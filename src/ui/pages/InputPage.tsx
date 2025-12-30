import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { LocalDb } from "../../data/local/localDb";
import type { User, Medication } from "../../utils/types";

export default function InputPage() {
  const nav = useNavigate();
  const { userUuid } = useParams();
  const [searchParams] = useSearchParams();
  const isMedicationOnly = searchParams.get("medication_only") === "true";

  const [user, setUser] = useState<User | null>(null);
  const [meds, setMeds] = useState<Medication[]>([]);
  
  // 入力値
  const [temp, setTemp] = useState("");
  const [selectedMeds, setSelectedMeds] = useState<string[]>([]);
  const [memo, setMemo] = useState("");
  const [measuredAt, setMeasuredAt] = useState(new Date().toISOString().slice(0, 16));

  useEffect(() => {
    if (!userUuid) return;
    loadData();
  }, [userUuid]);

  const loadData = async () => {
    // ユーザー情報
    const group = await LocalDb.getCurrentGroup();
    if (!group) return;
    const users = await LocalDb.listUsers(group.group_id);
    const u = users.find(x => x.uuid === userUuid);
    if (u) setUser(u);

    // お薬リスト（並び順対応）
    const m = await LocalDb.getMedications();
    // @ts-ignore
    setMeds(m.sort((a,b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)));
  };

  const toggleMed = (uuid: string) => {
    if (selectedMeds.includes(uuid)) {
      setSelectedMeds(selectedMeds.filter(id => id !== uuid));
    } else {
      setSelectedMeds([...selectedMeds, uuid]);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    const now = new Date().toISOString();

    // 1. 体温記録 (投薬のみモードの場合はスキップ)
    if (!isMedicationOnly && temp) {
        const tempVal = parseFloat(temp);
        if (!isNaN(tempVal)) {
            await LocalDb.upsertRecord({
                uuid: crypto.randomUUID(),
                group_id: user.group_id,
                user_uuid: user.uuid,
                temp: tempVal,
                measured_at: new Date(measuredAt).toISOString(),
                memo: memo,
                created_at: now,
                updated_at: now,
                is_deleted: 0
            });
        }
    } else if (!isMedicationOnly && memo) {
        // 体温なし、メモのみの場合も記録を作る
        await LocalDb.upsertRecord({
            uuid: crypto.randomUUID(),
            group_id: user.group_id,
            user_uuid: user.uuid,
            temp: 0, // 0は体温なし扱い
            measured_at: new Date(measuredAt).toISOString(),
            memo: memo,
            created_at: now,
            updated_at: now,
            is_deleted: 0
        });
    }

    // 2. 投薬イベント記録
    if (selectedMeds.length > 0) {
        const medNames = selectedMeds.map(id => meds.find(m => m.uuid === id)?.name).filter(Boolean).join(", ");
        await LocalDb.upsertEvent({
            uuid: crypto.randomUUID(),
            group_id: user.group_id,
            user_uuid: user.uuid,
            event_type: "medication",
            detail: medNames,
            occurred_at: new Date(measuredAt).toISOString(),
            created_at: now,
            updated_at: now,
            is_deleted: 0
        });

        // ★通知予約（簡易実装: ローカル通知APIがあればここで呼ぶ）
        // 今回はデータとしての記録のみ行います
    }

    nav(-1);
  };

  if (!user) return <div style={{padding: 20}}>読み込み中...</div>;

  return (
    <div style={{minHeight: "100dvh", background: "#f4f5f7", paddingBottom: 80}}>
      <header style={{height: 56, background: "white", display: "flex", alignItems: "center", padding: "0 16px", borderBottom: "1px solid #eee"}}>
        <button onClick={() => nav(-1)} style={{border:"none", background:"transparent", fontSize:20, marginRight: 16}}>✕</button>
        <span style={{fontWeight:"bold"}}>{user.name}の記録</span>
      </header>

      <div style={{padding: 20}}>
        {/* 日時 */}
        <label style={{display: "block", marginBottom: 20}}>
            <div style={{fontSize: 12, color: "#666", marginBottom: 4}}>日時</div>
            <input type="datetime-local" value={measuredAt} onChange={e => setMeasuredAt(e.target.value)} style={{fontSize: 16, padding: 8, width: "100%", boxSizing: "border-box", borderRadius: 8, border: "1px solid #ddd"}} />
        </label>

        {/* 体温入力 (投薬のみモードでは非表示) */}
        {!isMedicationOnly && (
            <div style={{background: "white", padding: 20, borderRadius: 12, marginBottom: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.05)"}}>
                <div style={{fontSize: 14, fontWeight: "bold", marginBottom: 10, color: "#66A9D9"}}>体温</div>
                <div style={{display: "flex", alignItems: "flex-end", gap: 8}}>
                    <input 
                        type="number" inputMode="decimal" step="0.1" 
                        value={temp} onChange={e => setTemp(e.target.value)}
                        placeholder="36.5"
                        style={{fontSize: 32, fontWeight: "bold", width: 120, padding: 8, border: "none", borderBottom: "2px solid #66A9D9", textAlign: "center"}} 
                    />
                    <span style={{fontSize: 20, paddingBottom: 10}}>℃</span>
                </div>
            </div>
        )}

        {/* お薬選択 */}
        <div style={{background: "white", padding: 20, borderRadius: 12, marginBottom: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.05)"}}>
            <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12}}>
                <div style={{fontSize: 14, fontWeight: "bold", color: "#FF6B35"}}>お薬</div>
                <button onClick={() => nav("/settings/medications")} style={{fontSize: 12, background: "none", border: "none", color: "#999"}}>設定</button>
            </div>
            
            {meds.length === 0 ? (
                <div style={{fontSize: 12, color: "#999"}}>お薬が登録されていません</div>
            ) : (
                <div style={{display: "flex", flexWrap: "wrap", gap: 8}}>
                    {meds.map(m => {
                        const isSelected = selectedMeds.includes(m.uuid);
                        return (
                            <button 
                                key={m.uuid} 
                                onClick={() => toggleMed(m.uuid)}
                                style={{
                                    padding: "8px 16px", borderRadius: 20, border: "1px solid", 
                                    borderColor: isSelected ? "#FF6B35" : "#ddd",
                                    background: isSelected ? "#FFF3E0" : "white",
                                    color: isSelected ? "#E65100" : "#333",
                                    fontWeight: isSelected ? "bold" : "normal"
                                }}
                            >
                                {m.name}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>

        {/* メモ (投薬のみモードでは非表示) */}
        {!isMedicationOnly && (
            <label style={{display: "block"}}>
                <div style={{fontSize: 12, color: "#666", marginBottom: 4}}>メモ</div>
                <textarea 
                    value={memo} onChange={e => setMemo(e.target.value)}
                    placeholder="咳がある、機嫌が悪いなど"
                    style={{width: "100%", height: 80, padding: 12, boxSizing: "border-box", borderRadius: 8, border: "1px solid #ddd", fontSize: 16}}
                />
            </label>
        )}
      </div>

      {/* 保存ボタン */}
      <div style={{position: "fixed", bottom: 0, left: 0, right: 0, padding: 16, background: "white", borderTop: "1px solid #eee"}}>
        <button 
            onClick={handleSave}
            style={{
                width: "100%", padding: 14, borderRadius: 12, border: "none",
                background: isMedicationOnly ? "#FF6B35" : "#66A9D9",
                color: "white", fontSize: 16, fontWeight: "bold"
            }}
        >
            記録する
        </button>
      </div>
    </div>
  );
}