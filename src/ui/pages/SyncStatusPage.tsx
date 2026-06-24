import { useCallback, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { refreshSyncStatusCounts } from "../../services/sync/syncCoordinator";
import { useSyncStatus } from "../../services/sync/useSyncStatus";
import { showAppConfirm, showSnackbar } from "../feedback/feedbackService";
import { COLORS } from "../tokens";

const STORE_LABELS: Record<string, string> = {
  users: "メンバー",
  records: "体温記録",
  medications: "お薬",
  events: "服薬・メモ記録",
  reminders: "リマインダー",
  settings: "共有設定",
};

export default function SyncStatusPage() {
  const navigate = useNavigate();
  const { status, display, runSyncNow, runFullSync } = useSyncStatus();
  const [processing, setProcessing] = useState<"sync" | "repair" | null>(null);

  const runManualSync = useCallback(async () => {
    if (processing) return;
    setProcessing("sync");
    try {
      const result = await runSyncNow();
      await refreshSyncStatusCounts();
      if (result.success) showSnackbar("共有データを最新の状態にしました");
    } finally {
      setProcessing(null);
    }
  }, [processing, runSyncNow]);

  const runRepair = useCallback(async () => {
    if (processing) return;
    const confirmed = await showAppConfirm({
      title: "同期状態を修復しますか？",
      message:
        "この端末に保存済みの未送信データを先に共有し、その後、共有データをすべて確認し直します。\n\n端末に保存済みの内容が自動的に破棄されることはありません。同じデータが別の端末でも変更されている場合は、確認が必要な変更として表示されます。",
      confirmLabel: "同期状態を修復する",
    });
    if (!confirmed) return;

    setProcessing("repair");
    try {
      const result = await runFullSync();
      await refreshSyncStatusCounts();
      if (result.success) {
        showSnackbar("端末と共有側のデータを確認しました");
      }
    } finally {
      setProcessing(null);
    }
  }, [processing, runFullSync]);

  const pendingEntries = Object.entries(status.pendingCountByStore).filter(
    ([, count]) => (count ?? 0) > 0,
  );

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <button type="button" onClick={() => navigate(-1)} aria-label="前の画面へ戻る" style={styles.backButton}>
          ←
        </button>
        <h1 data-page-heading style={styles.title}>同期状況</h1>
      </header>

      <div style={styles.body}>
        <section style={styles.card} aria-labelledby="sync-current-heading">
          <h2 id="sync-current-heading" style={styles.sectionTitle}>現在の状態</h2>
          <div style={styles.statusLabel}>{display.label}</div>
          {display.detail && <p style={styles.description}>{display.detail}</p>}
          <dl style={styles.definitionList}>
            <Row term="通信状態" value={navigator.onLine ? "オンライン" : "オフライン"} />
            <Row term="最終同期" value={display.absoluteLastSuccessLabel ?? "まだ完了していません"} />
            <Row term="未送信データ" value={`${status.pendingChangeCount}件`} />
            <Row term="確認が必要な変更" value={`${status.conflictCount}件`} />
            <Row term="前回送信" value={`${status.lastPushCount}件`} />
            <Row term="前回受信" value={`${status.lastPullCount}件`} />
          </dl>
        </section>

        {pendingEntries.length > 0 && (
          <section style={styles.card} aria-labelledby="pending-heading">
            <h2 id="pending-heading" style={styles.sectionTitle}>未送信データの内訳</h2>
            <ul style={styles.list}>
              {pendingEntries.map(([store, count]) => (
                <li key={store} style={styles.listItem}>
                  <span>{STORE_LABELS[store] ?? store}</span>
                  <strong>{count}件</strong>
                </li>
              ))}
            </ul>
            <p style={styles.note}>件数は保存操作の回数ではなく、共有側へ未送信のデータ行数です。</p>
          </section>
        )}

        {status.conflictCount > 0 && (
          <section style={{ ...styles.card, ...styles.warningCard }}>
            <h2 style={styles.sectionTitle}>内容の確認が必要です</h2>
            <p style={styles.description}>
              同じデータが別の端末でも変更されています。どちらの内容を残すか確認してください。
            </p>
            <button type="button" onClick={() => navigate("/sync/conflicts")} style={styles.primaryButton}>
              競合を確認する（{status.conflictCount}件）
            </button>
          </section>
        )}

        <section style={styles.card} aria-labelledby="actions-heading">
          <h2 id="actions-heading" style={styles.sectionTitle}>同期操作</h2>
          <div style={styles.actions}>
            <button
              type="button"
              disabled={Boolean(processing) || !display.canSyncNow}
              aria-busy={processing === "sync"}
              onClick={() => void runManualSync()}
              style={styles.primaryButton}
            >
              {processing === "sync" ? "同期中…" : "今すぐ同期"}
            </button>
            <button
              type="button"
              disabled={Boolean(processing) || !display.canFullSync}
              aria-busy={processing === "repair"}
              onClick={() => void runRepair()}
              style={styles.secondaryButton}
            >
              {processing === "repair" ? "確認中…" : "同期状態を修復する"}
            </button>
          </div>
          <p style={styles.note}>
            「同期状態を修復する」は競合を新しく作る操作ではありません。端末と共有側に既に存在する差異を確認し、必要な競合を正常に顕在化させます。
          </p>
        </section>

        {status.lastError && (
          <details style={styles.card}>
            <summary style={styles.summary}>エラーの詳細情報</summary>
            <dl style={styles.definitionList}>
              <Row term="内容" value={status.lastError.message} />
              <Row term="コード" value={status.lastError.code ?? "なし"} />
              <Row term="自動再試行" value={status.lastError.retryable ? "あり" : "なし"} />
            </dl>
          </details>
        )}
      </div>
    </div>
  );
}

function Row({ term, value }: { term: string; value: string }) {
  return (
    <div style={styles.definitionRow}>
      <dt style={styles.term}>{term}</dt>
      <dd style={styles.value}>{value}</dd>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: "100%", background: COLORS.bg },
  header: {
    maxWidth: 680,
    margin: "0 auto",
    minHeight: 56,
    padding: "0 12px",
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  backButton: { width: 44, border: "none", background: "transparent", fontSize: 24 },
  title: { margin: 0, fontSize: 20, color: COLORS.text },
  body: { maxWidth: 680, margin: "0 auto", padding: "0 12px 28px", display: "grid", gap: 12 },
  card: { background: COLORS.surface, borderRadius: 14, padding: 16, border: `1px solid ${COLORS.borderLight}` },
  warningCard: { borderColor: COLORS.warning, background: COLORS.warningBg },
  sectionTitle: { margin: 0, fontSize: 16, color: COLORS.text },
  statusLabel: { marginTop: 12, fontSize: 22, fontWeight: 800, color: COLORS.primaryDark },
  description: { margin: "8px 0 0", color: COLORS.textMuted, lineHeight: 1.7 },
  definitionList: { margin: "14px 0 0", display: "grid", gap: 10 },
  definitionRow: { display: "grid", gridTemplateColumns: "minmax(120px, 1fr) 1.4fr", gap: 12 },
  term: { color: COLORS.textMuted },
  value: { margin: 0, textAlign: "right", color: COLORS.text, overflowWrap: "anywhere" },
  list: { listStyle: "none", margin: "12px 0 0", padding: 0, display: "grid", gap: 8 },
  listItem: { display: "flex", justifyContent: "space-between", gap: 12 },
  note: { margin: "12px 0 0", fontSize: 12, color: COLORS.textMuted, lineHeight: 1.6 },
  actions: { marginTop: 14, display: "grid", gap: 10 },
  primaryButton: { minHeight: 48, border: "none", borderRadius: 10, background: COLORS.primaryDark, color: "white", fontWeight: 800, padding: "10px 16px" },
  secondaryButton: { minHeight: 48, border: `1px solid ${COLORS.primaryDark}`, borderRadius: 10, background: COLORS.surface, color: COLORS.primaryDark, fontWeight: 800, padding: "10px 16px" },
  summary: { minHeight: 44, display: "flex", alignItems: "center", fontWeight: 700, cursor: "pointer" },
};
