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
  
  // データ管理
  const [users, setUsers] = useState<User[]>([]);
  const [selUser, setSelUser] = useState<string>("");
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);

  // 1. ユーザー一覧取得
  useEffect(() => {
    void (async () => {
      const g = await LocalDb.getCurrentGroup();
      if (!g) return nav("/onboarding");
      const us = await LocalDb.listUsers(g.group_id);
      setUsers(us);
      if (us.length > 0) setSelUser(us[0].uuid);
    })();
  }, [nav]);

  // 2. 選択ユーザーのデータ取得
  useEffect(() => {
    void (async () => {
      if (!selUser) return;
      setRecords(await LocalDb.listRecords(selUser));
      setEvents(await LocalDb.listEvents(selUser));
    })();
  }, [selUser]);

  // 3. グラフ用データ変換 & 期間フィルタリング
  const chartData = useMemo(() => {
    const now = Date.now();
    const days = RANGES[range].days;
    const windowMs = days * 24 * 60 * 60 * 1000;
    
    // 期間内のデータのみ抽出
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
      {/* AppBar */}
      <header style={styles.appBar}>
        <button type="button" onClick={() => nav(-1)} style={styles.iconBtn} aria-label="戻る">
          ←
        </button>
        <div style={styles.appBarTitle}>
            <select 
              value={selUser} 
              onChange={(e) => setSelUser(e.target.value)}
              style={styles.userSelect}
            >
              {users.map(u => <option key={u.uuid} value={u.uuid}>{u.name}</option>)}
            </select>
        </div>
        <div style={styles.appBarRight} />
      </header>
  
      {/* Body */}
      <main style={styles.body}>
        {/* Range Segmented */}
        <div style={styles.rangeWrap}>
          <div style={styles.rangePill}>
            {(["day", "week", "month", "year"] as RangeKey[]).map((k) => (
              <SegBtn 
                key={k} 
                label={RANGES[k].label} 
                active={range === k} 
                onClick={() => setRange(k)} 
              />
            ))}
          </div>
        </div>

        {/* Chart */}
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

function SegBtn(props: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      style={{
        ...styles.segBtn,
        ...(props.active ? styles.segBtnActive : null),
      }}
    >
      {props.active ? "✓ " : ""}
      {props.label}
    </button>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100dvh",
    background: "#f4f5f7",
  },
  appBar: {
    height: 56,
    display: "grid",
    gridTemplateColumns: "56px 1fr 56px",
    alignItems: "center",
    background: "#66A9D9",
    color: "white",
    position: "sticky",
    top: 0,
    zIndex: 10,
    boxShadow: "0 1px 0 rgba(0,0,0,0.08)",
  },
  iconBtn: {
    height: 40,
    width: 40,
    marginLeft: 8,
    border: "none",
    background: "transparent",
    color: "white",
    fontSize: 18,
    cursor: "pointer",
  },
  appBarTitle: {
    textAlign: "center",
    display: "flex", 
    justifyContent: "center",
  },
  userSelect: {
    background: "rgba(255,255,255,0.2)",
    border: "none",
    borderRadius: 8,
    color: "white",
    fontSize: 16,
    fontWeight: 700,
    padding: "4px 8px",
    outline: "none",
    cursor: "pointer",
  },
  appBarRight: {
    paddingRight: 8,
  },
  body: {
    padding: 12,
    display: "grid",
    gap: 12,
  },
  rangeWrap: {
    display: "flex",
    justifyContent: "center",
    marginBottom: 8,
  },
  rangePill: {
    width: "min(520px, 100%)",
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    borderRadius: 999,
    overflow: "hidden",
    border: "1px solid rgba(0,0,0,0.15)",
    background: "white",
    boxShadow: "0 2px 5px rgba(0,0,0,0.05)",
  },
  segBtn: {
    height: 40,
    border: "none",
    background: "white",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 600,
    color: "#444",
    transition: "background 0.2s",
  },
  segBtnActive: {
    background: "#d7e8f7",
    color: "#005a9e",
    fontWeight: 800,
  },
  chartCard: {
    width: "min(720px, 100%)",
    margin: "0 auto",
    background: "white",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.10)",
    padding: 10,
    overflow: "hidden", // 安全策：これではみ出し防止
  },
};