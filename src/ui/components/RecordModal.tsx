import { useEffect, useState } from "react";
import { LocalDb } from "../../data/local/localDb";
import type { User, Medication } from "../../utils/types";

// 選択可能な症状リスト（カスタマイズ可能）
const DEFAULT_SYMPTOMS = ["咳", "鼻水", "頭痛", "喉の痛み", "食欲なし", "機嫌悪い", "嘔吐", "下痢", "発疹"];

type Props = {
  user: User;
  onClose: () => void;
  onSaved: () => void;
};

export function RecordModal({ user, onClose, onSaved }: Props) {
  const [temp, setTemp] = useState<string>("36.5");
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 16)); // YYYY-MM-DDTHH:mm
  const [memo, setMemo] = useState<string>("");
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [meds, setMeds] = useState<Medication[]>([]);
  const [selMeds, setSelMeds] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    // 薬マスタの読み込み
    LocalDb.getMedications(user.group_id).then(setMeds);
  }, [user.group_id]);

  const toggleSymptom = (s: string) => {
    setSymptoms(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  };

  const toggleMed = (id: string) => {
    setSelMeds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const save = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const ts = new Date(date).toISOString();
      const tempVal = parseFloat(temp);

      // 1. メモの構築（症状タグ + 自由入力）
      let finalMemo = memo.trim();
      if (symptoms.length > 0) {
        const tags = symptoms.join(", ");
        finalMemo = finalMemo ? `${tags}\n${finalMemo}` : tags;
      }

      // 2. 体温記録の保存 (records)
      const recUuid = crypto.randomUUID();
      await LocalDb.upsertRecord({
        uuid: recUuid,
        group_id: user.group_id,
        user_uuid: user.uuid,
        temp: isNaN(tempVal) ? 0 : tempVal,
        memo: finalMemo,
        measured_at: ts,
        is_deleted: 0,
        updated_at: new Date().toISOString(),
      });

      // 3. 投薬記録の保存 (events)
      for (const medId of selMeds) {
        await LocalDb.upsertEvent({
          uuid: crypto.randomUUID(),
          group_id: user.group_id,
          user_uuid: user.uuid,
          event_type: "medication",
          occurred_at: ts,
          payload: medId, // 薬のUUID
          is_deleted: 0,
          updated_at: new Date().toISOString(),
        });
      }

      onSaved();
    } catch (e) {
      alert("保存に失敗しました");
      console.error(e);
      setIsSaving(false);
    }
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <span style={{fontWeight: "bold"}}>{user.name} の記録</span>
          <button onClick={onClose} style={styles.closeBtn}>×</button>
        </div>

        <div style={styles.body}>
          {/* 日時 */}
          <label style={styles.label}>日時</label>
          <input 
            type="datetime-local" 
            value={date} 
            onChange={e => setDate(e.target.value)}
            style={styles.input}
          />

          {/* 体温 */}
          <label style={styles.label}>体温 (℃)</label>
          <div style={{display: "flex", gap: 10}}>
            <input 
              type="number" 
              inputMode="decimal" 
              step="0.1" 
              value={temp} 
              onChange={e => setTemp(e.target.value)}
              style={{...styles.input, fontSize: 24, fontWeight: "bold", textAlign: "center"}}
            />
          </div>

          {/* 症状 */}
          <label style={styles.label}>症状</label>
          <div style={styles.chipsWrap}>
            {DEFAULT_SYMPTOMS.map(s => (
              <button 
                key={s} 
                onClick={() => toggleSymptom(s)}
                style={symptoms.includes(s) ? styles.chipActive : styles.chip}
              >
                {s}
              </button>
            ))}
          </div>

          {/* 薬 */}
          {meds.length > 0 && (
            <>
              <label style={styles.label}>薬</label>
              <div style={styles.chipsWrap}>
                {meds.map(m => (
                  <button 
                    key={m.uuid} 
                    onClick={() => toggleMed(m.uuid)}
                    style={selMeds.includes(m.uuid) ? styles.chipMedActive : styles.chip}
                  >
                    💊 {m.name}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* メモ */}
          <label style={styles.label}>メモ</label>
          <textarea 
            value={memo} 
            onChange={e => setMemo(e.target.value)}
            style={{...styles.input, height: 60}}
            placeholder="その他、気付いたことなど"
          />
        </div>

        <div style={styles.footer}>
          <button onClick={save} disabled={isSaving} style={styles.saveBtn}>
            {isSaving ? "保存中..." : "保存する"}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", 
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000
  },
  modal: {
    background: "white", width: "90%", maxWidth: 400, maxHeight: "90dvh", borderRadius: 16, 
    display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 10px 25px rgba(0,0,0,0.2)"
  },
  header: {
    padding: 16, borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between", alignItems: "center",
    background: "#f9f9f9"
  },
  closeBtn: { border: "none", background: "transparent", fontSize: 24, cursor: "pointer", color: "#666" },
  body: { padding: 16, overflowY: "auto", flex: 1 },
  label: { display: "block", fontSize: 13, fontWeight: "bold", color: "#666", marginTop: 16, marginBottom: 8 },
  input: { 
    width: "100%", padding: 12, borderRadius: 8, border: "1px solid #ddd", fontSize: 16, 
    boxSizing: "border-box", fontFamily: "inherit" 
  },
  chipsWrap: { display: "flex", flexWrap: "wrap", gap: 8 },
  chip: {
    border: "1px solid #ddd", background: "white", padding: "6px 12px", borderRadius: 20, 
    fontSize: 14, cursor: "pointer", color: "#333"
  },
  chipActive: {
    border: "1px solid #FF6B35", background: "#FFF0E8", padding: "6px 12px", borderRadius: 20, 
    fontSize: 14, cursor: "pointer", color: "#FF6B35", fontWeight: "bold"
  },
  chipMedActive: {
    border: "1px solid #66A9D9", background: "#E8F4FF", padding: "6px 12px", borderRadius: 20, 
    fontSize: 14, cursor: "pointer", color: "#005a9e", fontWeight: "bold"
  },
  footer: { padding: 16, borderTop: "1px solid #eee" },
  saveBtn: {
    width: "100%", padding: 14, borderRadius: 12, border: "none", 
    background: "#66A9D9", color: "white", fontSize: 16, fontWeight: "bold", cursor: "pointer"
  }
};