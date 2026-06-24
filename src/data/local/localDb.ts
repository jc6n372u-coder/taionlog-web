import type { IDBPTransaction } from "idb";
import {
  getDb,
  type DraftEntry,
  type DraftFormType,
  type MyDB,
  type PushableStore,
  type SharedRowStore,
  type SyncConflictEntry,
  type SyncQueueEntry,
} from "./db";
import {
  emitDataRefreshRequested,
  emitLocalChange,
  type SyncStoreName,
} from "../../services/sync/syncEvents";
import type {
  AiSettings,
  EventRow,
  Medication,
  RecordRow,
  Reminder,
  SettingsRow,
  User,
} from "../../utils/types";

const nowISO = (): string => new Date().toISOString();
const EPOCH_ISO = "1970-01-01T00:00:00.000Z";

export type DataWriteSource = "local" | "remote";
export type LocalWriteOptions = {
  baseUpdatedAt?: string | null;
};
export type {
  DraftEntry,
  DraftFormType,
  PushableStore,
  SharedRowStore,
  SyncConflictEntry,
  SyncQueueEntry,
};

export type SyncPushRow = Record<string, unknown> & {
  _base_updated_at: string | null;
  _client_change_id: string;
};

export type SyncPushPayload = {
  users: SyncPushRow[];
  records: SyncPushRow[];
  medications: SyncPushRow[];
  events: SyncPushRow[];
  reminders: SyncPushRow[];
  settings?: SyncPushRow;
};

export type PushAcknowledgement = {
  store: PushableStore;
  row_key: string;
  change_id: string;
  updated_at: string;
};

export type PushConflict = {
  store: PushableStore;
  row_key: string;
  change_id: string;
  remote_row: Record<string, unknown> | null;
  remote_updated_at: string | null;
};

export type LegacySyncSnapshot = {
  users?: Record<string, unknown>[];
  records?: Record<string, unknown>[];
  medications?: Record<string, unknown>[];
  events?: Record<string, unknown>[];
  reminders?: Record<string, unknown>[];
  groups?: Record<string, unknown>[];
  settings?: Record<string, unknown> | null;
};

export type LegacySyncReconciliationResult = {
  queued: number;
  conflicts: number;
  pulled: number;
  changedStores: SyncStoreName[];
};

export type SyncOverview = {
  pendingChangeCount: number;
  pendingCountByStore: Partial<Record<PushableStore, number>>;
  conflictCount: number;
};

export type ConflictResolutionChoice = {
  key: string;
  choice: "local" | "remote";
};

export type DraftSaveInput = Omit<DraftEntry, "created_at" | "updated_at" | "expires_at"> & {
  created_at?: string;
  updated_at?: string;
  expires_at?: string;
};

type GroupAwareRow = {
  group_id?: unknown;
  uuid?: unknown;
  updated_at?: unknown;
};

type CurrentGroup = Record<string, unknown> & {
  group_id: string;
  group_name: string;
};

type SharedRow =
  | User
  | RecordRow
  | Medication
  | EventRow
  | Reminder
  | SettingsRow
  | Record<string, unknown>;

type PushableRow =
  | User
  | RecordRow
  | Medication
  | EventRow
  | Reminder
  | SettingsRow;

type PushableTransaction = IDBPTransaction<
  MyDB,
  [PushableStore, "sync_queue", "sync_conflicts"],
  "readwrite"
>;

function normalizeGroupId(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const groupId = String(value).trim();
  return groupId || null;
}

function toRecord(row: object): Record<string, unknown> {
  return row as Record<string, unknown>;
}

function getRowKey(store: PushableStore, row: GroupAwareRow): string {
  const raw = store === "settings" ? row.group_id : row.uuid;
  const key = String(raw ?? "").trim();
  if (!key) throw new Error(`${store} の同期キーがありません`);
  return key;
}

function getRowGroupId(
  store: SyncStoreName,
  row: GroupAwareRow,
): string | null {
  if (store === "groups") return normalizeGroupId(row.uuid);
  return normalizeGroupId(row.group_id);
}

function getSingleGroupId(
  store: SyncStoreName,
  rows: readonly GroupAwareRow[],
): string | null {
  const groupIds = new Set<string>();
  for (const row of rows) {
    const groupId = getRowGroupId(store, row);
    if (groupId) groupIds.add(groupId);
    if (groupIds.size > 1) return null;
  }
  return groupIds.values().next().value ?? null;
}

function notifyLocalChange(
  source: DataWriteSource,
  store: SyncStoreName,
  groupId: string | null,
): void {
  if (source === "local") emitLocalChange([store], groupId);
}

function createChangeId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function queueKey(store: PushableStore, rowKey: string): string {
  return `${store}:${rowKey}`;
}

function clearEventSyncMarker<T extends PushableRow>(
  store: PushableStore,
  row: T,
): T {
  if (store !== "events") return row;
  const next = { ...toRecord(row), synced_at: undefined };
  return next as T;
}

const MIGRATION_IGNORED_FIELDS = new Set([
  "updated_at",
  "synced_at",
  "_base_updated_at",
  "_client_change_id",
]);

function normalizeComparableValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalizeComparableValue);
  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const normalized: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      if (MIGRATION_IGNORED_FIELDS.has(key)) continue;
      const next = normalizeComparableValue(source[key]);
      if (next === undefined || next === null || next === "") continue;
      normalized[key] = next;
    }
    return normalized;
  }
  return value;
}

function rowsEquivalentForMigration(
  localRow: Record<string, unknown>,
  remoteRow: Record<string, unknown>,
): boolean {
  return (
    JSON.stringify(normalizeComparableValue(localRow)) ===
    JSON.stringify(normalizeComparableValue(remoteRow))
  );
}

async function getMigrationLocalRows(
  store: PushableStore,
  groupId: string,
): Promise<Record<string, unknown>[]> {
  const db = await getDb();
  switch (store) {
    case "users":
      return (await db.getAllFromIndex("users", "by_group", groupId)).map(
        toRecord,
      );
    case "records":
      return (await db.getAllFromIndex("records", "by_group", groupId)).map(
        toRecord,
      );
    case "medications":
      return (await db.getAllFromIndex("medications", "by_group", groupId)).map(
        toRecord,
      );
    case "events":
      return (await db.getAllFromIndex("events", "by_group", groupId)).map(
        toRecord,
      );
    case "reminders":
      return (await db.getAllFromIndex("reminders", "by_group", groupId)).map(
        toRecord,
      );
    case "settings": {
      const row = await db.get("settings", groupId);
      return row ? [toRecord(row)] : [];
    }
  }
}

function getMigrationRemoteRows(
  snapshot: LegacySyncSnapshot,
  store: PushableStore,
  groupId: string,
): Record<string, unknown>[] {
  if (store === "settings") {
    const row = snapshot.settings;
    return row && normalizeGroupId(row.group_id) === groupId ? [row] : [];
  }

  const rows = snapshot[store];
  return Array.isArray(rows)
    ? rows.filter((row) => normalizeGroupId(row.group_id) === groupId)
    : [];
}

async function saveMigrationLocalDifference(
  store: PushableStore,
  localRow: Record<string, unknown>,
  remoteRow: Record<string, unknown> | null,
  groupId: string,
): Promise<"queued" | "conflict" | "existing"> {
  const normalizedLocal = clearEventSyncMarker(store, localRow as PushableRow);
  const payload = toRecord(normalizedLocal);
  const rowKey = getRowKey(store, payload);
  const key = queueKey(store, rowKey);
  const db = await getDb();
  const tx = db.transaction(
    [store, "sync_queue", "sync_conflicts"],
    "readwrite",
  ) as PushableTransaction;
  const queueStore = tx.objectStore("sync_queue");
  const conflictStore = tx.objectStore("sync_conflicts");
  const [existingQueue, existingConflict] = await Promise.all([
    queueStore.get(key),
    conflictStore.get(key),
  ]);

  if (existingQueue || existingConflict) {
    await tx.done;
    return "existing";
  }

  await tx.objectStore(store).put(normalizedLocal as never);

  if (remoteRow) {
    await conflictStore.put({
      key,
      store,
      row_key: rowKey,
      group_id: groupId,
      local_row: payload,
      remote_row: remoteRow,
      remote_updated_at:
        typeof remoteRow.updated_at === "string" ? remoteRow.updated_at : null,
      detected_at: nowISO(),
    });
    await tx.done;
    return "conflict";
  }

  await queueStore.put({
    key,
    store,
    row_key: rowKey,
    group_id: groupId,
    change_id: createChangeId(),
    base_updated_at: null,
    payload,
    queued_at: nowISO(),
  });
  await tx.done;
  return "queued";
}

async function putLocalRow<T extends PushableRow>(
  store: PushableStore,
  row: T,
  options: LocalWriteOptions = {},
): Promise<void> {
  const normalizedRow = clearEventSyncMarker(store, row);
  const rowRecord = toRecord(normalizedRow);
  const rowKey = getRowKey(store, rowRecord);
  const groupId = normalizeGroupId(rowRecord.group_id);
  if (!groupId) throw new Error(`${store} の group_id がありません`);

  const db = await getDb();
  const tx = db.transaction(
    [store, "sync_queue", "sync_conflicts"],
    "readwrite",
  ) as PushableTransaction;
  const dataStore = tx.objectStore(store);
  const queueStore = tx.objectStore("sync_queue");
  const conflictStore = tx.objectStore("sync_conflicts");
  const key = queueKey(store, rowKey);
  const existingQueue = await queueStore.get(key);
  const existingConflict = await conflictStore.get(key);
  const existingRow = (await dataStore.get(rowKey)) as
    | GroupAwareRow
    | undefined;

  await dataStore.put(normalizedRow as never);

  if (existingConflict) {
    await conflictStore.put({
      ...existingConflict,
      local_row: rowRecord,
      detected_at: nowISO(),
    });
  } else {
    const entry: SyncQueueEntry = {
      key,
      store,
      row_key: rowKey,
      group_id: groupId,
      change_id: createChangeId(),
      base_updated_at: existingQueue
        ? existingQueue.base_updated_at
        : options.baseUpdatedAt !== undefined
          ? options.baseUpdatedAt
          : typeof existingRow?.updated_at === "string"
            ? existingRow.updated_at
            : null,
      payload: rowRecord,
      queued_at: nowISO(),
    };
    await queueStore.put(entry);
  }

  await tx.done;
  if (!existingConflict) emitLocalChange([store], groupId);
}

async function putRemoteRow(
  store: PushableStore,
  row: PushableRow,
): Promise<void> {
  const db = await getDb();
  if (store === "events") {
    const event = row as EventRow;
    await db.put("events", {
      ...event,
      synced_at: event.updated_at || nowISO(),
    });
    return;
  }

  switch (store) {
    case "users":
      await db.put("users", row as User);
      return;
    case "records":
      await db.put("records", row as RecordRow);
      return;
    case "medications":
      await db.put("medications", row as Medication);
      return;
    case "reminders":
      await db.put("reminders", row as Reminder);
      return;
    case "settings":
      await db.put("settings", row as SettingsRow);
      return;
  }
}

async function getLocalRow(
  store: PushableStore,
  rowKey: string,
): Promise<Record<string, unknown> | null> {
  const db = await getDb();
  let row: object | undefined;
  switch (store) {
    case "users":
      row = await db.get("users", rowKey);
      break;
    case "records":
      row = await db.get("records", rowKey);
      break;
    case "medications":
      row = await db.get("medications", rowKey);
      break;
    case "events":
      row = await db.get("events", rowKey);
      break;
    case "reminders":
      row = await db.get("reminders", rowKey);
      break;
    case "settings":
      row = await db.get("settings", rowKey);
      break;
  }
  return row ? toRecord(row) : null;
}

async function deleteLocalDataRow(
  store: PushableStore,
  rowKey: string,
): Promise<void> {
  const db = await getDb();
  switch (store) {
    case "users":
      await db.delete("users", rowKey);
      return;
    case "records":
      await db.delete("records", rowKey);
      return;
    case "medications":
      await db.delete("medications", rowKey);
      return;
    case "events":
      await db.delete("events", rowKey);
      return;
    case "reminders":
      await db.delete("reminders", rowKey);
      return;
    case "settings":
      await db.delete("settings", rowKey);
      return;
  }
}

async function deleteQueueAndConflict(
  store: PushableStore,
  rowKey: string,
): Promise<void> {
  const db = await getDb();
  const key = queueKey(store, rowKey);
  const tx = db.transaction(["sync_queue", "sync_conflicts"], "readwrite");
  await tx.objectStore("sync_queue").delete(key);
  await tx.objectStore("sync_conflicts").delete(key);
  await tx.done;
}

// =============================================================
// メタ情報
// =============================================================
export async function getMeta(key: string): Promise<string | null> {
  const db = await getDb();
  const value = (await db.get("meta", key))?.value;
  if (value === null || value === undefined) return null;
  return typeof value === "string" ? value : String(value);
}

export async function setMeta(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.put("meta", { key, value });
}

// =============================================================
// AI設定（端末ローカルのみ）
// =============================================================
export async function getAiSettings(): Promise<AiSettings | null> {
  const value = await getMeta("ai_settings");
  if (!value) return null;
  try {
    return JSON.parse(value) as AiSettings;
  } catch {
    return null;
  }
}

export async function saveAiSettings(settings: AiSettings): Promise<void> {
  await setMeta("ai_settings", JSON.stringify(settings));
}

// =============================================================
// グループ
// =============================================================
export async function getCurrentGroup(): Promise<CurrentGroup | null> {
  const db = await getDb();
  const groupId =
    (await getMeta("active_group_id")) || (await getMeta("current_group_id"));
  if (!groupId) return null;

  const group = await db.get("groups", groupId);
  if (!group) {
    const name = await getMeta("current_group_name");
    return name ? { group_id: groupId, group_name: name } : null;
  }

  return {
    ...group,
    group_id: group.uuid,
    group_name: String(group.name ?? "家族"),
  };
}

export async function setCurrentGroup(
  groupId: string,
  groupName: string,
): Promise<void> {
  await setMeta("current_group_id", groupId);
  await setMeta("active_group_id", groupId);
  await setMeta("current_group_name", groupName);
}

// =============================================================
// 共有設定
// =============================================================
export async function getSettings(
  groupId: string,
): Promise<SettingsRow | null> {
  const db = await getDb();
  return (await db.get("settings", groupId)) ?? null;
}

export async function upsertSettings(
  row: SettingsRow,
  source: DataWriteSource = "local",
): Promise<void> {
  if (source === "local") {
    await putLocalRow("settings", row);
  } else {
    await putRemoteRow("settings", row);
  }
}

export async function ensureSettings(groupId: string): Promise<SettingsRow> {
  const current = await getSettings(groupId);
  if (current) return current;

  // サーバー取得前の表示用既定値。保存も同期予約も行わない。
  return { group_id: groupId, show_temp_on_home: true, updated_at: "" };
}

// =============================================================
// ユーザー
// =============================================================
export async function listUsers(groupId: string): Promise<User[]> {
  const db = await getDb();
  const rows = await db.getAllFromIndex("users", "by_group", groupId);
  return rows
    .filter((row) => row.is_deleted === 0)
    .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
}

export async function upsertUser(
  row: User,
  source: DataWriteSource = "local",
  options: LocalWriteOptions = {},
): Promise<void> {
  if (source === "local") await putLocalRow("users", row, options);
  else await putRemoteRow("users", row);
}

export async function softDeleteUser(
  uuid: string,
  source: DataWriteSource = "local",
  options: LocalWriteOptions = {},
): Promise<void> {
  const db = await getDb();
  const current = await db.get("users", uuid);
  if (!current) return;
  await upsertUser(
    { ...current, is_deleted: 1, updated_at: nowISO() },
    source,
    options,
  );
}

export async function deleteUser(
  uuid: string,
  source: DataWriteSource = "local",
  options: LocalWriteOptions = {},
): Promise<void> {
  await softDeleteUser(uuid, source, options);
}

export async function updateUserOrder(
  items: { uuid: string; display_order: number }[],
  source: DataWriteSource = "local",
): Promise<void> {
  if (items.length === 0) return;
  const db = await getDb();
  const rows: User[] = [];
  for (const item of items) {
    const current = await db.get("users", item.uuid);
    if (current) {
      rows.push({
        ...current,
        display_order: item.display_order,
        updated_at: nowISO(),
      });
    }
  }
  if (source === "remote") {
    for (const row of rows) await putRemoteRow("users", row);
  } else {
    await putLocalRowsAtomically("users", rows);
  }
}

// =============================================================
// 体温記録
// =============================================================
export async function listRecords(userUuid: string): Promise<RecordRow[]> {
  const db = await getDb();
  const rows = await db.getAllFromIndex("records", "by_user", userUuid);
  return rows
    .filter((row) => row.is_deleted === 0)
    .sort((a, b) => b.measured_at.localeCompare(a.measured_at));
}

export async function upsertRecord(
  row: RecordRow,
  source: DataWriteSource = "local",
  options: LocalWriteOptions = {},
): Promise<void> {
  if (source === "local") await putLocalRow("records", row, options);
  else await putRemoteRow("records", row);
}

// =============================================================
// お薬
// =============================================================
export type MedicationSortBy = "yomi" | "order" | "created";

export async function getMedications(
  groupId?: string,
  sortBy: MedicationSortBy = "yomi",
): Promise<Medication[]> {
  let targetGroupId = groupId;
  if (!targetGroupId) {
    targetGroupId = (await getCurrentGroup())?.group_id;
    if (!targetGroupId) return [];
  }

  const db = await getDb();
  const rows = (
    await db.getAllFromIndex("medications", "by_group", targetGroupId)
  ).filter((row) => row.is_deleted === 0);

  switch (sortBy) {
    case "order":
      return rows.sort(
        (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0),
      );
    case "created":
      return rows.sort((a, b) =>
        (a.created_at ?? a.updated_at).localeCompare(
          b.created_at ?? b.updated_at,
        ),
      );
    case "yomi":
    default:
      return rows.sort((a, b) => {
        const aYomi = a.yomi || a.name || "";
        const bYomi = b.yomi || b.name || "";
        if (aYomi !== bYomi) return aYomi.localeCompare(bYomi, "ja");
        return (a.created_at || a.updated_at).localeCompare(
          b.created_at || b.updated_at,
        );
      });
  }
}

export async function upsertMedication(
  row: Medication,
  source: DataWriteSource = "local",
  options: LocalWriteOptions = {},
): Promise<void> {
  if (source === "local") await putLocalRow("medications", row, options);
  else await putRemoteRow("medications", row);
}

export async function updateMedicationOrder(rows: Medication[]): Promise<void> {
  await putLocalRowsAtomically("medications", rows);
}

export async function deleteMedication(
  uuid: string,
  source: DataWriteSource = "local",
  options: LocalWriteOptions = {},
): Promise<void> {
  const db = await getDb();
  const current = await db.get("medications", uuid);
  if (!current) return;
  await upsertMedication(
    { ...current, is_deleted: 1, updated_at: nowISO() },
    source,
    options,
  );
}

// =============================================================
// イベント
// =============================================================
export async function listEvents(userUuid: string): Promise<EventRow[]> {
  const db = await getDb();
  const rows = await db.getAllFromIndex("events", "by_user", userUuid);
  return rows
    .filter((row) => row.is_deleted === 0)
    .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
}

export async function upsertEvent(
  row: EventRow,
  source: DataWriteSource = "local",
  options: LocalWriteOptions = {},
): Promise<void> {
  if (source === "local") await putLocalRow("events", row, options);
  else await putRemoteRow("events", row);
}

// =============================================================
// リマインダー
// =============================================================
export async function listReminders(userUuid: string): Promise<Reminder[]> {
  const db = await getDb();
  const rows = await db.getAllFromIndex("reminders", "by_user", userUuid);
  return rows
    .filter((row) => row.is_deleted === 0)
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
}

export async function upsertReminder(
  row: Reminder,
  source: DataWriteSource = "local",
  options: LocalWriteOptions = {},
): Promise<void> {
  if (source === "local") await putLocalRow("reminders", row, options);
  else await putRemoteRow("reminders", row);
}

// =============================================================
// 複数行ローカル保存（単一トランザクション）
// =============================================================
async function putLocalRowsAtomically<T extends PushableRow>(
  store: PushableStore,
  rows: T[],
): Promise<void> {
  if (rows.length === 0) return;
  const db = await getDb();
  const tx = db.transaction(
    [store, "sync_queue", "sync_conflicts"],
    "readwrite",
  ) as PushableTransaction;
  const dataStore = tx.objectStore(store);
  const queueStore = tx.objectStore("sync_queue");
  const conflictStore = tx.objectStore("sync_conflicts");
  const normalizedRows = rows.map((row) => clearEventSyncMarker(store, row));
  const queuedRows: GroupAwareRow[] = [];

  for (const row of normalizedRows) {
    const record = toRecord(row);
    const rowKey = getRowKey(store, record);
    const groupId = normalizeGroupId(record.group_id);
    if (!groupId) throw new Error(`${store} の group_id がありません`);
    const key = queueKey(store, rowKey);
    const existingQueue = await queueStore.get(key);
    const existingConflict = await conflictStore.get(key);
    const existingRow = (await dataStore.get(rowKey)) as
      | GroupAwareRow
      | undefined;

    await dataStore.put(row as never);

    if (existingConflict) {
      await conflictStore.put({
        ...existingConflict,
        local_row: record,
        detected_at: nowISO(),
      });
      continue;
    }

    await queueStore.put({
      key,
      store,
      row_key: rowKey,
      group_id: groupId,
      change_id: createChangeId(),
      base_updated_at: existingQueue
        ? existingQueue.base_updated_at
        : typeof existingRow?.updated_at === "string"
          ? existingRow.updated_at
          : null,
      payload: record,
      queued_at: nowISO(),
    });
    queuedRows.push(record);
  }

  await tx.done;
  if (queuedRows.length > 0) {
    notifyLocalChange("local", store, getSingleGroupId(store, queuedRows));
  }
}

// =============================================================
// 旧同期方式からの初回安全移行
// =============================================================
export async function reconcileLegacySyncSnapshot(
  groupId: string,
  snapshot: LegacySyncSnapshot,
): Promise<LegacySyncReconciliationResult> {
  const changedStores = new Set<SyncStoreName>();
  let queued = 0;
  let conflicts = 0;
  let pulled = 0;
  const stores: readonly PushableStore[] = [
    "users",
    "records",
    "medications",
    "events",
    "reminders",
    "settings",
  ];

  for (const store of stores) {
    const localRows = await getMigrationLocalRows(store, groupId);
    const remoteRows = getMigrationRemoteRows(snapshot, store, groupId);
    const remoteByKey = new Map<string, Record<string, unknown>>();

    for (const remoteRow of remoteRows) {
      remoteByKey.set(getRowKey(store, remoteRow), remoteRow);
    }

    for (const localRow of localRows) {
      const rowKey = getRowKey(store, localRow);
      const remoteRow = remoteByKey.get(rowKey) ?? null;
      if (remoteRow) remoteByKey.delete(rowKey);

      if (!remoteRow) {
        const result = await saveMigrationLocalDifference(
          store,
          localRow,
          null,
          groupId,
        );
        if (result === "queued") {
          queued += 1;
          changedStores.add(store);
        }
        continue;
      }

      if (rowsEquivalentForMigration(localRow, remoteRow)) {
        if (!(await hasPendingOrConflict(store, rowKey))) {
          await putRemoteRow(store, remoteRow as PushableRow);
          pulled += 1;
          changedStores.add(store);
        }
        continue;
      }

      const result = await saveMigrationLocalDifference(
        store,
        localRow,
        remoteRow,
        groupId,
      );
      if (result === "conflict") {
        conflicts += 1;
        changedStores.add(store);
      }
    }

    for (const [rowKey, remoteRow] of remoteByKey) {
      if (await hasPendingOrConflict(store, rowKey)) continue;
      await putRemoteRow(store, remoteRow as PushableRow);
      pulled += 1;
      changedStores.add(store);
    }
  }

  const group = Array.isArray(snapshot.groups)
    ? snapshot.groups.find((row) => String(row.uuid ?? "") === groupId)
    : undefined;
  if (group) {
    const db = await getDb();
    await db.put("groups", group as Record<string, unknown> & { uuid: string });
    pulled += 1;
    changedStores.add("groups");
  }

  return { queued, conflicts, pulled, changedStores: [...changedStores] };
}

// =============================================================
// 同期キュー・競合
// =============================================================
export async function getQueuedChanges(
  groupId: string,
): Promise<SyncQueueEntry[]> {
  const db = await getDb();
  return db.getAllFromIndex("sync_queue", "by_group", groupId);
}

export function buildSyncPushPayload(
  entries: readonly SyncQueueEntry[],
): SyncPushPayload {
  const payload: SyncPushPayload = {
    users: [],
    records: [],
    medications: [],
    events: [],
    reminders: [],
  };

  for (const entry of entries) {
    const row: SyncPushRow = {
      ...entry.payload,
      _base_updated_at: entry.base_updated_at,
      _client_change_id: entry.change_id,
    };
    if (entry.store === "settings") payload.settings = row;
    else payload[entry.store].push(row);
  }

  return payload;
}

export async function applyPushAcknowledgements(
  acknowledgements: readonly PushAcknowledgement[],
): Promise<void> {
  for (const acknowledgement of acknowledgements) {
    const db = await getDb();
    const key = queueKey(acknowledgement.store, acknowledgement.row_key);
    const currentQueue = await db.get("sync_queue", key);
    if (!currentQueue) continue;

    if (currentQueue.change_id !== acknowledgement.change_id) {
      await db.put("sync_queue", {
        ...currentQueue,
        base_updated_at: acknowledgement.updated_at,
      });
      continue;
    }

    const localRow = await getLocalRow(
      acknowledgement.store,
      acknowledgement.row_key,
    );
    if (localRow) {
      const acknowledgedRow = {
        ...localRow,
        updated_at: acknowledgement.updated_at,
        ...(acknowledgement.store === "events"
          ? { synced_at: acknowledgement.updated_at }
          : null),
      } as PushableRow;
      await putRemoteRow(acknowledgement.store, acknowledgedRow);
    }
    await deleteQueueAndConflict(
      acknowledgement.store,
      acknowledgement.row_key,
    );
  }
}

export async function savePushConflicts(
  conflicts: readonly PushConflict[],
): Promise<void> {
  if (conflicts.length === 0) return;
  const db = await getDb();

  for (const conflict of conflicts) {
    const key = queueKey(conflict.store, conflict.row_key);
    const currentQueue = await db.get("sync_queue", key);
    if (!currentQueue) continue;

    const entry: SyncConflictEntry = {
      key,
      store: conflict.store,
      row_key: conflict.row_key,
      group_id: currentQueue.group_id,
      local_row: currentQueue.payload,
      remote_row: conflict.remote_row,
      remote_updated_at: conflict.remote_updated_at,
      detected_at: nowISO(),
    };

    const tx = db.transaction(["sync_queue", "sync_conflicts"], "readwrite");
    await tx.objectStore("sync_queue").delete(key);
    await tx.objectStore("sync_conflicts").put(entry);
    await tx.done;
  }
}

export async function listSyncConflicts(
  groupId: string,
): Promise<SyncConflictEntry[]> {
  const db = await getDb();
  return db.getAllFromIndex("sync_conflicts", "by_group", groupId);
}

export async function resolveConflictUseRemote(key: string): Promise<void> {
  const db = await getDb();
  const conflict = await db.get("sync_conflicts", key);
  if (!conflict) return;

  if (conflict.remote_row) {
    await putRemoteRow(conflict.store, conflict.remote_row as PushableRow);
  } else {
    await deleteLocalDataRow(conflict.store, conflict.row_key);
  }

  await deleteQueueAndConflict(conflict.store, conflict.row_key);
  await setMeta("sync_pull_cursor", EPOCH_ISO);
  await setMeta("last_sync", EPOCH_ISO);
  emitDataRefreshRequested("manual", [conflict.store]);
}

export async function resolveConflictUseLocal(key: string): Promise<void> {
  const db = await getDb();
  const conflict = await db.get("sync_conflicts", key);
  if (!conflict) return;

  const nextQueue: SyncQueueEntry = {
    key: conflict.key,
    store: conflict.store,
    row_key: conflict.row_key,
    group_id: conflict.group_id,
    change_id: createChangeId(),
    base_updated_at: conflict.remote_updated_at,
    payload: conflict.local_row,
    queued_at: nowISO(),
  };

  const tx = db.transaction(["sync_queue", "sync_conflicts"], "readwrite");
  await tx.objectStore("sync_queue").put(nextQueue);
  await tx.objectStore("sync_conflicts").delete(key);
  await tx.done;
  emitLocalChange([conflict.store], conflict.group_id);
}

export async function hasPendingOrConflict(
  store: PushableStore,
  rowKey: string,
): Promise<boolean> {
  const db = await getDb();
  const key = queueKey(store, rowKey);
  const [pending, conflict] = await Promise.all([
    db.get("sync_queue", key),
    db.get("sync_conflicts", key),
  ]);
  return Boolean(pending || conflict);
}

// =============================================================
// 同期概要・競合一括確定・ローカル下書き
// =============================================================
export async function getSyncOverview(groupId: string): Promise<SyncOverview> {
  const db = await getDb();
  const [queued, conflicts] = await Promise.all([
    db.getAllFromIndex("sync_queue", "by_group", groupId),
    db.getAllFromIndex("sync_conflicts", "by_group", groupId),
  ]);
  const pendingCountByStore: Partial<Record<PushableStore, number>> = {};
  for (const entry of queued) {
    pendingCountByStore[entry.store] = (pendingCountByStore[entry.store] ?? 0) + 1;
  }
  return {
    pendingChangeCount: queued.length,
    pendingCountByStore,
    conflictCount: conflicts.length,
  };
}

export async function applyConflictResolutions(
  choices: readonly ConflictResolutionChoice[],
): Promise<{ requiresFullSync: boolean; changedStores: SyncStoreName[] }> {
  if (choices.length === 0) return { requiresFullSync: false, changedStores: [] };
  const db = await getDb();
  const storeNames: PushableStore[] = [
    "users",
    "records",
    "medications",
    "events",
    "reminders",
    "settings",
  ];
  const tx = db.transaction(
    [...storeNames, "sync_queue", "sync_conflicts", "meta"],
    "readwrite",
  );
  const changedStores = new Set<SyncStoreName>();
  let requiresFullSync = false;

  for (const choice of choices) {
    const conflict = await tx.objectStore("sync_conflicts").get(choice.key);
    if (!conflict) continue;
    changedStores.add(conflict.store);

    if (choice.choice === "remote") {
      requiresFullSync = true;
      if (conflict.remote_row) {
        await tx.objectStore(conflict.store).put(conflict.remote_row as never);
      } else {
        await tx.objectStore(conflict.store).delete(conflict.row_key);
      }
      await tx.objectStore("sync_queue").delete(conflict.key);
    } else {
      const nextQueue: SyncQueueEntry = {
        key: conflict.key,
        store: conflict.store,
        row_key: conflict.row_key,
        group_id: conflict.group_id,
        change_id: createChangeId(),
        base_updated_at: conflict.remote_updated_at,
        payload: conflict.local_row,
        queued_at: nowISO(),
      };
      await tx.objectStore(conflict.store).put(conflict.local_row as never);
      await tx.objectStore("sync_queue").put(nextQueue);
    }

    await tx.objectStore("sync_conflicts").delete(conflict.key);
  }

  if (requiresFullSync) {
    await tx.objectStore("meta").put({ key: "sync_pull_cursor", value: EPOCH_ISO });
    await tx.objectStore("meta").put({ key: "last_sync", value: EPOCH_ISO });
  }
  await tx.done;

  const stores = [...changedStores];
  if (stores.length > 0) {
    emitDataRefreshRequested("manual", stores);
  }
  const localStores = choices
    .filter((choice) => choice.choice === "local")
    .map((choice) => choice.key.split(":", 1)[0] as PushableStore);
  if (localStores.length > 0) emitLocalChange(localStores);

  return { requiresFullSync, changedStores: stores };
}

function addDaysIso(baseIso: string, days: number): string {
  return new Date(new Date(baseIso).getTime() + days * 86_400_000).toISOString();
}

export async function saveDraft(input: DraftSaveInput): Promise<DraftEntry> {
  const db = await getDb();
  const now = input.updated_at ?? nowISO();
  const existing = await db.get("drafts", input.key);
  const entry: DraftEntry = {
    ...input,
    created_at: input.created_at ?? existing?.created_at ?? now,
    updated_at: now,
    expires_at: input.expires_at ?? addDaysIso(now, 30),
  };
  await db.put("drafts", entry);
  return entry;
}

export async function getDraft(key: string): Promise<DraftEntry | null> {
  const db = await getDb();
  return (await db.get("drafts", key)) ?? null;
}

export async function listDrafts(groupId: string): Promise<DraftEntry[]> {
  const db = await getDb();
  return (await db.getAllFromIndex("drafts", "by_group", groupId)).sort((a, b) =>
    b.updated_at.localeCompare(a.updated_at),
  );
}

export async function deleteDraft(key: string): Promise<void> {
  const db = await getDb();
  await db.delete("drafts", key);
}

export async function purgeExpiredDrafts(referenceIso = nowISO()): Promise<number> {
  const db = await getDb();
  const drafts = await db.getAll("drafts");
  const expired = drafts.filter((draft) => draft.expires_at <= referenceIso);
  if (expired.length === 0) return 0;
  const tx = db.transaction("drafts", "readwrite");
  for (const draft of expired) await tx.store.delete(draft.key);
  await tx.done;
  return expired.length;
}

export async function getSharedRow(
  store: PushableStore,
  rowKey: string,
): Promise<Record<string, unknown> | null> {
  return getLocalRow(store, rowKey);
}

// =============================================================
// リモート反映
// =============================================================
export async function upsertAll(
  store: SharedRowStore,
  rows: SharedRow[],
  source: DataWriteSource = "remote",
): Promise<number> {
  if (rows.length === 0) return 0;

  if (store === "groups") {
    const db = await getDb();
    for (const row of rows)
      await db.put("groups", row as Record<string, unknown> & { uuid: string });
    notifyLocalChange(source, store, getSingleGroupId(store, rows));
    return rows.length;
  }

  let changed = 0;
  for (const row of rows) {
    const record = toRecord(row);
    const rowKey = getRowKey(store, record);
    if (source === "remote" && (await hasPendingOrConflict(store, rowKey)))
      continue;
    await putRemoteRow(store, row as PushableRow);
    changed += 1;
  }
  notifyLocalChange(source, store, getSingleGroupId(store, rows));
  return changed;
}

export async function guardedUpsertAll(
  store: SharedRowStore,
  rows: SharedRow[],
  source: DataWriteSource = "remote",
): Promise<number> {
  return upsertAll(store, rows, source);
}

// =============================================================
// 端末ストレージ肥大化防止
// =============================================================
export async function countEvents(groupId: string): Promise<number> {
  const db = await getDb();
  return (await db.getAllFromIndex("events", "by_group", groupId)).length;
}

export async function deleteOldestSyncedEvents(
  groupId: string,
  deleteCount: number,
): Promise<number> {
  if (deleteCount <= 0) return 0;
  const db = await getDb();
  const events = await db.getAllFromIndex("events", "by_group", groupId);
  const candidates: EventRow[] = [];

  for (const event of events) {
    if (event.is_deleted !== 1 || !event.synced_at) continue;
    if (await hasPendingOrConflict("events", event.uuid)) continue;
    candidates.push(event);
  }

  candidates.sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
  const targets = candidates.slice(0, deleteCount);
  if (targets.length === 0) return 0;

  const tx = db.transaction("events", "readwrite");
  for (const event of targets) await tx.store.delete(event.uuid);
  await tx.done;
  return targets.length;
}

export async function pruneLocalEventsIfNeeded(
  groupId: string,
  maxCount: number = 10_000,
): Promise<number> {
  const total = await countEvents(groupId);
  if (total <= maxCount) return 0;
  return deleteOldestSyncedEvents(groupId, total - maxCount);
}

export const LocalDb = {
  getMeta,
  setMeta,
  getCurrentGroup,
  setCurrentGroup,
  getSettings,
  upsertSettings,
  ensureSettings,
  getAiSettings,
  saveAiSettings,
  listUsers,
  upsertUser,
  softDeleteUser,
  deleteUser,
  updateUserOrder,
  listRecords,
  upsertRecord,
  getMedications,
  upsertMedication,
  updateMedicationOrder,
  deleteMedication,
  listEvents,
  upsertEvent,
  listReminders,
  upsertReminder,
  reconcileLegacySyncSnapshot,
  getQueuedChanges,
  buildSyncPushPayload,
  applyPushAcknowledgements,
  savePushConflicts,
  listSyncConflicts,
  resolveConflictUseRemote,
  resolveConflictUseLocal,
  applyConflictResolutions,
  getSyncOverview,
  hasPendingOrConflict,
  saveDraft,
  getDraft,
  listDrafts,
  deleteDraft,
  purgeExpiredDrafts,
  getSharedRow,
  upsertAll,
  guardedUpsertAll,
  countEvents,
  deleteOldestSyncedEvents,
  pruneLocalEventsIfNeeded,
};

export default LocalDb;
