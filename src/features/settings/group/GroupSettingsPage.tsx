import { useEffect, useState } from 'react';
import { LocalDb } from '../../../data/local/localDb';
import type { User } from '../../../utils/types';

export default function GroupSettingsPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [newUser, setNewUser] = useState('');

  useEffect(() => { void reload(); }, []);

  async function reload() {
    const g = await LocalDb.getCurrentGroup();
    if (!g) return;
    setUsers(await LocalDb.listUsers(g.group_id));
  }

  async function addUser() {
    const g = await LocalDb.getCurrentGroup();
    if (!g || !newUser.trim()) return;
    const existing = await LocalDb.listUsers(g.group_id);
    const order = (existing.at(-1)?.display_order ?? existing.length) + 1;
    await LocalDb.upsertUser({
      uuid: crypto.randomUUID(), group_id: g.group_id, name: newUser.trim(),
      is_deleted: 0, updated_at: new Date().toISOString(), display_order: order
    });
    setNewUser('');
    await reload();
  }

  async function deleteMember(u: User) {
    if(!confirm(u.name + ' を削除しますか？')) return;
    await LocalDb.softDeleteUser(u.uuid);
    await reload();
  }

  return (
    <div style={{ padding: 16 }}>
      <h2>グループ設定</h2>
      <div style={{ marginBottom: 20, padding: 12, border: '1px solid #ddd', borderRadius: 8 }}>
        <h3>メンバー管理</h3>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <input value={newUser} onChange={e=>setNewUser(e.target.value)} placeholder='新しいメンバー名' style={{ padding: 8 }} />
          <button onClick={addUser}>追加</button>
        </div>
        <ul style={{ paddingLeft: 20 }}>
          {users.map(u => (
            <li key={u.uuid} style={{ marginBottom: 4 }}>
              {u.name} <button onClick={()=>deleteMember(u)} style={{ marginLeft: 10, fontSize: 10 }}>削除</button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
