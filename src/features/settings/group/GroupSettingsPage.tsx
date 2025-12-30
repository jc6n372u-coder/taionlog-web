import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LocalDb } from "../../../data/local/localDb";
import type { User } from "../../../utils/types";

export default function GroupSettingsPage() {
  const nav = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [groupName, setGroupName] = useState("");

  useEffect(() => { reload(); }, []);

  async function reload() {
    const g = await LocalDb.getCurrentGroup();
    if (!g) return;
    setGroupName(g.group_name);
    setUsers(await LocalDb.listUsers(g.group_id));
  }

  // 並び替え処理 (順番を入れ替えて保存)
  const move = async (index: number, direction: -1 | 1) => {
      const newUsers = [...users];
      const target = newUsers[index];
      const swap = newUsers[index + direction];
      if (!swap) return;

      newUsers[index] = swap;
      newUsers[index + direction] = target;
      
      setUsers(newUsers); // 即時反映
      
      // DB保存（order_indexを振り直す）
      const updates = newUsers.map((u, i) => ({ uuid: u.uuid, order_index: i }));
      await LocalDb.updateUserOrder(updates);
  };

  return (
    <div style={{minHeight: "100dvh", background: "#f4f5f7"}}>
      <header style={{height: 56, background: "#66A9D9", display: "flex", alignItems: "center", padding: "0 8px", color: "white"}}>
        <button onClick={() => nav(-1)} style={{border:"none", background:"transparent", color:"white", fontSize:20, width:40}}>←</button>
        <span style={{fontWeight: "bold", fontSize: 16}}>グループ設定</span>
      </header>

      <main style={{padding: 16, display: "grid", gap: 16}}>
        <section style={{background: "white", padding: 16, borderRadius: 12}}>
          <h3 style={{marginTop:0, fontSize:13, color:"#999"}}>グループ名</h3>
          <div style={{fontSize: 16, fontWeight: "bold"}}>{groupName}</div>
        </section>

        <section style={{background: "white", padding: 16, borderRadius: 12}}>
          <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12}}>
            <h3 style={{margin:0, fontSize:13, color:"#999"}}>メンバー (並び替え可)</h3>
            <button onClick={() => nav("/settings/member/edit")} style={{border:"none", background:"#E8F4FF", color:"#005a9e", padding:"6px 12px", borderRadius:20, fontSize:12, fontWeight:"bold", cursor:"pointer"}}>
              + メンバー追加
            </button>
          </div>

          <div style={{display: "grid", gap: 8}}>
            {users.map((u, i) => (
              <div key={u.uuid} style={{display: "flex", justifyContent: "space-between", alignItems: "center", border:"1px solid #f0f0f0", padding: 10, borderRadius:8}}>
                <div style={{display:"flex", alignItems:"center", gap:8}}>
                    <div style={{display:"flex", flexDirection:"column"}}>
                       {i > 0 && <button onClick={() => move(i, -1)} style={styles.arrowBtn}>↑</button>}
                       {i < users.length - 1 && <button onClick={() => move(i, 1)} style={styles.arrowBtn}>↓</button>}
                    </div>
                    <div>
                        <div style={{fontWeight: "bold"}}>{u.name}</div>
                        <div style={{fontSize: 12, color: "#666"}}>{u.birth_date ? new Date(u.birth_date).toLocaleDateString() : ""}</div>
                    </div>
                </div>
                <button onClick={() => nav(`/settings/member/edit?id=${u.uuid}`)} style={{border:"1px solid #ddd", background:"white", padding:"6px 12px", borderRadius: 8, fontSize: 12}}>
                  編集
                </button>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

const styles = {
    arrowBtn: { border:"none", background:"transparent", color:"#66A9D9", fontWeight:"bold", cursor:"pointer", padding:2 }
};