import { useState, useEffect } from 'react';
import type { Medication } from '../../utils/types';

type Props = {
  medications: Medication[];
  onReordered: (next: Medication[]) => Promise<void>;
};

export default function MedicationSort({ medications, onReordered }: Props) {
  const [list, setList] = useState<Medication[]>(medications);

  // 親コンポーネントからの更新を反映
  useEffect(() => {
    setList(medications);
  }, [medications]);

  return (
    <div>
      <h3>登録薬一覧（ドラッグで並び替え）</h3>
      <ul>
        {list.map((m) => (
          <li key={m.uuid} style={{ padding: 8, borderBottom: '1px solid #eee' }}>
            ☰ {m.name}
          </li>
        ))}
      </ul>
      <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
        ※並び替え機能はライブラリ導入後に有効化されます
      </div>
      <button onClick={() => onReordered(list)} style={{ marginTop: 8 }}>並び順を保存</button>
    </div>
  );
}