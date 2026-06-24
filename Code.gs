/**
 * たいおんログ GAS Backend
 *
 * Actions:
 *   Public API : create_group / join_group / get_group_info / sync
 *   Admin API  : rotate_secret / revoke_previous_secret / get_secret_status
 *
 * --- 今回の改修 ---
 *   - sync の Push 処理へ ScriptLock を追加し、同時書込みを直列化。
 *   - エラー応答を { code, message, retryable } の構造へ統一。
 *   - API_SECRET_PREVIOUS を使う短期的な秘密値移行を追加。
 *   - 管理者アクションは ADMIN_SECRET だけで認証し、フロント用
 *     API_SECRET だけでは実行できないように認証経路を分離。
 *   - API_SECRET / ADMIN_SECRET の同値設定をサーバー設定エラーとして拒否。
 *   - _client_change_id の受理結果を短期保存し、応答消失後の同一Push再送を冪等化。
 *
 * --- 維持する既存方針 ---
 *   - AI は GAS で中継せず、利用者端末から Gemini / Groq へ直接通信。
 *   - スプレッドシートのシート名・列名・列順は今回変更しない。
 *   - GAS の時間主導トリガーは使用しない。
 *
 * --- スクリプトプロパティ ---
 *   SPREADSHEET_ID       : データ保存先スプレッドシート ID
 *   API_SECRET           : 現行フロントと共有する API キー
 *   API_SECRET_PREVIOUS  : 移行期間中だけ許可する旧 API キー（任意）
 *   ADMIN_SECRET         : 管理者専用キー。API_SECRET 系と必ず異なる値
 *
 * 秘密値の実値はソースコード、Git、SSOTへ記載しないこと。
 */

const PROP = PropertiesService.getScriptProperties();

const JOIN_CODE_LEN = 12;
const JOIN_EXPIRE_DAYS = 30;
const JOIN_RATE_LIMIT_PER_HOUR = 30;
const JOIN_RATE_WINDOW_MS = 60 * 60 * 1000;
const SYNC_LOCK_WAIT_MS = 10 * 1000;
const SECRET_ROTATION_LOCK_WAIT_MS = 5 * 1000;
const MIN_SECRET_LENGTH = 32;
const SYNC_TIMESTAMP_MIGRATION_PROPERTY = "SYNC_SERVER_TIMESTAMP_V1";
const SYNC_RECEIPT_PROPERTY_PREFIX = "SYNC_RECEIPT_V1_";
const SYNC_RECEIPT_TTL_MS = 24 * 60 * 60 * 1000;
const SYNC_RECEIPT_MAX_ENTRIES = 200;

const PUBLIC_ACTIONS_ = [
  "create_group",
  "join_group",
  "get_group_info",
  "sync"
];

const ADMIN_ACTIONS_ = [
  "rotate_secret",
  "revoke_previous_secret",
  "get_secret_status"
];

// =========================================================
// シート構造メタ情報
// =========================================================

/**
 * 各シートで「グループ識別」に使う列名。
 * groups シートだけは uuid 自体がグループ ID なので別扱い。
 */
const GROUP_KEY_BY_SHEET_ = {
  groups: "uuid",
  users: "group_id",
  records: "group_id",
  medications: "group_id",
  events: "group_id",
  reminders: "group_id",
  settings: "group_id"
};

/**
 * 各シートの「日時カラム」一覧。
 * 既存スプレッドシートとの不一致は今回のスコープ外バックログとして維持し、
 * 本改修では列名を変更しない。
 */
const DATE_KEYS_BY_SHEET_ = {
  groups: ["join_code_expires_at", "created_at", "updated_at"],
  users: ["created_at", "updated_at", "deleted_at", "birthday"],
  records: ["measured_at", "created_at", "updated_at", "deleted_at"],
  medications: ["started_at", "ended_at", "created_at", "updated_at", "deleted_at"],
  events: ["starts_at", "ends_at", "created_at", "updated_at", "deleted_at"],
  reminders: ["scheduled_at", "created_at", "updated_at", "deleted_at"],
  settings: ["updated_at"],
  rate_limits: ["window_start"]
};

// =========================================================
// 日時ユーティリティ
// =========================================================

function nowISO() {
  return new Date().toISOString();
}

function toTimeMs_(v) {
  if (v === null || v === undefined || v === "") return NaN;
  if (v instanceof Date) return v.getTime();
  const t = new Date(v).getTime();
  return isNaN(t) ? NaN : t;
}

/**
 * 様々な形式の日時表現を ISO 8601 (UTC) 文字列に正規化する。
 */
function normalizeIsoString_(v) {
  if (v === null || v === undefined || v === "") return "";

  if (v instanceof Date) {
    return v.toISOString();
  }

  const s = String(v).trim();
  if (!s) return "";

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(s)) {
    return s;
  }

  const slashMatch = s.match(
    /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/
  );
  if (slashMatch) {
    const y = Number(slashMatch[1]);
    const m = Number(slashMatch[2]);
    const d = Number(slashMatch[3]);
    const hh = Number(slashMatch[4]);
    const mm = Number(slashMatch[5]);
    const ss = Number(slashMatch[6] || 0);

    const dt = new Date(y, m - 1, d, hh, mm, ss);
    return isNaN(dt.getTime()) ? s : dt.toISOString();
  }

  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }

  return s;
}

function normalizeDateFieldsForSheet_(sheetName, obj) {
  const keys = DATE_KEYS_BY_SHEET_[sheetName] || [];
  if (!obj || typeof obj !== "object") return obj;

  const out = { ...obj };
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(out, key)) {
      out[key] = normalizeIsoString_(out[key]);
    }
  }
  return out;
}

// =========================================================
// エラー・レスポンス整形
// =========================================================

function appError_(code, message, retryable) {
  const error = new Error(message);
  error.code = String(code || "SERVER_ERROR");
  error.retryable = Boolean(retryable);
  return error;
}

function normalizeError_(error) {
  const code = error && error.code ? String(error.code) : "SERVER_ERROR";
  const retryable = error && typeof error.retryable === "boolean"
    ? error.retryable
    : code === "SERVER_ERROR";
  const rawMessage = error && error.message ? String(error.message) : "Server error";

  const publicMessages = {
    INVALID_REQUEST: "リクエストが正しくありません",
    UNAUTHORIZED: "認証に失敗しました",
    SERVER_CONFIG_ERROR: "サーバー設定を確認してください",
    SHEET_NOT_FOUND: "データ保存先を確認してください",
    GROUP_NOT_FOUND: "グループが見つかりません",
    INVALID_JOIN_CODE: "参加コードが正しくありません",
    JOIN_CODE_EXPIRED: "参加コードの期限が切れています",
    RATE_LIMITED: "アクセス頻度が高すぎます。しばらく待ってください",
    SYNC_BUSY: "他の同期処理を実行中です。少し待って再試行してください",
    INVALID_SECRET: "新しい秘密値の条件を確認してください",
    SERVER_ERROR: "サーバー処理に失敗しました"
  };

  return {
    code,
    message: publicMessages[code] || rawMessage || "サーバー処理に失敗しました",
    retryable
  };
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function ok_(data) {
  return json_({ ok: true, data });
}

function ng_(error) {
  return json_({ ok: false, error: normalizeError_(error) });
}

// =========================================================
// 認証・サーバー設定
// =========================================================

function getSecretConfig_() {
  return {
    current: String(PROP.getProperty("API_SECRET") || "").trim(),
    previous: String(PROP.getProperty("API_SECRET_PREVIOUS") || "").trim(),
    admin: String(PROP.getProperty("ADMIN_SECRET") || "").trim()
  };
}

function assertSecretConfig_() {
  const secrets = getSecretConfig_();

  if (!secrets.current || !secrets.admin) {
    throw appError_("SERVER_CONFIG_ERROR", "Required secret is not configured", false);
  }

  if (secrets.current === secrets.admin) {
    throw appError_("SERVER_CONFIG_ERROR", "API_SECRET and ADMIN_SECRET must differ", false);
  }

  if (secrets.previous && secrets.previous === secrets.admin) {
    throw appError_("SERVER_CONFIG_ERROR", "API_SECRET_PREVIOUS and ADMIN_SECRET must differ", false);
  }

  return secrets;
}

function requireApiSecret_(body) {
  const secrets = assertSecretConfig_();
  const provided = body && body.api_secret ? String(body.api_secret) : "";

  if (provided && provided === secrets.current) {
    return "current";
  }

  if (provided && secrets.previous && provided === secrets.previous) {
    return "previous";
  }

  throw appError_("UNAUTHORIZED", "Unauthorized", false);
}

function requireAdmin_(body) {
  const secrets = assertSecretConfig_();
  const provided = body && body.admin_secret ? String(body.admin_secret) : "";

  if (!provided || provided !== secrets.admin) {
    throw appError_("UNAUTHORIZED", "Unauthorized", false);
  }
}

function getSs_() {
  const spreadsheetId = String(PROP.getProperty("SPREADSHEET_ID") || "").trim();
  if (!spreadsheetId) {
    throw appError_("SERVER_CONFIG_ERROR", "SPREADSHEET_ID is not configured", false);
  }

  try {
    return SpreadsheetApp.openById(spreadsheetId);
  } catch (error) {
    console.error(`[getSs_] ${error && error.message ? error.message : error}`);
    throw appError_("SERVER_CONFIG_ERROR", "Spreadsheet is unavailable", false);
  }
}

function getSheet_(name) {
  const sh = getSs_().getSheetByName(name);
  if (!sh) {
    throw appError_("SHEET_NOT_FOUND", `Sheet not found: ${name}`, false);
  }
  return sh;
}

// =========================================================
// シート操作ヘルパー
// =========================================================

function headerMap_(sh) {
  const lastColumn = sh.getLastColumn();
  if (lastColumn < 1) {
    throw appError_("SHEET_NOT_FOUND", `Header not found: ${sh.getName()}`, false);
  }

  const head = sh.getRange(1, 1, 1, lastColumn).getValues()[0];
  const map = {};
  head.forEach((k, i) => { map[String(k).trim()] = i + 1; });
  return map;
}

function requireColumn_(map, key, sheetName) {
  const col = map[key];
  if (!col) {
    throw appError_("SHEET_NOT_FOUND", `Column not found: ${sheetName}.${key}`, false);
  }
  return col;
}

function getGroupCol_(sh, map) {
  const sheetName = sh.getName();
  const colName = GROUP_KEY_BY_SHEET_[sheetName] || "group_id";
  return requireColumn_(map, colName, sheetName);
}

function findRowByUuid_(sh, uuidCol, uuid) {
  const last = sh.getLastRow();
  if (last < 2) return -1;
  const values = sh.getRange(2, uuidCol, last - 1, 1).getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]) === String(uuid)) return i + 2;
  }
  return -1;
}

function listUpdatedBetween_(sh, groupCol, updatedAtCol, group_id, sinceISO, cursorISO) {
  const last = sh.getLastRow();
  if (last < 2) return [];
  const data = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const sinceMs = toTimeMs_(sinceISO);
  const cursorMs = toTimeMs_(cursorISO);
  const out = [];

  for (const row of data) {
    const groupValue = row[groupCol - 1];
    const updatedValue = row[updatedAtCol - 1];
    if (String(groupValue) !== String(group_id)) continue;
    if (!updatedValue) continue;

    const updatedMs = toTimeMs_(updatedValue);
    if (isNaN(updatedMs)) continue;
    // 同一ミリ秒の更新漏れを避けるため since と同値は再取得する。
    if (!isNaN(sinceMs) && updatedMs < sinceMs) continue;
    if (!isNaN(cursorMs) && updatedMs > cursorMs) continue;

    const obj = {};
    for (let i = 0; i < head.length; i++) {
      const value = row[i];
      obj[String(head[i])] = value instanceof Date ? value.toISOString() : value;
    }
    out.push(normalizeDateFieldsForSheet_(sh.getName(), obj));
  }

  return out;
}

function createServerTimestampFactory_() {
  let lastMs = Date.now() - 1;
  return function nextServerTimestamp_() {
    lastMs = Math.max(Date.now(), lastMs + 1);
    return new Date(lastMs).toISOString();
  };
}

function stripSyncTransportFields_(row) {
  const clean = { ...row };
  delete clean._base_updated_at;
  delete clean._client_change_id;
  return clean;
}

function timestampsEqual_(left, right) {
  return normalizeIsoString_(left) === normalizeIsoString_(right);
}

function syncReceiptPropertyKey_(store, rowKey, changeId) {
  const source = `${store}:${rowKey}:${changeId}`;
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, source);
  const hex = digest.map(value => (`0${(value & 0xff).toString(16)}`).slice(-2)).join("");
  return `${SYNC_RECEIPT_PROPERTY_PREFIX}${hex}`;
}

function parseSyncReceipt_(raw) {
  if (!raw) return null;
  try {
    const receipt = JSON.parse(raw);
    if (!receipt || typeof receipt !== "object") return null;
    if (!receipt.store || !receipt.row_key || !receipt.change_id || !receipt.updated_at) return null;
    return receipt;
  } catch (_) {
    return null;
  }
}

function getSyncReceipt_(store, rowKey, changeId) {
  if (!store || !rowKey || !changeId) return null;
  const key = syncReceiptPropertyKey_(store, rowKey, changeId);
  const receipt = parseSyncReceipt_(PROP.getProperty(key));
  if (!receipt) {
    PROP.deleteProperty(key);
    return null;
  }

  const savedAtMs = toTimeMs_(receipt.saved_at);
  if (isNaN(savedAtMs) || Date.now() - savedAtMs > SYNC_RECEIPT_TTL_MS) {
    PROP.deleteProperty(key);
    return null;
  }

  if (
    String(receipt.store) !== String(store) ||
    String(receipt.row_key) !== String(rowKey) ||
    String(receipt.change_id) !== String(changeId)
  ) {
    PROP.deleteProperty(key);
    return null;
  }

  return {
    row_key: String(receipt.row_key),
    change_id: String(receipt.change_id),
    updated_at: normalizeIsoString_(receipt.updated_at)
  };
}

function cleanupSyncReceipts_() {
  const properties = PROP.getProperties();
  const valid = [];

  Object.keys(properties).forEach(key => {
    if (!key.startsWith(SYNC_RECEIPT_PROPERTY_PREFIX)) return;
    const receipt = parseSyncReceipt_(properties[key]);
    const savedAtMs = receipt ? toTimeMs_(receipt.saved_at) : NaN;
    if (!receipt || isNaN(savedAtMs) || Date.now() - savedAtMs > SYNC_RECEIPT_TTL_MS) {
      PROP.deleteProperty(key);
      return;
    }
    valid.push({ key, savedAtMs });
  });

  valid.sort((left, right) => right.savedAtMs - left.savedAtMs);
  valid.slice(SYNC_RECEIPT_MAX_ENTRIES).forEach(entry => {
    PROP.deleteProperty(entry.key);
  });

  const kept = valid.slice(0, SYNC_RECEIPT_MAX_ENTRIES);
  const byKey = {};
  kept.forEach(entry => {
    byKey[entry.key] = { savedAtMs: entry.savedAtMs };
  });

  return { byKey, count: kept.length };
}

function findOldestSyncReceiptKey_(registry) {
  let oldestKey = null;
  let oldestSavedAtMs = Number.POSITIVE_INFINITY;

  Object.keys(registry.byKey).forEach(key => {
    const savedAtMs = Number(registry.byKey[key].savedAtMs);
    if (savedAtMs < oldestSavedAtMs) {
      oldestKey = key;
      oldestSavedAtMs = savedAtMs;
    }
  });

  return oldestKey;
}

function saveSyncReceipt_(store, acknowledgement, registry) {
  const key = syncReceiptPropertyKey_(
    store,
    acknowledgement.row_key,
    acknowledgement.change_id
  );
  const exists = Object.prototype.hasOwnProperty.call(registry.byKey, key);

  if (!exists && registry.count >= SYNC_RECEIPT_MAX_ENTRIES) {
    const oldestKey = findOldestSyncReceiptKey_(registry);
    if (oldestKey) {
      PROP.deleteProperty(oldestKey);
      delete registry.byKey[oldestKey];
      registry.count -= 1;
    }
  }

  const savedAt = nowISO();
  const savedAtMs = toTimeMs_(savedAt);
  PROP.setProperty(key, JSON.stringify({
    store,
    row_key: acknowledgement.row_key,
    change_id: acknowledgement.change_id,
    updated_at: acknowledgement.updated_at,
    saved_at: savedAt
  }));

  registry.byKey[key] = { savedAtMs };
  if (!exists) registry.count += 1;
}

function clearSyncReceipts_() {
  const properties = PROP.getProperties();
  Object.keys(properties).forEach(key => {
    if (key.startsWith(SYNC_RECEIPT_PROPERTY_PREFIX)) {
      PROP.deleteProperty(key);
    }
  });
}

function upsertRow_(
  sh,
  obj,
  pkKey,
  updatedAtKey,
  nextServerTimestamp,
  receiptRegistry
) {
  const normalizedInput = normalizeDateFieldsForSheet_(sh.getName(), obj);
  const map = headerMap_(sh);
  const pkCol = requireColumn_(map, pkKey, sh.getName());
  const updatedCol = requireColumn_(map, updatedAtKey, sh.getName());
  const pk = String(normalizedInput[pkKey] || "").trim();
  const changeId = String(normalizedInput._client_change_id || "").trim();
  const baseUpdatedAt = normalizeIsoString_(normalizedInput._base_updated_at || "");

  if (!pk || !changeId) {
    return {
      count: 0,
      acknowledgement: null,
      conflict: {
        row_key: pk,
        change_id: changeId,
        remote_row: null,
        remote_updated_at: null
      }
    };
  }

  const replayedAcknowledgement = getSyncReceipt_(sh.getName(), pk, changeId);
  if (replayedAcknowledgement) {
    return { count: 0, acknowledgement: replayedAcknowledgement, conflict: null };
  }

  const rowIndex = findRowByUuid_(sh, pkCol, pk);
  let remoteRow = null;
  let remoteUpdatedAt = null;

  if (rowIndex >= 0) {
    const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    const values = sh.getRange(rowIndex, 1, 1, sh.getLastColumn()).getValues()[0];
    remoteRow = {};
    for (let i = 0; i < head.length; i++) {
      const value = values[i];
      remoteRow[String(head[i])] = value instanceof Date ? value.toISOString() : value;
    }
    remoteRow = normalizeDateFieldsForSheet_(sh.getName(), remoteRow);
    remoteUpdatedAt = normalizeIsoString_(remoteRow[updatedAtKey] || "");

    if (!baseUpdatedAt || !timestampsEqual_(baseUpdatedAt, remoteUpdatedAt)) {
      return {
        count: 0,
        acknowledgement: null,
        conflict: {
          row_key: pk,
          change_id: changeId,
          remote_row: remoteRow,
          remote_updated_at: remoteUpdatedAt || null
        }
      };
    }
  } else if (baseUpdatedAt) {
    return {
      count: 0,
      acknowledgement: null,
      conflict: {
        row_key: pk,
        change_id: changeId,
        remote_row: null,
        remote_updated_at: null
      }
    };
  }

  const serverUpdatedAt = nextServerTimestamp();
  const normalizedObj = stripSyncTransportFields_(normalizedInput);
  normalizedObj[updatedAtKey] = serverUpdatedAt;
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const row = head.map(key => normalizedObj[String(key)] ?? "");

  if (rowIndex < 0) sh.appendRow(row);
  else sh.getRange(rowIndex, 1, 1, row.length).setValues([row]);

  const acknowledgement = {
    row_key: pk,
    change_id: changeId,
    updated_at: serverUpdatedAt
  };
  saveSyncReceipt_(sh.getName(), acknowledgement, receiptRegistry);

  return { count: 1, acknowledgement, conflict: null };
}

function upsertSettings_(
  groupId,
  settings,
  nextServerTimestamp,
  receiptRegistry
) {
  const sh = getSheet_("settings");
  const map = headerMap_(sh);
  const pkCol = requireColumn_(map, "group_id", sh.getName());
  const updatedCol = requireColumn_(map, "updated_at", sh.getName());
  const showTempCol = requireColumn_(map, "show_temp_on_home", sh.getName());
  const normalizedInput = normalizeDateFieldsForSheet_("settings", settings);
  const changeId = String(normalizedInput._client_change_id || "").trim();
  const baseUpdatedAt = normalizeIsoString_(normalizedInput._base_updated_at || "");
  const replayedAcknowledgement = getSyncReceipt_("settings", groupId, changeId);
  if (replayedAcknowledgement) {
    return { count: 0, acknowledgement: replayedAcknowledgement, conflict: null };
  }
  const last = sh.getLastRow();
  let rowIndex = -1;

  if (last >= 2) {
    const values = sh.getRange(2, pkCol, last - 1, 1).getValues();
    for (let i = 0; i < values.length; i++) {
      if (String(values[i][0]) === String(groupId)) {
        rowIndex = i + 2;
        break;
      }
    }
  }

  let remoteRow = null;
  let remoteUpdatedAt = null;
  if (rowIndex >= 0) {
    remoteUpdatedAt = normalizeIsoString_(sh.getRange(rowIndex, updatedCol).getValue() || "");
    remoteRow = {
      group_id: groupId,
      show_temp_on_home: Boolean(sh.getRange(rowIndex, showTempCol).getValue()),
      updated_at: remoteUpdatedAt
    };
    if (!changeId || !baseUpdatedAt || !timestampsEqual_(baseUpdatedAt, remoteUpdatedAt)) {
      return {
        count: 0,
        acknowledgement: null,
        conflict: {
          row_key: groupId,
          change_id: changeId,
          remote_row: remoteRow,
          remote_updated_at: remoteUpdatedAt || null
        }
      };
    }
  } else if (!changeId || baseUpdatedAt) {
    return {
      count: 0,
      acknowledgement: null,
      conflict: {
        row_key: groupId,
        change_id: changeId,
        remote_row: null,
        remote_updated_at: null
      }
    };
  }

  const serverUpdatedAt = nextServerTimestamp();
  if (rowIndex < 0) {
    sh.appendRow([groupId, Boolean(normalizedInput.show_temp_on_home), serverUpdatedAt]);
  } else {
    sh.getRange(rowIndex, showTempCol).setValue(Boolean(normalizedInput.show_temp_on_home));
    sh.getRange(rowIndex, updatedCol).setValue(serverUpdatedAt);
  }

  const acknowledgement = {
    row_key: groupId,
    change_id: changeId,
    updated_at: serverUpdatedAt
  };
  saveSyncReceipt_("settings", acknowledgement, receiptRegistry);

  return { count: 1, acknowledgement, conflict: null };
}

function getSettingsUpdatedBetween_(groupId, since, cursor) {
  const sh = getSheet_("settings");
  const map = headerMap_(sh);
  const groupCol = requireColumn_(map, "group_id", sh.getName());
  const updatedCol = requireColumn_(map, "updated_at", sh.getName());
  const last = sh.getLastRow();
  if (last < 2) return null;

  const vals = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const sinceMs = toTimeMs_(since);
  const cursorMs = toTimeMs_(cursor);

  for (const row of vals) {
    if (String(row[groupCol - 1]) !== String(groupId)) continue;
    const obj = {};
    for (let i = 0; i < head.length; i++) obj[String(head[i])] = row[i];
    const normalizedObj = normalizeDateFieldsForSheet_("settings", obj);
    const updatedMs = toTimeMs_(normalizedObj.updated_at);
    if (isNaN(updatedMs)) return null;
    if (!isNaN(sinceMs) && updatedMs < sinceMs) return null;
    if (!isNaN(cursorMs) && updatedMs > cursorMs) return null;
    return normalizedObj;
  }

  return null;
}

/**
 * 既存 records シート全体の日時セルを ISO に正規化する一回限りの修復用。
 */
function normalizeExistingRecordsSheet_() {
  const sh = getSheet_("records");
  const map = headerMap_(sh);
  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < 2) return;

  const data = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
  const targetKeys = ["measured_at", "created_at", "updated_at", "deleted_at"];
  const targetCols = targetKeys
    .map(k => map[k])
    .filter(Boolean)
    .map(c => c - 1);

  let changed = 0;

  for (let r = 0; r < data.length; r++) {
    for (const c of targetCols) {
      const before = data[r][c];
      const after = normalizeIsoString_(before);
      if (String(before ?? "") !== String(after ?? "")) {
        data[r][c] = after;
        changed++;
      }
    }
  }

  sh.getRange(2, 1, data.length, lastCol).setValues(data);
  console.log(`records normalized: ${changed} cells updated`);
}

// =========================================================
// 参加コード関連
// =========================================================

function rateLimitJoin_(device_id) {
  if (!device_id) return;
  const sh = getSheet_("rate_limits");
  const map = headerMap_(sh);
  const didCol = requireColumn_(map, "device_id", sh.getName());
  const cntCol = requireColumn_(map, "request_count", sh.getName());
  const winCol = requireColumn_(map, "window_start", sh.getName());
  const last = sh.getLastRow();
  let idx = -1;

  if (last >= 2) {
    const values = sh.getRange(2, didCol, last - 1, 1).getValues();
    for (let i = 0; i < values.length; i++) {
      if (String(values[i][0]) === String(device_id)) {
        idx = i + 2;
        break;
      }
    }
  }

  const now = Date.now();

  if (idx < 0) {
    sh.appendRow([device_id, 1, new Date(now).toISOString()]);
    return;
  }

  const curCount = Number(sh.getRange(idx, cntCol).getValue() || 0);
  const curWin = String(sh.getRange(idx, winCol).getValue() || "");
  const winStart = curWin ? Date.parse(curWin) : 0;

  if (!winStart || (now - winStart) > JOIN_RATE_WINDOW_MS) {
    sh.getRange(idx, cntCol).setValue(1);
    sh.getRange(idx, winCol).setValue(new Date(now).toISOString());
    return;
  }

  if (curCount >= JOIN_RATE_LIMIT_PER_HOUR) {
    throw appError_("RATE_LIMITED", "Rate limit exceeded", true);
  }
  sh.getRange(idx, cntCol).setValue(curCount + 1);
}

function genJoinCode_() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < JOIN_CODE_LEN; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function uuid_() {
  return Utilities.getUuid();
}

// =========================================================
// Actions: public
// =========================================================

function actionCreateGroup_(body) {
  const sh = getSheet_("groups");
  const now = nowISO();
  const group_id = uuid_();
  const join_code = genJoinCode_();
  const expires = new Date(Date.now() + JOIN_EXPIRE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const name = (body.name && String(body.name).trim()) ? String(body.name).trim() : "家族";
  sh.appendRow([group_id, join_code, name, expires, now, now]);

  const setSh = getSheet_("settings");
  setSh.appendRow([group_id, true, now]);

  return { group_id, name, join_code, expires_at: expires };
}

function actionJoinGroup_(body) {
  const device_id = body.device_id ? String(body.device_id) : "";
  rateLimitJoin_(device_id);

  const join_code = (body.join_code ? String(body.join_code) : "").trim().toUpperCase();
  if (!join_code) {
    throw appError_("INVALID_JOIN_CODE", "Invalid join code", false);
  }

  const sh = getSheet_("groups");
  const map = headerMap_(sh);
  const last = sh.getLastRow();
  if (last < 2) {
    throw appError_("GROUP_NOT_FOUND", "Group not found", false);
  }

  const codeCol = requireColumn_(map, "join_code", sh.getName());
  const expCol = requireColumn_(map, "join_code_expires_at", sh.getName());
  const idCol = requireColumn_(map, "uuid", sh.getName());
  const nameCol = requireColumn_(map, "name", sh.getName());
  const vals = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();

  for (const row of vals) {
    if (String(row[codeCol - 1]) !== join_code) continue;
    const exp = String(row[expCol - 1] || "");
    if (!exp || Date.parse(exp) < Date.now()) {
      throw appError_("JOIN_CODE_EXPIRED", "Join code expired", false);
    }
    return { group_id: String(row[idCol - 1]), name: String(row[nameCol - 1]) };
  }

  throw appError_("INVALID_JOIN_CODE", "Invalid join code", false);
}

function actionGetGroupInfo_(body) {
  const group_id = String(body.group_id || "");
  if (!group_id) {
    throw appError_("GROUP_NOT_FOUND", "Group not found", false);
  }

  const sh = getSheet_("groups");
  const map = headerMap_(sh);
  const idCol = requireColumn_(map, "uuid", sh.getName());
  const last = sh.getLastRow();
  if (last < 2) {
    throw appError_("GROUP_NOT_FOUND", "Group not found", false);
  }

  const vals = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];

  for (const row of vals) {
    if (String(row[idCol - 1]) !== group_id) continue;
    const obj = {};
    for (let i = 0; i < head.length; i++) obj[String(head[i])] = row[i];
    return normalizeDateFieldsForSheet_("groups", obj);
  }

  throw appError_("GROUP_NOT_FOUND", "Group not found", false);
}

function pushSyncChanges_(groupId, push, tables, nextServerTimestamp) {
  const receiptRegistry = cleanupSyncReceipts_();
  const pushed = {};
  const acknowledgements = [];
  const conflicts = [];

  for (const table of tables) {
    const sh = getSheet_(table.name);
    const rows = Array.isArray(push[table.name]) ? push[table.name] : [];
    let count = 0;

    for (const row of rows) {
      if (String(row.group_id || "") !== groupId) continue;
      const result = upsertRow_(
        sh,
        row,
        table.pk,
        table.updated,
        nextServerTimestamp,
        receiptRegistry
      );
      count += result.count;
      if (result.acknowledgement) {
        acknowledgements.push({ store: table.name, ...result.acknowledgement });
      }
      if (result.conflict) {
        conflicts.push({ store: table.name, ...result.conflict });
      }
    }

    pushed[table.name] = count;
  }

  if (push.settings && String(push.settings.group_id || "") === groupId) {
    const result = upsertSettings_(
      groupId,
      push.settings,
      nextServerTimestamp,
      receiptRegistry
    );
    pushed.settings = result.count;
    if (result.acknowledgement) {
      acknowledgements.push({ store: "settings", ...result.acknowledgement });
    }
    if (result.conflict) {
      conflicts.push({ store: "settings", ...result.conflict });
    }
  } else {
    pushed.settings = 0;
  }

  SpreadsheetApp.flush();
  return { pushed, acknowledgements, conflicts };
}

function pullSyncChanges_(groupId, since, cursor, tables) {
  const pulled = {};

  for (const table of tables) {
    const sh = getSheet_(table.name);
    const map = headerMap_(sh);
    const updatedAtCol = requireColumn_(map, "updated_at", sh.getName());
    pulled[table.name] = listUpdatedBetween_(
      sh,
      getGroupCol_(sh, map),
      updatedAtCol,
      groupId,
      since,
      cursor
    );
  }

  const groupSheet = getSheet_("groups");
  const groupMap = headerMap_(groupSheet);
  const groupUpdatedCol = requireColumn_(groupMap, "updated_at", groupSheet.getName());
  const groups = listUpdatedBetween_(
    groupSheet,
    getGroupCol_(groupSheet, groupMap),
    groupUpdatedCol,
    groupId,
    since,
    cursor
  );

  if (groups.length === 0 && since.startsWith("1970")) {
    try {
      const group = actionGetGroupInfo_({ group_id: groupId });
      if (group) groups.push(group);
    } catch (error) {
      if (!error || error.code !== "GROUP_NOT_FOUND") throw error;
    }
  }

  pulled.groups = groups;
  pulled.settings = getSettingsUpdatedBetween_(groupId, since, cursor);
  return pulled;
}

function assertSyncTimestampMigration_() {
  if (PROP.getProperty(SYNC_TIMESTAMP_MIGRATION_PROPERTY) !== "done") {
    throw appError_(
      "SERVER_CONFIG_ERROR",
      "Run migrateSyncUpdatedAtToServerTimeOnce before enabling the new sync client",
      false
    );
  }
}

function actionSync_(body) {
  assertSyncTimestampMigration_();

  const group_id = String(body.group_id || "");
  const since = normalizeIsoString_(String(body.since || "1970-01-01T00:00:00.000Z"));
  if (!group_id) throw appError_("GROUP_NOT_FOUND", "Group not found", false);

  const push = body.push && typeof body.push === "object" ? body.push : {};
  const tables = [
    { name: "users", pk: "uuid", updated: "updated_at" },
    { name: "records", pk: "uuid", updated: "updated_at" },
    { name: "medications", pk: "uuid", updated: "updated_at" },
    { name: "events", pk: "uuid", updated: "updated_at" },
    { name: "reminders", pk: "uuid", updated: "updated_at" }
  ];

  const lock = LockService.getScriptLock();
  const acquired = lock.tryLock(SYNC_LOCK_WAIT_MS);
  if (!acquired) throw appError_("SYNC_BUSY", "Sync lock timeout", true);

  try {
    const nextServerTimestamp = createServerTimestampFactory_();
    const pushResult = pushSyncChanges_(group_id, push, tables, nextServerTimestamp);
    const serverCursor = nextServerTimestamp();
    const pulled = pullSyncChanges_(group_id, since, serverCursor, tables);

    return {
      pulled,
      pushed: pushResult.pushed,
      acknowledgements: pushResult.acknowledgements,
      conflicts: pushResult.conflicts,
      server_cursor: serverCursor
    };
  } finally {
    lock.releaseLock();
  }
}

// =========================================================
// 一回限りの同期時刻移行（GASエディタから所有者が手動実行）
// =========================================================

function migrateSyncUpdatedAtToServerTime_(allowRepeat) {
  const lock = LockService.getScriptLock();
  const acquired = lock.tryLock(SYNC_LOCK_WAIT_MS);
  if (!acquired) throw appError_("SYNC_BUSY", "Migration lock timeout", true);

  try {
    if (!allowRepeat && PROP.getProperty(SYNC_TIMESTAMP_MIGRATION_PROPERTY) === "done") {
      return { status: "already_done" };
    }

    const sheetNames = [
      "groups",
      "users",
      "records",
      "medications",
      "events",
      "reminders",
      "settings"
    ];
    const migrationTimestamp = nowISO();
    const updatedRows = {};

    for (const sheetName of sheetNames) {
      const sheet = getSheet_(sheetName);
      const map = headerMap_(sheet);
      const updatedCol = requireColumn_(map, "updated_at", sheetName);
      const lastRow = sheet.getLastRow();
      const rowCount = Math.max(lastRow - 1, 0);
      updatedRows[sheetName] = rowCount;
      if (rowCount === 0) continue;

      const values = Array.from({ length: rowCount }, () => [migrationTimestamp]);
      sheet.getRange(2, updatedCol, rowCount, 1).setValues(values);
    }

    SpreadsheetApp.flush();
    clearSyncReceipts_();
    PROP.setProperty(SYNC_TIMESTAMP_MIGRATION_PROPERTY, "done");
    return {
      status: allowRepeat ? "remigrated" : "done",
      migration_timestamp: migrationTimestamp,
      updated_rows: updatedRows
    };
  } finally {
    lock.releaseLock();
  }
}

function migrateSyncUpdatedAtToServerTimeOnce() {
  return migrateSyncUpdatedAtToServerTime_(false);
}

/**
 * 時刻移行前バックアップを復元した場合だけ、入力停止中に所有者が手動実行する。
 * 通常運用中は実行しないこと。
 */
function remigrateSyncUpdatedAtAfterSpreadsheetRestore() {
  return migrateSyncUpdatedAtToServerTime_(true);
}

// =========================================================
// Actions: admin
// =========================================================

function validateNewSecret_(newSecret, secrets) {
  if (!newSecret || newSecret.length < MIN_SECRET_LENGTH) {
    throw appError_("INVALID_SECRET", `Secret must be at least ${MIN_SECRET_LENGTH} characters`, false);
  }

  if (newSecret === secrets.admin) {
    throw appError_("INVALID_SECRET", "API secret must differ from ADMIN_SECRET", false);
  }

  if (newSecret === secrets.current) {
    throw appError_("INVALID_SECRET", "New API secret is unchanged", false);
  }

  if (secrets.previous && newSecret === secrets.previous) {
    throw appError_("INVALID_SECRET", "New API secret must not reuse API_SECRET_PREVIOUS", false);
  }
}

function actionRotateSecret_(body) {
  const newSecret = String(body.new_secret || "").trim();
  const keepPrevious = body.keep_previous !== false;
  const lock = LockService.getScriptLock();
  const acquired = lock.tryLock(SECRET_ROTATION_LOCK_WAIT_MS);

  if (!acquired) {
    throw appError_("SYNC_BUSY", "Secret rotation lock timeout", true);
  }

  try {
    const secrets = assertSecretConfig_();
    validateNewSecret_(newSecret, secrets);

    if (keepPrevious && secrets.current) {
      PROP.setProperty("API_SECRET_PREVIOUS", secrets.current);
    } else {
      PROP.deleteProperty("API_SECRET_PREVIOUS");
    }

    PROP.setProperty("API_SECRET", newSecret);

    return {
      rotated: true,
      previous_secret_enabled: Boolean(keepPrevious && secrets.current),
      minimum_secret_length: MIN_SECRET_LENGTH
    };
  } finally {
    lock.releaseLock();
  }
}

function actionRevokePreviousSecret_() {
  const lock = LockService.getScriptLock();
  const acquired = lock.tryLock(SECRET_ROTATION_LOCK_WAIT_MS);

  if (!acquired) {
    throw appError_("SYNC_BUSY", "Secret revocation lock timeout", true);
  }

  try {
    const existed = Boolean(String(PROP.getProperty("API_SECRET_PREVIOUS") || "").trim());
    PROP.deleteProperty("API_SECRET_PREVIOUS");
    return { revoked: existed };
  } finally {
    lock.releaseLock();
  }
}

function actionGetSecretStatus_() {
  const secrets = assertSecretConfig_();
  return {
    api_secret_configured: Boolean(secrets.current),
    previous_secret_enabled: Boolean(secrets.previous),
    admin_secret_configured: Boolean(secrets.admin),
    secrets_are_separated:
      secrets.current !== secrets.admin &&
      (!secrets.previous || secrets.previous !== secrets.admin),
    minimum_secret_length: MIN_SECRET_LENGTH
  };
}

// =========================================================
// HTTP エントリーポイント
// =========================================================

function parseRequestBody_(e) {
  const bodyStr = (e && e.postData && e.postData.contents)
    ? String(e.postData.contents)
    : "{}";

  try {
    const body = JSON.parse(bodyStr);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("Body must be an object");
    }
    return body;
  } catch (error) {
    throw appError_("INVALID_REQUEST", "Invalid JSON body", false);
  }
}

function dispatchPublicAction_(action, body) {
  if (action === "create_group") return actionCreateGroup_(body);
  if (action === "join_group") return actionJoinGroup_(body);
  if (action === "get_group_info") return actionGetGroupInfo_(body);
  if (action === "sync") return actionSync_(body);
  throw appError_("INVALID_REQUEST", "Unknown action", false);
}

function dispatchAdminAction_(action, body) {
  if (action === "rotate_secret") return actionRotateSecret_(body);
  if (action === "revoke_previous_secret") return actionRevokePreviousSecret_();
  if (action === "get_secret_status") return actionGetSecretStatus_();
  throw appError_("INVALID_REQUEST", "Unknown admin action", false);
}

function doPost(e) {
  try {
    const body = parseRequestBody_(e);
    const action = String(body.action || "").trim();

    if (!action) {
      throw appError_("INVALID_REQUEST", "Action is required", false);
    }

    console.log(`[doPost] action=${action}`);

    if (ADMIN_ACTIONS_.includes(action)) {
      requireAdmin_(body);
      return ok_(dispatchAdminAction_(action, body));
    }

    requireApiSecret_(body);

    if (!PUBLIC_ACTIONS_.includes(action)) {
      throw appError_("INVALID_REQUEST", "Unknown action", false);
    }

    return ok_(dispatchPublicAction_(action, body));
  } catch (error) {
    const normalized = normalizeError_(error);
    console.error(`[doPost] code=${normalized.code} retryable=${normalized.retryable} message=${normalized.message}`);
    return ng_(error);
  }
}

// =========================================================
// 手動実行用エントリーポイント
// =========================================================

/** GAS の OAuth 認可を一度通すために手動実行する。 */
function forceAuth() {
  UrlFetchApp.fetch("https://www.google.com");
  console.log("認証成功");
}

/** records シート全体の日時セルを ISO に修復する（一回限り）。 */
function runNormalizeExistingRecords() {
  normalizeExistingRecordsSheet_();
}

/**
 * スクリプトプロパティの設定状態だけをログへ出す。
 * 秘密値そのものはログへ出力しない。
 */
function logSecretStatus() {
  try {
    const status = actionGetSecretStatus_();
    console.log(JSON.stringify(status));
  } catch (error) {
    console.error(JSON.stringify(normalizeError_(error)));
  }
}
