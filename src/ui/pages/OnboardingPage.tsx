import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiClient } from "../../data/remote/apiClient";
import { LocalDb } from "../../data/local/localDb";

export function OnboardingPage() {
  const nav = useNavigate();
  const [groupName, setGroupName] = useState("家族");
  const [joinCode, setJoinCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function createGroup() {
    setErr(null); setLoading(true);
    try {
      const res = await ApiClient.createGroup(groupName.trim());
      const data = res.data as any;
      // 修正: カッコを追加
      await LocalDb.setCurrentGroup(data.group_id, (data.name ?? groupName.trim()) || "家族");
      alert(`参加コード: ${data.join_code}\n有効期限: ${data.expires_at ?? ""}`);
      nav("/");
    } catch (e: any) { setErr(e.message ?? String(e)); } finally { setLoading(false); }
  }

  async function joinGroup() {
    setErr(null); setLoading(true);
    try {
      const code = joinCode.toUpperCase().trim();
      if (!code) return setErr("参加コードを入力してください");
      const res = await ApiClient.joinGroup(code);
      const data = res.data as any;
      // 修正: カッコを追加
      await LocalDb.setCurrentGroup(data.group_id, data.name ?? "家族");
      nav("/");
    } catch (e: any) { setErr(e.message ?? String(e)); } finally { setLoading(false); }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <h2 style={{ margin: 0 }}>はじめに</h2>
      {err && <div style={{ color: "crimson" }}>{err}</div>}
      <section style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>新しく始める</div>
        <input value={groupName} onChange={(e)=>setGroupName(e.target.value)} placeholder="グループ名" style={{ width: "100%", padding: 10 }} />
        <button onClick={createGroup} disabled={loading} style={{ marginTop: 8, padding: 10 }}>作成</button>
      </section>
      <section style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>参加する</div>
        <input value={joinCode} onChange={(e)=>setJoinCode(e.target.value)} placeholder="参加コード" style={{ width: "100%", padding: 10, textTransform: "uppercase" }} />
        <button onClick={joinGroup} disabled={loading} style={{ marginTop: 8, padding: 10 }}>参加</button>
      </section>
    </div>
  );
}