import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ApiClient } from "../../data/remote/apiClient";
import { LocalDb } from "../../data/local/localDb";
import { PRIVACY_POLICY } from "../../utils/privacy";

export default function OnboardingPage() {
  const nav = useNavigate();
  const [step, setStep] = useState<"policy" | "action">("policy");
  
  // Policy Check
  const [checked, setChecked] = useState(false);
  const [policyAccepted, setPolicyAccepted] = useState(false);

  useEffect(() => {
    const accepted = localStorage.getItem('policyAccepted') === 'true';
    if (accepted) {
      setPolicyAccepted(true);
      setStep("action");
    }
  }, []);

  function acceptPolicy() {
    localStorage.setItem('policyAccepted', 'true');
    setPolicyAccepted(true);
    setStep("action");
  }

  // Actions
  const [groupName, setGroupName] = useState("家族");
  const [joinCode, setJoinCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function createGroup() {
    setErr(null); setLoading(true);
    try {
      const res = await ApiClient.createGroup(groupName.trim());
      const data = res.data as any;
      await LocalDb.setCurrentGroup(data.group_id, (data.name ?? groupName.trim()) || "家族");
      // キャッシュ用
      await LocalDb.setMeta("cached_join_code", data.join_code);
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
      await LocalDb.setCurrentGroup(data.group_id, data.name ?? "家族");
      nav("/");
    } catch (e: any) { setErr(e.message ?? String(e)); } finally { setLoading(false); }
  }

  if (step === "policy") {
    return (
      <div style={{ padding: 24, maxWidth: 600, margin: "0 auto" }}>
        <h2>ご利用前の確認</h2>
        <div style={{ background: "#f7f7f7", padding: 16, borderRadius: 12, marginBottom: 16 }}>
          <ul style={{ paddingLeft: 20 }}>
            {PRIVACY_POLICY.summary.map((s, i) => <li key={i} style={{ marginBottom: 8 }}>{s}</li>)}
            <li>本アプリは医療行為を代替するものではありません</li>
          </ul>
        </div>
        <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} />
          内容を理解し、同意します
        </label>
        <button disabled={!checked} onClick={acceptPolicy} style={{ marginTop: 20, width: "100%", padding: 12, borderRadius: 8, background: checked ? "#3b82f6" : "#ccc", color: "white", border: "none" }}>
          利用開始
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 12, padding: 16, maxWidth: 600, margin: "0 auto" }}>
      <h2 style={{ margin: 0 }}>たいおんログ</h2>
      {err && <div style={{ color: "crimson", padding: 10, background: "#ffeef0" }}>{err}</div>}
      
      <section style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>新しく始める</div>
        <input value={groupName} onChange={(e)=>setGroupName(e.target.value)} placeholder="グループ名" style={{ width: "100%", padding: 10, marginBottom: 8 }} />
        <button onClick={createGroup} disabled={loading} style={{ padding: 10, width: "100%" }}>作成</button>
      </section>

      <section style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>参加する</div>
        <input value={joinCode} onChange={(e)=>setJoinCode(e.target.value)} placeholder="参加コード" style={{ width: "100%", padding: 10, textTransform: "uppercase", marginBottom: 8 }} />
        <button onClick={joinGroup} disabled={loading} style={{ padding: 10, width: "100%" }}>参加</button>
      </section>
    </div>
  );
}