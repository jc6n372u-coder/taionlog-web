import { useState } from 'react';
import type { User } from '../../utils/types';
import { upsertUser } from '../../data/local/localDb';

type Props = {
  members: User[];
  onChanged?: () => void;
};

export default function MemberSortList({ members, onChanged }: Props) {
  const [list, setList] = useState<User[]>(members);

  async function saveOrder() {
    for (let i = 0; i < list.length; i++) {
      await upsertUser({ ...list[i], sort_order: i });
    }
    onChanged?.();
  }

  return (
    <div>
      <h3>メンバー管理（並び替え）</h3>
      <ul>
        {list.map((u) => (
          <li key={u.uuid} style={{ padding: 8, borderBottom: '1px solid #eee' }}>
            ☰ {u.name}
          </li>
        ))}
      </ul>
      <button onClick={saveOrder} style={{ marginTop: 8 }}>並び順を保存</button>
    </div>
  );
}