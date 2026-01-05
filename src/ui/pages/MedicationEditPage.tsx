import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { LocalDb } from "../../data/local/localDb";
import { ApiClient } from "../../data/remote/apiClient";
import type { User, Medication } from "../../utils/types";

export default function MedicationEditPage() {
  const nav = useNavigate();
  const { id } = useParams(); // URLからID取得 (新規なら undefined)
  
  const [users, setUsers] = useState<User[]>([]);
  const [allMeds, setAllMeds] = useState<Medication[]>([]);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isOpenDetails, setIsOpenDetails] = useState(false); // アコーディオン開閉

  // フォーム状態
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

      // 編集モードの場合、データをロード
      if (id) {
        const target = meds.find(m => m.uuid === id);
        if (target) {
          setFormData(JSON.parse(JSON.stringify(target))); // Deep Copy
          setIsOpenDetails(true); // 編集時は詳細を開いておく
        }
      }
    });
  }, [id]);

  // AIに問い合わせる処理
  const handleAskAi = async () => {
    if (!formData.name) return alert("先にお薬の名前を入力してください");
    
    // 他のお薬リストを作成（自分自身は除外）
    const currentMeds = allMeds
      .filter(m => m.uuid !== id && m.target_user_id === formData.target_user_id) // 同じ人の薬に絞る
      .map(m => m.name);

    setIsAiLoading(true);
    try {
      const result = await ApiClient.fetchMedicationGuidance({
        targetMedName: formData.name,
        currentMedNames: currentMeds
      });

      if (result) {
        setFormData(prev => ({
          ...prev,
          ai_description: result.description,
          ai_side_effects: result.side_effects,
          ai_tags: result.tags,
          ai_interaction: result.interaction
        }));
        alert("AIによる解析が完了しました！");
      } else {
        alert("AI情報の取得に失敗しました。API設定を確認してください。");
      }
    } catch (e) {
      alert("エラーが発生しました");
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
      uuid: id || crypto.randomUUID(), // 新規ならUUID生成
      group_id: g.group_id,
      name: formData.name!,
      target_user_id: formData.target_user_id,
      
      // AIデータ
      ai_tags: formData.ai_tags,
      ai_description: formData.ai_description,
      ai_side_effects: formData.ai_side_effects,
      ai_interaction: formData.ai_interaction,

      // スケジュール & メモ
      schedule: formData.schedule,
      memo_taste: formData.memo_taste,
      taste_rating: formData.taste_rating,

      display_order: 0, 
      is_deleted: 0,
      updated_at: now,
      created_at: id ? undefined : now // 更新時はcreated_atを触らない
    };

    // 既存の created_at を維持するためのマージ
    if (id) {
      const original = allMeds.find(m => m.uuid === id);
      if (original) newMed.created_at = original.created_at;
    }

    await LocalDb.upsertMedication(newMed);
    nav(-1); // 戻る
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
        
        {/* 1. 基本情報 */}
        <div style={styles.card}>
          <label style={styles.label}>お薬の名前 (必須)</label>
          <input 
            value={formData.name}
            onChange={e => setFormData({...formData, name: e.target.value})}
            placeholder="例: カロナール細粒"
            style={styles.input}
          />
        </div>

        {/* 2. 詳細情報（アコーディオン） */}
        <button 
          onClick={() => setIsOpenDetails(!isOpenDetails)}
          style={{ ...styles.card, textAlign: "center", fontWeight: "bold", color: "#666", display: "flex", justifyContent: "center", alignItems: "center", gap: 8 }}
        >
          {isOpenDetails ? "▲ 詳細を閉じる" : "▼ 詳細設定 (所有者・AI解説・メモ)"}
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

            {/* AIサポートエリア */}
            <div style={{ ...styles.card, border: "2px solid #e0f2fe" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontWeight: "bold", color: "#0369a1" }}>🤖 AIサポート</span>
                <button 
                  onClick={handleAskAi} 
                  disabled={isAiLoading}
                  style={{ background: "#0369a1", color: "white", border: "none", padding: "6px 12px", borderRadius: 8, fontSize: 12, cursor: "pointer" }}
                >
                  {isAiLoading ? "解析中..." : "解説・タグを取得"}
                </button>
              </div>

              {/* 飲み合わせ警告 */}
              {formData.ai_interaction && formData.ai_interaction.status !== 'none' && (
                <div style={{ 
                  background: formData.ai_interaction.status === 'danger' ? '#fecaca' : formData.ai_interaction.status === 'warning' ? '#fef08a' : '#d1fae5',
                  color: formData.ai_interaction.status === 'danger' ? '#7f1d1d' : formData.ai_interaction.status === 'warning' ? '#713f12' : '#064e3b',
                  padding: 12, borderRadius: 8, marginBottom: 12, fontSize: 13
                }}>
                  <strong>飲み合わせ判定:</strong> {formData.ai_interaction.message}
                </div>
              )}

              <label style={styles.label}>解説 (AI)</label>
              <textarea 
                value={formData.ai_description || ""}
                onChange={e => setFormData({...formData, ai_description: e.target.value})}
                style={{ ...styles.textarea, minHeight: 60 }}
                placeholder="AIボタンを押すと自動入力されます"
              />

              <label style={styles.label}>用途タグ</label>
              <input 
                value={formData.ai_tags?.join(", ") || ""}
                onChange={e => setFormData({...formData, ai_tags: e.target.value.split(",").map(t=>t.trim())})}
                style={styles.input}
                placeholder="カンマ区切り (例: 発熱, 咳)"
              />
            </div>

            {/* スケジュール */}
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

            {/* メモ */}
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
  textarea: { width: "100%", padding: 12, borderRadius: 8, border: "1px solid #ddd", fontSize: 14, minHeight: 80, boxSizing: "border-box", fontFamily: "inherit" }
};