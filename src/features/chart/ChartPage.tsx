import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LocalDb } from '../../data/local/localDb';
import type { User, RecordRow, EventRow } from '../../utils/types';
import TemperatureMedicationChart from './TemperatureMedicationChart';

export default function ChartPage() {
  const nav = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [sel, setSel] = useState<string>('');
  const [temps, setTemps] = useState<{ time: number; value: number }[]>([]);
  const [meds, setMeds] = useState<{ time: number; name: string }[]>([]);

  useEffect(() => {
    void (async () => {
      const g = await LocalDb.getCurrentGroup();
      if (!g) return nav('/onboarding');
      const us = await LocalDb.listUsers(g.group_id);
      setUsers(us);
      if (us.length > 0) setSel(us[0].uuid);
    })();
  }, [nav]);

  useEffect(() => {
    void (async () => {
      if (!sel) return;
      // 体温
      const recs = await LocalDb.listRecords(sel);
      setTemps(recs.map(r => ({ time: new Date(r.measured_at).getTime(), value: r.temp })).reverse());
      
      // 投薬イベント
      const evs = await LocalDb.listEvents(sel);
      const allMeds = await LocalDb.listMedications((await LocalDb.getCurrentGroup())!.group_id);
      const medMap = new Map(allMeds.map(m => [m.uuid, m.name]));
      
      const mPoints = evs
        .filter(e => e.event_type === 'medication')
        .map(e => ({ time: new Date(e.occurred_at).getTime(), name: medMap.get(e.payload??'') ?? '?' }))
        .reverse();
      setMeds(mPoints);
    })();
  }, [sel]);

  return (
    <div style={{ padding: 16 }}>
      <h2>グラフ</h2>
      <select value={sel} onChange={e=>setSel(e.target.value)} style={{ marginBottom: 16, padding: 8, fontSize: 16 }}>
        {users.map(u => <option key={u.uuid} value={u.uuid}>{u.name}</option>)}
      </select>
      
      <div style={{ height: 400 }}>
        <TemperatureMedicationChart temperatures={temps} medications={meds} />
      </div>
      
      <div style={{ marginTop: 20 }}>
        <button onClick={() => nav('/')}>戻る</button>
      </div>
    </div>
  );
}
