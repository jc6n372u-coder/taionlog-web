import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { LocalDb } from "../../data/local/localDb";
import { ApiClient } from "../../data/remote/apiClient";
import type { User, Medication } from "../../utils/types";

// 飲み合わせデータなどの独自形式 {key=value, ...} をパースするヘルパー
function parseCustomFormat(input: any): any {
  if (!input) return null;
  if (typeof input === "object") return input; 

  if (typeof input === "string") {
    const trimmed = input.trim();
    try { return JSON.parse(trimmed); } catch {}

    // 独自形式 {message=..., status=...} の救済
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
  
  // ★追加: 解説欄の拡大状態
  const [isDescExpanded, setIsDescExpanded] = useState(false);

  const [formData, setFormData] = useState<Partial<Medication>>({
    name: "",
    schedule: { wakeup:0, morning:0, lunch:0, evening:0, bedtime:0 },
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

          // 1. タグのパース
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

          // 2. 飲み合わせデータのパース
          loadedData.ai_interaction = parseCustomFormat(loadedData.ai_interaction);

          // 3. スケジュールのパース
          if (loadedData.schedule && typeof loadedData.schedule === "string") {
              try {
                  loadedData.schedule = JSON.parse(loadedData.schedule);
              } catch (e) {
                  console.error("Schedule parse error", e);
                  loadedData.schedule = { wakeup:0, morning:0, lunch:0, evening:0, bedtime:0 };
              }
          }

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
        setIsDescExpanded(true); // 更新時に自動で広げる
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
    
    const newMed: Medication = {
      uuid: id || crypto.randomUUID(),
      group_id: g.group_id,
      name: formData.name!,
      target_user_id: formData.target_user_id,
      
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

  return (
    <div style={{ minHeight: "100dvh", background: "#f4f5f7", paddingBottom: 100 }}>
      <header style={{ height: 56, background: "#66A9D9", color: "white", display: "flex", alignItems: "center", padding: "0 16px" }}>
        <button onClick={() => nav(-1)} style={{ background: "none", border: "none", color: "white", fontSize: 20 }}>←</button>
        <span style={{ marginLeft: 16, fontWeight: "bold" }}>{id ? "お薬の編集" : "お薬の登録"}</span>
        {id && <button onClick={handleDelete} style={{ marginLeft: "auto", background: "none", border: "none", color: "white" }}>🗑️</button>}
      </header>

      <main style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
        
        <div style={styles.card}>
          <label style={styles.label}>お薬の名前 (必須)</label>
          <input 
            value={formData.name}
            onChange={e => setFormData({...formData, name: e.target.value})}
            placeholder="例: カロナール細粒"
            style={styles.input}
          />
        </div>

        <button 
          onClick={() => setIsOpenDetails(!isOpenDetails)}
          style={{ ...styles.card, textAlign: "center", fontWeight: "bold", color: "#666", display: "flex", justifyContent: "center", alignItems: "center", gap: 8 }}
        >
          {isOpenDetails ? "▲ 詳細を閉じる" : "▼ 詳細設定 (所有者・AI解説・メモ)"}
        </button>

        {isOpenDetails && (
          <>
            <div style={styles.card}>
              <label style={styles.label}>誰のお薬？</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {users.map(u => (
                  <button
                    key={u.uuid}
                    onClick={() => setFormData({...formData, target_user_id: u.uuid})}
                    style={{
                      padding: "8px 16px",
                      borderRadius: 20,
                      border: "1px solid #66A9D9",
                      background: formData.target_user_id === u.uuid ? "#66A9D9" : "white",
                      color: formData.target_user_id === u.uuid ? "white" : "#66A9D9",
                      cursor: "pointer"
                    }}
                  >
                    {u.name}
                  </button>
                ))}
              </div>
            </div>

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

              {/* 飲み合わせ警告 */}
              {formData.ai_interaction && formData.ai_interaction.status && formData.ai_interaction.status !== 'none' && (
                <div style={{ 
                  background: formData.ai_interaction.status === 'danger' ? '#fecaca' : formData.ai_interaction.status === 'warning' ? '#fef08a' : '#d1fae5',
                  color: formData.ai_interaction.status === 'danger' ? '#7f1d1d' : formData.ai_interaction.status === 'warning' ? '#713f12' : '#064e3b',
                  padding: 12, borderRadius: 8, marginBottom: 12, fontSize: 13, lineHeight: "1.5"
                }}>
                  <strong>飲み合わせ判定:</strong><br/>
                  {formData.ai_interaction.message}
                </div>
              )}

              <label style={styles.label}>解説 (AI) - タップで拡大</label>
              <textarea 
                value={formData.ai_description || ""}
                onChange={e => setFormData({...formData, ai_description: e.target.value})}
                onClick={() => setIsDescExpanded(!isDescExpanded)} // ★ここが拡大トリガー
                style={{ 
                    ...styles.textarea, 
                    minHeight: isDescExpanded ? 200 : 60, // ★高さ切替
                    transition: "min-height 0.3s ease",
                    cursor: "pointer"
                }}
                placeholder="AIボタンを押すと自動入力されます"
              />

              <label style={styles.label}>用途タグ</label>
              <input 
                value={Array.isArray(formData.ai_tags) ? formData.ai_tags.join(", ") : ""}
                onChange={e => setFormData({...formData, ai_tags: e.target.value.split(",").map(t=>t.trim())})}
                style={styles.input}
                placeholder="カンマ区切り (例: 発熱, 咳)"
              />
            </div>

            <div style={styles.card}>
              <label style={styles.label}>飲むタイミング (回数)</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: 4, textAlign: "center" }}>
                {["起床", "朝", "昼", "夕", "就寝"].map((label, i) => {
                  const keys = ["wakeup", "morning", "lunch", "evening", "bedtime"] as const;
                  const key = keys[i];
                  return (
                    <div key={key}>
                      <div style={{ fontSize: 10, marginBottom: 4 }}>{label}</div>
                      <input 
                        type="number" step="0.5"
                        value={formData.schedule?.[key] || ""}
                        onChange={e => setFormData({
                          ...formData, 
                          schedule: { ...formData.schedule, [key]: parseFloat(e.target.value) || 0 }
                        })}
                        style={{ width: "100%", padding: 4, textAlign: "center", border: "1px solid #ddd", borderRadius: 4 }}
                      />
                    </div>
                  )
                })}
              </div>
            </div>

            <div style={styles.card}>
              <label style={styles.label}>親メモ (味・飲ませ方)</label>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                 {["good:😀", "normal:🙂", "bad:😖"].map(opt => {
                   const [val, icon] = opt.split(":");
                   return (
                     <button key={val} 
                       onClick={() => setFormData({...formData, taste_rating: val as any})}
                       style={{ 
                         flex: 1, padding: 8, borderRadius: 8, border: "1px solid #ddd",
                         background: formData.taste_rating === val ? "#e0f2fe" : "white"
                       }}
                     >
                       {icon}
                     </button>
                   )
                 })}
              </div>
              <textarea 
                value={formData.memo_taste || ""}
                onChange={e => setFormData({...formData, memo_taste: e.target.value})}
                style={styles.textarea}
                placeholder="例: チョコアイスなら食べた"
              />
            </div>
          </>
        )}
      </main>

      <div style={{ position: "fixed", bottom: 0, left: 0, width: "100%", padding: 16, background: "white", borderTop: "1px solid #eee" }}>
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