import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { LocalDb } from "../../../data/local/localDb";
import { AI_DEFAULTS } from "../../../config/aiDefaults";
import type { AiSettings } from "../../../utils/types";

export default function AiSettingsPage() {
  const nav = useNavigate();
  const [settings, setSettings] = useState<AiSettings>({
    geminiApiKey: "",
    geminiModel: AI_DEFAULTS.gemini.model,
    groqApiKey: "",
    groqModel: AI_DEFAULTS.groq.model,
    useFallback: true,
  });

  const [showGemini, setShowGemini] = useState(false);
  const [showGroq, setShowGroq] = useState(false);

  // 手順アコーディオンの開閉状態
  const [showGeminiHelp, setShowGeminiHelp] = useState(false);
  const [showGroqHelp, setShowGroqHelp] = useState(false);

  useEffect(() => {
    void LocalDb.getAiSettings().then((s) => {
      if (s) {
        // 旧バージョンとのモデル名互換
        if (s.geminiModel === "gemini-3.0-flash") s.geminiModel = AI_DEFAULTS.gemini.model;
        setSettings(s);
      }
    });
  }, []);

  const handleSave = async () => {
    const geminiKey = settings.geminiApiKey.trim();
    if (geminiKey) {
      if (!geminiKey.startsWith("AIza")) {
        alert("【Gemini APIキー エラー】\nキーは通常 'AIza' で始まります。");
        return;
      }
      if (geminiKey.length !== 39) {
        alert(
          `【Gemini APIキー エラー】\n桁数が違います(現在${geminiKey.length}文字)。\nコピー漏れを確認してください。`
        );
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
          onClick={() => nav(-1)}
          style={{ background: "none", border: "none", color: "white", fontSize: 20, cursor: "pointer" }}
        >
          ←
        </button>
        <span style={{ marginLeft: 16, fontWeight: "bold" }}>AI機能の設定</span>
      </header>

      <main style={{ padding: 16, display: "grid", gap: 16 }}>
        <div
          style={{
            padding: 12,
            background: "#e0f2fe",
            borderRadius: 8,
            fontSize: 13,
            color: "#0369a1",
          }}
        >
          AI機能を利用するには、ご自身のAPIキーが必要です。
          <br />
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
              onChange={(e) => setSettings({ ...settings, geminiApiKey: e.target.value })}
            />
            <button onClick={() => setShowGemini(!showGemini)} style={styles.iconButton}>
              {showGemini ? "🙈" : "👁️"}
            </button>
          </div>

          <div style={styles.linkArea}>
            <span style={{ marginRight: 6 }}>ℹ️ キーをお持ちでない方は</span>
            <a
              href={AI_DEFAULTS.gemini.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={styles.link}
            >
              Google AI Studio で取得 (無料) ↗
            </a>
          </div>
          <div style={{ marginBottom: 16 }}>
            <button
              onClick={() => setShowGeminiHelp(!showGeminiHelp)}
              style={styles.accordionBtn}
            >
              {showGeminiHelp ? "▼" : "▶"} APIキーの取得手順を見る
            </button>
            {showGeminiHelp && (
              <div style={styles.helpText}>
                1. 上記リンクから Google AI Studio にアクセス
                <br />
                2. 「Get API key」ボタンを押す
                <br />
                3. 「Create API key」を選択してキーを生成
                <br />
                4. コピーして、この画面の入力欄に貼り付ける
              </div>
            )}
          </div>

          <label style={styles.label}>Model (任意入力可)</label>
          <input
            list="gemini-models"
            placeholder={`例: ${AI_DEFAULTS.gemini.model}`}
            style={styles.input}
            value={settings.geminiModel}
            onChange={(e) => setSettings({ ...settings, geminiModel: e.target.value })}
          />
          <datalist id="gemini-models">
            {AI_DEFAULTS.gemini.candidates.map((m) => (
              <option key={m} value={m} />
            ))}
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
              onChange={(e) => setSettings({ ...settings, groqApiKey: e.target.value })}
            />
            <button onClick={() => setShowGroq(!showGroq)} style={styles.iconButton}>
              {showGroq ? "🙈" : "👁️"}
            </button>
          </div>

          <div style={styles.linkArea}>
            <span style={{ marginRight: 6 }}>ℹ️ キーをお持ちでない方は</span>
            <a
              href={AI_DEFAULTS.groq.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={styles.link}
            >
              Groq Console で取得 (無料) ↗
            </a>
          </div>
          <div style={{ marginBottom: 16 }}>
            <button onClick={() => setShowGroqHelp(!showGroqHelp)} style={styles.accordionBtn}>
              {showGroqHelp ? "▼" : "▶"} APIキーの取得手順を見る
            </button>
            {showGroqHelp && (
              <div style={styles.helpText}>
                1. 上記リンクから Groq Console にアクセス
                <br />
                2. 「Create API Key」ボタンを押す
                <br />
                3. 任意の名前(例: app)を入力してSubmit
                <br />
                4. 表示されたキー(gsk_...)をコピーして貼り付ける
              </div>
            )}
          </div>

          <label style={styles.label}>Model (任意入力可)</label>
          <input
            list="groq-models"
            placeholder={`例: ${AI_DEFAULTS.groq.model}`}
            style={styles.input}
            value={settings.groqModel}
            onChange={(e) => setSettings({ ...settings, groqModel: e.target.value })}
          />
          <datalist id="groq-models">
            {AI_DEFAULTS.groq.candidates.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginTop: 12,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={settings.useFallback}
              onChange={(e) => setSettings({ ...settings, useFallback: e.target.checked })}
            />
            Geminiエラー時にGroqを使用する
          </label>
        </section>

        <button onClick={handleSave} style={styles.saveBtn}>
          設定を保存
        </button>
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: { background: "white", padding: 16, borderRadius: 12, border: "1px solid #ddd" },
  cardTitle: { margin: "0 0 12px 0", fontSize: 16, borderBottom: "1px solid #eee", paddingBottom: 8 },
  label: { display: "block", fontSize: 12, color: "#666", marginBottom: 4, fontWeight: "bold" },
  inputGroup: { display: "flex", gap: 8, marginBottom: 8 },
  inputWithIcon: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    border: "1px solid #ddd",
    fontSize: 14,
    boxSizing: "border-box",
  },
  iconButton: {
    padding: "0 12px",
    background: "#f3f4f6",
    border: "1px solid #ddd",
    borderRadius: 8,
    cursor: "pointer",
    fontSize: 18,
  },
  input: {
    width: "100%",
    padding: 12,
    borderRadius: 8,
    border: "1px solid #ddd",
    marginBottom: 12,
    fontSize: 14,
    boxSizing: "border-box",
  },
  saveBtn: {
    padding: 16,
    background: "#111827",
    color: "white",
    borderRadius: 12,
    border: "none",
    fontWeight: "bold",
    fontSize: 16,
    cursor: "pointer",
  },
  linkArea: {
    fontSize: 13,
    color: "#666",
    marginBottom: 8,
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
  },
  link: { color: "#0056b3", fontWeight: "bold", textDecoration: "none" },
  accordionBtn: {
    background: "none",
    border: "none",
    color: "#666",
    fontSize: 12,
    cursor: "pointer",
    padding: 0,
    display: "flex",
    alignItems: "center",
    gap: 4,
  },
  helpText: {
    marginTop: 8,
    padding: 10,
    background: "#f9fafb",
    borderRadius: 8,
    fontSize: 12,
    color: "#444",
    lineHeight: "1.6",
  },
};
