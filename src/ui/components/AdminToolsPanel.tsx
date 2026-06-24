import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useSyncStatus } from "../../services/sync/useSyncStatus";
import { COLORS } from "../tokens";
import { showAppConfirm } from "../feedback/feedbackService";

type Operation = "cache" | "full-sync" | null;
type MessageTone = "info" | "success" | "warning" | "danger";

type PanelMessage = {
  tone: MessageTone;
  text: string;
};

const MESSAGE_STYLES: Record<MessageTone, CSSProperties> = {
  info: {
    color: COLORS.primaryDark,
    background: COLORS.primaryLight,
    borderColor: COLORS.primary,
  },
  success: {
    color: COLORS.success,
    background: COLORS.successBg,
    borderColor: COLORS.success,
  },
  warning: {
    color: COLORS.warning,
    background: COLORS.warningBg,
    borderColor: COLORS.warning,
  },
  danger: {
    color: COLORS.danger,
    background: COLORS.dangerBg,
    borderColor: COLORS.danger,
  },
};

function getFullSyncFailureMessage(code: string | null, retryable: boolean): string {
  switch (code) {
    case "OFFLINE":
      return "オフラインのため全件同期を実行できません。通信復帰後に再度お試しください。";
    case "UNAUTHORIZED":
      return "認証に失敗しました。アプリの接続設定を管理者へ確認してください。";
    case "CLIENT_CONFIG_ERROR":
    case "SERVER_CONFIG_ERROR":
      return "同期設定に不備があります。アプリの接続設定を確認してください。";
    case "GROUP_NOT_CONFIGURED":
    case "GROUP_NOT_FOUND":
      return "共有グループを確認できません。グループ設定を確認してください。";
    case "SYNC_BUSY":
      return "別の同期処理を実行中です。少し待ってから再度お試しください。";
    case "RATE_LIMITED":
      return "同期回数の上限に達しています。時間をおいて再度お試しください。";
    case "NETWORK_ERROR":
    case "NETWORK_TIMEOUT":
      return "通信できませんでした。通信状態を確認して再度お試しください。";
    default:
      return retryable
        ? "全件同期を完了できませんでした。時間をおいて再度お試しください。"
        : "全件同期を実行できません。同期設定を確認してください。";
  }
}

export function AdminToolsPanel() {
  const { display, runFullSync } = useSyncStatus();
  const [operation, setOperation] = useState<Operation>(null);
  const [message, setMessage] = useState<PanelMessage | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const isBusy = operation !== null;
  const fullSyncDisabled = isBusy || !display.canFullSync;

  async function clearCache() {
    if (isBusy) return;

    const confirmed = await showAppConfirm({
      title: "キャッシュを削除しますか？",
      message: "アプリの一時データを削除して再読み込みします。保存された記録は削除されません。",
      confirmLabel: "削除して再読み込み",
      cancelLabel: "キャンセル",
    });
    if (!confirmed) return;

    setOperation("cache");
    setMessage({ tone: "info", text: "キャッシュを削除しています。" });

    try {
      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
          await registration.unregister();
        }
      }
      window.location.reload();
    } catch {
      if (!mountedRef.current) return;
      setMessage({
        tone: "danger",
        text: "キャッシュを削除できませんでした。時間をおいて再度お試しください。",
      });
      setOperation(null);
    }
  }

  async function forceFullSync() {
    if (fullSyncDisabled) return;

    const confirmed = await showAppConfirm({
      title: "同期状態を修復しますか？",
      message: "端末に保存済みの未送信データを先に共有し、その後、共有データをすべて確認し直します。端末の内容が自動的に破棄されることはありません。既存の差異が競合として顕在化する場合があります。",
      confirmLabel: "同期状態を修復する",
      cancelLabel: "キャンセル",
    });
    if (!confirmed) return;

    setOperation("full-sync");
    setMessage({ tone: "info", text: "全件同期を実行しています。" });

    try {
      const result = await runFullSync();
      if (!mountedRef.current) return;

      if (!result.success) {
        setMessage({
          tone: result.retryable ? "warning" : "danger",
          text: getFullSyncFailureMessage(result.code, result.retryable),
        });
        return;
      }

      if (result.skipped === "no-group") {
        setMessage({
          tone: "warning",
          text: "共有グループが設定されていないため、全件同期を実行しませんでした。",
        });
        return;
      }

      const detail =
        result.pushed === 0 && result.pulled === 0
          ? "共有データは最新の状態です。"
          : `送信 ${result.pushed}件、受信 ${result.pulled}件を処理しました。`;

      setMessage({ tone: "success", text: `全件同期が完了しました。${detail}` });
    } catch {
      if (!mountedRef.current) return;
      setMessage({
        tone: "danger",
        text: "全件同期を開始できませんでした。時間をおいて再度お試しください。",
      });
    } finally {
      if (mountedRef.current) setOperation(null);
    }
  }

  return (
    <div style={styles.panel}>
      <div style={styles.currentStatus}>
        <span style={styles.currentStatusLabel}>現在の同期状態</span>
        <strong>{display.label}</strong>
      </div>

      <button
        type="button"
        onClick={clearCache}
        disabled={isBusy}
        style={{ ...styles.btn, ...(isBusy ? styles.btnDisabled : null) }}
      >
        {operation === "cache" ? "キャッシュ削除中" : "キャッシュクリア（更新が反映されない時）"}
      </button>

      <button
        type="button"
        onClick={forceFullSync}
        disabled={fullSyncDisabled}
        style={{ ...styles.btn, ...(fullSyncDisabled ? styles.btnDisabled : null) }}
      >
        {operation === "full-sync" ? "全件同期中" : "全データを今すぐ同期"}
      </button>

      <div style={styles.note}>
        全件同期は、通常の自動同期で表示が直らない場合だけ使用してください。
      </div>

      {message && (
        <div
          role={message.tone === "danger" ? "alert" : "status"}
          aria-live={message.tone === "danger" ? "assertive" : "polite"}
          aria-atomic="true"
          style={{ ...styles.message, ...MESSAGE_STYLES[message.tone] }}
        >
          {message.text}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  panel: {
    display: "grid",
    gap: 8,
  },
  currentStatus: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "8px 10px",
    borderRadius: 8,
    background: COLORS.bg,
    color: COLORS.text,
    fontSize: 12,
  },
  currentStatusLabel: {
    color: COLORS.textMuted,
  },
  btn: {
    width: "100%",
    minHeight: 42,
    padding: "10px",
    borderRadius: 8,
    border: `1px solid ${COLORS.border}`,
    background: "#f9f9f9",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 700,
    color: COLORS.textMuted,
  },
  btnDisabled: {
    cursor: "not-allowed",
    opacity: 0.55,
  },
  note: {
    color: COLORS.textSubtle,
    fontSize: 11,
    lineHeight: 1.5,
  },
  message: {
    border: "1px solid",
    borderRadius: 8,
    padding: "9px 10px",
    fontSize: 12,
    lineHeight: 1.5,
    overflowWrap: "anywhere",
  },
};
