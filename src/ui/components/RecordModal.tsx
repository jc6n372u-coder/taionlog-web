import { useEffect, useState } from "react";
import { LocalDb } from "../../data/local/localDb";
import type { User, Medication, RecordRow } from "../../utils/types";

// 症状リスト
const DEFAULT_SYMPTOMS = ["咳", "鼻水", "頭痛", "喉の痛み", "食欲なし", "機嫌悪い", "嘔吐", "下痢", "発疹"];

type Props = {
  user: User;
  initialRecord?: RecordRow; // 編集時はこれが入る
  onClose: () => void;
  onSaved: () => void;
};

export function RecordModal({ user, initialRecord, onClose, onSaved }: Props) {
  const [temp, setTemp] = useState<string>("36.5");
  const [date, setDate] = useState<string>("");
  const [memo, setMemo] = useState<string>("");
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [meds, setMeds] = useState<Medication[]>([]);
  const [selMeds, setSelMeds] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    // 初期値セット
    const now = new Date();
    // タイムゾーン考慮して datetime-local 用の文字列(YYYY-MM-DDTHH:mm)を作る
    const toLocalISO = (d: Date) => {
        const offset = d.getTimezoneOffset() * 60000;
        return new Date(d.getTime() - offset).toISOString().slice(0, 16);
    };

    if (initialRecord) {
        setTemp(initialRecord.temp.toString());
        setDate(toLocalISO(new Date(initialRecord.measured_at)));
        // メモからタグを復元するのは簡易的に行う（実際は別管理が良いが今回はメモ解析）
        setMemo(initialRecord.memo ?? "");
    } else {
        setTemp("36.5");
        setDate(toLocalISO(now));
    }

    // 薬マスタ取得
    LocalDb.getMedications(user.group_id).then(setMeds);
  }, [user, initialRecord]);

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
      
      // メモ構築（タグ + 自由入力）
      let finalMemo = memo.trim();
      if (symptoms.length > 0) {
        const tags = symptoms.join(", ");
        // 既にタグが含まれていなければ追加（簡易重複防止）
        if (!finalMemo.includes(tags)) {
            finalMemo = finalMemo ? `${tags}\n${finalMemo}` : tags;
        }
      }

      const uuid = initialRecord?.uuid ?? crypto.randomUUID();

      await LocalDb.upsertRecord({
        uuid,
        group_id: user.group_id,
        user_uuid: user.uuid,
        temp: isNaN(tempVal) ? 0 : tempVal,
        memo: finalMemo,
        measured_at: ts,
        is_deleted: 0,
        updated_at: new Date().toISOString(),
      });

      // 投薬記録（今回は簡易的に「記録時に選択されたら追加」のみ実装）
      // ※厳密な編集（過去の投薬の削除）は複雑になるため、今回は「追加」のみとする
      for (const medId of selMeds) {
        await LocalDb.upsertEvent({
          uuid: crypto.randomUUID(),
          group_id: user.group_id,
          user_uuid: user.uuid,
          event_type: "medication",
          occurred_at: ts,
          payload: medId,
          is_deleted: 0,
          updated_at: new Date().toISOString(),
        });
      }

      onSaved();
    } catch (e) {
      alert("保存失敗");
      setIsSaving(false);
    }
  };

  const doDelete = async () => {
    if (!initialRecord || !confirm("この記録を削除しますか？")) return;
    try {
        await LocalDb.upsertRecord({ ...initialRecord, is_deleted: 1, updated_at: new Date().toISOString() });
        onSaved();
    } catch {
        alert("削除失敗");
    }
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <span style={{fontWeight: "bold"}}>{user.name} の記録{initialRecord ? "(編集)" : ""}</span>
          <button onClick={onClose} style={styles.closeBtn}>×</button>
        </div>

        <div style={styles.body}>
          <label style={styles.label}>日時</label>
          <input type="datetime-local" value={date} onChange={e => setDate(e.target.value)} style={styles.input} />

          <label style={styles.label}>体温 (℃)</label>
          <div style={{display:"flex", alignItems:"center", justifyContent:"center"}}>
            <input 
              type="number" inputMode="decimal" step="0.1" 
              value={temp} onChange={e => setTemp(e.target.value)}
              style={{...styles.input, fontSize: 32, fontWeight: "bold", textAlign: "center", width: 140, border:"none", background:"#f4f5f7"}}
            />
          </div>

          <label style={styles.label}>症状</label>
          <div style={styles.chipsWrap}>
            {DEFAULT_SYMPTOMS.map(s => (
              <button key={s} onClick={() => toggleSymptom(s)} style={symptoms.includes(s) ? styles.chipActive : styles.chip}>
                {s}
              </button>
            ))}
          </div>

          {meds.length > 0 && (
            <>
              <label style={styles.label}>薬</label>
              <div style={styles.chipsWrap}>
                {meds.map(m => (
                  <button key={m.uuid} onClick={() => toggleMed(m.uuid)} style={selMeds.includes(m.uuid) ? styles.chipMedActive : styles.chip}>
                    💊 {m.name}
                  </button>
                ))}
              </div>
            </>
          )}

          <label style={styles.label}>メモ</label>
          <textarea value={memo} onChange={e => setMemo(e.target.value)} style={{...styles.input, height: 60}} placeholder="メモ" />
        </div>

        <div style={styles.footer}>
          {initialRecord && (
             <button onClick={doDelete} style={styles.deleteBtn}>削除</button>
          )}
          <button onClick={save} disabled={isSaving} style={styles.saveBtn}>
            {isSaving ? "保存中..." : "保存する"}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000 },
  modal: { background: "white", width: "90%", maxWidth: 400, maxHeight: "90dvh", borderRadius: 16, display: "flex", flexDirection: "column", boxShadow: "0 10px 25px rgba(0,0,0,0.2)" },
  header: { padding: 16, borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f9f9f9", borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  closeBtn: { border: "none", background: "transparent", fontSize: 24, cursor: "pointer", color: "#666" },
  body: { padding: 16, overflowY: "auto", flex: 1 },
  label: { display: "block", fontSize: 13, fontWeight: "bold", color: "#666", marginTop: 12, marginBottom: 8 },
  input: { width: "100%", padding: 12, borderRadius: 8, border: "1px solid #ddd", fontSize: 16, boxSizing: "border-box" },
  chipsWrap: { display: "flex", flexWrap: "wrap", gap: 8 },
  chip: { border: "1px solid #ddd", background: "white", padding: "6px 12px", borderRadius: 20, fontSize: 14, cursor: "pointer", color: "#333" },
  chipActive: { border: "1px solid #FF6B35", background: "#FFF0E8", padding: "6px 12px", borderRadius: 20, fontSize: 14, cursor: "pointer", color: "#FF6B35", fontWeight: "bold" },
  chipMedActive: { border: "1px solid #66A9D9", background: "#E8F4FF", padding: "6px 12px", borderRadius: 20, fontSize: 14, cursor: "pointer", color: "#005a9e", fontWeight: "bold" },
  footer: { padding: 16, borderTop: "1px solid #eee", display: "flex", gap: 12 },
  saveBtn: { flex: 1, padding: 14, borderRadius: 12, border: "none", background: "#66A9D9", color: "white", fontSize: 16, fontWeight: "bold", cursor: "pointer" },
  deleteBtn: { padding: "14px 20px", borderRadius: 12, border: "none", background: "#fee2e2", color: "#dc2626", fontSize: 14, fontWeight: "bold", cursor: "pointer" },
};