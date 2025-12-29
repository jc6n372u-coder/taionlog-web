import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LocalDb } from "../../data/local/localDb";
import type { User, RecordRow, EventRow } from "../../utils/types";
import TemperatureMedicationChart from "./TemperatureMedicationChart";

export default function ChartPage() {
  const nav = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [sel, setSel] = useState<string>("");
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);

  useEffect(() => {
    void (async () => {
      const g = await LocalDb.getCurrentGroup();
      if (!g) return nav("/onboarding");
      const us = await LocalDb.listUsers(g.group_id);
      setUsers(us);
      if (us.length > 0) setSel(us[0].uuid);
    })();
  }, [nav]);

  useEffect(() => {
    void (async () => {
      if (!sel) return;
      setRecords(await LocalDb.listRecords(sel));
      setEvents(await LocalDb.listEvents(sel));
    })();
  }, [sel]);

  const chartData = useMemo(() => {
    const now = Date.now();
    const windowMs = 30 * 24 * 60 * 60 * 1000;
    
    const tempPoints = records
      .filter(r => (now - new Date(r.measured_at).getTime()) < windowMs)
      .map(r => ({ time: new Date(r.measured_at).getTime(), value: r.temp }));

    const medPoints = events
      .filter(e => e.event_type === "medication" && (now - new Date(e.occurred_at).getTime()) < windowMs)
      .map(e => ({ time: new Date(e.occurred_at).getTime(), name: "薬" }));

    return { tempPoints, medPoints };
  }, [records, events]);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <label style={{ display: "grid", gap: 6 }}>
        <div style={{ fontWeight: 700 }}>対象</div>
        <select value={sel} onChange={(e)=>setSel(e.target.value)} style={{ padding: 10 }}>
          {users.map(u => <option key={u.uuid} value={u.uuid}>{u.name}</option>)}
        </select>
      </label>
      
      <div style={{ background: "white", padding: 10, borderRadius: 12, border: "1px solid #ddd" }}>
        {records.length === 0 ? 
          <div style={{ padding: 20, textAlign: "center", opacity: 0.6 }}>記録がありません</div> :
          <TemperatureMedicationChart temperatures={chartData.tempPoints} medications={chartData.medPoints} />
        }
      </div>
    </div>
  );
}