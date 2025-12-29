import { useEffect, useState } from "react";
import { LocalDb } from "../../../data/local/localDb";
import { createMember, deleteMember } from "../../../features/members/memberService";
import type { User } from "../../../utils/types";

export default function GroupSettingsPage() {
  const [group, setGroup] = useState<{ group_id: string; group_name: string } | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [inviteCode, setInviteCode] = useState<string>(""); 

  async function load() {
    const g = await LocalDb.getCurrentGroup();
    if (g) {
      setGroup(g);
      setUsers(await LocalDb.listUsers(g.group_id));
      const code = await LocalDb.getMeta("cached_join_code");
      setInviteCode(code ?? "（サーバー同期で取得）");
    }
  }

  useEffect(() => { load(); }, []);

  async function addMember() {
    const name = prompt("メンバー名を入力してください");
    if (!name) return;
    await createMember(name);
    await load();
  }

  async function doDeleteMember(u: User) {
    if (!confirm(`${u.name} を削除しますか？`)) return;
    await deleteMember(u.uuid);
    await load();
  }

  return (
    <div style={{ padding: 10 }}>
      <h3>グループ設定</h3>
      {group && (
        <div style={{ marginBottom: 20, padding: 12, border: "1px solid #ddd", borderRadius: 12, background: "white" }}>
          <div>グループ名: <b>{group.group_name}</b></div>
          <div style={{ marginTop: 8 }}>招待コード: <b>{inviteCode}</b></div>
          <div style={{ fontSize: 12, color: "#666" }}>※招待コードの更新は現在管理者機能としてサーバー側でのみ可能です</div>
        </div>
      )}

      <h4>メンバー管理</h4>
      <div style={{ display: "grid", gap: 8 }}>
        {users.map(u => (
          <div key={u.uuid} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 10, border: "1px solid #eee", borderRadius: 8, background: "white" }}>
             <span>{u.name}</span>
             <button onClick={() => doDeleteMember(u)} style={{ background: "#fee2e2", color: "#991b1b", border: "none", padding: "6px 12px", borderRadius: 6 }}>削除</button>
          </div>
        ))}
        <button onClick={addMember} style={{ padding: 12, borderRadius: 8, border: "1px dashed #aaa", background: "none" }}>＋ メンバーを追加</button>
      </div>
    </div>
  );
}