import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import TemperatureMedicationChart from "../../features/chart/TemperatureMedicationChart";
import { LocalDb } from "../../data/local/localDb";
import type { User, RecordRow, EventRow } from "../../utils/types";

// 期間フィルター：4つ（日・週・月・年）
const RANGES = {
  day: { label: "日", days: 1 },
  week: { label: "週", days: 7 },
  month: { label: "月", days: 30 },
  year: { label: "年", days: 365 },
} as const;
type RangeKey = keyof typeof RANGES;

export default function ChartPage() {
  const nav = useNavigate();
  const [range, setRange] = useState<RangeKey>("week");
  
  const [users, setUsers] = useState<User[]>([]);
  const [selUser, setSelUser] = useState<string>("");
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);

  useEffect(() => {
    void (async () => {
      const g = await LocalDb.getCurrentGroup();
      if (!g) return nav("/onboarding");
      const us = await LocalDb.listUsers(g.group_id);
      setUsers(us);
      if (us.length > 0) setSelUser(us[0].uuid);
    })();
  }, [nav]);

  useEffect(() => {
    void (async () => {
      if (!selUser) return;
      setRecords(await LocalDb.listRecords(selUser));
      setEvents(await LocalDb.listEvents(selUser));
    })();
  }, [selUser]);

  const chartData = useMemo(() => {
    const now = Date.now();
    const days = RANGES[range].days;
    const windowMs = days * 24 * 60 * 60 * 1000;
    
    const tempPoints = records
      .filter(r => (now - new Date(r.measured_at).getTime()) < windowMs)
      .map(r => ({ time: new Date(r.measured_at).getTime(), value: r.temp }));

    const medPoints = events
      .filter(e => e.event_type === "medication" && (now - new Date(e.occurred_at).getTime()) < windowMs)
      .map(e => ({ time: new Date(e.occurred_at).getTime(), name: "薬" }));

    return { tempPoints, medPoints };
  }, [records, events, range]);

  return (
    <div style={styles.page}>
      {/* 青いヘッダー */}
      <header style={styles.appBar}>
        <button type="button" onClick={() => nav(-1)} style={styles.iconBtn}>←</button>
        <div style={styles.appBarTitle}>
            <select 
              value={selUser} 
              onChange={(e) => setSelUser(e.target.value)}
              style={styles.userSelect}
            >
              {users.map(u => <option key={u.uuid} value={u.uuid}>{u.name}</option>)}
            </select>
        </div>
        <div style={{width: 40}} />{/* 右側のバランス用 */}
      </header>
  
      <main style={styles.body}>
        {/* 切り替えボタン (日・週・月・年) */}
        <div style={styles.rangeWrap}>
          <div style={styles.rangePill}>
            {(["day", "week", "month", "year"] as RangeKey[]).map((k) => (
              <button 
                key={k} 
                onClick={() => setRange(k)} 
                style={{
                    ...styles.segBtn,
                    ...(range === k ? styles.segBtnActive : null)
                }}
              >
                {RANGES[k].label}
              </button>
            ))}
          </div>
        </div>

        {/* グラフエリア */}
        <div style={styles.chartCard}>
          {chartData.tempPoints.length === 0 && chartData.medPoints.length === 0 ? (
             <div style={{ padding: 40, textAlign: "center", opacity: 0.5, fontSize: 13 }}>
               データがありません
             </div>
          ) : (
            <TemperatureMedicationChart
              temperatures={chartData.tempPoints}
              medications={chartData.medPoints}
            />
          )}
        </div>
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: "100dvh", background: "#f4f5f7" },
  appBar: {
    height: 56, display: "grid", gridTemplateColumns: "40px 1fr 40px", alignItems: "center",
    background: "#66A9D9", color: "white", position: "sticky", top: 0, zIndex: 10
  },
  iconBtn: { border: "none", background: "transparent", color: "white", fontSize: 20, cursor: "pointer", height: "100%" },
  appBarTitle: { display: "flex", justifyContent: "center" },
  userSelect: {
    background: "rgba(255,255,255,0.2)", border: "none", borderRadius: 8, color: "white", fontSize: 16, fontWeight: "bold", padding: "4px 8px", outline: "none"
  },
  body: { padding: 12, display: "grid", gap: 12 },
  rangeWrap: { display: "flex", justifyContent: "center", marginBottom: 8 },
  rangePill: {
    width: "100%", maxWidth: 400, display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr",
    borderRadius: 999, overflow: "hidden", border: "1px solid #ddd", background: "white"
  },
  segBtn: { border: "none", background: "white", padding: "8px 0", fontSize: 14, cursor: "pointer", color: "#666" },
  segBtnActive: { background: "#d7e8f7", color: "#005a9e", fontWeight: "bold" },
  chartCard: {
    width: "100%", background: "white", borderRadius: 12, padding: 10, overflow: "hidden",
    boxShadow: "0 1px 3px rgba(0,0,0,0.1)"
  },
};