import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { LocalDb } from "../../data/local/localDb";
import { ApiClient } from "../../data/remote/apiClient";
import type { User, Medication } from "../../utils/types";

// 飲み合わせデータなどの独自形式パース
function parseCustomFormat(input: any): any {
  if (!input) return null;
  if (typeof input === "object") return input;
  if (typeof input === "string") {
    const trimmed = input.trim();
    try { return JSON.parse(trimmed); } catch { }
    
    // 特殊フォーマット {status=..., message=...} の解析
    if (trimmed.startsWith("{") && trimmed.includes("message=")) {
      let status = "none";
      let message = trimmed;
      if (trimmed.includes("status=danger")) status = "danger";
      else if (trimmed.includes("status=warning")) status = "warning";
      else if (trimmed.includes("status=safe")) status = "safe";

      const msgStart = trimmed.indexOf("message=");
      if (msgStart !== -1) {
        let cleanMsg = trimmed.slice(msgStart + 8);
        if (cleanMsg.endsWith("}")) cleanMsg = cleanMsg.slice(0, -1);
        const statusIdx = cleanMsg.lastIndexOf(", status=");
        if (statusIdx !== -1) cleanMsg = cleanMsg.substring(0, statusIdx);
        message = cleanMsg.trim();
      }
      return { status, message };
    }
  }
  return null;
}

export default function MedicationEditPage() {
  const nav = useNavigate();
  const { id } = useParams();

  const [users, setUsers] = useState<User[]>([]);
  const [allMeds, setAllMeds] = useState<Medication[]>([]);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isOpenDetails, setIsOpenDetails] = useState(false);

  // 各エリアの拡大状態
  const [isDescExpanded, setIsDescExpanded] = useState(false);
  const [isDoctorExpanded, setIsDoctorExpanded] = useState(false);
  const [isMemoExpanded, setIsMemoExpanded] = useState(false);

  // フォームデータ
  const [formData, setFormData] = useState<Partial<Medication>>({
    name: "",
    yomi: "",
    show_in_input: 1, // デフォルトON
    schedule: {
      type: 'fixed', // デフォルトは固定
      wakeup: 0, morning: 0, lunch: 0, evening: 0, bedtime: 0,
      interval_hours: 8, max_times: 3, reminder_minutes: 0
    },
    ai_tags: [],
    taste_rating: "normal"
  });

  useEffect(() => {
    LocalDb.getCurrentGroup().then(async (g) => {
      if (!g) return;
      const us = await LocalDb.listUsers(g.group_id);
      setUsers(us);
      const meds = await LocalDb.getMedications(g.group_id);
      setAllMeds(meds);

      if (id) {
        const target = meds.find(m => m.uuid === id);
        if (target) {
          const loadedData = JSON.parse(JSON.stringify(target));

          // 各種データパース
          try {
            const rawTags = loadedData.ai_tags as any;
            if (typeof rawTags === "string") {
              const trimmed = rawTags.trim();
              if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
                loadedData.ai_tags = JSON.parse(trimmed);
              } else {
                loadedData.ai_tags = trimmed ? [trimmed] : [];
              }
            } else if (!Array.isArray(rawTags)) {
              loadedData.ai_tags = [];
            }
          } catch { loadedData.ai_tags = []; }

          // AI判定データのパース (単数形 ai_interaction)
          loadedData.ai_interaction = parseCustomFormat(loadedData.ai_interaction);

          // スケジュールパースと初期値補完
          if (loadedData.schedule && typeof loadedData.schedule === "string") {
            try { loadedData.schedule = JSON.parse(loadedData.schedule); }
            catch { loadedData.schedule = {}; }
          }
          if (!loadedData.schedule) loadedData.schedule = {};
          if (!loadedData.schedule.type) loadedData.schedule.type = 'fixed';

          // 未定義項目の初期化
          if (loadedData.show_in_input === undefined) loadedData.show_in_input = 1;

          setFormData(loadedData);
          setIsOpenDetails(true);
        }
      }
    });
  }, [id]);

  const handleAskAi = async () => {
    if (!formData.name) return alert("先にお薬の名前を入力してください");
    const currentMeds = allMeds
      .filter(m => m.uuid !== id && m.target_user_id === formData.target_user_id)
      .map(m => m.name);

    setIsAiLoading(true);
    try {
      const result = await ApiClient.fetchMedicationGuidance({
        targetMedName: formData.name,
        currentMedNames: currentMeds
      });

      if (result) {
        const safeInteraction = parseCustomFormat(result.interaction);
        setFormData(prev => ({
          ...prev,
          ai_description: result.description,
          ai_side_effects: result.side_effects,
          ai_tags: result.tags,
          ai_interaction: safeInteraction
        }));
        alert("AI情報を更新しました！(解説欄をご確認ください)");
        setIsDescExpanded(true);
      } else {
        alert("AI情報の取得に失敗しました。API設定を確認してください。");
      }
    } catch (e) {
      console.error(e);
      alert("エラーが発生しました。通信環境やAPI設定を確認してください。");
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.name) return alert("お薬の名前は必須です");
    const g = await LocalDb.getCurrentGroup();
    if (!g) return;
    const now = new Date().toISOString();

    // DB保存用に整形
    const newMed: Medication = {
      uuid: id || crypto.randomUUID(),
      group_id: g.group_id,
      name: formData.name!,
      yomi: formData.yomi || formData.name!,
      target_user_id: formData.target_user_id,

      doctor_comment: formData.doctor_comment,
      show_in_input: formData.show_in_input,

      ai_tags: formData.ai_tags,
      ai_description: formData.ai_description,
      ai_side_effects: formData.ai_side_effects,
      ai_interaction: formData.ai_interaction,

      schedule: formData.schedule,
      memo_taste: formData.memo_taste,
      taste_rating: formData.taste_rating,

      display_order: 0,
      is_deleted: 0,
      updated_at: now,
      created_at: id ? undefined : now
    };

    if (id) {
      const original = allMeds.find(m => m.uuid === id);
      if (original) newMed.created_at = original.created_at;
    }

    await LocalDb.upsertMedication(newMed);
    nav(-1);
  };

  const handleDelete = async () => {
    if (id && confirm("このお薬を削除しますか？")) {
      await LocalDb.deleteMedication(id);
      nav(-1);
    }
  };

  // スケジュール設定用ヘルパー
  const updateSchedule = (key: string, val: any) => {
    setFormData(prev => ({
      ...prev,
      schedule: { ...prev.schedule, [key]: val }
    }));
  };

  return (
    <div style={{ minHeight: "100dvh", background: "#f4f5f7", paddingBottom: 100 }}>
      <header style={{ height: 56, background: "#66A9D9", color: "white", display: "flex", alignItems: "center", padding: "0 16px" }}>
        <button onClick={() => nav(-1)} style={{ background: "none", border: "none", color: "white", fontSize: 20 }}>←</button>
        <span style={{ marginLeft: 16, fontWeight: "bold" }}>{id ? "お薬の編集" : "お薬の登録"}</span>
        {id && <button onClick={handleDelete} style={{ marginLeft: "auto", background: "none", border: "none", color: "white" }}>🗑️</button>}
      </header>

      <main style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>

        {/* 基本情報 */}
        <div style={styles.card}>
          <label style={styles.label}>お薬の名前 (必須)</label>
          <input
            value={formData.name}
            onChange={e => setFormData({ ...formData, name: e.target.value })}
            placeholder="例: カロナール細粒"
            style={styles.input}
          />

          <div style={{ height: 16 }}></div>

          <label style={styles.label}>よみがな (並び替え用)</label>
          <input
            value={formData.yomi || ""}
            onChange={e => setFormData({ ...formData, yomi: e.target.value })}
            placeholder="例: かろなーる"
            style={styles.input}
          />
        </div>

        <button
          onClick={() => setIsOpenDetails(!isOpenDetails)}
          style={{ ...styles.card, textAlign: "center", fontWeight: "bold", color: "#666", display: "flex", justifyContent: "center", alignItems: "center", gap: 8 }}
        >
          {isOpenDetails ? "▲ 詳細設定を閉じる" : "▼ 詳細設定を開く"}
        </button>

        {isOpenDetails && (
          <>
            {/* 所有者 */}
            <div style={styles.card}>
              <label style={styles.label}>誰のお薬？</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {users.map(u => (
                  <button
                    key={u.uuid}
                    onClick={() => setFormData({ ...formData, target_user_id: u.uuid })}
                    style={{
                      padding: "8px 16px", borderRadius: 20, border: "1px solid #66A9D9",
                      background: formData.target_user_id === u.uuid ? "#66A9D9" : "white",
                      color: formData.target_user_id === u.uuid ? "white" : "#66A9D9",
                    }}
                  >
                    {u.name}
                  </button>
                ))}
              </div>
            </div>

            {/* 飲み方・タイミング */}
            <div style={styles.card}>
              <label style={styles.label}>飲み方・タイミング</label>

              <div style={{ display: "flex", background: "#eee", borderRadius: 8, padding: 4, marginBottom: 16 }}>
                <button
                  onClick={() => updateSchedule('type', 'fixed')}
                  style={{
                    flex: 1, padding: 8, borderRadius: 6, border: "none", fontWeight: "bold",
                    background: formData.schedule?.type === 'fixed' ? "white" : "transparent",
                    color: formData.schedule?.type === 'fixed' ? "#66A9D9" : "#999",
                    boxShadow: formData.schedule?.type === 'fixed' ? "0 1px 2px rgba(0,0,0,0.1)" : "none"
                  }}
                >
                  決まった時間
                </button>
                <button
                  onClick={() => updateSchedule('type', 'interval')}
                  style={{
                    flex: 1, padding: 8, borderRadius: 6, border: "none", fontWeight: "bold",
                    background: formData.schedule?.type === 'interval' ? "white" : "transparent",
                    color: formData.schedule?.type === 'interval' ? "#66A9D9" : "#999",
                    boxShadow: formData.schedule?.type === 'interval' ? "0 1px 2px rgba(0,0,0,0.1)" : "none"
                  }}
                >
                  時間間隔
                </button>
              </div>

              {formData.schedule?.type === 'fixed' ? (
                /* 固定時間モード */
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 4, textAlign: "center" }}>
                  {["起床", "朝", "昼", "夕", "就寝"].map((label, i) => {
                    const keys = ["wakeup", "morning", "lunch", "evening", "bedtime"] as const;
                    const key = keys[i];
                    return (
                      <div key={key}>
                        <div style={{ fontSize: 10, marginBottom: 4 }}>{label}</div>
                        <input
                          type="number" step="0.5"
                          value={formData.schedule?.[key] || ""}
                          onChange={e => updateSchedule(key, parseFloat(e.target.value) || 0)}
                          style={{ width: "100%", padding: 4, textAlign: "center", border: "1px solid #ddd", borderRadius: 4 }}
                        />
                      </div>
                    )
                  })}
                </div>
              ) : (
                /* 時間間隔モード */
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 14 }}>間隔:</span>
                    <input
                      type="number"
                      value={formData.schedule?.interval_hours || ""}
                      onChange={e => updateSchedule('interval_hours', parseFloat(e.target.value))}
                      style={{ ...styles.input, width: 80, textAlign: "center" }}
                    />
                    <span style={{ fontSize: 14 }}>時間おき</span>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 14 }}>上限:</span>
                    <input
                      type="number"
                      value={formData.schedule?.max_times || ""}
                      onChange={e => updateSchedule('max_times', parseFloat(e.target.value))}
                      style={{ ...styles.input, width: 80, textAlign: "center" }}
                    />
                    <span style={{ fontSize: 14 }}>回まで / 日</span>
                  </div>

                  <div style={{ marginTop: 8, padding: 12, background: "#f0f9ff", borderRadius: 8 }}>
                    <label style={{ ...styles.label, marginBottom: 4 }}>🔔 リマインダー初期値</label>
                    <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>
                      記録時に自動で通知時間をセットします。<br />
                      0にすると自動セットされません。
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input
                        type="number"
                        // 分単位で保存されているが、入力は「時間」で行う
                        value={formData.schedule?.reminder_minutes ? formData.schedule.reminder_minutes / 60 : (formData.schedule?.interval_hours || 0)}
                        onChange={e => updateSchedule('reminder_minutes', (parseFloat(e.target.value) || 0) * 60)}
                        style={{ ...styles.input, width: 80, textAlign: "center" }}
                      />
                      <span style={{ fontSize: 14 }}>時間後</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* AIサポート */}
            <div style={{ ...styles.card, border: "2px solid #e0f2fe" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontWeight: "bold", color: "#0369a1" }}>🤖 AIサポート</span>
                <button
                  onClick={handleAskAi}
                  disabled={isAiLoading}
                  style={{ background: "#0369a1", color: "white", border: "none", padding: "6px 12px", borderRadius: 8, fontSize: 12, cursor: "pointer" }}
                >
                  {isAiLoading ? "解析中..." : "解説・タグを更新"}
                </button>
              </div>

              {/* API設定へのリンク */}
              <div style={{ textAlign: "right", marginBottom: 12 }}>
                <span
                  onClick={() => nav("/settings/ai")}
                  style={{ fontSize: 11, color: "#0369a1", textDecoration: "underline", cursor: "pointer" }}
                >
                  (i) APIキーの設定・取得はこちら
                </span>
              </div>

              {formData.ai_interaction && formData.ai_interaction.status && formData.ai_interaction.status !== 'none' && (
                <div style={{
                  background: formData.ai_interaction.status === 'danger' ? '#fecaca' : formData.ai_interaction.status === 'warning' ? '#fef08a' : '#d1fae5',
                  color: formData.ai_interaction.status === 'danger' ? '#7f1d1d' : formData.ai_interaction.status === 'warning' ? '#713f12' : '#064e3b',
                  padding: 12, borderRadius: 8, marginBottom: 12, fontSize: 13, lineHeight: "1.5"
                }}>
                  <strong>飲み合わせ判定:</strong><br />
                  {formData.ai_interaction.message}
                </div>
              )}

              <label style={styles.label}>解説 (AI) - タップで拡大</label>
              <textarea
                value={formData.ai_description || ""}
                onChange={e => setFormData({ ...formData, ai_description: e.target.value })}
                onClick={() => setIsDescExpanded(!isDescExpanded)}
                style={{
                  ...styles.textarea,
                  minHeight: isDescExpanded ? 200 : 60,
                  transition: "min-height 0.3s ease",
                  cursor: "pointer"
                }}
                placeholder="AIボタンを押すと自動入力されます"
              />

              <label style={styles.label}>用途タグ</label>
              <input
                value={Array.isArray(formData.ai_tags) ? formData.ai_tags.join(", ") : ""}
                onChange={e => setFormData({ ...formData, ai_tags: e.target.value.split(",").map(t => t.trim()) })}
                style={styles.input}
                placeholder="カンマ区切り (例: 発熱, 咳)"
              />
            </div>

            {/* 医師・薬剤師コメント */}
            <div style={styles.card}>
              <label style={styles.label}>医師・薬剤師コメント - タップで拡大</label>
              <textarea
                value={formData.doctor_comment || ""}
                onChange={e => setFormData({ ...formData, doctor_comment: e.target.value })}
                onClick={() => setIsDoctorExpanded(!isDoctorExpanded)}
                style={{
                  ...styles.textarea,
                  minHeight: isDoctorExpanded ? 200 : 60,
                  transition: "min-height 0.3s ease",
                  cursor: "pointer"
                }}
                placeholder="例: 食後に飲む、熱が下がっても飲みきること 等"
              />
            </div>

            {/* 親メモ */}
            <div style={styles.card}>
              <label style={styles.label}>親メモ (味・飲ませ方) - タップで拡大</label>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                {["good:◎", "normal:○", "bad:△"].map(opt => {
                  const [val, icon] = opt.split(":");
                  return (
                    <button key={val}
                      onClick={() => setFormData({ ...formData, taste_rating: val as any })}
                      style={{
                        flex: 1, padding: 8, borderRadius: 8, border: "1px solid #ddd",
                        background: formData.taste_rating === val ? "#e0f2fe" : "white",
                        fontSize: 18, fontWeight: "bold",
                        color: formData.taste_rating === val ? "#0369a1" : "#666"
                      }}
                    >
                      {icon}
                    </button>
                  )
                })}
              </div>
              <textarea
                value={formData.memo_taste || ""}
                onChange={e => setFormData({ ...formData, memo_taste: e.target.value })}
                onClick={() => setIsMemoExpanded(!isMemoExpanded)}
                style={{
                  ...styles.textarea,
                  minHeight: isMemoExpanded ? 200 : 60,
                  transition: "min-height 0.3s ease",
                  cursor: "pointer"
                }}
                placeholder="例: チョコアイスなら食べた"
              />
            </div>

            {/* 表示設定 */}
            <div style={styles.card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: "bold", fontSize: 14 }}>記録メニューに表示する</div>
                  <div style={{ fontSize: 11, color: "#999" }}>OFFにすると記録時の選択肢から隠せます</div>
                </div>
                <div
                  onClick={() => setFormData({ ...formData, show_in_input: formData.show_in_input === 1 ? 0 : 1 })}
                  style={{
                    width: 50, height: 30, borderRadius: 15, position: "relative", cursor: "pointer",
                    background: formData.show_in_input === 1 ? "#66A9D9" : "#ccc",
                    transition: "background 0.3s"
                  }}
                >
                  <div style={{
                    width: 26, height: 26, borderRadius: 13, background: "white", position: "absolute", top: 2,
                    left: formData.show_in_input === 1 ? 22 : 2,
                    transition: "left 0.3s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)"
                  }} />
                </div>
              </div>
            </div>

          </>
        )}
      </main>

      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        padding: 16, background: "white", borderTop: "1px solid #eee", boxSizing: "border-box"
      }}>
        <button onClick={handleSave} style={{ width: "100%", padding: 16, background: "#111827", color: "white", borderRadius: 12, border: "none", fontWeight: "bold", fontSize: 16 }}>
          保 存
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: { background: "white", padding: 16, borderRadius: 12, border: "1px solid #ddd" },
  label: { display: "block", fontSize: 12, color: "#666", marginBottom: 6, fontWeight: "bold" },
  input: { width: "100%", padding: 12, borderRadius: 8, border: "1px solid #ddd", fontSize: 16, boxSizing: "border-box" },
  textarea: { width: "100%", padding: 12, borderRadius: 8, border: "1px solid #ddd", fontSize: 14, minHeight: 60, boxSizing: "border-box", fontFamily: "inherit" }
};