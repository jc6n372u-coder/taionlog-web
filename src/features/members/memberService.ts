import { LocalDb } from "../../data/local/localDb";
import type { User } from "../../utils/types";
const nowISO = () => new Date().toISOString();

export async function createMember(name: string) {
  const g = await LocalDb.getCurrentGroup();
  if (!g) throw new Error("グループ未設定です");
  const uuid = crypto.randomUUID();
  const existing = await LocalDb.listUsers(g.group_id);
  const display_order = (existing.at(-1)?.display_order ?? existing.length) + 1;
  const row: User = {
    uuid,
    group_id: g.group_id,
    name: name.trim(),
    is_deleted: 0,
    updated_at: nowISO(),
    display_order,
  };
  await LocalDb.upsertUser(row);
  return row;
}

export async function updateMember(uuid: string, patch: Partial<User>) {
  const g = await LocalDb.getCurrentGroup();
  if (!g) throw new Error("グループ未設定です");
  const users = await LocalDb.listUsers(g.group_id);
  const cur = users.find(u => u.uuid === uuid);
  if (!cur) throw new Error("メンバーが見つかりません");
  const next: User = {
    ...cur,
    ...patch,
    updated_at: nowISO(),
  };
  await LocalDb.upsertUser(next);
  return next;
}

export async function deleteMember(uuid: string) {
  await LocalDb.softDeleteUser(uuid);
}
