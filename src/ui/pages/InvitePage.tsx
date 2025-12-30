import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LocalDb } from "../../data/local/localDb";

export default function InvitePage() {
  const nav = useNavigate();
  const [code, setCode] = useState("...");
  const [expires, setExpires] = useState("");

  useEffect(() => {
    // データは届いているので、あとは表示するだけです
    LocalDb.getCurrentGroup().then(g => {
        if (g) {
            // join_code があれば表示、なければ "..." のまま
            if (g.join_code) {
                setCode(g.join_code);
            }
            if (g.join_code_expires_at) {
                setExpires(new Date(g.join_code_expires_at).toLocaleDateString());
            }
        }
    });
  }, []);

  const copy = () => {
      if(code && code !== "...") {
          navigator.clipboard.writeText(code);
          alert("コピーしました");
      }
  };

  return (
    <div style={{minHeight: "100dvh", background: "#f4f5f7"}}>
      <header style={{height: 56, display: "flex", alignItems: "center", padding: "0 8px", background: "#66A9D9", color: "white"}}>
        <button onClick={() => nav(-1)} style={{border:"none", background:"transparent", color:"white", fontSize:20, width:40}}>←</button>
        <span style={{fontWeight:"bold", fontSize:16}}>参加コード</span>
      </header>
      
      <main style={{padding: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 20}}>
        <div onClick={copy} style={{background: "white", padding: 32, borderRadius: 16, width: "100%", textAlign: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.1)", cursor:"pointer"}}>
            <div style={{fontSize: 14, color: "#666", marginBottom: 8}}>家族の参加コード (タップでコピー)</div>
            <div style={{fontSize: 32, fontWeight: "900", color: "#333", letterSpacing: 2, marginBottom: 8}}>
                {code}
            </div>
            <div style={{fontSize: 12, color: "#999"}}>有効期限: {expires || "無期限"}</div>
        </div>
        <div style={{fontSize: 13, color: "#666", lineHeight: 1.6, textAlign: "center"}}>
            このコードを家族の端末に入力すると、<br/>同じグループに参加してデータを共有できます。
        </div>
      </main>
    </div>
  );
}