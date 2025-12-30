import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LocalDb } from "../../data/local/localDb";
import type { SettingsRow } from "../../utils/types";
import { isPwaInstalled } from "../../services/notifications/tier1_pwa";
import { requestBrowserNotificationPermission } from "../../services/notifications/tier1_push_min";
import { AdminToolsPanel } from "../components/AdminToolsPanel";
import { AppShell } from "../layouts/AppShell";

export function SettingsPage() {
  const nav = useNavigate();
  const [row, setRow] = useState<SettingsRow | null>(null);
  const [err] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const g = await LocalDb.getCurrentGroup();
      if (!g) return nav("/onboarding");
      const s = await LocalDb.ensureSettings(g.group_id);
      setRow(s);
    })();
  }, [nav]);

  async function toggleShowTemp() {
    if (!row) return;
    const next = {
      ...row,
      show_temp_on_home: !row.show_temp_on_home,
      updated_at: new Date().toISOString(),
    };
    await LocalDb.upsertSettings(next);
    setRow(next);
  }

  function explainPwa() {
    alert(
      "【PWA（アプリ化）】\n" +
      "iPhone/Androidで『ホーム画面に追加』すると、アプリのように使えます。\n" +
      "通知（Push）は端末によって不安定なため、このアプリはPushを主役にしません。\n" +
      "まずはアプリ内通知（Tier0）で成立します。"
    );
  }

  async function enableNotifications() {
    const p = await requestBrowserNotificationPermission();
    alert(`通知権限: ${p}`);
  }

  // Flutter寄せ：バージョン表記はカードの下部に寄せて余白を確保
  const versionText = useMemo(() => {
    // 既存のどこかに version 文字列があるなら、次工程で差し替え
    return "10.1.x (Web)";
  }, []);

  return (
    <AppShell
      title="設定"
      back
      right={
        <button
          type="button"
          onClick={() => nav("/")}
          style={styles.topRightBtn}
          aria-label="ホーム"
          title="ホーム"
        >
          ⌂
        </button>
      }
    >
      {err && <div style={{ color: "crimson" }}>{err}</div>}

      <div style={{ display: "grid", gap: 12 }}>
        {/* グループ表示（Flutterの「グループ名」カード寄せ） */}
        <section style={styles.card}>
          <div style={styles.cardTitleRow}>
            <div style={styles.cardTitle}>グループ</div>
          </div>
          <div style={{ fontSize: 14, opacity: 0.85 }}>現在のグループ名は、メンバー画面で確認できます。</div>
        </section>

        {/* 参加コード */}
        <section style={styles.card}>
          <div style={styles.cardTitleRow}>
            <div style={styles.cardTitle}>参加コード</div>
          </div>
          <button type="button" style={styles.rowBtn} onClick={() => nav("/invite")}>
            <span style={styles.rowLeft}>参加コードを表示</span>
            <span style={styles.rowRight}>›</span>
          </button>
        </section>

        {/* プライバシー */}
        <section style={styles.card}>
          <div style={styles.cardTitleRow}>
            <div style={styles.cardTitle}>プライバシー</div>
          </div>
          <div style={styles.switchRow}>
            <div style={{ display: "grid", gap: 4 }}>
              <div style={{ fontWeight: 700 }}>ホームで体温を表示</div>
              <div style={{ fontSize: 12, opacity: 0.75 }}>
                OFFにすると「**.*℃」表示（覗き見対策）
              </div>
            </div>
            <label style={styles.switch}>
              <input
                type="checkbox"
                checked={!!row?.show_temp_on_home}
                onChange={toggleShowTemp}
                style={styles.switchInput}
              />
              <span
                style={{
                  ...styles.switchKnob,
                  transform: row?.show_temp_on_home ? "translateX(22px)" : "translateX(0px)",
                  background: "white",
                }}
              />
            </label>
          </div>
        </section>

        {/* PWA */}
        <section style={styles.card}>
          <div style={styles.cardTitleRow}>
            <div style={styles.cardTitle}>PWA（アプリ化）</div>
          </div>
          <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 10 }}>
            現在の状態: {isPwaInstalled() ? "インストール済み" : "未インストール（推奨）"}
          </div>
          <button type="button" style={styles.primaryBtn} onClick={explainPwa}>
            ホーム画面に追加する方法
          </button>
        </section>

        {/* 通知 */}
        <section style={styles.card}>
          <div style={styles.cardTitleRow}>
            <div style={styles.cardTitle}>通知（任意）</div>
          </div>
          <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 10 }}>
            端末によって不安定なため、通知は主役にしません。まずはアプリ内通知（Tier0）で成立します。
          </div>
          <button type="button" style={styles.primaryBtn} onClick={enableNotifications}>
            通知を許可する
          </button>
        </section>

        {/* 管理ツール */}
        <section style={styles.card}>
          <div style={styles.cardTitleRow}>
            <div style={styles.cardTitle}>管理ツール</div>
          </div>
          <AdminToolsPanel />
        </section>

        {/* バージョン */}
        <section style={styles.card}>
          <div style={styles.cardTitleRow}>
            <div style={styles.cardTitle}>バージョン</div>
          </div>
          <div style={{ fontSize: 14, opacity: 0.85 }}>{versionText}</div>
        </section>
      </div>
    </AppShell>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: "white",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.10)",
    padding: 12,
  },
  cardTitleRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  cardTitle: {
    fontWeight: 900,
    fontSize: 14,
  },
  rowBtn: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: "12px 10px",
    borderRadius: 10,
    border: "1px solid rgba(0,0,0,0.10)",
    background: "#f9fafb",
    cursor: "pointer",
    fontSize: 14,
  },
  rowLeft: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
  },
  rowRight: {
    fontSize: 22,
    opacity: 0.5,
  },
  primaryBtn: {
    width: "100%",
    height: 44,
    border: "none",
    borderRadius: 10,
    background: "#66A9D9",
    color: "white",
    fontWeight: 800,
    cursor: "pointer",
  },
  topRightBtn: {
    height: 40,
    width: 40,
    border: "none",
    borderRadius: 999,
    background: "transparent",
    color: "white",
    fontSize: 18,
    cursor: "pointer",
  },
  switchRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  switch: {
    position: "relative",
    width: 54,
    height: 32,
    borderRadius: 999,
    background: "rgba(0,0,0,0.15)",
    display: "inline-block",
    cursor: "pointer",
  },
  switchInput: {
    position: "absolute",
    opacity: 0,
    inset: 0,
    margin: 0,
    cursor: "pointer",
  },
  switchKnob: {
    position: "absolute",
    top: 4,
    left: 4,
    width: 24,
    height: 24,
    borderRadius: 999,
    background: "white",
    boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
    transform: "translateX(0px)",
    transition: "transform 120ms ease",
  },
};