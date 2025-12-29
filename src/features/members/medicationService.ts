import { LocalDb } from "../../data/local/localDb";
import type { Medication } from "../../utils/types";
const nowISO = () => new Date().toISOString();

export async function createMedication(name: string, intervalHours: number) {
  const g = await LocalDb.getCurrentGroup();
  if (!g) throw new Error("グループ未設定です");
  const existing = await LocalDb.listMedications(g.group_id);
  const display_order = (existing.at(-1)?.display_order ?? existing.length) + 1;
  const row: Medication = {
    uuid: crypto.randomUUID(),
    group_id: g.group_id,
    name: name.trim(),
    default_interval_hours: intervalHours,
    display_order,
    is_deleted: 0,
    updated_at: nowISO(),
  };
  await LocalDb.upsertMedication(row);
  return row;
}

export async function updateMedication(uuid: string, patch: Partial<Medication>) {
  const g = await LocalDb.getCurrentGroup();
  if (!g) throw new Error("グループ未設定です");
  const meds = await LocalDb.listMedications(g.group_id);
  const cur = meds.find(m => m.uuid === uuid);
  if (!cur) throw new Error("薬が見つかりません");
  const next: Medication = {
    ...cur,
    ...patch,
    updated_at: nowISO(),
  };
  await LocalDb.upsertMedication(next);
  return next;
}

export async function deleteMedication(uuid: string) {
  const g = await LocalDb.getCurrentGroup();
  if (!g) throw new Error("グループ未設定です");
  const meds = await LocalDb.listMedications(g.group_id);
  const cur = meds.find(m => m.uuid === uuid);
  if (!cur) return;
  await LocalDb.upsertMedication({ ...cur, is_deleted: 1, updated_at: nowISO() });
}
