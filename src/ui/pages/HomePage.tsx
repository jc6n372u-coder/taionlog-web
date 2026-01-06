import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LocalDb } from "../../data/local/localDb";
import { useSync } from "../../services/sync/syncService"; 
import type { User, RecordRow } from "../../utils/types";

// 日付フォーマッター（MM/DD(曜日)）
function formatDate(iso: string) {
  const d = new Date(iso);
  const week = ["日","月","火","水","木","金","土"];
  return `${d.getMonth()+1}/${d.getDate()}(${week[d.getDay()]})`;
}

// 相対日付フォーマッター（今日、昨日、N日前）
function formatRelativeDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const dayDiff = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (dayDiff === 0) return "今日";
  if (dayDiff === 1) return "昨日";
  return `${dayDiff}日前`;
}

export default function HomePage() {
  const nav = useNavigate();
  const { syncState, runSync } = useSync();

  const [users, setUsers] = useState<User[]>([]);
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [isAiReady, setIsAiReady] = useState(false);

  // データ読み込み
  const loadData = async () => {
    const g = await LocalDb.getCurrentGroup();
    if (!g) return nav("/onboarding");
    
    // 設定確保
    const s = await LocalDb.ensureSettings(g.group_id);
    setSettings(s);

    const us = await LocalDb.listUsers(g.group_id);
    setUsers(us);

    // 各ユーザーの最新記録を取得
    const allRecs: RecordRow[] = [];
    for (const u of us) {
      const recs = await LocalDb.listRecords(u.uuid);
      if (recs.length > 0) {
        recs.sort((a,b) => new Date(b.measured_at).getTime() - new Date(a.measured_at).getTime());
        allRecs.push(recs[0]);
      }
    }
    setRecords(allRecs);

    // AI設定チェック
    const aiSettings = await LocalDb.getAiSettings();
    if (aiSettings && (aiSettings.geminiApiKey || aiSettings.groqApiKey)) {
      setIsAiReady(true);
    } else {
      setIsAiReady(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [nav]);

  // 同期実行
  const doSync = async () => {
    await runSync();
    await loadData();
  };

  // 記録開始（行タップ時）
  const startRecord = (userId: string) => {
    nav(`/input?userId=${userId}`);
  };

  const handleSupportClick = () => {
    if (isAiReady) {
      nav("/ai-support");
    } else {
      if (confirm("AIサポート機能を使うにはAPIキーの設定が必要です。\n設定画面に移動しますか？")) {
        nav("/settings/ai");
      }
    }
  };

  return (
    <div style={styles.page}>
      <header style={styles.appBar}>
        <div style={styles.appBarLeft}>
            <span style={{fontWeight:"bold", fontSize: 18}}>たいおんログ</span>
        </div>
        <div style={styles.appBarRight}>
          <button onClick={doSync} disabled={syncState.isLoading} style={styles.iconBtn}>
              {syncState.isLoading ? "..." : "同期"}
          </button>
          <button onClick={() => nav("/settings")} style={styles.iconBtn}>設定</button>
        </div>
      </header>

      <main style={styles.body}>
        <div style={styles.card}>
            <div style={styles.cardHeader}>
                <span>最新の記録</span>
                <button onClick={() => nav("/chart")} style={styles.linkBtn}>グラフを見る →</button>
            </div>
            
            {users.length === 0 && (
                <div style={{padding:20, textAlign:"center", color:"#999"}}>
                    メンバーがいません<br/>設定から追加してください
                </div>
            )}
            
            {users.map(u => {
                const rec = records.find(r => r.user_uuid === u.uuid);
                const showTemp = settings?.show_temp_on_home ?? true;
                
                const isFever = rec && rec.temp >= 37.5;
                const tempColor = isFever ? "#FF5722" : "#66A9D9";

                let tempStr = "—";
                if (rec) {
                    if (rec.temp === 0) {
                          tempStr = "投薬"; 
                    } else if (showTemp) {
                          tempStr = `${rec.temp.toFixed(1)}℃`;
                    } else {
                          tempStr = "**.*℃";
                    }
                }

                return (
                    <div key={u.uuid} style={styles.row} onClick={() => startRecord(u.uuid)}>
                        {/* 1. 名前エリア */}
                        <div style={styles.userName}>{u.name}</div>
                        
                        {/* 2. 体温エリア (幅100pxに拡張して余白を作る) */}
                        <div style={{...styles.tempCol, color: tempColor, fontSize: rec && rec.temp === 0 ? 14 : 18}}>
                            {tempStr}
                        </div>

                        {/* 3. 日付エリア */}
                        <div style={styles.dateCol}>
                            {rec ? formatDate(rec.measured_at) : "未記録"}
                        </div>

                        {/* 4. 相対日付エリア */}
                        <div style={styles.relativeDateCol}>
                            {rec ? formatRelativeDate(rec.measured_at) : ""}
                        </div>
                    </div>
                );
            })}
        </div>
      </main>

      <button 
        onClick={handleSupportClick} 
        style={{ 
          ...styles.fab,
          background: isAiReady ? "#111827" : "#9ca3af",
          width: "auto",
          padding: "0 24px",
          borderRadius: 30,
          fontSize: 16,
          transition: "background 0.3s"
        }}
      >
        {isAiReady ? "🤖 サポート" : "⚙️ 設定が必要"}
      </button>

    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: "100dvh", background: "#f4f5f7", display: "flex", flexDirection: "column" },
  appBar: { height: 56, background: "#66A9D9", color: "white", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", boxShadow: "0 2px 4px rgba(0,0,0,0.1)", position: "sticky", top: 0, zIndex: 10 },
  appBarLeft: { display: "flex", alignItems: "center", gap: 8 },
  appBarRight: { display: "flex", gap: 16 },
  iconBtn: { background: "transparent", border: "none", color: "white", fontSize: 14, cursor: "pointer", fontWeight: "bold" },
  body: { padding: 16, flex: 1 },
  card: { background: "white", borderRadius: 12, padding: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" },
  cardHeader: { display: "flex", justifyContent: "space-between", marginBottom: 12, fontSize: 14, color: "#666" },
  linkBtn: { background: "transparent", border: "none", color: "#66A9D9", cursor: "pointer" },
  
  row: { display: "flex", alignItems: "center", padding: "12px 0", borderBottom: "1px solid #eee", cursor: "pointer" },
  userName: { flex: 1, fontWeight: "bold", color: "#333", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 8 },
  
  // ★幅を調整してバランス改善
  tempCol: { width: 100, fontWeight: "bold", textAlign: "left", flexShrink: 0 }, // 64 -> 100
  dateCol: { width: 90, fontSize: 13, color: "#666", textAlign: "left", flexShrink: 0 }, // 80 -> 90
  relativeDateCol: { fontSize: 12, color: "#999", textAlign: "right", marginLeft: "auto", minWidth: 45, flexShrink: 0 },

  fab: { position: "fixed", bottom: 24, right: 24, color: "white", border: "none", height: 56, fontWeight: "bold", boxShadow: "0 4px 12px rgba(0,0,0,0.3)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
};
