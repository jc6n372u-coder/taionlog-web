// src/ui/pages/JoinGroupPage.tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LocalDb } from "../../data/local/localDb";
// ApiClientなど実際の参加ロジックが必要ですが、まずはUIのみ
export default function JoinGroupPage() {
  const nav = useNavigate();
  const [code, setCode] = useState("");

  const handleJoin = async () => {
    if (!code) return;
    alert("招待コード: " + code + "\n(現在デモモードです)");
    // TODO: 実装時にここにAPI呼び出しを追加
    nav("/");
  };

  return (
    <div style={{ minHeight: "100dvh", background: "white", padding: 24, textAlign: "center" }}>
      <h2 style={{ marginTop: 40 }}>家族に参加する</h2>
      <input 
        value={code}
        onChange={e => setCode(e.target.value.toUpperCase())}
        placeholder="招待コード"
        style={{ width: "100%", padding: 16, fontSize: 18, textAlign: "center", borderRadius: 12, border: "2px solid #ddd", marginBottom: 24 }}
      />
      <button onClick={handleJoin} style={{ width: "100%", padding: 16, background: "#66A9D9", color: "white", borderRadius: 12, border: "none", fontWeight: "bold" }}>参加</button>
      <button onClick={() => nav(-1)} style={{ marginTop: 20, background: "none", border: "none", color: "#999" }}>戻る</button>
    </div>
  );
}