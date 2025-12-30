import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LocalDb } from "../../../data/local/localDb";
import type { Medication } from "../../../utils/types";

export default function MedicationSettingsPage() {
  const nav = useNavigate();
  const [meds, setMeds] = useState<Medication[]>([]);
  const [groupId, setGroupId] = useState("");

  useEffect(() => { reload(); }, []);

  async function reload() {
    const g = await LocalDb.getCurrentGroup();
    if (!g) return;
    setGroupId(g.group_id);
    setMeds(await LocalDb.getMedications(g.group_id));
  }

  const add = async () => {
      const name = prompt("薬の名前を入力してください（例：カロナール）");
      if (!name || !groupId) return;
      await LocalDb.upsertMedication({
          uuid: crypto.randomUUID(),
          group_id: groupId,
          name,
          is_deleted: 0,
          updated_at: new Date().toISOString()
      });
      reload();
  };

  const del = async (uuid: string) => {
      if (!confirm("この薬を一覧から削除しますか？")) return;
      await LocalDb.deleteMedication(uuid);
      reload();
  };

  return (
    <div style={{minHeight: "100dvh", background: "#f4f5f7"}}>
      <header style={{height: 56, background: "#66A9D9", display: "flex", alignItems: "center", padding: "0 8px", color: "white"}}>
        <button onClick={() => nav(-1)} style={{border:"none", background:"transparent", color:"white", fontSize:20, width:40}}>←</button>
        <span style={{fontWeight: "bold", fontSize: 16}}>お薬設定</span>
      </header>

      <main style={{padding: 16}}>
         <div style={{background:"white", borderRadius:12, padding:16}}>
             <button onClick={add} style={{width:"100%", padding:12, background:"#E8F4FF", color:"#005a9e", border:"none", borderRadius:8, fontWeight:"bold", marginBottom:16}}>
                 + 薬を追加する
             </button>
             {meds.length === 0 && <div style={{textAlign:"center", color:"#999"}}>登録されている薬はありません</div>}
             {meds.map(m => (
                 <div key={m.uuid} style={{display:"flex", justifyContent:"space-between", padding:"12px 0", borderBottom:"1px solid #eee"}}>
                     <span style={{fontWeight:"bold"}}>{m.name}</span>
                     <button onClick={() => del(m.uuid)} style={{color:"red", border:"none", background:"transparent"}}>削除</button>
                 </div>
             ))}
         </div>
         <div style={{marginTop:12, fontSize:12, color:"#666"}}>※ここで登録した薬は、体温記録の際に選択できるようになります。</div>
      </main>
    </div>
  );
}