import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { LocalDb } from "../../data/local/localDb";

export default function MemberEditPage() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const targetUuid = params.get("id");

  const [name, setName] = useState("");
  const [birth, setBirth] = useState("");
  const [gender, setGender] = useState("未回答");
  const [allergy, setAllergy] = useState("");
  const [history, setHistory] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (targetUuid) {
      LocalDb.getCurrentGroup().then(async g => {
        if (!g) return;
        const users = await LocalDb.listUsers(g.group_id);
        const u = users.find(x => x.uuid === targetUuid);
        if (u) {
          setName(u.name);
          setBirth(u.birth_date ?? "");
          setGender(u.gender ?? "未回答");
          setAllergy(u.allergy ?? "");
          setHistory(u.history ?? "");
        }
      });
    }
  }, [targetUuid]);

  const save = async () => {
    if (!name.trim()) return alert("名前を入力してください");
    setIsSaving(true);
    try {
      const g = await LocalDb.getCurrentGroup();
      if (!g) return;
      await LocalDb.upsertUser({
        uuid: targetUuid || crypto.randomUUID(),
        group_id: g.group_id,
        name,
        birth_date: birth || null,
        gender,
        allergy,
        history,
        is_deleted: 0,
        updated_at: new Date().toISOString(),
      });
      nav(-1);
    } catch {
      setIsSaving(false);
      alert("エラー");
    }
  };

  const doDelete = async () => {
      if (!targetUuid || !confirm("本当にこのメンバーを削除しますか？\n過去の記録も表示されなくなります。")) return;
      await LocalDb.deleteUser(targetUuid);
      nav(-1);
  };

  return (
    <div style={{minHeight: "100dvh", background: "#f4f5f7"}}>
      <header style={{height: 56, background: "#66A9D9", display: "flex", alignItems: "center", padding: "0 16px", color: "white"}}>
        <button onClick={() => nav(-1)} style={{border:"none", background:"transparent", color:"white", fontSize:20, marginRight:16}}>←</button>
        <span style={{fontWeight: "bold", fontSize: 16}}>{targetUuid ? "メンバー編集" : "メンバー追加"}</span>
      </header>

      <main style={{padding: 16, display: "grid", gap: 16}}>
        <div style={{background: "white", padding: 16, borderRadius: 12}}>
          <h3 style={{marginTop: 0, marginBottom: 16, fontSize: 14, color: "#999"}}>基本情報</h3>
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="名前" style={inputStyle} />
          <input type="date" value={birth} onChange={e=>setBirth(e.target.value)} style={{...inputStyle, marginTop:12}} />
          <select value={gender} onChange={e => setGender(e.target.value)} style={{...inputStyle, marginTop:12}}>
             <option value="未回答">性別：未回答</option>
             <option value="男">男</option>
             <option value="女">女</option>
          </select>
        </div>

        <div style={{background: "white", padding: 16, borderRadius: 12}}>
          <h3 style={{marginTop: 0, marginBottom: 16, fontSize: 14, color: "#999"}}>医療情報</h3>
          <input value={allergy} onChange={e=>setAllergy(e.target.value)} placeholder="アレルギー" style={inputStyle} />
          <textarea value={history} onChange={e=>setHistory(e.target.value)} placeholder="既往歴など" style={{...inputStyle, marginTop:12, height:80}} />
        </div>

        <button onClick={save} disabled={isSaving} style={{padding: 16, borderRadius: 12, border: "none", background: "#FF6B35", color: "white", fontWeight: "bold", fontSize: 16}}>
          保存する
        </button>

        {targetUuid && (
            <button onClick={doDelete} style={{padding: 16, borderRadius: 12, border: "none", background: "transparent", color: "#dc2626", fontSize: 14}}>
                メンバーを削除
            </button>
        )}
      </main>
    </div>
  );
}
const inputStyle = { width: "100%", padding: 12, borderRadius: 8, border: "1px solid #ddd", fontSize: 16, background: "#f9f9f9", boxSizing: "border-box" } as const;