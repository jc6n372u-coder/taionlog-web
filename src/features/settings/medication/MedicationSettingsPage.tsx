import { useEffect, useState } from 'react';
import { LocalDb } from '../../../data/local/localDb';
import type { Medication } from '../../../utils/types';
import MedicationSort from '../../medication/MedicationSort';

export default function MedicationSettingsPage() {
  const [items, setItems] = useState<Medication[]>([]);
  const [newName, setNewName] = useState('');
  const [newInt, setNewInt] = useState(6);

  async function reload() {
    const g = await LocalDb.getCurrentGroup();
    if (!g) return;
    setItems(await LocalDb.listMedications(g.group_id));
  }
  useEffect(() => { void reload(); }, []);

  async function addMed() {
    const g = await LocalDb.getCurrentGroup();
    if (!g || !newName.trim()) return;
    const existing = await LocalDb.listMedications(g.group_id);
    const order = (existing.at(-1)?.display_order ?? existing.length) + 1;
    await LocalDb.upsertMedication({
      uuid: crypto.randomUUID(), group_id: g.group_id, name: newName.trim(),
      default_interval_hours: newInt, display_order: order,
      is_deleted: 0, updated_at: new Date().toISOString()
    });
    setNewName('');
    await reload();
  }

  return (
    <div style={{ padding: 16 }}>
      <h2>投薬設定</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <input value={newName} onChange={e=>setNewName(e.target.value)} placeholder='薬の名前' style={{ padding: 8 }} />
        <input type='number' value={newInt} onChange={e=>setNewInt(Number(e.target.value))} style={{ width: 60, padding: 8 }} />時間おき
        <button onClick={addMed}>追加</button>
      </div>

      <MedicationSort 
        medications={items} 
        onReordered={async (next) => {
          for (let i = 0; i < next.length; i++) {
            await LocalDb.upsertMedication({ ...next[i], display_order: i, updated_at: new Date().toISOString() });
          }
          await reload();
        }} 
      />
    </div>
  );
}
