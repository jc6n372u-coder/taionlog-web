import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function ConsultationPage() {
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [age, setAge] = useState("");
  const [symptom, setSymptom] = useState("");

  const diagnose = () => {
    if (age === "0-3m") return { level: "danger", msg: "生後3ヶ月未満の発熱は、直ちに受診が必要です。" };
    if (symptom === "consciousness") return { level: "danger", msg: "意識がおかしい場合は、救急車を呼ぶか直ちに救急外来へ。" };
    if (symptom === "convulsion") return { level: "danger", msg: "痙攣（けいれん）が5分以上続く場合は救急要請を。" };
    if (symptom === "water") return { level: "warning", msg: "水分が摂れない状態が続く場合は、早めの受診をお勧めします。" };
    return { level: "ok", msg: "水分が摂れて眠れているなら、翌朝まで様子を見ても良いでしょう。ただし変化があれば受診を。" };
  };

  const result = step === 2 ? diagnose() : null;

  return (
    <div style={{ minHeight: "100dvh", background: "#f4f5f7", paddingBottom: 40 }}>
      <header style={{ height: 56, background: "#66A9D9", color: "white", display: "flex", alignItems: "center", padding: "0 16px" }}>
        <button onClick={() => nav(-1)} style={{ background: "none", border: "none", color: "white", fontSize: 20 }}>←</button>
        <span style={{ marginLeft: 16, fontWeight: "bold" }}>受診の目安</span>
      </header>

      <main style={{ padding: 16 }}>
        {step === 0 && (
          <div style={cardStyle}>
            <h3>お子様の年齢は？</h3>
            <button onClick={() => { setAge("0-3m"); setStep(1); }} style={btnStyle}>生後3ヶ月未満</button>
            <button onClick={() => { setAge("3m-1y"); setStep(1); }} style={btnStyle}>3ヶ月 〜 1歳</button>
            <button onClick={() => { setAge("over1y"); setStep(1); }} style={btnStyle}>1歳以上</button>
          </div>
        )}

        {step === 1 && (
          <div style={cardStyle}>
            <h3>一番気になる症状は？</h3>
            <button onClick={() => { setSymptom("consciousness"); setStep(2); }} style={btnAlertStyle}>視線が合わない・ぐったり</button>
            <button onClick={() => { setSymptom("convulsion"); setStep(2); }} style={btnAlertStyle}>けいれんしている</button>
            <button onClick={() => { setSymptom("water"); setStep(2); }} style={btnStyle}>水分が摂れない・おしっこが少ない</button>
            <button onClick={() => { setSymptom("fever"); setStep(2); }} style={btnStyle}>熱があるが元気はある</button>
          </div>
        )}

        {step === 2 && result && (
          <div style={cardStyle}>
            <h3 style={{ color: result.level === "danger" ? "red" : result.level === "warning" ? "#d97706" : "#059669" }}>
              {result.level === "danger" ? "🚨 すぐに受診を" : result.level === "warning" ? "⚠️ 注意が必要" : "✅ 様子見の目安"}
            </h3>
            <p style={{ lineHeight: 1.6 }}>{result.msg}</p>
            <button onClick={() => nav("/ai-support")} style={{ ...btnStyle, background: "#666", marginTop: 20, color: "white", textAlign: "center" }}>メニューに戻る</button>
          </div>
        )}

        {/* ★追加: 電話相談案内 */}
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 14, fontWeight: "bold", color: "#666", marginBottom: 8, textAlign: "center" }}>
            判断に迷ったときは…
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            <a href="tel:#8000" style={phoneBtnStyle}>
              <span style={{ fontSize: 20 }}>📞 #8000</span>
              <span style={{ fontSize: 12 }}>こども医療電話相談</span>
            </a>
            <a href="tel:#7119" style={phoneBtnStyle}>
              <span style={{ fontSize: 20 }}>🚑 #7119</span>
              <span style={{ fontSize: 12 }}>救急安心センター (対応地域のみ)</span>
            </a>
          </div>
          <p style={{ fontSize: 11, color: "#999", marginTop: 8, textAlign: "center" }}>
            ※地域によって番号や対応時間が異なる場合があります。
          </p>
        </div>
      </main>
    </div>
  );
}

const cardStyle = { background: "white", padding: 24, borderRadius: 12, display: "flex", flexDirection: "column" as const, gap: 16 };
const btnStyle = { padding: 16, background: "#f3f4f6", border: "none", borderRadius: 8, fontSize: 16, textAlign: "left" as const, cursor: "pointer" };
const btnAlertStyle = { ...btnStyle, background: "#fee2e2", color: "#991b1b" };
const phoneBtnStyle = { 
  display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center",
  background: "white", padding: 16, borderRadius: 12, textDecoration: "none", color: "#333",
  border: "2px solid #66A9D9", boxShadow: "0 2px 4px rgba(0,0,0,0.05)"
};