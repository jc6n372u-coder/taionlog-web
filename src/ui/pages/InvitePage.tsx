import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LocalDb } from "../../data/local/localDb";
import { ApiClient } from "../../data/remote/apiClient";
import {
  onDataRefreshRequested,
  type SyncStoreName,
} from "../../services/sync/syncEvents";
import { COLORS } from "../tokens";

const INVITE_REFRESH_STORES: readonly SyncStoreName[] = ["groups"];

type JsonObject = Record<string, unknown>;
type MessageTone = "info" | "success" | "warning" | "danger";

type PageMessage = {
  tone: MessageTone;
  text: string;
};

type InviteSnapshot = {
  groupId: string;
  groupName: string;
  joinCode: string;
  expiresAt: string;
  isExpired: boolean;
  source: "local" | "server";
};

type ErrorWithMetadata = {
  code?: unknown;
  retryable?: unknown;
};

const MESSAGE_STYLES: Record<
  MessageTone,
  { background: string; border: string; color: string }
> = {
  info: {
    background: COLORS.primaryLight,
    border: COLORS.primary,
    color: COLORS.primaryDark,
  },
  success: {
    background: COLORS.successBg,
    border: COLORS.success,
    color: COLORS.success,
  },
  warning: {
    background: COLORS.warningBg,
    border: COLORS.warning,
    color: COLORS.warning,
  },
  danger: {
    background: COLORS.dangerBg,
    border: COLORS.danger,
    color: COLORS.danger,
  },
};

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function includesInviteRefreshStore(stores: readonly SyncStoreName[]): boolean {
  return stores.some((store) => INVITE_REFRESH_STORES.includes(store));
}

function createSnapshot(
  value: unknown,
  fallbackCode: string,
  source: InviteSnapshot["source"]
): InviteSnapshot | null {
  if (!isJsonObject(value)) return null;

  const groupId = toText(value.group_id || value.uuid);
  if (!groupId) return null;

  const groupName = toText(value.group_name || value.name) || "家族";
  const joinCode = (toText(value.join_code) || fallbackCode).toUpperCase();
  const expiresAt = toText(value.join_code_expires_at || value.expires_at);
  const expiresMs = expiresAt ? new Date(expiresAt).getTime() : Number.NaN;

  return {
    groupId,
    groupName,
    joinCode,
    expiresAt,
    isExpired: !Number.isNaN(expiresMs) && expiresMs < Date.now(),
    source,
  };
}

function formatExpiry(snapshot: InviteSnapshot | null): string {
  if (!snapshot?.expiresAt) return "有効期限を確認できません";

  const parsed = new Date(snapshot.expiresAt);
  if (Number.isNaN(parsed.getTime())) return "有効期限を確認できません";

  const formatted = parsed.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  return snapshot.isExpired ? `有効期限切れ: ${formatted}` : `有効期限: ${formatted}`;
}

function getSafeRefreshFailureMessage(
  error: unknown,
  hasLocalCode: boolean
): PageMessage {
  const metadata = error && typeof error === "object" ? (error as ErrorWithMetadata) : null;
  const code = typeof metadata?.code === "string" ? metadata.code : "";

  if (code === "UNAUTHORIZED") {
    return {
      tone: "danger",
      text: "認証に失敗しました。アプリの接続設定を管理者へ確認してください。",
    };
  }

  if (code === "CLIENT_CONFIG_ERROR" || code === "SERVER_CONFIG_ERROR") {
    return {
      tone: "danger",
      text: "接続設定が未完了です。アプリの設定を管理者へ確認してください。",
    };
  }

  if (code === "GROUP_NOT_FOUND") {
    return {
      tone: "danger",
      text: "共有グループを確認できませんでした。グループ設定を確認してください。",
    };
  }

  if (code === "NETWORK_ERROR" || code === "NETWORK_TIMEOUT") {
    return {
      tone: hasLocalCode ? "warning" : "danger",
      text: hasLocalCode
        ? "最新情報を確認できませんでした。端末に保存されている参加コードを表示しています。"
        : "通信できませんでした。通信状態を確認して再度お試しください。",
    };
  }

  return {
    tone: hasLocalCode ? "warning" : "danger",
    text: hasLocalCode
      ? "最新情報を確認できませんでした。端末に保存されている参加コードを表示しています。"
      : "参加コードを取得できませんでした。時間をおいて再度お試しください。",
  };
}

function legacyCopyText(text: string): boolean {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();

  try {
    return document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
  }
}

export default function InvitePage() {
  const nav = useNavigate();
  const [snapshot, setSnapshot] = useState<InviteSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [isCopying, setIsCopying] = useState(false);
  const [message, setMessage] = useState<PageMessage | null>(null);

  const mountedRef = useRef(false);
  const loadRequestIdRef = useRef(0);
  const refreshInProgressRef = useRef(false);
  const deferredRefreshRef = useRef(false);
  const snapshotRef = useRef<InviteSnapshot | null>(null);

  const applySnapshot = useCallback((next: InviteSnapshot | null) => {
    snapshotRef.current = next;
    setSnapshot(next);
  }, []);

  const loadLocalInviteData = useCallback(async (): Promise<InviteSnapshot | null> => {
    const requestId = ++loadRequestIdRef.current;

    try {
      const [group, fallbackCode] = await Promise.all([
        LocalDb.getCurrentGroup(),
        LocalDb.getMeta("invite_code"),
      ]);

      if (!mountedRef.current || requestId !== loadRequestIdRef.current) {
        return null;
      }

      if (!group) {
        applySnapshot(null);
        nav("/onboarding", { replace: true });
        return null;
      }

      const next = createSnapshot(group, toText(fallbackCode), "local");
      applySnapshot(next);
      return next;
    } catch {
      if (mountedRef.current && requestId === loadRequestIdRef.current) {
        setMessage({
          tone: "danger",
          text: "参加コードを読み込めませんでした。時間をおいて再度お試しください。",
        });
      }
      return null;
    } finally {
      if (mountedRef.current && requestId === loadRequestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [applySnapshot, nav]);

  const refreshFromServer = useCallback(
    async (showSuccessMessage: boolean): Promise<void> => {
      if (refreshInProgressRef.current) {
        deferredRefreshRef.current = true;
        return;
      }

      refreshInProgressRef.current = true;
      if (mountedRef.current) {
        setIsRefreshing(true);
        setMessage(null);
      }

      let shouldRunDeferredRefresh = false;

      try {
        const localGroup = await LocalDb.getCurrentGroup();
        if (!localGroup) {
          if (mountedRef.current) {
            applySnapshot(null);
            nav("/onboarding", { replace: true });
          }
          return;
        }

        const groupId = toText(localGroup.group_id || localGroup.uuid);
        if (!groupId) {
          throw Object.assign(new Error("Group ID is missing"), {
            code: "GROUP_NOT_FOUND",
            retryable: false,
          });
        }

        const response = await ApiClient.getGroupInfo(groupId);
        const remoteData = response.data;
        const localCode = snapshotRef.current?.joinCode || toText(await LocalDb.getMeta("invite_code"));
        const next = createSnapshot(remoteData, localCode, "server");

        if (!next) {
          throw Object.assign(new Error("Invalid group response"), {
            code: "INVALID_RESPONSE",
            retryable: true,
          });
        }

        const persistedRow: JsonObject = {
          ...remoteData,
          uuid: next.groupId,
          name: next.groupName,
          join_code: next.joinCode,
          join_code_expires_at: next.expiresAt,
        };

        await Promise.all([
          LocalDb.upsertAll("groups", [persistedRow], "remote"),
          LocalDb.setCurrentGroup(next.groupId, next.groupName),
          next.joinCode ? LocalDb.setMeta("invite_code", next.joinCode) : Promise.resolve(),
        ]);

        if (!mountedRef.current) return;

        ++loadRequestIdRef.current;
        applySnapshot(next);
        setIsLoading(false);

        if (showSuccessMessage) {
          setMessage({
            tone: "success",
            text: "参加コードの最新情報を取得しました。",
          });
        }
      } catch (error) {
        if (mountedRef.current) {
          setMessage(
            getSafeRefreshFailureMessage(error, Boolean(snapshotRef.current?.joinCode))
          );
        }
      } finally {
        refreshInProgressRef.current = false;
        shouldRunDeferredRefresh = deferredRefreshRef.current;
        deferredRefreshRef.current = false;

        if (mountedRef.current) {
          setIsRefreshing(false);
        }
      }

      if (shouldRunDeferredRefresh && mountedRef.current) {
        await loadLocalInviteData();
      }
    },
    [applySnapshot, loadLocalInviteData, nav]
  );

  useEffect(() => {
    mountedRef.current = true;

    const timerId = window.setTimeout(() => {
      void (async () => {
        await loadLocalInviteData();
        if (navigator.onLine) {
          await refreshFromServer(false);
        }
      })();
    }, 0);

    return () => {
      mountedRef.current = false;
      loadRequestIdRef.current += 1;
      window.clearTimeout(timerId);
    };
  }, [loadLocalInviteData, refreshFromServer]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    return onDataRefreshRequested((detail) => {
      if (!includesInviteRefreshStore(detail.stores)) return;

      if (refreshInProgressRef.current) {
        deferredRefreshRef.current = true;
        return;
      }

      void loadLocalInviteData();
    });
  }, [loadLocalInviteData]);

  const handleCopy = useCallback(async () => {
    const code = snapshotRef.current?.joinCode || "";
    if (!code || isCopying) return;

    setIsCopying(true);
    setMessage(null);

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
      } else if (!legacyCopyText(code)) {
        throw new Error("Copy failed");
      }

      if (mountedRef.current) {
        setMessage({ tone: "success", text: "参加コードをコピーしました。" });
      }
    } catch {
      if (mountedRef.current) {
        setMessage({
          tone: "warning",
          text: "自動でコピーできませんでした。参加コードを長押ししてコピーしてください。",
        });
      }
    } finally {
      if (mountedRef.current) {
        setIsCopying(false);
      }
    }
  }, [isCopying]);

  const code = snapshot?.joinCode || "";
  const expiryText = formatExpiry(snapshot);
  const messageStyle = message ? MESSAGE_STYLES[message.tone] : null;
  const refreshDisabled = isLoading || isRefreshing || !isOnline;
  const copyDisabled = !code || isCopying;

  return (
    <div style={styles.shell}>
      <header style={styles.header}>
        <button
          type="button"
          onClick={() => nav(-1)}
          style={styles.backButton}
          aria-label="前の画面へ戻る"
        >
          ←
        </button>
        <span style={styles.headerTitle}>参加コード</span>
      </header>

      <main style={styles.main} aria-busy={isLoading || isRefreshing}>
        <section style={styles.groupInfo} aria-label="共有グループ情報">
          <span style={styles.groupInfoLabel}>共有グループ</span>
          <strong style={styles.groupInfoName}>
            {snapshot?.groupName || (isLoading ? "読み込み中" : "未設定")}
          </strong>
        </section>

        <button
          type="button"
          onClick={() => void handleCopy()}
          style={{
            ...styles.codeCard,
            ...(copyDisabled ? styles.buttonDisabled : null),
          }}
          disabled={copyDisabled}
          aria-label={code ? `参加コード ${code} をコピー` : "参加コードはまだ取得できていません"}
        >
          <span style={styles.codeCaption}>
            {isLoading && !code ? "参加コードを読み込んでいます" : "家族の参加コード"}
          </span>
          <span style={styles.codeValue}>{code || "取得できていません"}</span>
          <span
            style={{
              ...styles.expiry,
              ...(snapshot?.isExpired ? styles.expiredText : null),
            }}
          >
            {expiryText}
          </span>
          <span style={styles.copyHint}>
            {isCopying ? "コピー中" : code ? "タップしてコピー" : "最新情報を取得してください"}
          </span>
        </button>

        <button
          type="button"
          onClick={() => void refreshFromServer(true)}
          style={{
            ...styles.refreshButton,
            ...(refreshDisabled ? styles.buttonDisabled : null),
          }}
          disabled={refreshDisabled}
        >
          {isRefreshing ? "最新情報を取得中" : "最新情報を取得"}
        </button>

        {!isOnline && (
          <div style={styles.offlineNote} role="status" aria-live="polite">
            オフラインです。通信復帰後に最新情報を取得できます。
          </div>
        )}

        {message && messageStyle && (
          <div
            style={{
              ...styles.message,
              background: messageStyle.background,
              borderColor: messageStyle.border,
              color: messageStyle.color,
            }}
            role={message.tone === "danger" ? "alert" : "status"}
            aria-live={message.tone === "danger" ? "assertive" : "polite"}
            aria-atomic="true"
          >
            {message.text}
          </div>
        )}

        <div style={styles.description}>
          このコードを家族の端末に入力すると、同じグループに参加してデータを共有できます。
        </div>

        <div style={styles.note}>
          参加コードの再発行機能はありません。有効期限が切れている場合は、アプリ管理者へ確認してください。
        </div>
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  shell: {
    width: "100%",
    maxWidth: "100vw",
    minWidth: 0,
    minHeight: "100dvh",
    overflowX: "hidden",
    boxSizing: "border-box",
    background: COLORS.bg,
  },
  header: {
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    height: 56,
    display: "flex",
    alignItems: "center",
    padding: "0 8px",
    overflow: "hidden",
    boxSizing: "border-box",
    background: COLORS.primary,
    color: COLORS.surface,
  },
  backButton: {
    flex: "0 0 44px",
    width: 44,
    minHeight: 44,
    border: "none",
    background: "transparent",
    color: COLORS.surface,
    fontSize: 20,
    cursor: "pointer",
  },
  headerTitle: {
    minWidth: 0,
    overflowWrap: "anywhere",
    fontWeight: 800,
    fontSize: 16,
  },
  main: {
    width: "100%",
    maxWidth: 520,
    minWidth: 0,
    margin: "0 auto",
    padding: "clamp(16px, 5vw, 24px)",
    overflowX: "hidden",
    boxSizing: "border-box",
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr)",
    gap: 16,
  },
  groupInfo: {
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    padding: "12px 14px",
    overflow: "hidden",
    boxSizing: "border-box",
    borderRadius: 12,
    background: COLORS.surface,
    border: `1px solid ${COLORS.borderLight}`,
  },
  groupInfoLabel: {
    flex: "0 0 auto",
    minWidth: 0,
    fontSize: 12,
    color: COLORS.textMuted,
  },
  groupInfoName: {
    flex: "1 1 160px",
    minWidth: 0,
    maxWidth: "100%",
    fontSize: 14,
    color: COLORS.text,
    overflowWrap: "anywhere",
    wordBreak: "break-word",
    textAlign: "right",
  },
  codeCard: {
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    minHeight: 210,
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr)",
    placeItems: "center",
    alignContent: "center",
    gap: 10,
    padding: "clamp(20px, 6vw, 28px) clamp(14px, 5vw, 24px)",
    overflow: "hidden",
    boxSizing: "border-box",
    borderRadius: 16,
    border: `1px solid ${COLORS.borderLight}`,
    background: COLORS.surface,
    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
    cursor: "pointer",
  },
  codeCaption: {
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    fontSize: 14,
    color: COLORS.textMuted,
    overflowWrap: "anywhere",
    textAlign: "center",
  },
  codeValue: {
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    fontSize: "clamp(20px, 7.6vw, 32px)",
    fontWeight: 900,
    lineHeight: 1.2,
    color: COLORS.text,
    letterSpacing: "clamp(0.25px, 0.45vw, 2px)",
    overflowWrap: "anywhere",
    wordBreak: "break-all",
    textAlign: "center",
  },
  expiry: {
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    fontSize: 12,
    color: COLORS.textSubtle,
    overflowWrap: "anywhere",
    textAlign: "center",
  },
  expiredText: {
    color: COLORS.danger,
    fontWeight: 800,
  },
  copyHint: {
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    fontSize: 12,
    color: COLORS.primaryDark,
    fontWeight: 800,
    overflowWrap: "anywhere",
    textAlign: "center",
  },
  refreshButton: {
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    minHeight: 44,
    padding: "10px 12px",
    overflow: "hidden",
    boxSizing: "border-box",
    borderRadius: 12,
    border: `1px solid ${COLORS.primary}`,
    background: COLORS.primaryLight,
    color: COLORS.primaryDark,
    fontSize: 14,
    fontWeight: 800,
    overflowWrap: "anywhere",
    cursor: "pointer",
  },
  buttonDisabled: {
    opacity: 0.55,
    cursor: "not-allowed",
  },
  offlineNote: {
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    padding: "10px 12px",
    overflowWrap: "anywhere",
    boxSizing: "border-box",
    borderRadius: 10,
    background: COLORS.warningBg,
    color: COLORS.warning,
    fontSize: 12,
    lineHeight: 1.6,
  },
  message: {
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    padding: "11px 12px",
    overflowWrap: "anywhere",
    boxSizing: "border-box",
    border: "1px solid",
    borderRadius: 10,
    fontSize: 13,
    lineHeight: 1.6,
  },
  description: {
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    boxSizing: "border-box",
    fontSize: 13,
    color: COLORS.textMuted,
    lineHeight: 1.7,
    overflowWrap: "anywhere",
    wordBreak: "break-word",
    textAlign: "center",
  },
  note: {
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    padding: "10px 12px",
    overflowWrap: "anywhere",
    wordBreak: "break-word",
    boxSizing: "border-box",
    borderRadius: 10,
    background: COLORS.surface,
    border: `1px solid ${COLORS.borderLight}`,
    fontSize: 12,
    color: COLORS.textMuted,
    lineHeight: 1.6,
  },
};
