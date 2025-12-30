import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LocalDb } from "../../../data/local/localDb";
import type { User } from "../../../utils/types";

export default function GroupSettingsPage() {
  const nav = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [groupName, setGroupName] = useState("");

  useEffect(() => {
    reload();
  }, []);

  async function reload() {
    const g = await LocalDb.getCurrentGroup();
    if (!g) return;
    setGroupName(g.group_name);
    const us = await LocalDb.listUsers(g.group_id);
    setUsers(us);
  }

  return (
    <div style={{minHeight: "100dvh", background: "#f4f5f7"}}>
      <header style={{height: 56, background: "#66A9D9", display: "flex", alignItems: "center", padding: "0 8px", color: "white"}}>
        <button onClick={() => nav(-1)} style={{border:"none", background:"transparent", color:"white", fontSize:20, width:40}}>←</button>
        <span style={{fontWeight: "bold", fontSize: 16}}>グループ設定</span>
      </header>

      <main style={{padding: 16, display: "grid", gap: 16}}>
        {/* グループ名 */}
        <section style={{background: "white", padding: 16, borderRadius: 12}}>
          <h3 style={{marginTop:0, fontSize:13, color:"#999"}}>グループ名</h3>
          <div style={{fontSize: 16, fontWeight: "bold"}}>{groupName}</div>
        </section>

        {/* メンバーリスト */}
        <section style={{background: "white", padding: 16, borderRadius: 12}}>
          <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12}}>
            <h3 style={{margin:0, fontSize:13, color:"#999"}}>メンバー</h3>
            <button 
              onClick={() => nav("/settings/member/edit")} 
              style={{border:"none", background:"#E8F4FF", color:"#005a9e", padding:"6px 12px", borderRadius:20, fontSize:12, fontWeight:"bold", cursor:"pointer"}}
            >
              + メンバー追加
            </button>
          </div>

          <div style={{display: "grid", gap: 12}}>
            {users.map(u => (
              <div key={u.uuid} style={{display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom:"1px solid #f0f0f0", paddingBottom: 8}}>
                <div>
                  <div style={{fontWeight: "bold"}}>{u.name}</div>
                  <div style={{fontSize: 12, color: "#666"}}>
                    {u.birth_date ? new Date(u.birth_date).toLocaleDateString() : ""} {u.gender ? ` / ${u.gender}` : ""}
                  </div>
                </div>
                <button 
                  onClick={() => nav(`/settings/member/edit?id=${u.uuid}`)}
                  style={{border:"1px solid #ddd", background:"white", padding:"6px 12px", borderRadius: 8, fontSize: 12, cursor: "pointer"}}
                >
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