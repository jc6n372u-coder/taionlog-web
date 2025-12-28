import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LocalDb } from "../../data/local/localDb";
import type { User, RecordRow } from "../../utils/types";

function normalize(v: number, min: number, max: number) {
  if (max === min) return 0.5;
  return (v - min) / (max - min);
}

export function ChartPage() {
  const nav = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [sel, setSel] = useState<string>("");
  const [records, setRecords] = useState<RecordRow[]>([]);

  useEffect(() => { void (async () => {
    const g = await LocalDb.getCurrentGroup();
    if (!g) return nav("/onboarding");
    const us = await LocalDb.listUsers(g.group_id);
    setUsers(us);
    setSel(us[0]?.uuid ?? "");
  })(); }, [nav]);

  useEffect(() => { void (async () => {
    if (!sel) return setRecords([]);
    setRecords(await LocalDb.listRecords(sel));
  })(); }, [sel]);

  const points = useMemo(() => {
    const rec = [...records].slice(0, 30).reverse(); // 直近30件
    if (rec.length === 0) return "";
    const temps = rec.map(r => r.temp);
    const min = Math.min(...temps, 35.0);
    const max = Math.max(...temps, 39.5);
    return rec.map((r, i) => {
      const x = (i / Math.max(1, rec.length - 1)) * 320;
      const y = 120 - normalize(r.temp, min, max) * 120;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
  }, [records]);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <h2 style={{ margin: 0 }}>グラフ</h2>
      <label style={{ display: "grid", gap: 6 }}>
        <div style={{ fontWeight: 700 }}>対象</div>
        <select value={sel} onChange={(e)=>setSel(e.target.value)} style={{ padding: 10 }}>
          {users.map(u => <option key={u.uuid} value={u.uuid}>{u.name}</option>)}
        </select>
      </label>
      <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12, background: "white" }}>
        {records.length === 0 ? <div style={{ opacity: 0.7 }}>記録がありません</div> :
          <svg width="100%" viewBox="0 0 320 140">
            <polyline points={points} fill="none" stroke="black" strokeWidth="2" />
            <line x1="0" y1="120" x2="320" y2="120" stroke="#bbb" />
            <text x="0" y="135" fontSize="10">古い</text>
            <text x="300" y="135" fontSize="10">新しい</text>
          </svg>
        }
      </div>
      <button onClick={() => nav("/")}>戻る</button>
    </div>
  );
}