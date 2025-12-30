import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LocalDb } from "../../data/local/localDb";
import type { RecordRow, SettingsRow, User } from "../../utils/types";
import { maskTemp } from "../../utils/privacy";
import { InAppNotices } from "../components/InAppNotices";
import { RecordModal } from "../components/RecordModal";
import { syncNow } from "../../services/syncService"; // パス修正済み

type Latest = { user_uuid: string; temp: number; measured_at: string } | null;

function calcAgeLabel(birth_date?: string | null) {
  if (!birth_date) return "";
  try {
    const birth = new Date(birth_date);
    const now = new Date();
    let years = now.getFullYear() - birth.getFullYear();
    let months = now.getMonth() - birth.getMonth();
    if (now.getDate() < birth.getDate()) months -= 1;
    if (months < 0) {
      years -= 1;
      months += 12;
    }
    if (years < 1) return `${months}ヶ月`;
    return `${years}歳`;
  } catch {
    return "";
  }
}

function formatDaysAgo(iso?: string) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const now = new Date();
    const ms = now.getTime() - d.getTime();
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));
    if (days <= 0) return "今日";
    if (days === 1) return "昨日";
    return `${days}日前`;
  } catch {
    return "";
  }
}

function tempColor(temp?: number | null) {
  if (temp == null) return "#666666";
  if (temp >= 38.0) return "#E57373"; // danger
  if (temp >= 37.5) return "#FFB74D"; // warning
  return "#4CAF50"; // chartGreen
}

export default function HomePage() {
  const nav = useNavigate();
  const [group, setGroup] = useState<{ group_id: string; group_name: string } | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [settings, setSettings] = useState<SettingsRow | null>(null);
  const [latest, setLatest] = useState<Record<string, Latest>>({});
  const [selected, setSelected] = useState<User | null>(null);
  const [syncState, setSyncState] = useState<string>("");
  const [syncBusy, setSyncBusy] = useState(false);

  async function reload() {
    const g = await LocalDb.getCurrentGroup();
    if (!g) {
      nav("/onboarding");
      return;
    }
    setGroup(g);
    const us = await LocalDb.listUsers(g.group_id);
    setUsers(us);
    const s = await LocalDb.ensureSettings(g.group_id);
    setSettings(s);

    // 直近体温（ユーザーごと：最新1件）
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

  useEffect(() => {
    void reload();
  }, []);

  async function doSync() {
    try {
      setSyncBusy(true);
      const r = await syncNow();
      setSyncState(r.success ? `同期OK（push:${r.pushed}, pull:${r.pulled}）` : `同期失敗: ${r.error}`);
      await reload();
    } finally {
      setSyncBusy(false);
    }
  }

  const showTemp = settings?.show_temp_on_home ?? true;

  // 「＋」ボタン：最後にタップした人がいればその人、いなければ先頭の人
  const fabTarget = useMemo(() => {
    if (selected) return selected;
    return users[0] ?? null;
  }, [selected, users]);

  return (
    <div style={{ minHeight: "100vh", background: "#F5F5F5" }}>
      {/* AppBar */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "#66A9D9", // Flutter Blue
          color: "white",
          padding: "12px 12px 10px",
          boxShadow: "0 1px 0 rgba(0,0,0,0.08)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div style={{ minWidth: 44 }} />
          <div style={{ textAlign: "center", lineHeight: 1.2 }}>
            <div style={{ fontWeight: 900, fontSize: 16 }}>{group?.group_name ?? "たいおんログ"}</div>
            <div style={{ fontSize: 11, opacity: 0.9 }}>{syncState}</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "flex-end", minWidth: 44 }}>
            <button
              onClick={doSync}
              disabled={syncBusy}
              style={{
                background: "rgba(255,255,255,0.18)",
                color: "white",
                border: "1px solid rgba(255,255,255,0.35)",
                borderRadius: 10,
                padding: "8px 10px",
                fontWeight: 800,
                cursor: syncBusy ? "not-allowed" : "pointer",
              }}
            >
              {syncBusy ? "同期中…" : "同期"}
            </button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: 12, display: "grid", gap: 12, maxWidth: 680, margin: "0 auto" }}>
        <InAppNotices />

        {/* quick actions */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link
            to="/members"
            style={{
              textDecoration: "none",
              background: "white",
              border: "1px solid #e5e5e5",
              borderRadius: 12,
              padding: "10px 12px",
              fontWeight: 800,
              color: "#333",
            }}
          >
            メンバー編集
          </Link>
          <Link
            to="/settings"
            style={{
              textDecoration: "none",
              background: "white",
              border: "1px solid #e5e5e5",
              borderRadius: 12,
              padding: "10px 12px",
              fontWeight: 800,
              color: "#333",
            }}
          >
            設定
          </Link>
          <Link
            to="/chart"
            style={{
              textDecoration: "none",
              background: "white",
              border: "1px solid #e5e5e5",
              borderRadius: 12,
              padding: "10px 12px",
              fontWeight: 800,
              color: "#333",
            }}
          >
            グラフ
          </Link>
        </div>

        {/* member list */}
        <div style={{ display: "grid", gap: 10 }}>
          {users.map((u) => {
            const lt = latest[u.uuid];
            const tempText = lt ? (showTemp ? `${lt.temp.toFixed(1)}℃` : `${maskTemp(lt.temp)}℃`) : "—";
            const dayText = lt ? formatDaysAgo(lt.measured_at) : "未記録";
            const age = calcAgeLabel((u as any).birth_date);

            return (
              <button
                key={u.uuid}
                onClick={() => setSelected(u)}
                style={{
                  textAlign: "left",
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid #e5e5e5",
                  background: "white",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
                  <div style={{ display: "grid", gap: 4 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                      <div style={{ fontWeight: 900, fontSize: 16, color: "#333" }}>{u.name}</div>
                      {age && <div style={{ fontSize: 12, opacity: 0.7, color: "#333" }}>{age}</div>}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.75, color: "#333" }}>{dayText}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div
                      style={{
                        fontWeight: 900,
                        fontSize: 20,
                        color: tempColor(lt?.temp ?? null),
                      }}
                    >
                      {tempText}
                    </div>
                    <div style={{ fontSize: 11, opacity: 0.65, color: "#333" }}>タップで記録</div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Floating Action Button */}
      <button
        onClick={() => {
          if (fabTarget) setSelected(fabTarget);
        }}
        disabled={!fabTarget}
        title={fabTarget ? `${fabTarget.name}の記録` : "メンバーがいません"}
        style={{
          position: "fixed",
          right: 18,
          bottom: 18,
          width: 56,
          height: 56,
          borderRadius: 28,
          border: "none",
          background: "#FF6B35",
          color: "white",
          fontSize: 28,
          fontWeight: 900,
          boxShadow: "0 8px 18px rgba(0,0,0,0.22)",
          cursor: fabTarget ? "pointer" : "not-allowed",
        }}
      >
        +
      </button>

      {selected && <RecordModal user={selected} onClose={() => setSelected(null)} onSaved={reload} />}
    </div>
  );
}