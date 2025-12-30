import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { LocalDb } from "../../data/local/localDb";
import { AppShell } from "../layouts/AppShell"; // もしAppShellを使わないなら独自ヘッダーでOK

export default function MemberEditPage() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const targetUuid = params.get("id"); // URLパラメータ ?id=... があれば編集、なければ新規

  const [name, setName] = useState("");
  const [birth, setBirth] = useState("");
  const [gender, setGender] = useState("未回答");
  const [allergy, setAllergy] = useState("");
  const [history, setHistory] = useState(""); // 既往歴
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
      if (!g) throw new Error("グループが見つかりません");

      const uuid = targetUuid || crypto.randomUUID();
      const now = new Date().toISOString();

      await LocalDb.upsertUser({
        uuid,
        group_id: g.group_id,
        name,
        birth_date: birth || null,
        gender,
        allergy,
        history, // 既往歴
        is_deleted: 0,
        updated_at: now,
        // 新規の場合は末尾に追加するためのorderなどが必要だが今回は省略
      });
      
      alert("保存しました");
      nav(-1); // 戻る
    } catch (e) {
      alert("エラーが発生しました");
      console.error(e);
      setIsSaving(false);
    }
  };

  return (
    <div style={{minHeight: "100dvh", background: "#f4f5f7"}}>
      <header style={{height: 56, background: "#66A9D9", display: "flex", alignItems: "center", padding: "0 16px", color: "white"}}>
        <button onClick={() => nav(-1)} style={{border:"none", background:"transparent", color:"white", fontSize:20, marginRight:16}}>←</button>
        <span style={{fontWeight: "bold", fontSize: 16}}>{targetUuid ? "メンバー編集" : "メンバー追加"}</span>
      </header>

      <main style={{padding: 16, display: "grid", gap: 16}}>
        <Section title="基本情報">
          <Input label="名前" value={name} onChange={setName} placeholder="例：たろう" />
          <Input label="生年月日" type="date" value={birth} onChange={setBirth} />
          <div style={{display: "flex", flexDirection: "column", gap: 4}}>
            <label style={{fontSize:12, fontWeight:"bold", color:"#666"}}>性別</label>
            <select value={gender} onChange={e => setGender(e.target.value)} style={inputStyle}>
              <option value="未回答">未回答</option>
              <option value="男">男</option>
              <option value="女">女</option>
              <option value="その他">その他</option>
            </select>
          </div>
        </Section>

        <Section title="医療情報">
          <Input label="アレルギー" value={allergy} onChange={setAllergy} placeholder="例：卵, 乳製品" />
          <Input label="既往歴・その他" value={history} onChange={setHistory} placeholder="例：熱性けいれんあり" textarea />
        </Section>

        <button onClick={save} disabled={isSaving} style={{
          padding: 16, borderRadius: 12, border: "none", background: "#FF6B35", color: "white", fontWeight: "bold", fontSize: 16, marginTop: 16
        }}>
          保存する
        </button>
      </main>
    </div>
  );
}

function Section({title, children}: any) {
  return (
    <div style={{background: "white", padding: 16, borderRadius: 12, boxShadow: "0 1px 2px rgba(0,0,0,0.05)"}}>
      <h3 style={{marginTop: 0, marginBottom: 16, fontSize: 14, color: "#999"}}>{title}</h3>
      <div style={{display: "grid", gap: 16}}>{children}</div>
    </div>
  );
}

function Input({label, value, onChange, type="text", placeholder, textarea}: any) {
  return (
    <div style={{display: "flex", flexDirection: "column", gap: 4}}>
      <label style={{fontSize:12, fontWeight:"bold", color:"#666"}}>{label}</label>
      {textarea ? (
        <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{...inputStyle, height: 80}} />
      ) : (
        <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={inputStyle} />
      )}
    </div>
  );
}

const inputStyle = {
  padding: 12, borderRadius: 8, border: "1px solid #ddd", fontSize: 16, background: "#f9f9f9"
};