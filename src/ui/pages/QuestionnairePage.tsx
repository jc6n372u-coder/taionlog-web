import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { LocalDb } from "../../data/local/localDb";
import { ApiClient } from "../../data/remote/apiClient";
import type { User, RecordRow } from "../../utils/types";

export default function QuestionnairePage() {
  const nav = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<string>("");
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [memo, setMemo] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    LocalDb.getCurrentGroup().then(async g => {
      if(g) setUsers(await LocalDb.listUsers(g.group_id));
    });
  }, []);

  const handleUserSelect = async (uuid: string) => {
    setSelectedUser(uuid);
    const recs = await LocalDb.listRecords(uuid);
    setRecords(recs.slice(0, 5));
  };

  const handleGenerate = async () => {
    if (!selectedUser) return alert("対象の家族を選択してください");
    setLoading(true);
    setResult("");

    try {
      const history = records.map(r => 
        `- ${new Date(r.measured_at).toLocaleString()}: ${r.temp}℃ ${r.memo ? `(${r.memo})` : ""}`
      ).join("\n");
      
      const system = "あなたは小児科医です。保護者が持参する「問診票（医師へのメモ）」を作成してください。体温記録と親のメモを元に、時系列で簡潔にまとめてください。";
      const userPrompt = `【体温記録】\n${history}\n\n【親の追記】\n${memo}`;
      
      const res = await ApiClient.fetchAiGeneral(system, userPrompt);
      setResult(res || "生成失敗。APIキー設定を確認してください。");
    } catch (e: any) {
      console.error(e);
      alert("エラーが発生しました:\n" + (e.message || "通信エラー"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100dvh", background: "#f4f5f7", paddingBottom: 40 }}>
      <header style={{ height: 56, background: "#66A9D9", color: "white", display: "flex", alignItems: "center", padding: "0 16px" }}>
        <button onClick={() => nav(-1)} style={{ background: "none", border: "none", color: "white", fontSize: 20, cursor: "pointer" }}>←</button>
        <span style={{ marginLeft: 16, fontWeight: "bold" }}>問診票作成</span>
      </header>

      <main style={{ padding: 16 }}>
        <div style={{ background: "white", padding: 16, borderRadius: 12, marginBottom: 16, boxShadow: "0 2px 4px rgba(0,0,0,0.05)" }}>
          <label style={{ display: "block", marginBottom: 8, fontSize: 12, color: "#666" }}>誰の記録を使いますか？</label>
          <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
            {users.map(u => (
              <button key={u.uuid} onClick={() => handleUserSelect(u.uuid)}
                style={{ 
                  padding: "8px 16px", borderRadius: 20, cursor: "pointer", whiteSpace: "nowrap",
                  border: selectedUser === u.uuid ? "none" : "1px solid #ddd", 
                  background: selectedUser === u.uuid ? "#66A9D9" : "white", 
                  color: selectedUser === u.uuid ? "white" : "#333",
                  fontWeight: selectedUser === u.uuid ? "bold" : "normal"
                }}>
                {u.name}
              </button>
            ))}
          </div>
        </div>

        {selectedUser && (
          <div style={{ background: "white", padding: 16, borderRadius: 12, boxShadow: "0 2px 4px rgba(0,0,0,0.05)" }}>
            <p style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>直近の体温記録（5件）が自動で引用されます。</p>
            <textarea 
              value={memo} onChange={e => setMemo(e.target.value)}
              placeholder="他に伝えたいこと（例: 昨晩から咳がひどい、保育園でインフル流行中など）"
              style={{ width: "100%", height: 80, padding: 12, borderRadius: 8, border: "1px solid #ddd", boxSizing: "border-box", fontSize: 15, fontFamily: "inherit" }}
            />
            <button 
              onClick={handleGenerate} disabled={loading} 
              style={{ 
                width: "100%", marginTop: 12, padding: 12, 
                background: loading ? "#9ca3af" : "#1e293b", 
                color: "white", borderRadius: 8, border: "none", cursor: loading ? "not-allowed" : "pointer", fontWeight: "bold" 
              }}
            >
              {loading ? "作成中..." : "問診票を生成する"}
            </button>
          </div>
        )}

        {result && (
          <div style={{ marginTop: 16, background: "white", padding: 20, borderRadius: 12, border: "2px solid #66A9D9", boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>
            <h3 style={{ marginTop: 0, color: "#333", display: "flex", alignItems: "center" }}>📋 医師へのメモ</h3>
            
            {/* Markdown表示エリア */}
            <div style={{ fontSize: 15, lineHeight: 1.8, color: "#333" }}>
              <ReactMarkdown components={{
                h3: ({node, ...props}) => <h3 style={{ fontSize: 16, borderBottom: "1px solid #ddd", paddingBottom: 4, marginTop: 16, marginBottom: 8 }} {...props} />,
                strong: ({node, ...props}) => <strong style={{ textDecoration: "underline", textDecorationColor: "#66A9D9", textDecorationThickness: "2px", fontWeight: "bold" }} {...props} />,
                li: ({node, ...props}) => <li style={{ marginBottom: 4, marginLeft: 16 }} {...props} />
              }}>
                {result}
              </ReactMarkdown>
            </div>

            <button 
              onClick={() => navigator.clipboard.writeText(result).then(()=>alert("コピーしました"))} 
              style={{ marginTop: 16, padding: "10px 16px", background: "#f3f4f6", border: "1px solid #ddd", borderRadius: 8, cursor: "pointer", width: "100%", fontWeight: "bold", color: "#555" }}
            >
              テキストをコピーする
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
