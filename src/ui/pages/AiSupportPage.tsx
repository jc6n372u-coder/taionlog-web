import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { ApiClient, AiCallError } from "../../data/remote/apiClient";
import { LocalDb } from "../../data/local/localDb";
import { describeActiveAiModel } from "../../config/aiDefaults";

export default function AiSupportPage() {
  const nav = useNavigate();

  // チャット用のステート
  const [inputText, setInputText] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // 使用モデル名の表示用
  const [modelName, setModelName] = useState("AI Model");

  // 設定からAIモデル名を判定して取得
  useEffect(() => {
    void LocalDb.getAiSettings().then((s) => {
      setModelName(describeActiveAiModel(s));
    });
  }, []);

  // メニュー項目の定義
  const MENU_ITEMS = [
    {
      title: "🚨 受診の目安",
      desc: "病院に行くべき？迷ったらここ",
      emoji: "🏥",
      action: () => nav("/consultation"),
    },
    {
      title: "🌡 家庭でのケア",
      desc: "お家でできる対処法",
      emoji: "🧊",
      action: () => nav("/home-care"),
    },
    {
      title: "📝 問診票作成",
      desc: "医師に伝えるメモを作る",
      emoji: "📋",
      action: () => nav("/questionnaire"),
    },
    {
      title: "💊 お薬手帳",
      desc: "飲み合わせ・解説・記録",
      emoji: "💊",
      action: () => nav("/medication-book"),
    },
  ];

  // AIに相談する処理
  const handleConsult = async () => {
    if (!inputText.trim()) return;

    setIsLoading(true);
    setAiResponse("");
    setErrorMsg("");

    try {
      const systemPrompt = "あなたは親切な小児科医療アシスタントです。";
      const res = await ApiClient.fetchAiGeneral(systemPrompt, inputText);
      setAiResponse(res);
    } catch (e) {
      console.error(e);
      if (e instanceof AiCallError) {
        setErrorMsg(`エラー [${e.provider}/${e.stage}]: ${e.message}`);
      } else if (e instanceof Error) {
        setErrorMsg("エラー: " + e.message);
      } else {
        setErrorMsg("通信エラーが発生しました");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100dvh", background: "#f4f5f7", paddingBottom: 40 }}>
      <header
        style={{
          height: 56,
          background: "#66A9D9",
          color: "white",
          display: "flex",
          alignItems: "center",
          padding: "0 16px",
        }}
      >
        <button
          onClick={() => nav("/")}
          style={{ background: "none", border: "none", color: "white", fontSize: 20, cursor: "pointer" }}
        >
          ←
        </button>
        <span style={{ marginLeft: 16, fontWeight: "bold" }}>あんしん相談サポート</span>
        <button
          onClick={() => nav("/settings/ai")}
          style={{ marginLeft: "auto", background: "none", border: "none", fontSize: 20, cursor: "pointer" }}
        >
          ⚙️
        </button>
      </header>

      {/* メインメニュー */}
      <main style={{ padding: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {MENU_ITEMS.map((item, idx) => (
          <button
            key={idx}
            onClick={item.action}
            style={{
              background: "white",
              border: "1px solid #ddd",
              borderRadius: 16,
              padding: "24px 16px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
              gap: 12,
              cursor: "pointer",
              boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
            }}
          >
            <div style={{ fontSize: 32 }}>{item.emoji}</div>
            <div style={{ fontWeight: "bold", fontSize: 16, color: "#333" }}>{item.title}</div>
            <div style={{ fontSize: 12, color: "#888", lineHeight: 1.4 }}>{item.desc}</div>
          </button>
        ))}
      </main>

      {/* 汎用AI相談エリア */}
      <div style={{ padding: "0 16px", marginTop: 16 }}>
        <div
          style={{
            background: "white",
            padding: 20,
            borderRadius: 16,
            boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
          }}
        >
          <h3
            style={{
              margin: "0 0 12px 0",
              fontSize: 16,
              color: "#333",
              borderLeft: "4px solid #66A9D9",
              paddingLeft: 8,
            }}
          >
            🤖 AIに自由に相談
          </h3>
          <p style={{ fontSize: 12, color: "#666", marginBottom: 12 }}>
            どのメニューか迷ったら、こちらへどうぞ。
          </p>
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="例: 子供が熱を出して震えています。どうしたらいいですか？"
            style={{
              width: "100%",
              height: 80,
              padding: 12,
              borderRadius: 8,
              border: "1px solid #ddd",
              boxSizing: "border-box",
              fontSize: 15,
              fontFamily: "inherit",
            }}
          />
          <button
            onClick={handleConsult}
            disabled={isLoading}
            style={{
              marginTop: 12,
              width: "100%",
              padding: 14,
              background: isLoading ? "#ccc" : "#1e293b",
              color: "white",
              border: "none",
              borderRadius: 8,
              fontWeight: "bold",
              cursor: isLoading ? "not-allowed" : "pointer",
            }}
          >
            {isLoading ? "考え中..." : "アドバイスをもらう"}
          </button>

          {errorMsg && (
            <div
              style={{
                color: "red",
                marginTop: 10,
                fontSize: 14,
                background: "#fee2e2",
                padding: 8,
                borderRadius: 4,
              }}
            >
              {errorMsg}
            </div>
          )}

          {aiResponse && (
            <div style={{ marginTop: 24, borderTop: "1px solid #eee", paddingTop: 16 }}>
              <div
                style={{
                  fontSize: 15,
                  lineHeight: 1.8,
                  color: "#333",
                  textAlign: "left",
                  wordBreak: "break-word",
                  overflowWrap: "anywhere",
                  maxWidth: "100%",
                }}
              >
                <ReactMarkdown
                  components={{
                    h3: (props) => (
                      <h3
                        style={{
                          color: "#0284c7",
                          borderBottom: "2px solid #e0f2fe",
                          paddingBottom: 6,
                          marginTop: 24,
                          marginBottom: 12,
                          fontSize: 18,
                        }}
                        {...props}
                      />
                    ),
                    strong: (props) => (
                      <strong
                        style={{
                          background: "linear-gradient(transparent 60%, #fecaca 60%)",
                          fontWeight: "bold",
                        }}
                        {...props}
                      />
                    ),
                    li: (props) => (
                      <li style={{ marginBottom: 8, listStyleType: "disc", marginLeft: 20 }} {...props} />
                    ),
                    p: (props) => <p style={{ marginBottom: 12 }} {...props} />,
                  }}
                >
                  {aiResponse}
                </ReactMarkdown>
              </div>

              <div
                style={{
                  textAlign: "right",
                  marginTop: 12,
                  fontSize: 11,
                  color: "#bbb",
                  fontFamily: "sans-serif",
                }}
              >
                Powered by {modelName}
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: 16, textAlign: "center", fontSize: 12, color: "#999" }}>
        ※ AIの回答は参考情報です。
        <br />
        必ず医師の判断を優先してください。
      </div>
    </div>
  );
}
