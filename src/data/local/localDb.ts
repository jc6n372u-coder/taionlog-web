import { getDb } from './db';
import type { User, RecordRow, Medication, EventRow, Reminder, SettingsRow } from '../../utils/types';

const nowISO = () => new Date().toISOString();

// 個別エクスポート関数群 (Named Exports)

export async function getMeta(key: string) {
  const db = await getDb();
  return (await db.get('meta', key))?.value ?? null;
}

export async function setMeta(key: string, value: string) {
  const db = await getDb();
  await db.put('meta', { key, value });
}

export async function getCurrentGroup() {
  const group_id = await getMeta('current_group_id');
  const group_name = await getMeta('current_group_name');
  return group_id ? { group_id, group_name: group_name ?? '家族' } : null;
}

export async function setCurrentGroup(group_id: string, group_name: string) {
  await setMeta('current_group_id', group_id);
  await setMeta('current_group_name', group_name);
}

export async function getSettings(group_id: string): Promise<SettingsRow | null> {
  const db = await getDb();
  return (await db.get('settings', group_id)) ?? null;
}

export async function upsertSettings(row: SettingsRow) {
  const db = await getDb();
  await db.put('settings', row);
}

// 補完: ensureSettings
export async function ensureSettings(group_id: string) {
  const cur = await getSettings(group_id);
  if (cur) return cur;
  const row = { group_id, show_temp_on_home: true, updated_at: nowISO() };
  await upsertSettings(row);
  return row;
}

export async function listUsers(group_id?: string): Promise<User[]> {
  const db = await getDb();
  const all = await db.getAll('users');
  // group_id指定がなければ全件、あればフィルタ
  const filtered = group_id 
    ? all.filter(x => x.group_id === group_id && x.is_deleted === 0)
    : all.filter(x => x.is_deleted === 0);
  return filtered.sort((a,b)=>(a.display_order??0)-(b.display_order??0));
}

export async function upsertUser(row: User) {
  const db = await getDb();
  await db.put('users', row);
}

export async function softDeleteUser(uuid: string) {
  const db = await getDb();
  const cur = await db.get('users', uuid);
  if (!cur) return;
  await db.put('users', { ...cur, is_deleted: 1, updated_at: nowISO() });
}

export async function listRecords(user_uuid: string): Promise<RecordRow[]> {
  const db = await getDb();
  const idx = db.transaction('records').store.index('by_user');
  const rows = await idx.getAll(user_uuid);
  return rows.filter(x => x.is_deleted === 0).sort((a,b)=>b.measured_at.localeCompare(a.measured_at));
}

export async function upsertRecord(row: RecordRow) {
  const db = await getDb();
  await db.put('records', row);
}

// 互換性のためのエイリアス
export const getMedications = listMedications;
export const deleteMedication = async (uuid: string) => {
  const db = await getDb();
  const m = await db.get('medications', uuid);
  if(m) await upsertMedication({...m, is_deleted: 1, updated_at: nowISO()});
};

export async function listMedications(group_id: string): Promise<Medication[]> {
  const db = await getDb();
  const all = await db.getAll('medications');
  return all.filter(x => x.group_id === group_id && x.is_deleted === 0).sort((a,b)=>a.display_order-b.display_order);
}

export async function upsertMedication(row: Medication) {
  const db = await getDb();
  await db.put('medications', row);
}

export async function upsertEvent(row: EventRow) {
  const db = await getDb();
  await db.put('events', row);
}

export async function listEvents(user_uuid: string): Promise<EventRow[]> {
  const db = await getDb();
  const idx = db.transaction('events').store.index('by_user');
  const rows = await idx.getAll(user_uuid);
  return rows.filter(x => x.is_deleted === 0).sort((a,b)=>b.occurred_at.localeCompare(a.occurred_at));
}

export async function upsertReminder(row: Reminder) {
  const db = await getDb();
  await db.put('reminders', row);
}

export async function listReminders(user_uuid: string): Promise<Reminder[]> {
  const db = await getDb();
  const idx = db.transaction('reminders').store.index('by_user');
  const rows = await idx.getAll(user_uuid);
  return rows.filter(x => x.is_deleted === 0).sort((a,b)=>a.scheduled_at.localeCompare(b.scheduled_at));
}

export async function getUpdatedRows<T extends { group_id: string; updated_at: string }>(
  group_id: string, 
  since: string, 
  store: 'users'|'records'|'medications'|'events'|'reminders'
): Promise<T[]> {
  const db = await getDb();
  const all = await db.getAll(store as any);
  return (all as any[]).filter(x => x.group_id === group_id && x.updated_at > since);
}

export async function upsertAll(store: 'users'|'records'|'medications'|'events'|'reminders', rows: any[]) {
  const db = await getDb();
  const tx = db.transaction(store as any, 'readwrite');
  for (const r of rows) await tx.store.put(r);
  await tx.done;
}

// 自動整理用API (Phase B)
export async function countEvents(group_id: string): Promise<number> {
  const db = await getDb();
  // 全イベントを取得してカウント（簡易実装）
  // ※本来はindex countだが、ここではgetAllで実装
  const all = await db.getAll('events');
  return all.filter(e => e.group_id === group_id).length;
}

export async function deleteOldestSyncedEvents(group_id: string, deleteCount: number): Promise<number> {
  const db = await getDb();
  const all = await db.getAll('events');
  // 同期済み(updated_atがあるものは基本同期対象だが、厳密にはmeta管理。簡易的に古いものを対象)
  const targets = all
    .filter(e => e.group_id === group_id)
    .sort((a,b) => a.updated_at.localeCompare(b.updated_at)); // 古い順
  
  // 削除実行
  const toDelete = targets.slice(0, deleteCount);
  const tx = db.transaction('events', 'readwrite');
  for(const e of toDelete) {
    await tx.store.delete(e.uuid);
  }
  await tx.done;
  return toDelete.length;
}

// Default Export (LocalDbオブジェクトとして束ねる)
export const LocalDb = {
  getMeta, setMeta,
  getCurrentGroup, setCurrentGroup,
  getSettings, upsertSettings, ensureSettings,
  listUsers, upsertUser, softDeleteUser,
  listRecords, upsertRecord,
  listMedications, getMedications, upsertMedication, deleteMedication,
  listEvents, upsertEvent, countEvents, deleteOldestSyncedEvents,
  listReminders, upsertReminder,
  getUpdatedRows, upsertAll
};

export default LocalDb;
