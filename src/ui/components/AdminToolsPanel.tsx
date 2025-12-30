import { useState } from "react";
import { LocalDb } from "../../data/local/localDb";

export function AdminToolsPanel() {
  const [msg, setMsg] = useState("");

  async function clearCache() {
    if (!confirm("アプリのキャッシュ（一時データ）を削除してリロードしますか？\n※保存されたデータは消えません。")) return;
    try {
      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
          await registration.unregister();
        }
      }
      window.location.reload();
    } catch (e) {
      alert("削除に失敗しました: " + e);
    }
  }

  async function forceResync() {
    if (!confirm("強制的に全データを再同期しますか？")) return;
    await LocalDb.setMeta("last_sync", ""); // 最終同期時刻をリセット
    setMsg("同期時刻をリセットしました。ホーム画面に戻って同期ボタンを押してください。");
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <button type="button" onClick={clearCache} style={styles.btn}>
        キャッシュクリア（更新が反映されない時）
      </button>
      <button type="button" onClick={forceResync} style={styles.btn}>
        強制再同期（同期リセット）
      </button>
      {msg && <div style={{ fontSize: 12, color: "green" }}>{msg}</div>}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  btn: {
    width: "100%",
    padding: "10px",
    borderRadius: 8,
    border: "1px solid #ddd",
    background: "#f9f9f9",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 700,
    color: "#555",
  },
};