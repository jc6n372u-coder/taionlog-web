import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LocalDb } from "../../data/local/localDb";
import { AdminToolsPanel } from "../components/AdminToolsPanel";
import type { SettingsRow } from "../../utils/types";

// 通知許可
async function requestNotification() {
  if (!("Notification" in window)) return alert("非対応です");
  const p = await Notification.requestPermission();
  alert(p === "granted" ? "許可されました" : "拒否されました");
}

export default function SettingsPage() {
  const nav = useNavigate();
  const [group, setGroup] = useState<{ group_name: string } | null>(null);
  const [settings, setSettings] = useState<SettingsRow | null>(null);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const g = await LocalDb.getCurrentGroup();
    if (g) {
      setGroup(g);
      setSettings(await LocalDb.ensureSettings(g.group_id));
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
      <header style={styles.appBar}>
        <button onClick={() => nav(-1)} style={styles.iconBtn}>←</button>
        <span style={{fontWeight: "bold", fontSize: 16}}>設定</span>
        <div style={{width: 40}} />
      </header>

      <main style={styles.body}>
        {/* グループ全体設定 */}
        <section style={styles.card}>
          <h3 style={styles.h3}>グループ設定 (共有)</h3>
          <button onClick={() => nav("/settings/group")} style={styles.menuItem}>
            <div>
              <span style={{fontWeight: "bold"}}>{group?.group_name ?? "..."}</span>
              <div style={{fontSize: 11, color: "#999"}}>メンバー追加・編集・並び替え</div>
            </div>
            <span style={{color: "#ccc"}}>›</span>
          </button>
          
          <button onClick={() => nav("/settings/medications")} style={styles.menuItem}>
            <div>
              <span style={{fontWeight: "bold"}}>お薬の管理</span>
              <div style={{fontSize: 11, color: "#999"}}>よく使う薬の登録・削除</div>
            </div>
            <span style={{color: "#ccc"}}>›</span>
          </button>

          <button onClick={() => nav("/settings/symptoms")} style={styles.menuItem}>
            <div>
              <span style={{fontWeight: "bold"}}>症状タグの管理</span>
              <div style={{fontSize: 11, color: "#999"}}>記録時の症状ボタンを編集</div>
            </div>
            <span style={{color: "#ccc"}}>›</span>
          </button>

          {/* ★追加: AI設定 */}
          <button onClick={() => nav("/settings/ai")} style={styles.menuItem}>
            <div>
              <span style={{fontWeight: "bold"}}>AI機能の設定</span>
              <div style={{fontSize: 11, color: "#999"}}>APIキー・モデルの変更</div>
            </div>
            <span style={{color: "#ccc"}}>›</span>
          </button>

          <button onClick={() => nav("/invite")} style={styles.menuItem}>
            <span>参加コード確認</span>
            <span style={{color: "#ccc"}}>›</span>
          </button>
        </section>

        {/* アプリ個別設定 */}
        <section style={styles.card}>
          <h3 style={styles.h3}>アプリ設定 (この端末のみ)</h3>
          <div style={styles.switchRow}>
            <div>
              <div style={{fontWeight: "bold", fontSize: 14}}>ホームで体温を表示</div>
              <div style={{fontSize: 11, color: "#999"}}>OFFにすると「**.*℃」になります</div>
            </div>
            <label style={styles.switch}>
              <input type="checkbox" checked={!!settings?.show_temp_on_home} onChange={toggleShowTemp} style={{display: "none"}} />
              <div style={{...styles.switchTrack, background: settings?.show_temp_on_home ? "#66A9D9" : "#ccc"}}>
                <div style={{...styles.switchKnob, transform: settings?.show_temp_on_home ? "translateX(22px)" : "translateX(2px)"}} />
              </div>
            </label>
          </div>
          <button onClick={requestNotification} style={{...styles.menuItem, borderBottom:"none"}}>
            <span>通知の許可設定</span>
            <span style={{color: "#ccc"}}>›</span>
          </button>
        </section>

        <section style={styles.card}>
          <h3 style={styles.h3}>管理メニュー</h3>
          <AdminToolsPanel />
        </section>
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: "100dvh", background: "#f4f5f7" },
  appBar: { height: 56, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 8px", background: "#66A9D9", color: "white" },
  iconBtn: { width: 40, height: 40, border: "none", background: "transparent", color: "white", fontSize: 20, cursor: "pointer" },
  body: { padding: 16, display: "flex", flexDirection: "column", gap: 16 },
  card: { background: "white", borderRadius: 12, padding: 16, boxShadow: "0 1px 2px rgba(0,0,0,0.05)" },
  h3: { margin: "0 0 12px 0", fontSize: 13, color: "#888", fontWeight: "bold" },
  menuItem: { width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", background: "transparent", border: "none", padding: "12px 0", fontSize: 15, cursor: "pointer", borderBottom: "1px solid #f0f0f0", textAlign: "left" },
  switchRow: { display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 12, borderBottom: "1px solid #f0f0f0", marginBottom: 8 },
  switch: { position: "relative", cursor: "pointer", width: 48, height: 26 },
  switchTrack: { width: "100%", height: "100%", borderRadius: 13, transition: "background 0.2s" },
  switchKnob: { width: 22, height: 22, background: "white", borderRadius: "50%", position: "absolute", top: 2, left: 0, transition: "transform 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }
};