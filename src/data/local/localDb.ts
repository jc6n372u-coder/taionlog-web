import { getDb } from "./db";
import type { User, RecordRow, Medication, EventRow, Reminder, SettingsRow, AiSettings } from "../../utils/types";

const nowISO = () => new Date().toISOString();

// =============================================================
// メタ情報（任意の key/value）
// =============================================================
export async function getMeta(key: string) {
  const db = await getDb();
  return (await db.get("meta", key))?.value ?? null;
}

export async function setMeta(key: string, value: string) {
  const db = await getDb();
  await db.put("meta", { key, value });
}

// =============================================================
// AI 設定（端末ローカル保存。クラウド同期しない）
// =============================================================
export async function getAiSettings(): Promise<AiSettings | null> {
  const val = await getMeta("ai_settings");
  if (!val) return null;
  try {
    return JSON.parse(val);
  } catch {
    return null;
  }
}

export async function saveAiSettings(settings: AiSettings) {
  await setMeta("ai_settings", JSON.stringify(settings));
}

// =============================================================
// グループ
// =============================================================
export async function getCurrentGroup(): Promise<any> {
  const db = await getDb();

  const gid = (await getMeta("active_group_id")) || (await getMeta("current_group_id"));
  if (!gid) return null;

  const g = await db.get("groups", gid);

  if (!g) {
    // groups テーブルに無くても meta に名前があれば最低限返す
    const name = await getMeta("current_group_name");
    return name ? { group_id: gid, group_name: name } : null;
  }

  return {
    ...g,
    group_id: g.uuid,
    group_name: g.name,
  };
}

export async function setCurrentGroup(group_id: string, group_name: string) {
  await setMeta("current_group_id", group_id);
  await setMeta("active_group_id", group_id);
  await setMeta("current_group_name", group_name);
}

// =============================================================
// 端末別設定（show_temp_on_home 等）
// =============================================================
export async function getSettings(group_id: string): Promise<SettingsRow | null> {
  const db = await getDb();
  return (await db.get("settings", group_id)) ?? null;
}

export async function upsertSettings(row: SettingsRow) {
  const db = await getDb();
  await db.put("settings", row);
}

export async function ensureSettings(group_id: string) {
  const cur = await getSettings(group_id);
  if (cur) return cur;
  const row: SettingsRow = { group_id, show_temp_on_home: true, updated_at: nowISO() };
  await upsertSettings(row);
  return row;
}

// =============================================================
// ユーザー（メンバー）
// =============================================================
export async function listUsers(group_id: string): Promise<User[]> {
  const db = await getDb();
  const all = await db.getAll("users");
  return all
    .filter((x) => x.group_id === group_id && x.is_deleted === 0)
    .sort(
      (a, b) =>
        (a.order_index ?? a.display_order ?? 0) - (b.order_index ?? b.display_order ?? 0)
    );
}

export async function upsertUser(row: User) {
  const db = await getDb();
  await db.put("users", row);
}

export async function softDeleteUser(uuid: string) {
  const db = await getDb();
  const cur = await db.get("users", uuid);
  if (!cur) return;
  await db.put("users", { ...cur, is_deleted: 1, updated_at: nowISO() });
}

export async function deleteUser(uuid: string) {
  await softDeleteUser(uuid);
}

export async function updateUserOrder(items: { uuid: string; order_index: number }[]) {
  const db = await getDb();
  const tx = db.transaction("users", "readwrite");
  for (const it of items) {
    const cur = await tx.store.get(it.uuid);
    if (!cur) continue;
    await tx.store.put({ ...cur, order_index: it.order_index, updated_at: nowISO() });
  }
  await tx.done;
}

// =============================================================
// 体温記録
// =============================================================
export async function listRecords(user_uuid: string): Promise<RecordRow[]> {
  const db = await getDb();
  const idx = db.transaction("records").store.index("by_user");
  const rows = await idx.getAll(user_uuid);
  return rows
    .filter((x) => x.is_deleted === 0)
    .sort((a, b) => b.measured_at.localeCompare(a.measured_at));
}

export async function upsertRecord(row: RecordRow) {
  const db = await getDb();
  await db.put("records", row);
}

// =============================================================
// お薬マスタ
// =============================================================
export type MedicationSortBy = "yomi" | "order" | "created";

/**
 * お薬マスタを取得（is_deleted=0 のみ）。
 *
 * @param group_id  省略時は currentGroup を取得して使う
 * @param sortBy    "yomi"(既定): ヨミガナ昇順 / "order": display_order 昇順 / "created": 作成日時昇順
 */
export async function getMedications(
  group_id?: string,
  sortBy: MedicationSortBy = "yomi"
): Promise<Medication[]> {
  if (!group_id) {
    const g = await getCurrentGroup();
    if (!g) return [];
    group_id = g.group_id as string;
  }
  const db = await getDb();
  const all = await db.getAll("medications");
  const filtered = all.filter((x) => x.group_id === group_id && x.is_deleted === 0);

  switch (sortBy) {
    case "order":
      return filtered.sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
    case "created":
      return filtered.sort((a, b) =>
        (a.created_at ?? a.updated_at).localeCompare(b.created_at ?? b.updated_at)
      );
    case "yomi":
    default:
      return filtered.sort((a, b) => {
        const yA = a.yomi || a.name || "";
        const yB = b.yomi || b.name || "";
        if (yA !== yB) return yA.localeCompare(yB, "ja");
        return (a.created_at || a.updated_at).localeCompare(b.created_at || b.updated_at);
      });
  }
}

export async function upsertMedication(row: Medication) {
  const db = await getDb();
  await db.put("medications", row);
}

export async function deleteMedication(uuid: string) {
  const db = await getDb();
  const cur = await db.get("medications", uuid);
  if (!cur) return;
  await db.put("medications", { ...cur, is_deleted: 1, updated_at: nowISO() });
}

// =============================================================
// イベント（投薬等）
// =============================================================
export async function listEvents(user_uuid: string): Promise<EventRow[]> {
  const db = await getDb();
  const idx = db.transaction("events").store.index("by_user");
  const rows = await idx.getAll(user_uuid);
  return rows
    .filter((x) => x.is_deleted === 0)
    .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
}

export async function upsertEvent(row: EventRow) {
  const db = await getDb();
  await db.put("events", row);
}

// =============================================================
// リマインダー
// =============================================================
export async function listReminders(user_uuid: string): Promise<Reminder[]> {
  const db = await getDb();
  const idx = db.transaction("reminders").store.index("by_user");
  const rows = await idx.getAll(user_uuid);
  return rows
    .filter((x) => x.is_deleted === 0)
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
}

export async function upsertReminder(row: Reminder) {
  const db = await getDb();
  await db.put("reminders", row);
}

// =============================================================
// 同期（差分取得用）
// =============================================================
export async function getUpdatedRows<T extends { group_id: string; updated_at: string }>(
  group_id: string,
  since: string,
  store: "users" | "records" | "medications" | "events" | "reminders"
): Promise<T[]> {
  const db = await getDb();
  const all = await db.getAll(store as any);
  return (all as any[]).filter((x) => x.group_id === group_id && x.updated_at > since);
}

export async function upsertAll(
  store: "users" | "records" | "medications" | "events" | "reminders" | "groups",
  rows: any[]
) {
  const db = await getDb();
  const tx = db.transaction(store as any, "readwrite");
  for (const r of rows) await tx.store.put(r);
  await tx.done;
}

// =============================================================
// 端末ストレージ肥大化防止（同期済みイベントを古い順に削除）
// =============================================================
export async function countEvents(groupId: string): Promise<number> {
  const db = await getDb();
  const all = await db.getAll("events");
  return all.filter((e) => e.group_id === groupId).length;
}

export async function deleteOldestSyncedEvents(
  groupId: string,
  deleteCount: number
): Promise<number> {
  const db = await getDb();
  const all = await db.getAll("events");
  const targets = all
    .filter((e) => e.group_id === groupId && !!e.synced_at)
    .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));

  const toDelete = targets.slice(0, deleteCount);
  if (toDelete.length === 0) return 0;

  const tx = db.transaction("events", "readwrite");
  for (const item of toDelete) {
    await tx.store.delete(item.uuid);
  }
  await tx.done;
  return toDelete.length;
}

export async function pruneLocalEventsIfNeeded(
  groupId: string,
  maxCount: number = 10000
): Promise<void> {
  const total = await countEvents(groupId);
  if (total <= maxCount) return;
  const over = total - maxCount;
  await deleteOldestSyncedEvents(groupId, over);
}

// =============================================================
// まとめてエクスポート（既存呼び出し側との互換性維持のため）
// =============================================================
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
  deleteMedication,

  listEvents,
  upsertEvent,

  listReminders,
  upsertReminder,

  getUpdatedRows,
  upsertAll,
  countEvents,
  deleteOldestSyncedEvents,
  pruneLocalEventsIfNeeded,
};

export default LocalDb;
