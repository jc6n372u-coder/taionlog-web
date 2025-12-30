import { useNavigate } from "react-router-dom";
import { AdminToolsPanel } from "../components/AdminToolsPanel";

export default function SettingsPage() {
  const nav = useNavigate();

  return (
    <div style={styles.page}>
      {/* 青いヘッダー */}
      <header style={styles.appBar}>
        <button onClick={() => nav(-1)} style={styles.iconBtn}>←</button>
        <span style={{fontWeight: "bold", fontSize: 16}}>設定</span>
        <div style={{width: 40}} />
      </header>

      <main style={styles.body}>
        <div style={styles.section}>
            <h3 style={styles.h3}>管理メニュー</h3>
            <AdminToolsPanel />
        </div>
        
        <div style={{marginTop: 32, textAlign: "center", fontSize: 12, color: "#999"}}>
            バージョン: 2025.12.30
        </div>
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: "100dvh", background: "#f4f5f7" },
  appBar: {
    height: 56, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 8px",
    background: "#66A9D9", color: "white"
  },
  iconBtn: { width: 40, height: 40, border: "none", background: "transparent", color: "white", fontSize: 20 },
  body: { padding: 16 },
  section: { background: "white", borderRadius: 12, padding: 16, boxShadow: "0 1px 2px rgba(0,0,0,0.05)" },
  h3: { margin: "0 0 16px 0", fontSize: 14, color: "#666" },
};