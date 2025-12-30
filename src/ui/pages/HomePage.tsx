import { useEffect, useState, useMemo } from "react";

import { useNavigate } from "react-router-dom";

import { LocalDb } from "../../data/local/localDb";

import { useSync } from "../../services/sync/syncService";

import type { User, RecordRow, SettingsRow } from "../../utils/types";

import { RecordModal } from "../components/RecordModal";



// 相対日付フォーマッター

function formatRelativeDate(iso: string) {

  const d = new Date(iso);

  const now = new Date();

  const diff = now.getTime() - d.getTime();

  const dayDiff = Math.floor(diff / (1000 * 60 * 60 * 24));

 

  const week = ["日","月","火","水","木","金","土"];

  const dateStr = `${d.getMonth()+1}/${d.getDate()}(${week[d.getDay()]})`;



  if (dayDiff === 0) return `${dateStr} 今日`;

  if (dayDiff === 1) return `${dateStr} 昨日`;

  return `${dateStr} ${dayDiff}日前`;

}



export default function HomePage() {

  const nav = useNavigate();

  const { syncState, runSync } = useSync();

 

  const [users, setUsers] = useState<User[]>([]);

  const [records, setRecords] = useState<RecordRow[]>([]);

  const [settings, setSettings] = useState<SettingsRow | null>(null);

 

  // モーダル・メニュー制御

  const [selectedUserForModal, setSelectedUserForModal] = useState<User | null>(null);

  const [showMemberMenu, setShowMemberMenu] = useState(false);



  useEffect(() => {

    loadData();

    // 画面に戻ってきた時に設定を再読み込みするリスナーがあればベストだが、今回は簡易的に定期チェック等はせず、

    // useSyncや操作時にリロードされる形にする。

    // ※より厳密にするなら useFocusEffect 等を使うが、今回はロード時実行で対応。

  }, []);



  async function loadData() {

    const g = await LocalDb.getCurrentGroup();

    if (!g) return nav("/onboarding");

   

    // 設定読み込み（体温隠し設定のため）

    const s = await LocalDb.ensureSettings(g.group_id);

    setSettings(s);

   

    const us = await LocalDb.listUsers(g.group_id);

    setUsers(us);



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



  const openRecordModal = (u: User) => {

    setShowMemberMenu(false);

    setSelectedUserForModal(u);

  };



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

            {users.length === 0 && <div style={{padding:20, textAlign:"center", color:"#999"}}>メンバーがいません<br/>設定から追加してください</div>}

           

            {users.map(u => {

                const rec = records.find(r => r.user_uuid === u.uuid);

                // 設定で隠す場合

                const showTemp = settings?.show_temp_on_home ?? true;

                const tempStr = rec ? (showTemp ? `${rec.temp.toFixed(1)}℃` : "**.*℃") : "—";



                return (

                    <div key={u.uuid} style={styles.row} onClick={() => openRecordModal(u)}>

                        <div style={styles.userName}>{u.name}</div>

                        <div style={styles.temp}>{tempStr}</div>

                        <div style={styles.date}>

                            {rec ? formatRelativeDate(rec.measured_at) : "未記録"}

                        </div>

                    </div>

                );

            })}

        </div>

      </main>



      {/* FAB: メンバー選択メニューを開く */}

      <button onClick={() => setShowMemberMenu(true)} style={styles.fab}>＋</button>



      {/* メンバー選択メニュー (下からスライド) */}

      {showMemberMenu && (

        <div style={styles.menuOverlay} onClick={() => setShowMemberMenu(false)}>

            <div style={styles.menuSheet} onClick={e => e.stopPropagation()}>

                <div style={styles.menuTitle}>誰の記録をつけますか？</div>

                {users.map(u => (

                    <button key={u.uuid} onClick={() => openRecordModal(u)} style={styles.menuItem}>

                        {u.name}

                    </button>

                ))}

                <button onClick={() => setShowMemberMenu(false)} style={styles.menuCancel}>キャンセル</button>

            </div>

        </div>

      )}



      {/* 記録モーダル */}

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

  appBar: { height: 56, background: "#66A9D9", color: "white", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", boxShadow: "0 2px 4px rgba(0,0,0,0.1)", position: "sticky", top: 0, zIndex: 10 },

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

  fab: { position: "fixed", bottom: 24, right: 24, background: "#FF6B35", color: "white", border: "none", borderRadius: 28, width: 56, height: 56, fontSize: 28, fontWeight: "bold", boxShadow: "0 4px 12px rgba(0,0,0,0.3)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", paddingBottom: 4 },

 

  // メニュー用スタイル

  menuOverlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "flex-end" },

  menuSheet: { width: "100%", background: "white", borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: "20px 16px", display: "flex", flexDirection: "column", gap: 12, animation: "slideUp 0.2s ease-out" },

  menuTitle: { textAlign: "center", fontWeight: "bold", color: "#666", marginBottom: 8 },

  menuItem: { padding: 16, background: "#f4f5f7", border: "none", borderRadius: 12, fontSize: 16, fontWeight: "bold", color: "#333", cursor: "pointer" },

  menuCancel: { padding: 16, background: "white", border: "1px solid #ddd", borderRadius: 12, fontSize: 16, color: "#666", cursor: "pointer" }

};