import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LocalDb } from "../../data/local/localDb";
import type { Medication } from "../../utils/types";

type MedicationExt = Medication & { 
  reminder_time?: string; 
  sort_order?: number; 
};

export default function MedicationSettingsPage() {
  const nav = useNavigate();
  const [list, setList] = useState<MedicationExt[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MedicationExt | null>(null);
  const [name, setName] = useState("");
  const [reminderTime, setReminderTime] = useState("");

  useEffect(() => {
    loadList();
  }, []);

  const loadList = async () => {
    const data = await LocalDb.getMedications();
    // @ts-ignore
    const sorted = data.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    setList(sorted);
  };

  const handleCreate = () => {
    setEditingItem(null);
    setName("");
    setReminderTime("");
    setIsModalOpen(true);
  };

  const handleEdit = (item: MedicationExt) => {
    setEditingItem(item);
    setName(item.name);
    setReminderTime(item.reminder_time || "");
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    const now = new Date().toISOString();
    const group = await LocalDb.getCurrentGroup();
    if (!group) return;

    let newItem: MedicationExt;
    if (editingItem) {
      newItem = { ...editingItem, name: name.trim(), reminder_time: reminderTime, updated_at: now };
    } else {
      const maxOrder = list.reduce((max, item) => Math.max(max, item.sort_order ?? 0), 0);
      newItem = {
        uuid: crypto.randomUUID(),
        group_id: group.group_id,
        name: name.trim(),
        reminder_time: reminderTime,
        sort_order: maxOrder + 1,
        is_deleted: 0,
        created_at: now,
        updated_at: now,
      };
    }

    // @ts-ignore
    await LocalDb.upsertMedication(newItem);
    setIsModalOpen(false);
    loadList();
  };

  const handleDelete = async () => {
    if (!editingItem) return;
    if (!confirm("削除しますか？")) return;
    await LocalDb.deleteMedication(editingItem.uuid);
    setIsModalOpen(false);
    loadList();
  };

  const moveItem = async (index: number, direction: "up" | "down") => {
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === list.length - 1) return;
    const newList = [...list];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    [newList[index], newList[targetIndex]] = [newList[targetIndex], newList[index]];
    
    const updates = newList.map((item, idx) => ({ ...item, sort_order: idx + 1, updated_at: new Date().toISOString() }));
    // @ts-ignore
    for (const item of updates) await LocalDb.upsertMedication(item);
    setList(updates);
  };

  return (
    <div style={{minHeight: "100dvh", background: "#f4f5f7"}}>
      <header style={{height: 56, background: "white", display: "flex", alignItems: "center", padding: "0 16px", borderBottom: "1px solid #eee"}}>
        <button onClick={() => nav(-1)} style={{border:"none", background:"transparent", fontSize:20, marginRight: 16}}>←</button>
        <span style={{fontWeight:"bold"}}>お薬の設定</span>
      </header>
      <div style={{padding: 16}}>
        {list.map((item, idx) => (
          <div key={item.uuid} style={{background: "white", padding: 12, marginBottom: 8, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "space-between"}}>
            <div onClick={() => handleEdit(item)} style={{flex: 1}}>
                <div style={{fontWeight: "bold"}}>{item.name}</div>
                {item.reminder_time && <div style={{fontSize: 12, color: "#66A9D9"}}>🔔 {item.reminder_time}</div>}
            </div>
            <div style={{display: "flex", flexDirection: "column", gap: 2}}>
                <button onClick={() => moveItem(idx, "up")} disabled={idx===0} style={{fontSize: 10, padding: "2px 8px"}}>▲</button>
                <button onClick={() => moveItem(idx, "down")} disabled={idx===list.length-1} style={{fontSize: 10, padding: "2px 8px"}}>▼</button>
            </div>
          </div>
        ))}
        <button onClick={handleCreate} style={{width: "100%", padding: 12, marginTop: 12, background: "#E3F2FD", color: "#1976D2", border: "1px dashed #1976D2", borderRadius: 8}}>＋ お薬を追加</button>
      </div>

      {isModalOpen && (
        <div style={{position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center"}}>
          <div style={{background: "white", width: 300, padding: 20, borderRadius: 12}}>
            <h3>{editingItem ? "編集" : "新規登録"}</h3>
            <input value={name} onChange={e=>setName(e.target.value)} placeholder="薬の名前" style={{width: "100%", padding: 8, marginBottom: 12, boxSizing: "border-box"}} />
            <label style={{display: "block", marginBottom: 20}}>
                <div style={{fontSize: 12}}>通知時間（任意）</div>
                <input type="time" value={reminderTime} onChange={e=>setReminderTime(e.target.value)} style={{width: "100%", padding: 8}} />
            </label>
            <div style={{display: "flex", justifyContent: "flex-end", gap: 8}}>
                {editingItem && <button onClick={handleDelete} style={{color: "red", background: "none", border: "none", marginRight: "auto"}}>削除</button>}
                <button onClick={() => setIsModalOpen(false)}>キャンセル</button>
                <button onClick={handleSave} style={{background: "#1976D2", color: "white", border: "none", padding: "8px 16px", borderRadius: 4}}>保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}