import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { LocalDb } from "../../data/local/localDb";
import { useSync } from "../../services/sync/syncService";
import type { User, RecordRow } from "../../utils/types";
import { RecordModal } from "../components/RecordModal"; // ★復活

export default function HomePage() {
  const nav = useNavigate();
  const { syncState, runSync } = useSync();
  
  const [users, setUsers] = useState<User[]>([]);
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [selUser, setSelUser] = useState<string>("");
  const [selectedUserForModal, setSelectedUserForModal] = useState<User | null>(null); // ★モーダル用

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const g = await LocalDb.getCurrentGroup();
    if (!g) return nav("/onboarding");
    
    const us = await LocalDb.listUsers(g.group_id);
    setUsers(us);
    if (us.length > 0 && !selUser) setSelUser(us[0].uuid);

    const allRecs: RecordRow[] = [];
    for (const u of us) {
      const recs = await LocalDb.listRecords(u.uuid);
      if (recs.length > 0) {
        recs.sort((a,b) => new Date(b.measured_at).getTime() - new Date(a.measured_at).getTime());
        allRecs.push(recs[0]);
      }
    }
    setRecords(allRecs);
  }

  const handleSync = async () => {
    await runSync();
    await loadData();
  };

  // FABを押した時の対象ユーザー（選択中のユーザーがいなければ一人目）
  const targetUser = useMemo(() => {
      if (selUser) return users.find(u => u.uuid === selUser) ?? users[0];
      return users[0];
  }, [selUser, users]);

  return (
    <div style={styles.page}>
      <header style={styles.appBar}>
        <div style={styles.appBarLeft}>
            <span style={{fontWeight:"bold", fontSize: 18}}>たいおんログ</span>
        </div>
        <div style={styles.appBarRight}>
          <button onClick={handleSync} disabled={syncState.isLoading} style={styles.iconBtn}>
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
            {users.map(u => {
                const rec = records.find(r => r.user_uuid === u.uuid);
                return (
                    <div key={u.uuid} 
                         style={styles.row} 
                         onClick={() => setSelectedUserForModal(u)} /* タップで記録 */
                    >
                        <div style={styles.userName}>{u.name}</div>
                        <div style={styles.temp}>
                            {rec ? `${rec.temp.toFixed(1)}℃` : "—"}
                        </div>
                        <div style={styles.date}>
                            {rec ? new Date(rec.measured_at).toLocaleDateString() : ""}
                        </div>
                    </div>
                );
            })}
        </div>
      </main>

      {/* ★記録用FAB (プラスボタン) */}
      <button 
        onClick={() => targetUser && setSelectedUserForModal(targetUser)}
        style={styles.fab}
      >
        ＋
      </button>

      {/* ★記録モーダル */}
      {selectedUserForModal && (
        <RecordModal 
            user={selectedUserForModal} 
            onClose={() => setSelectedUserForModal(null)} 
            onSaved={() => {
                setSelectedUserForModal(null);
                loadData();
            }} 
        />
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: "100dvh", background: "#f4f5f7", display: "flex", flexDirection: "column" },
  appBar: {
    height: 56, background: "#66A9D9", color: "white", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px",
    boxShadow: "0 2px 4px rgba(0,0,0,0.1)", position: "sticky", top: 0, zIndex: 10
  },
  appBarLeft: { display: "flex", alignItems: "center", gap: 8 },
  appBarRight: { display: "flex", gap: 16 },
  iconBtn: { background: "transparent", border: "none", color: "white", fontSize: 14, cursor: "pointer", fontWeight: "bold" },
  body: { padding: 16, flex: 1 },
  card: { background: "white", borderRadius: 12, padding: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" },
  cardHeader: { display: "flex", justifyContent: "space-between", marginBottom: 12, fontSize: 14, color: "#666" },
  linkBtn: { background: "transparent", border: "none", color: "#66A9D9", cursor: "pointer" },
  row: { display: "flex", alignItems: "center", padding: "12px 0", borderBottom: "1px solid #eee", cursor: "pointer" },
  userName: { flex: 1, fontWeight: "bold", color: "#333" },
  temp: { fontSize: 18, fontWeight: "bold", color: "#66A9D9", marginRight: 12 },
  date: { fontSize: 12, color: "#999" },
  fab: {
    position: "fixed", bottom: 24, right: 24,
    background: "#FF6B35", color: "white", border: "none", borderRadius: 28, /* オレンジ色に戻しました */
    width: 56, height: 56, fontSize: 28, fontWeight: "bold",
    boxShadow: "0 4px 12px rgba(0,0,0,0.3)", cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center", paddingBottom: 4
  }
};