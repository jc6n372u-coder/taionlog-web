import { getDb } from "./db";
import type { User, RecordRow, Medication, EventRow, Reminder, SettingsRow } from "../../utils/types";

const nowISO = () => new Date().toISOString();

export const LocalDb = {
  async getMeta(key: string) {
    const db = await getDb();
    return (await db.get("meta", key))?.value ?? null;
  },
  async setMeta(key: string, value: string) {
    const db = await getDb();
    await db.put("meta", { key, value });
  },
  async getCurrentGroup() {
    const group_id = await this.getMeta("current_group_id");
    const group_name = await this.getMeta("current_group_name");
    return group_id ? { group_id, group_name: group_name ?? "家族" } : null;
  },
  async setCurrentGroup(group_id: string, group_name: string) {
    await this.setMeta("current_group_id", group_id);
    await this.setMeta("current_group_name", group_name);
  },
  async ensureSettings(group_id: string) {
    const cur = await this.getSettings(group_id);
    if (cur) return cur;
    const row = { group_id, show_temp_on_home: true, updated_at: new Date().toISOString() };
    await this.upsertSettings(row);
    return row;
  },
  async getSettings(group_id: string): Promise<SettingsRow | null> {
    const db = await getDb();
    return (await db.get("settings", group_id)) ?? null;
  },
  async upsertSettings(row: SettingsRow) {
    const db = await getDb();
    await db.put("settings", row);
  },
  async listUsers(group_id: string): Promise<User[]> {
    const db = await getDb();
    const all = await db.getAll("users");
    return all.filter(x => x.group_id === group_id && x.is_deleted === 0).sort((a,b)=>(a.display_order??0)-(b.display_order??0));
  },
  async upsertUser(row: User) { const db = await getDb(); await db.put("users", row); },
  async softDeleteUser(uuid: string) {
    const db = await getDb();
    const cur = await db.get("users", uuid);
    if (!cur) return;
    await db.put("users", { ...cur, is_deleted: 1, updated_at: nowISO() });
  },
  async listRecords(user_uuid: string): Promise<RecordRow[]> {
    const db = await getDb();
    const idx = db.transaction("records").store.index("by_user");
    const rows = await idx.getAll(user_uuid);
    return rows.filter(x => x.is_deleted === 0).sort((a,b)=>b.measured_at.localeCompare(a.measured_at));
  },
  async upsertRecord(row: RecordRow) { const db = await getDb(); await db.put("records", row); },
  async listMedications(group_id: string): Promise<Medication[]> {
    const db = await getDb();
    const all = await db.getAll("medications");
    return all.filter(x => x.group_id === group_id && x.is_deleted === 0).sort((a,b)=>a.display_order-b.display_order);
  },
  async upsertMedication(row: Medication) { const db = await getDb(); await db.put("medications", row); },
  async upsertEvent(row: EventRow) { const db = await getDb(); await db.put("events", row); },
  async listEvents(user_uuid: string): Promise<EventRow[]> {
    const db = await getDb();
    const idx = db.transaction("events").store.index("by_user");
    const rows = await idx.getAll(user_uuid);
    return rows.filter(x => x.is_deleted === 0).sort((a,b)=>b.occurred_at.localeCompare(a.occurred_at));
  },
  async upsertReminder(row: Reminder) { const db = await getDb(); await db.put("reminders", row); },
  async listReminders(user_uuid: string): Promise<Reminder[]> {
    const db = await getDb();
    const idx = db.transaction("reminders").store.index("by_user");
    const rows = await idx.getAll(user_uuid);
    return rows.filter(x => x.is_deleted === 0).sort((a,b)=>a.scheduled_at.localeCompare(b.scheduled_at));
  },
  async getUpdatedRows<T extends { group_id: string; updated_at: string }>(group_id: string, since: string, store: "users"|"records"|"medications"|"events"|"reminders"): Promise<T[]> {
    const db = await getDb();
    const all = await db.getAll(store as any);
    return (all as any[]).filter(x => x.group_id === group_id && x.updated_at > since);
  },
  async upsertAll(store: "users"|"records"|"medications"|"events"|"reminders", rows: any[]) {
    const db = await getDb();
    const tx = db.transaction(store as any, "readwrite");
    for (const r of rows) await tx.store.put(r);
    await tx.done;
  },
};