import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LocalDb } from "../../data/local/localDb";
import type { User, RecordRow, SettingsRow } from "../../utils/types";
import { InAppNotices } from "../components/InAppNotices";
import { syncNow } from "../../services/sync/syncService";
import { RecordModal } from "../components/RecordModal";
import { maskTemp } from "../../utils/privacy";

type Latest = { user_uuid: string; temp: number; measured_at: string } | null;

export function HomePage() {
  const [group, setGroup] = useState<{ group_id: string; group_name: string } | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [selected, setSelected] = useState<User | null>(null);
  const [syncState, setSyncState] = useState<string>("");
  const [settings, setSettings] = useState<SettingsRow | null>(null);
  const [latest, setLatest] = useState<Record<string, Latest>>({});
  const nav = useNavigate();

  async function reload() {
    const g = await LocalDb.getCurrentGroup();
    if (!g) { nav("/onboarding"); return; }
    setGroup(g);
    const us = await LocalDb.listUsers(g.group_id);
    setUsers(us);
    const s = await LocalDb.ensureSettings(g.group_id);
    setSettings(s);
    
    const map: Record<string, Latest> = {};
    for (const u of us) {
      const recs: RecordRow[] = await LocalDb.listRecords(u.uuid);
      const r = recs[0];
      map[u.uuid] = r ? { user_uuid: u.uuid, temp: r.temp, measured_at: r.measured_at } : null;
    }
    setLatest(map);
    
    const lastSync = await LocalDb.getMeta("last_sync");
    setSyncState(lastSync ? `最終同期: ${new Date(lastSync).toLocaleString()}` : "未同期");
  }

  useEffect(() => { void reload(); }, []);

  async function doSync() {
    const r = await syncNow();
    setSyncState(r.success ? `同期OK（push:${r.pushed}, pull:${r.pulled}）` : `同期失敗: ${r.error}`);
    await reload();
  }
  const showTemp = settings?.show_temp_on_home ?? true;

  return (
    <div>
      <InAppNotices />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div>
          <div style={{ fontWeight: 700 }}>{group?.group_name ?? ""}</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>{syncState}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={doSync}>同期</button>
          <Link to="/members">編集</Link>
        </div>
      </div>
      <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
        {users.map(u => {
          const lt = latest[u.uuid];
          const tempText = lt ? (showTemp ? `${lt.temp.toFixed(1)}℃` : `${maskTemp(lt.temp)}℃`) : "—";
          const timeText = lt ? new Date(lt.measured_at).toLocaleString() : "未記録";
          return (
            <button key={u.uuid} onClick={() => setSelected(u)} style={{ textAlign: "left", padding: 12, borderRadius: 12, border: "1px solid #ddd", background: "white" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                <div style={{ fontWeight: 800 }}>{u.name}</div>
                <div style={{ fontWeight: 900, fontSize: 18 }}>{tempText}</div>
              </div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>{timeText}</div>
            </button>
          );
        })}
      </div>
      {selected && <RecordModal user={selected} onClose={() => setSelected(null)} onSaved={reload} />}
    </div>
  );
}