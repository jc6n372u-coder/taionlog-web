import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LocalDb } from "../../../data/local/localDb";
import type { Medication } from "../../../utils/types";

export default function MedicationSettingsPage() {
  const navigate = useNavigate();
  const [meds, setMeds] = useState<Medication[]>([]);
  const [newName, setNewName] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    loadMeds();
  }, []);

  const loadMeds = async () => {
    const g = await LocalDb.getCurrentGroup();
    if (!g) return;
    const list = await LocalDb.getMedications(g.group_id);
    
    // 並び順 (display_order) でソート
    const sorted = list.sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
    setMeds(sorted);
  };

  const addMed = async () => {
    if (!newName.trim()) return;
    setIsProcessing(true);
    try {
      const g = await LocalDb.getCurrentGroup();
      if (!g) return;
      
      const maxOrder = meds.length > 0 ? Math.max(...meds.map(m => m.display_order || 0)) : 0;

      await LocalDb.upsertMedication({
        uuid: crypto.randomUUID(),
        group_id: g.group_id,
        name: newName,
        display_order: maxOrder + 1,
        is_deleted: 0,
        updated_at: new Date().toISOString()
      });
      setNewName("");
      loadMeds();
    } finally {
      setIsProcessing(false);
    }
  };

  const deleteMed = async (id: string) => {
    if (!confirm("この薬を一覧から削除しますか？")) return;
    const target = meds.find(m => m.uuid === id);
    if (!target) return;

    // 論理削除（過去の記録への影響を防ぐため推奨）
    await LocalDb.upsertMedication({
      ...target,
      is_deleted: 1,
      updated_at: new Date().toISOString()
    });
    loadMeds();
  };

  const moveItem = async (index: number, direction: number) => {
    if (isProcessing) return;
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= meds.length) return;

    setIsProcessing(true);
    
    const newMeds = [...meds];
    const [movedItem] = newMeds.splice(index, 1);
    newMeds.splice(newIndex, 0, movedItem);
    setMeds(newMeds);

    try {
      const promises = newMeds.map((med, idx) => 
        LocalDb.upsertMedication({
          ...med,
          display_order: idx,
          updated_at: new Date().toISOString()
        })
      );
      await Promise.all(promises);
    } catch (e) {
      console.error(e);
      alert("並び替えの保存に失敗しました");
      loadMeds();
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div style={styles.page}>
      <header style={styles.appBar}>
        <button onClick={() => navigate(-1)} style={styles.navBtn}>←</button>
        <span style={styles.title}>お薬の設定</span>
        <div style={{width: 30}}></div>
      </header>

      <div style={styles.body}>
        {/* 追加フォーム */}
        <div style={styles.inputRow}>
          <input 
            type="text" 
            value={newName} 
            onChange={(e) => setNewName(e.target.value)} 
            placeholder="お薬名を入力 (例: カロナール)"
            style={styles.input}
          />
          <button onClick={addMed} disabled={isProcessing || !newName} style={styles.addBtn}>
            追加
          </button>
        </div>

        {/* リスト */}
        <div style={styles.listContainer}>
          {meds.map((m, index) => (
            <div key={m.uuid} style={styles.listItem}>
              <div style={styles.medName}>{m.name}</div>
              
              <div style={styles.actions}>
                <button 
                  onClick={() => moveItem(index, -1)} 
                  disabled={index === 0 || isProcessing}
                  style={index === 0 ? styles.moveBtnDisabled : styles.moveBtn}
                >
                  ↑
                </button>
                <button 
                  onClick={() => moveItem(index, 1)} 
                  disabled={index === meds.length - 1 || isProcessing}
                  style={index === meds.length - 1 ? styles.moveBtnDisabled : styles.moveBtn}
                >
                  ↓
                </button>

                <button onClick={() => deleteMed(m.uuid)} style={styles.deleteBtn}>
                  削除
                </button>
              </div>
            </div>
          ))}
          {meds.length === 0 && <div style={styles.empty}>登録がありません</div>}
        </div>
        
        {/* ★復元: 注釈テキスト */}
        <div style={{marginTop:12, fontSize:12, color:"#666"}}>
            ※ここで登録した薬は、体温記録の際に選択できるようになります。
        </div>

      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: "100dvh", background: "#f4f5f7", fontFamily: "sans-serif" },
  appBar: { height: 56, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 16px", background: "#66A9D9", color: "white", position: "sticky", top: 0, zIndex: 10 },
  title: { fontWeight: "bold", fontSize: 18 },
  navBtn: { background: "transparent", border: "none", color: "white", fontSize: 20, cursor: "pointer", width: 30 },
  body: { padding: 16 },
  inputRow: { display: "flex", gap: 8, marginBottom: 16 },
  input: { flex: 1, padding: 12, borderRadius: 8, border: "1px solid #ddd", fontSize: 16 },
  addBtn: { padding: "0 20px", borderRadius: 8, border: "none", background: "#66A9D9", color: "white", fontWeight: "bold", cursor: "pointer" },
  listContainer: { display: "flex", flexDirection: "column", gap: 8 },
  listItem: { display: "flex", alignItems: "center", justifyContent: "space-between", background: "white", padding: "12px 16px", borderRadius: 8, boxShadow: "0 1px 2px rgba(0,0,0,0.1)" },
  medName: { fontSize: 16, fontWeight: "bold", color: "#333" },
  actions: { display: "flex", gap: 8 },
  moveBtn: { width: 32, height: 32, borderRadius: 16, border: "1px solid #ddd", background: "#f0f9ff", color: "#005a9e", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: "bold" },
  moveBtnDisabled: { width: 32, height: 32, borderRadius: 16, border: "1px solid #eee", background: "#f9f9f9", color: "#ccc", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 },
  deleteBtn: { padding: "0 12px", height: 32, borderRadius: 16, border: "none", background: "#ffeeee", color: "red", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  empty: { textAlign: "center", color: "#999", padding: 20 },
};