import type { SyncConflictEntry } from "../../data/local/localDb";

export type ConflictLookup = {
  userNames: Map<string, string>;
  medicationNames: Map<string, string>;
};

export type ConflictField = {
  key: string;
  label: string;
  localValue: string;
  remoteValue: string;
};

export type PresentedConflict = {
  title: string;
  subtitle: string | null;
  fields: ConflictField[];
  localDeleted: boolean;
  remoteDeleted: boolean;
};

type FieldDefinition = {
  key: string;
  label: string;
  format?: (value: unknown, row: Record<string, unknown>, lookup: ConflictLookup) => string;
};

const japanDateTime = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function formatDateTime(value: unknown): string {
  if (typeof value !== "string" || !value) return "未設定";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : japanDateTime.format(date);
}

function formatBoolean(value: unknown): string {
  return value === true || value === 1 || value === "1" ? "はい" : "いいえ";
}

function formatText(value: unknown): string {
  if (value === null || value === undefined || value === "") return "未設定";
  if (Array.isArray(value)) return value.length > 0 ? value.join("、") : "未設定";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function formatSchedule(value: unknown): string {
  if (!value || typeof value !== "object") return "未設定";
  const schedule = value as Record<string, unknown>;
  if (schedule.type === "interval") {
    const hours = formatText(schedule.interval_hours);
    const max = formatText(schedule.max_times);
    return `${hours}時間おき・1日最大${max}回`;
  }
  const labels: Array<[string, string]> = [
    ["wakeup", "起床時"],
    ["morning", "朝"],
    ["lunch", "昼"],
    ["evening", "夕"],
    ["bedtime", "就寝前"],
  ];
  const selected = labels
    .filter(([key]) => Number(schedule[key] ?? 0) > 0)
    .map(([, label]) => label);
  return selected.length > 0 ? selected.join("・") : "未設定";
}

function resolveUser(value: unknown, lookup: ConflictLookup): string {
  const key = formatText(value);
  return lookup.userNames.get(key) ?? key;
}

function resolveMedication(value: unknown, lookup: ConflictLookup): string {
  const key = formatText(value);
  return lookup.medicationNames.get(key) ?? key;
}

function summarizePayload(value: unknown, lookup: ConflictLookup): string {
  if (value === null || value === undefined || value === "") return "未設定";
  if (typeof value !== "string") return formatText(value);
  const medicationName = lookup.medicationNames.get(value);
  if (medicationName) return medicationName;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === "object") {
      const source = parsed as Record<string, unknown>;
      const parts = Object.entries(source)
        .filter(([key]) => !["uuid", "group_id", "updated_at", "synced_at"].includes(key))
        .map(([key, item]) => `${key}: ${formatText(item)}`);
      return parts.length > 0 ? parts.join("／") : "内容なし";
    }
  } catch {
    // 旧形式の薬ID・自由入力文字列はそのまま表示する。
  }
  return value;
}

const DEFINITIONS: Record<SyncConflictEntry["store"], FieldDefinition[]> = {
  users: [
    { key: "name", label: "名前" },
    { key: "birth_date", label: "生年月日" },
    { key: "gender", label: "性別" },
    { key: "allergy", label: "アレルギー" },
    { key: "history", label: "既往歴" },
    { key: "note", label: "メモ" },
    { key: "display_order", label: "表示順" },
  ],
  records: [
    { key: "temp", label: "体温", format: (value) => (value === 0 ? "投薬記録" : `${formatText(value)}℃`) },
    { key: "memo", label: "メモ" },
    { key: "measured_at", label: "測定日時", format: formatDateTime },
    { key: "user_uuid", label: "対象メンバー", format: (value, _row, lookup) => resolveUser(value, lookup) },
  ],
  medications: [
    { key: "name", label: "お薬名" },
    { key: "yomi", label: "よみがな" },
    { key: "target_user_id", label: "対象メンバー", format: (value, _row, lookup) => resolveUser(value, lookup) },
    { key: "doctor_comment", label: "医師・薬剤師コメント" },
    { key: "show_in_input", label: "記録画面に表示", format: formatBoolean },
    { key: "schedule", label: "服薬スケジュール", format: formatSchedule },
    { key: "memo_taste", label: "飲み方メモ" },
    { key: "taste_rating", label: "飲みやすさ" },
    { key: "display_order", label: "表示順" },
  ],
  events: [
    { key: "event_type", label: "記録種別" },
    { key: "occurred_at", label: "記録日時", format: formatDateTime },
    { key: "user_uuid", label: "対象メンバー", format: (value, _row, lookup) => resolveUser(value, lookup) },
    { key: "medication_uuid", label: "お薬", format: (value, _row, lookup) => resolveMedication(value, lookup) },
    { key: "payload", label: "内容", format: (value, _row, lookup) => summarizePayload(value, lookup) },
    { key: "note", label: "メモ" },
  ],
  reminders: [
    { key: "title", label: "タイトル" },
    { key: "scheduled_at", label: "予定日時", format: formatDateTime },
    { key: "user_uuid", label: "対象メンバー", format: (value, _row, lookup) => resolveUser(value, lookup) },
    { key: "medication_uuid", label: "お薬", format: (value, _row, lookup) => resolveMedication(value, lookup) },
    { key: "is_notified", label: "通知済み", format: formatBoolean },
    { key: "is_completed", label: "完了", format: formatBoolean },
  ],
  settings: [
    { key: "show_temp_on_home", label: "ホームに体温を表示", format: formatBoolean },
  ],
};

function isDeleted(row: Record<string, unknown> | null): boolean {
  return row === null || row.is_deleted === 1 || row.is_deleted === "1";
}

function rowTitle(conflict: SyncConflictEntry): string {
  const local = conflict.local_row;
  const remote = conflict.remote_row ?? {};
  switch (conflict.store) {
    case "users":
      return `メンバー：${formatText(local.name ?? remote.name)}`;
    case "records":
      return "体温記録";
    case "medications":
      return `お薬：${formatText(local.name ?? remote.name)}`;
    case "events":
      return "服薬・メモ記録";
    case "reminders":
      return `リマインダー：${formatText(local.title ?? remote.title)}`;
    case "settings":
      return "共有表示設定";
  }
}

function rowSubtitle(conflict: SyncConflictEntry, lookup: ConflictLookup): string | null {
  const row = conflict.local_row ?? conflict.remote_row ?? {};
  const userId = row.user_uuid;
  if (typeof userId === "string") return lookup.userNames.get(userId) ?? null;
  const dateValue = row.measured_at ?? row.occurred_at ?? row.scheduled_at;
  return typeof dateValue === "string" ? formatDateTime(dateValue) : null;
}

export function presentConflict(
  conflict: SyncConflictEntry,
  lookup: ConflictLookup,
): PresentedConflict {
  const local = conflict.local_row;
  const remote = conflict.remote_row;
  const localDeleted = isDeleted(local);
  const remoteDeleted = isDeleted(remote);
  const fields: ConflictField[] = [];

  for (const definition of DEFINITIONS[conflict.store]) {
    const localRaw = local?.[definition.key];
    const remoteRaw = remote?.[definition.key];
    const formatter = definition.format ?? ((value: unknown) => formatText(value));
    const localValue = localDeleted ? "削除されています" : formatter(localRaw, local, lookup);
    const remoteValue = remoteDeleted
      ? "削除されています"
      : formatter(remoteRaw, remote ?? {}, lookup);
    if (localValue === remoteValue) continue;
    fields.push({ key: definition.key, label: definition.label, localValue, remoteValue });
  }

  if (fields.length === 0 && localDeleted !== remoteDeleted) {
    fields.push({
      key: "deleted",
      label: "保存状態",
      localValue: localDeleted ? "削除されています" : "保存されています",
      remoteValue: remoteDeleted ? "削除されています" : "保存されています",
    });
  }

  return {
    title: rowTitle(conflict),
    subtitle: rowSubtitle(conflict, lookup),
    fields,
    localDeleted,
    remoteDeleted,
  };
}
