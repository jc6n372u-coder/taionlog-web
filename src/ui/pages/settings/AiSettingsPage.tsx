import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { LocalDb } from "../../../data/local/localDb";
import type { AiSettings } from "../../../utils/types";

export default function AiSettingsPage() {
  const nav = useNavigate();
  const [settings, setSettings] = useState<AiSettings>({
    geminiApiKey: "",
    geminiModel: "gemini-3-flash", // ★修正: 正しいモデル名
    groqApiKey: "",
    groqModel: "llama-3.3-70b-versatile",
    useFallback: true
  });

  const [showGemini, setShowGemini] = useState(false);
  const [showGroq, setShowGroq] = useState(false);

  useEffect(() => {
    LocalDb.getAiSettings().then(s => {
      if (s) {
        // ★追加: 古い設定(3.0)があれば修正して読み込む
        if (s.geminiModel === "gemini-3.0-flash") s.geminiModel = "gemini-3-flash";
        setSettings(s);
      }
    });
  }, []);

  const handleSave = async () => {
    // --- バリデーション ---
    const geminiKey = settings.geminiApiKey.trim();
    if (geminiKey) {
      if (!geminiKey.startsWith("AIza")) {
        alert("【Gemini APIキー エラー】\nキーは通常 'AIza' で始まります。");
        return;
      }
      if (geminiKey.length !== 39) {
        alert(`【Gemini APIキー エラー】\n桁数が違います(現在${geminiKey.length}文字)。\nコピー漏れを確認してください。`);
        return;
      }
    }

    const groqKey = settings.groqApiKey.trim();
    if (groqKey) {
      if (!groqKey.startsWith("gsk_")) {
        alert("【Groq APIキー エラー】\nキーは通常 'gsk_' で始まります。");
        return;
      }
    }

    await LocalDb.saveAiSettings({ ...settings, geminiApiKey: geminiKey, groqApiKey: groqKey });
    alert("AI設定を保存しました。");
    nav(-1);
  };

  return (
    <div style={{ minHeight: "100dvh", background: "#f4f5f7" }}>
      <header style={{ height: 56, background: "#66A9D9", color: "white", display: "flex", alignItems: "center", padding: "0 16px" }}>
        <button onClick={() => nav(-1)} style={{ background: "none", border: "none", color: "white", fontSize: 20 }}>←</button>
        <span style={{ marginLeft: 16, fontWeight: "bold" }}>AI機能の設定</span>
      </header>

      <main style={{ padding: 16, display: "grid", gap: 16 }}>
        <div style={{ padding: 12, background: "#e0f2fe", borderRadius: 8, fontSize: 13, color: "#0369a1" }}>
          AI機能を利用するには、ご自身のAPIキーが必要です。<br/>
          キーが設定されていない場合、ホーム画面のサポートボタンは利用できません。
        </div>

        {/* Gemini設定 */}
        <section style={styles.card}>
          <h3 style={styles.cardTitle}>Google Gemini (優先)</h3>
          
          <label style={styles.label}>API Key (39文字)</label>
          <div style={styles.inputGroup}>
            <input 
              type={showGemini ? "text" : "password"}
              placeholder="例: AIzaSy..." 
              style={styles.inputWithIcon}
              value={settings.geminiApiKey}
              onChange={e => setSettings({...settings, geminiApiKey: e.target.value})}
            />
            <button onClick={() => setShowGemini(!showGemini)} style={styles.iconButton}>
              {showGemini ? "🙈" : "👁️"}
            </button>
          </div>
          
          <label style={styles.label}>Model (任意入力可)</label>
          <input 
            list="gemini-models"
            placeholder="例: gemini-3-flash" 
            style={styles.input}
            value={settings.geminiModel}
            onChange={e => setSettings({...settings, geminiModel: e.target.value})}
          />
          <datalist id="gemini-models">
            {/* ★修正: リスト更新 */}
            <option value="gemini-3-flash" />
            <option value="gemini-2.5-flash" />
            <option value="gemini-1.5-flash" />
          </datalist>
        </section>

        {/* Groq設定 */}
        <section style={styles.card}>
          <h3 style={styles.cardTitle}>Groq (予備)</h3>
          
          <label style={styles.label}>API Key ('gsk_'で始まる)</label>
          <div style={styles.inputGroup}>
            <input 
              type={showGroq ? "text" : "password"}
              placeholder="例: gsk_8A..." 
              style={styles.inputWithIcon}
              value={settings.groqApiKey}
              onChange={e => setSettings({...settings, groqApiKey: e.target.value})}
            />
            <button onClick={() => setShowGroq(!showGroq)} style={styles.iconButton}>
              {showGroq ? "🙈" : "👁️"}
            </button>
          </div>
          
          <label style={styles.label}>Model (任意入力可)</label>
          <input 
            list="groq-models"
            placeholder="例: llama-3.3-70b-versatile" 
            style={styles.input}
            value={settings.groqModel}
            onChange={e => setSettings({...settings, groqModel: e.target.value})}
          />
          <datalist id="groq-models">
            <option value="llama-3.3-70b-versatile" />
            <option value="mixtral-8x7b-32768" />
            <option value="gemma2-9b-it" />
          </datalist>

          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 14, cursor: "pointer" }}>
            <input 
              type="checkbox" checked={settings.useFallback}
              onChange={e => setSettings({...settings, useFallback: e.target.checked})}
            />
            Geminiエラー時にGroqを使用する
          </label>
        </section>

        <button onClick={handleSave} style={styles.saveBtn}>設定を保存</button>
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: { background: "white", padding: 16, borderRadius: 12, border: "1px solid #ddd" },
  cardTitle: { margin: "0 0 12px 0", fontSize: 16, borderBottom:"1px solid #eee", paddingBottom:8 },
  label: { display:"block", fontSize:12, color:"#666", marginBottom:4 },
  inputGroup: { display: "flex", gap: 8, marginBottom: 12 },
  inputWithIcon: { flex: 1, padding: 12, borderRadius: 8, border: "1px solid #ddd", fontSize: 14, boxSizing: "border-box" },
  iconButton: { padding: "0 12px", background: "#f3f4f6", border: "1px solid #ddd", borderRadius: 8, cursor: "pointer", fontSize: 18 },
  input: { width: "100%", padding: 12, borderRadius: 8, border: "1px solid #ddd", marginBottom: 12, fontSize: 14, boxSizing: "border-box" },
  saveBtn: { padding: 16, background: "#111827", color: "white", borderRadius: 12, border: "none", fontWeight: "bold", fontSize: 16, cursor: "pointer" }
};