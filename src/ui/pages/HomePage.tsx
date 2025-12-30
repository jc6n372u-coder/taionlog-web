import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LocalDb } from "../../data/local/localDb";
import { useSync } from "../../services/sync/syncService";
import TempChart from "../components/TempChart";

type UserExt = {
  uuid: string; name: string; icon?: string; color?: string; order_index?: number;
};

export default function HomePage() {
  const nav = useNavigate();
  const { runSync, syncState } = useSync();
  const [users, setUsers] = useState<UserExt[]>([]);
  const [activeUser, setActiveUser] = useState<UserExt | null>(null);
  const [showMemberSelect, setShowMemberSelect] = useState(false);
  const [dateOffset, setDateOffset] = useState(0); 

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const group = await LocalDb.getCurrentGroup();
    
    // ★ここが最大の修正点★
    // グループが見つからなくても、絶対にリダイレクトさせない（コンソール警告のみ）
    if (!group) {
        console.warn("Group not found in HomePage (Loop prevention)");
        return; 
    }

    const us = await LocalDb.listUsers(group.group_id);
    if (us.length === 0) return;
    
    // @ts-ignore
    const sorted = us.sort((a,b) => (a.order_index ?? 0) - (b.order_index ?? 0));
    setUsers(sorted as any);
    setActiveUser(sorted[0] as any);
  };

  const handleSync = async () => { await runSync(); loadData(); };

  const getDisplayDate = () => {
    const d = new Date(); d.setDate(d.getDate() + dateOffset);
    if (dateOffset === 0) return "今日";
    if (dateOffset === -1) return "昨日";
    return `${d.getMonth()+1}/${d.getDate()}`;
  };

  const handleFabClick = () => {
    if (users.length === 1) {
        nav(`/input/${users[0].uuid}?medication_only=true`);
    } else {
        setShowMemberSelect(true);
    }
  };

  const renderUserIcon = (u: UserExt, size: number = 24) => {
    const bgColor = u.color || "#ccc";
    const text = u.icon || u.name.slice(0, 1);
    return (
        <div style={{
            width: size, height: size, borderRadius: "50%", background: bgColor, color: "white", 
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: size * 0.6, fontWeight: "bold", flexShrink: 0
        }}>{text}</div>
    );
  };

  return (
    <div style={{minHeight: "100dvh", background: "#f4f5f7", display: "flex", flexDirection: "column"}}>
      <header style={{height: 56, background: "white", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", boxShadow: "0 1px 2px rgba(0,0,0,0.05)"}}>
        <div style={{fontWeight: "bold", fontSize: 18, color: "#66A9D9", display: "flex", alignItems: "center", gap: 8}}>
            {activeUser && renderUserIcon(activeUser, 28)}
            たいおんログ
        </div>
        <div style={{display: "flex", gap: 16}}>
          <button onClick={handleSync} style={{border: "none", background: "transparent", fontSize: 20}}>{syncState.isLoading ? "..." : "🔄"}</button>
          <button onClick={() => nav("/settings")} style={{border: "none", background: "transparent", fontSize: 20}}>⚙️</button>
        </div>
      </header>

      {users.length > 0 && (
        <div style={{display: "flex", overflowX: "auto", background: "white", padding: "0 8px", borderBottom: "1px solid #eee"}}>
          {users.map(u => {
            const isActive = activeUser?.uuid === u.uuid;
            return (
              <button key={u.uuid} onClick={() => setActiveUser(u)}
                style={{
                  flex: 1, minWidth: 80, padding: "12px 4px", border: "none", background: "transparent",
                  borderBottom: isActive ? "3px solid #66A9D9" : "3px solid transparent",
                  fontWeight: isActive ? "bold" : "normal", color: isActive ? "#66A9D9" : "#999",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6
                }}>
                {renderUserIcon(u, 20)}
                {u.name}
              </button>
            );
          })}
        </div>
      )}

      <main style={{flex: 1, padding: 16, overflowY: "auto"}}>
        <div style={{display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20}}>
            <button onClick={() => setDateOffset(d => d - 1)} style={{border: "none", background: "white", width: 40, height: 40, borderRadius: 20}}>◀</button>
            <div style={{margin: "0 20px", fontSize: 18, fontWeight: "bold", color: "#444"}}>{getDisplayDate()}</div>
            <button onClick={() => setDateOffset(d => d + 1)} disabled={dateOffset === 0} style={{border: "none", background: "white", width: 40, height: 40, borderRadius: 20, opacity: dateOffset===0?0.3:1}}>▶</button>
        </div>

        <div style={{background: "white", borderRadius: 16, padding: 16, marginBottom: 20, minHeight: 250}}>
            {activeUser ? <TempChart userUuid={activeUser.uuid} dateOffset={dateOffset} /> : <div style={{textAlign:"center", marginTop: 100}}>データがありません</div>}
        </div>

        <button onClick={() => activeUser && nav(`/input/${activeUser.uuid}`)}
            style={{width: "100%", padding: 16, background: "#66A9D9", color: "white", border: "none", borderRadius: 16, fontSize: 18, fontWeight: "bold", display: "flex", alignItems: "center", justifyContent: "center", gap: 8}}>
            <span>📝</span>{activeUser ? `${activeUser.name}の記録をつける` : "記録をつける"}
        </button>
      </main>

      <button onClick={handleFabClick} style={{position: "fixed", bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28, background: "#FF6B35", color: "white", border: "none", fontSize: 24, zIndex: 50}}>💊</button>

      {showMemberSelect && (
        <div style={{position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100}} onClick={() => setShowMemberSelect(false)}>
            <div style={{background: "white", width: 300, borderRadius: 16, padding: 24}} onClick={e => e.stopPropagation()}>
                <h3 style={{marginTop: 0, textAlign: "center"}}>誰のお薬ですか？</h3>
                <div style={{display: "flex", flexDirection: "column", gap: 12, marginTop: 20}}>
                    {users.map(u => (
                        <button key={u.uuid} onClick={() => { setShowMemberSelect(false); nav(`/input/${u.uuid}?medication_only=true`); }}
                            style={{padding: 12, borderRadius: 12, border: "1px solid #eee", background: "white", display: "flex", alignItems: "center", gap: 12, fontSize: 16}}>
                            {renderUserIcon(u, 32)}{u.name}
                        </button>
                    ))}
                </div>
            </div>
        </div>
      )}
    </div>
  );
}