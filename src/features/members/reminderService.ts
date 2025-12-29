import { addHours, isAfter, parseISO } from "date-fns";
import { LocalDb } from "../../data/local/localDb";
import type { Reminder } from "../../utils/types";
const nowISO = () => new Date().toISOString();

export async function ensureNextReminder(user_uuid: string, medication_uuid: string, baseOccurredAtISO: string, intervalHours: number) {
  const g = await LocalDb.getCurrentGroup();
  if (!g) throw new Error("グループ未設定です");
  
  const nextTime = addHours(parseISO(baseOccurredAtISO), intervalHours).toISOString();
  
  // 既に未来予定があるなら作らない（重複防止）
  const existing = await LocalDb.listReminders(user_uuid);
  const already = existing.find(r => 
    r.is_deleted === 0 &&
    r.is_notified === 0 &&
    r.medication_uuid === medication_uuid &&
    isAfter(parseISO(r.scheduled_at), new Date()) &&
    Math.abs(parseISO(r.scheduled_at).getTime() - parseISO(nextTime).getTime()) < 5 * 60 * 1000 // 5分以内は同一扱い
  );

  if (already) return already;

  const rem: Reminder = {
    uuid: crypto.randomUUID(),
    group_id: g.group_id,
    user_uuid,
    medication_uuid,
    scheduled_at: nextTime,
    is_notified: 0,
    is_deleted: 0,
    updated_at: nowISO(),
  };
  await LocalDb.upsertReminder(rem);
  return rem;
}

export async function markNotified(reminder_uuid: string) {
  const db = await (await import("../../data/local/db")).getDb();
  const cur = await db.get("reminders", reminder_uuid);
  if (!cur) return;
  await db.put("reminders", { ...cur, is_notified: 1, updated_at: nowISO() });
}
