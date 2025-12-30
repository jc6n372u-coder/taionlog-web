import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LocalDb } from "../../data/local/localDb";
import { AdminToolsPanel } from "../components/AdminToolsPanel";
import type { SettingsRow } from "../../utils/types";

// ブラウザ通知の許可を求める関数
async function requestNotification() {
  if (!("Notification" in window)) {
    alert("このブラウザは通知に対応していません");
    return;
  }
  const p = await Notification.requestPermission();
  alert(p === "granted" ? "通知が許可されました" : "通知が拒否されました");
}

export default function SettingsPage() {
  const nav = useNavigate();
  const [group, setGroup] = useState<{ group_name: string } | null>(null);
  const [settings, setSettings] = useState<SettingsRow | null>(null);
  const [isPwa, setIsPwa] = useState(false);

  useEffect(() => {
    loadData();
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    setIsPwa(isStandalone);
  }, []);

  async function loadData() {
    const g = await LocalDb.getCurrentGroup();
    if (g) {
      setGroup(g);
      const s = await LocalDb.ensureSettings(g.group_id);
      setSettings(s);
    }
  }

  async function toggleShowTemp() {
    if (!settings) return;
    const next = { ...settings, show_temp_on_home: !settings.show_temp_on_home };
    await LocalDb.upsertSettings(next);
    setSettings(next);
  }

  return (
    <div style={styles.page}>
      {/* 青いヘッダー */}
      <header style={styles.appBar}>
        <button onClick={() => nav(-1)} style={styles.iconBtn}>←</button>
        <span style={{fontWeight: "bold", fontSize: 16}}>設定</span>
        <div style={{width: 40}} />
      </header>

      <main style={styles.body}>
        {/* 1. グループ情報 */}
        <section style={styles.card}>
          <h3 style={styles.h3}>グループ</h3>
          <div style={styles.row}>
            <span style={{color: "#666"}}>グループ名</span>
            <span style={{fontWeight: "bold"}}>{group?.group_name ?? "..."}</span>
          </div>
        </section>

        {/* 2. 参加コード */}
        <section style={styles.card}>
          <h3 style={styles.h3}>参加コード</h3>
          <button onClick={() => nav("/invite")} style={styles.menuItem}>
            <span>参加コードを表示する</span>
            <span style={{color: "#ccc"}}>›</span>
          </button>
        </section>

        {/* 3. プライバシー */}
        <section style={styles.card}>
          <h3 style={styles.h3}>プライバシー</h3>
          <div style={styles.switchRow}>
            <div>
              <div style={{fontWeight: "bold", fontSize: 14}}>ホームで体温を表示</div>
              <div style={{fontSize: 11, color: "#999"}}>OFFにすると「**.*℃」になります</div>
            </div>
            <label style={styles.switch}>
              <input 
                type="checkbox" 
                checked={!!settings?.show_temp_on_home} 
                onChange={toggleShowTemp}
                style={{display: "none"}}
              />
              <div style={{
                ...styles.switchTrack,
                background: settings?.show_temp_on_home ? "#66A9D9" : "#ccc"
              }}>
                <div style={{
                  ...styles.switchKnob,
                  transform: settings?.show_temp_on_home ? "translateX(22px)" : "translateX(2px)"
                }} />
              </div>
            </label>
          </div>
        </section>

        {/* 4. アプリ設定 */}
        <section style={styles.card}>
          <h3 style={styles.h3}>アプリ設定</h3>
          <button onClick={requestNotification} style={styles.menuItem}>
            <span>通知設定（許可をリクエスト）</span>
            <span style={{color: "#ccc"}}>›</span>
          </button>
          {!isPwa && (
            <div style={{padding: "12px 0", fontSize: 13, color: "#666", lineHeight: 1.5}}>
              💡 <strong>ホーム画面に追加</strong>すると、アプリとして快適に使えます（ブラウザのメニューから追加してください）。
            </div>
          )}
        </section>

        {/* 5. 管理ツール */}
        <section style={styles.card}>
          <h3 style={styles.h3}>管理メニュー</h3>
          <AdminToolsPanel />
        </section>
        
        <div style={{marginTop: 32, textAlign: "center", fontSize: 12, color: "#999"}}>
            バージョン: 2025.12.30
        </div>
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: "100dvh", background: "#f4f5f7", fontFamily: "sans-serif" },
  appBar: {
    height: 56, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 8px",
    background: "#66A9D9", color: "white", position: "sticky", top: 0, zIndex: 10
  },
  iconBtn: { width: 40, height: 40, border: "none", background: "transparent", color: "white", fontSize: 20, cursor: "pointer" },
  body: { padding: 16, display: "flex", flexDirection: "column", gap: 16 },
  card: { background: "white", borderRadius: 12, padding: 16, boxShadow: "0 1px 2px rgba(0,0,0,0.05)" },
  h3: { margin: "0 0 12px 0", fontSize: 13, color: "#888", fontWeight: "bold" },
  row: { display: "flex", justifyContent: "space-between", fontSize: 15 },
  menuItem: { 
    width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", 
    background: "transparent", border: "none", padding: "12px 0", fontSize: 15, cursor: "pointer", 
    borderBottom: "1px solid #f0f0f0" 
  },
  switchRow: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  switch: { position: "relative", cursor: "pointer", width: 48, height: 26 },
  switchTrack: { width: "100%", height: "100%", borderRadius: 13, transition: "background 0.2s" },
  switchKnob: { 
    width: 22, height: 22, background: "white", borderRadius: "50%", 
    position: "absolute", top: 2, left: 0, transition: "transform 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" 
  }
};