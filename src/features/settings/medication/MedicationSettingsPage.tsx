import { useEffect, useState } from 'react';
import MedicationSort from '../../medication/MedicationSort';
import { getMedications, upsertMedication, deleteMedication } from '../../../data/local/localDb';
import { createMedication } from '../../../features/members/medicationService';
import type { Medication } from '../../../utils/types';

export default function MedicationSettingsPage() {
  const [items, setItems] = useState<Medication[]>([]);

  async function reload() {
    setItems(await getMedications());
  }

  useEffect(() => { reload(); }, []);

  async function addMed() {
    const name = prompt("薬の名前");
    if (!name) return;
    const hours = prompt("標準間隔（時間）", "6");
    await createMedication(name, Number(hours) || 6);
    reload();
  }

  async function onDelete(m: Medication) {
    if(!confirm(`${m.name} を削除しますか？`)) return;
    await deleteMedication(m.uuid);
    reload();
  }

  return (
    <div style={{ padding: 16 }}>
      <h2>投薬設定</h2>
      <MedicationSort
        medications={items}
        onReordered={async (next) => {
          for (let i = 0; i < next.length; i++) {
            await upsertMedication({ ...next[i], sort_order: i });
          }
          await reload();
        }}
      />
      
      <div style={{ marginTop: 20 }}>
        <h3>編集・削除</h3>
        {items.map(m => (
          <div key={m.uuid} style={{ display: "flex", justifyContent: "space-between", padding: 8, borderBottom: "1px solid #eee" }}>
            <span>{m.name} ({m.default_interval_hours}h)</span>
            <button onClick={() => onDelete(m)}>削除</button>
          </div>
        ))}
        <button onClick={addMed} style={{ marginTop: 10, width: "100%", padding: 10 }}>＋ 薬を追加</button>
      </div>
    </div>
  );
}