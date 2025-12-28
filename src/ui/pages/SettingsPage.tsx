import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LocalDb } from "../../data/local/localDb";
import type { SettingsRow } from "../../utils/types";
import { isPwaInstalled } from "../../services/notifications/tier1_pwa";
import { requestBrowserNotificationPermission } from "../../services/notifications/tier1_push_min";

export function SettingsPage() {
  const nav = useNavigate();
  const [row, setRow] = useState<SettingsRow | null>(null);
  const [err] = useState<string | null>(null);

  useEffect(() => { void (async () => {
    const g = await LocalDb.getCurrentGroup();
    if (!g) return nav("/onboarding");
    const s = await LocalDb.ensureSettings(g.group_id);
    setRow(s);
  })(); }, [nav]);

  async function toggleShowTemp() {
    if (!row) return;
    const next = { ...row, show_temp_on_home: !row.show_temp_on_home, updated_at: new Date().toISOString() };
    await LocalDb.upsertSettings(next);
    setRow(next);
  }
  function explainPwa() {
    alert("【PWA（アプリ化）】\niPhone/Androidで『ホーム画面に追加』すると、アプリのように使えます。\n通知（Push）は端末によって不安定なため、このアプリはPushを主役にしません。まずはアプリ内通知（Tier0）で成立します。");
  }
  async function enableNotifications() {
    const p = await requestBrowserNotificationPermission();
    alert(`通知権限: ${p}`);
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <h2 style={{ margin: 0 }}>設定</h2>
      {err && <div style={{ color: "crimson" }}>{err}</div>}
      <section style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12, background: "white" }}>
        <div style={{ fontWeight: 800, marginBottom: 10 }}>プライバシー</div>
        <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input type="checkbox" checked={!!row?.show_temp_on_home} onChange={toggleShowTemp} />
          ホームで体温を表示する（OFFで伏字）
        </label>
        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>身内配布でも、画面の覗き見対策として伏字を推奨します。</div>
      </section>
      <section style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12, background: "white" }}>
        <div style={{ fontWeight: 800, marginBottom: 10 }}>PWA（アプリ化）</div>
        <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 8 }}>現在の状態: {isPwaInstalled() ? "インストール済み" : "未インストール（推奨）"}</div>
        <button onClick={explainPwa}>ホーム画面に追加する方法</button>
      </section>
      <section style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12, background: "white" }}>
        <div style={{ fontWeight: 800, marginBottom: 10 }}>通知（任意）</div>
        <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 8 }}>端末によって不安定なため、通知は主役にしません。まずはアプリ内通知（Tier0）で成立します。</div>
        <button onClick={enableNotifications}>通知を許可する</button>
      </section>
      <button onClick={() => nav("/")}>戻る</button>
    </div>
  );
}