import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LocalDb } from "../../data/local/localDb";
import type { User, Medication } from "../../utils/types";
import { Card, Field, Row } from "../components/FormBits";
import { createMember, deleteMember, updateMember } from "../../features/members/memberService";
import { createMedication, deleteMedication, updateMedication } from "../../features/members/medicationService";

export function MembersPage() {
  const nav = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [meds, setMeds] = useState<Medication[]>([]);
  const [newUser, setNewUser] = useState("");
  const [newMed, setNewMed] = useState("");
  const [newMedInterval, setNewMedInterval] = useState(6);
  const [err, setErr] = useState<string | null>(null);

  async function reload() {
    const g = await LocalDb.getCurrentGroup();
    if (!g) return nav("/onboarding");
    setUsers(await LocalDb.listUsers(g.group_id));
    setMeds(await LocalDb.listMedications(g.group_id));
  }
  useEffect(() => { void reload(); }, []);

  async function addUser() {
    try {
      setErr(null); if (!newUser.trim()) return;
      await createMember(newUser); setNewUser(""); await reload();
    } catch (e: any) { setErr(e.message ?? String(e)); }
  }
  async function addMed() {
    try {
      setErr(null); if (!newMed.trim()) return;
      await createMedication(newMed, Math.max(1, Number(newMedInterval)));
      setNewMed(""); await reload();
    } catch (e: any) { setErr(e.message ?? String(e)); }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <h2 style={{ margin: 0 }}>メンバー / 薬</h2>
      {err && <div style={{ color: "crimson" }}>{err}</div>}
      <Card title="メンバー">
        <Row>
          <input value={newUser} onChange={(e)=>setNewUser(e.target.value)} placeholder="名前" style={{ padding: 10, minWidth: 220 }} />
          <button onClick={addUser}>追加</button>
        </Row>
        <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
          {users.map(u => (
            <Row key={u.uuid}>
              <input value={u.name} onChange={async (e)=>{ await updateMember(u.uuid, { name: e.target.value }); await reload(); }} style={{ padding: 10, minWidth: 240 }} />
              <button onClick={async ()=>{ if (confirm("削除しますか？")) { await deleteMember(u.uuid); await reload(); } }}>削除</button>
            </Row>
          ))}
          {users.length === 0 && <div style={{ opacity: 0.7 }}>メンバーがいません</div>}
        </div>
      </Card>
      <Card title="薬（投薬間隔）">
        <div style={{ display: "grid", gap: 8 }}>
          <Row>
            <input value={newMed} onChange={(e)=>setNewMed(e.target.value)} placeholder="薬名" style={{ padding: 10, minWidth: 220 }} />
            <Field label="間隔（時間）">
              <input type="number" min={1} value={newMedInterval} onChange={(e)=>setNewMedInterval(Number(e.target.value))} style={{ padding: 10, width: 120 }} />
            </Field>
            <button onClick={addMed}>追加</button>
          </Row>
          <div style={{ display: "grid", gap: 8 }}>
            {meds.map(m => (
              <Row key={m.uuid}>
                <input value={m.name} onChange={async (e)=>{ await updateMedication(m.uuid, { name: e.target.value }); await reload(); }} style={{ padding: 10, minWidth: 220 }} />
                <input type="number" min={1} value={m.default_interval_hours} onChange={async (e)=>{ await updateMedication(m.uuid, { default_interval_hours: Number(e.target.value) }); await reload(); }} style={{ padding: 10, width: 120 }} />
                <button onClick={async ()=>{ if (confirm("削除しますか？")) { await deleteMedication(m.uuid); await reload(); } }}>削除</button>
              </Row>
            ))}
            {meds.length === 0 && <div style={{ opacity: 0.7 }}>薬が登録されていません</div>}
          </div>
        </div>
      </Card>
      <div><button onClick={() => nav("/")}>ホームへ戻る</button></div>
    </div>
  );
}