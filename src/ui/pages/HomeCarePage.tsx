import { useState } from "react";
import { useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { ApiClient } from "../../data/remote/apiClient";

export default function HomeCarePage() {
  const nav = useNavigate();
  const [input, setInput] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);

  const handleAsk = async () => {
    if (!input) return;
    setLoading(true);
    setAnswer(""); // クリア

    try {
      // GAS側でテンプレートが適用されるため、systemPromptはシンプルでOKですが、念のため役割を明示
      const system = "あなたは小児科看護師です。保護者に対し、家庭でできるホームケアを優しく簡潔にアドバイスしてください。";
      const res = await ApiClient.fetchAiGeneral(system, input);
      setAnswer(res || "回答を取得できませんでした。");
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
        <span style={{ marginLeft: 16, fontWeight: "bold" }}>家庭でのケア</span>
      </header>

      <main style={{ padding: 16 }}>
        <div style={{ background: "white", padding: 16, borderRadius: 12, boxShadow: "0 2px 4px rgba(0,0,0,0.05)" }}>
          <p style={{ fontSize: 14, color: "#666", marginBottom: 8 }}>どんな症状で困っていますか？</p>
          <textarea 
            value={input} onChange={e => setInput(e.target.value)}
            placeholder="例: 39度の熱があり、食欲がありません。アイスなら食べます。"
            style={{ width: "100%", height: 80, padding: 12, borderRadius: 8, border: "1px solid #ddd", boxSizing: "border-box", fontSize: 16, fontFamily: "inherit" }}
          />
          <button 
            onClick={handleAsk} disabled={loading}
            style={{ 
              width: "100%", marginTop: 12, padding: 12, 
              background: loading ? "#9ca3af" : "#1e293b", 
              color: "white", borderRadius: 8, border: "none", fontWeight: "bold", cursor: loading ? "not-allowed" : "pointer" 
            }}
          >
            {loading ? "AI看護師に相談中..." : "アドバイスをもらう"}
          </button>
        </div>

        {answer && (
          <div style={{ marginTop: 16, background: "white", padding: 20, borderRadius: 12, borderLeft: "4px solid #66A9D9", boxShadow: "0 2px 4px rgba(0,0,0,0.05)" }}>
            <div style={{ fontWeight: "bold", marginBottom: 16, color: "#333", display: "flex", alignItems: "center" }}>
              <span style={{ fontSize: 20, marginRight: 8 }}>🤖</span> AIからのアドバイス
            </div>
            
            {/* Markdownレンダリングエリア */}
            <div style={{ fontSize: 15, lineHeight: 1.8, color: "#333" }}>
              <ReactMarkdown components={{
                // 見出しのデザイン
                h3: ({node, ...props}) => <h3 style={{ color: "#0284c7", borderBottom: "2px solid #e0f2fe", paddingBottom: 6, marginTop: 24, marginBottom: 12, fontSize: 18 }} {...props} />,
                // 太字（レッドフラッグ等）のデザイン
                strong: ({node, ...props}) => <strong style={{ background: "linear-gradient(transparent 60%, #fecaca 60%)", fontWeight: "bold" }} {...props} />,
                // リストのデザイン
                li: ({node, ...props}) => <li style={{ marginBottom: 8, listStyleType: "disc", marginLeft: 20 }} {...props} />,
                // 段落の間隔
                p: ({node, ...props}) => <p style={{ marginBottom: 12 }} {...props} />
              }}>
                {answer}
              </ReactMarkdown>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
