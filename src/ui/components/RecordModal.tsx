import { useEffect, useMemo, useState } from "react";
import type { User, RecordRow, EventRow, Medication } from "../../utils/types";
import { LocalDb } from "../../data/local/localDb";
import { ensureNextReminder } from "../../features/members/reminderService";

type Props = { user: User; onClose: () => void; onSaved: () => void };
const memoTemplates = ["咳","鼻水","頭痛","元気","だるそう","食欲あり","食欲なし","嘔吐","下痢"];

export function RecordModal({ user, onClose, onSaved }: Props) {
  const [temp, setTemp] = useState(36.5);
  const [measuredAt, setMeasuredAt] = useState<string>(new Date().toISOString().slice(0,16)); 
  const [memo, setMemo] = useState("");
  const [meds, setMeds] = useState<Medication[]>([]);
  const [selectedMed, setSelectedMed] = useState<Record<string, boolean>>({});
  
  const groupPromise = useMemo(() => LocalDb.getCurrentGroup(), []);

  useEffect(() => { void (async () => {
    const g = await groupPromise;
    if (!g) return;
    setMeds(await LocalDb.listMedications(g.group_id));
  })(); }, [groupPromise]);

  function toggleTemplate(t: string) {
    setMemo(prev => prev.includes(t) ? prev.replaceAll(t,"").replace(/\s+/g," ").trim() : (prev ? `${prev} ${t}` : t));
  }

  async function save() {
    const g = await groupPromise;
    if (!g) return;
    const now = new Date().toISOString();
    const uuid = crypto.randomUUID();
    const rec: RecordRow = {
      uuid, group_id: g.group_id, user_uuid: user.uuid, temp, memo,
      measured_at: new Date(measuredAt).toISOString(), is_deleted: 0, updated_at: now,
    };
    await LocalDb.upsertRecord(rec);

    // 投薬イベント＆次回リマインド生成
    const selected = Object.entries(selectedMed).filter(([,v])=>v).map(([k])=>k);
    const medMap = new Map(meds.map(m => [m.uuid, m]));

    for (const medId of selected) {
      const ev: EventRow = {
        uuid: crypto.randomUUID(), group_id: g.group_id, user_uuid: user.uuid,
        event_type: "medication", occurred_at: rec.measured_at, payload: medId,
        is_deleted: 0, updated_at: now,
      };
      await LocalDb.upsertEvent(ev);
      
      const m = medMap.get(medId);
      if (m) {
        await ensureNextReminder(user.uuid, medId, rec.measured_at, m.default_interval_hours);
      }
    }

    alert("保存しました");
    onClose();
    onSaved();
    if (temp >= 38.5) {
      setTimeout(() => alert("高熱です。水分補給・受診目安の確認などを行ってください。"), 300);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "grid", placeItems: "center", padding: 12, zIndex: 999 }}>
      <div style={{ width: "min(640px, 100%)", background: "white", borderRadius: 14, padding: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 800 }}>{user.name}さんの記録</div>
          <button onClick={onClose}>閉じる</button>
        </div>
        <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
          <label>
            体温（℃）
            <input type="number" step="0.1" value={temp} onChange={(e)=>setTemp(Number(e.target.value))} style={{ width: "100%", padding: 8 }} />
          </label>
          <label>
            日時
            <input type="datetime-local" value={measuredAt} onChange={(e)=>setMeasuredAt(e.target.value)} style={{ width: "100%", padding: 8 }} />
          </label>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>メモ</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
              {memoTemplates.map(t => (
                <button key={t} onClick={()=>toggleTemplate(t)} style={{ padding: "6px 10px", borderRadius: 999, border: "1px solid #ddd" }}>{t}</button>
              ))}
            </div>
            <textarea value={memo} onChange={(e)=>setMemo(e.target.value)} rows={2} style={{ width: "100%" }} />
          </div>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>投薬</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {meds.length === 0 ?
                <div style={{ opacity: 0.7 }}>薬が登録されていません（メンバー画面で追加）</div> :
                meds.map(m => (
                  <label key={m.uuid} style={{ display: "flex", gap: 6, alignItems: "center", border: "1px solid #ddd", borderRadius: 999, padding: "6px 10px" }}>
                    <input type="checkbox" checked={!!selectedMed[m.uuid]} onChange={(e)=>setSelectedMed(s=>({ ...s, [m.uuid]: e.target.checked }))} />
                    {m.name}
                  </label>
                ))
              }
            </div>
          </div>
          <button onClick={save} style={{ padding: 12, borderRadius: 12, fontWeight: 800, background: "#eee" }}>記録する</button>
        </div>
      </div>
    </div>
  );
}