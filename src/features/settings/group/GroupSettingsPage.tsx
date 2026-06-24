import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { LocalDb } from "../../../data/local/localDb";
import {
  onDataRefreshRequested,
  type SyncStoreName,
} from "../../../services/sync/syncEvents";
import { COLORS } from "../../../ui/tokens";
import type { User } from "../../../utils/types";

const GROUP_SETTINGS_REFRESH_STORES: readonly SyncStoreName[] = [
  "groups",
  "users",
];

type PanelMessage = {
  tone: "danger" | "info";
  text: string;
};

function includesGroupSettingsRefreshStore(
  stores: readonly SyncStoreName[],
): boolean {
  return stores.some((store) => GROUP_SETTINGS_REFRESH_STORES.includes(store));
}

function normalizeGroupName(value: unknown): string {
  if (typeof value !== "string") return "名称未設定のグループ";
  const trimmed = value.trim();
  return trimmed || "名称未設定のグループ";
}

export default function GroupSettingsPage() {
  const nav = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [groupName, setGroupName] = useState("");
  const [isReordering, setIsReordering] = useState(false);
  const [message, setMessage] = useState<PanelMessage | null>(null);

  const mountedRef = useRef(false);
  const loadRequestIdRef = useRef(0);
  const usersRef = useRef<User[]>([]);
  const reorderInProgressRef = useRef(false);
  const deferredRefreshRef = useRef(false);

  const loadGroupSettingsData = useCallback(async () => {
    const requestId = ++loadRequestIdRef.current;

    try {
      const group = await LocalDb.getCurrentGroup();

      if (!mountedRef.current || requestId !== loadRequestIdRef.current) return;

      if (!group) {
        usersRef.current = [];
        setUsers([]);
        setGroupName("");
        nav("/onboarding", { replace: true });
        return;
      }

      const nextUsers = await LocalDb.listUsers(group.group_id);

      if (!mountedRef.current || requestId !== loadRequestIdRef.current) return;

      usersRef.current = nextUsers;
      setUsers(nextUsers);
      setGroupName(normalizeGroupName(group.group_name));
      setMessage((current) => (current?.tone === "danger" ? null : current));
    } catch {
      if (!mountedRef.current || requestId !== loadRequestIdRef.current) return;
      setMessage({
        tone: "danger",
        text: "グループ情報を読み込めませんでした。時間をおいて再度お試しください。",
      });
    }
  }, [nav]);

  useEffect(() => {
    mountedRef.current = true;

    const timerId = window.setTimeout(() => {
      void loadGroupSettingsData();
    }, 0);

    return () => {
      mountedRef.current = false;
      loadRequestIdRef.current += 1;
      window.clearTimeout(timerId);
    };
  }, [loadGroupSettingsData]);

  useEffect(() => {
    return onDataRefreshRequested((detail) => {
      if (!includesGroupSettingsRefreshStore(detail.stores)) return;

      if (reorderInProgressRef.current) {
        deferredRefreshRef.current = true;
        return;
      }

      void loadGroupSettingsData();
    });
  }, [loadGroupSettingsData]);

  const move = useCallback(
    async (index: number, direction: -1 | 1) => {
      if (reorderInProgressRef.current) return;

      const currentUsers = usersRef.current;
      const destinationIndex = index + direction;
      if (
        index < 0 ||
        destinationIndex < 0 ||
        destinationIndex >= currentUsers.length
      ) {
        return;
      }

      const previousUsers = [...currentUsers];
      const nextUsers = [...currentUsers];
      const target = nextUsers[index];
      const swap = nextUsers[destinationIndex];
      if (!target || !swap) return;

      nextUsers[index] = swap;
      nextUsers[destinationIndex] = target;

      const updates = nextUsers.map((user, orderIndex) => ({
        uuid: user.uuid,
        display_order: orderIndex,
      }));

      reorderInProgressRef.current = true;
      setIsReordering(true);
      setMessage(null);
      loadRequestIdRef.current += 1;
      usersRef.current = nextUsers;
      setUsers(nextUsers);

      try {
        await LocalDb.updateUserOrder(updates);
      } catch {
        usersRef.current = previousUsers;
        if (mountedRef.current) {
          setUsers(previousUsers);
          setMessage({
            tone: "danger",
            text: "並び順を保存できませんでした。元の順番に戻しました。",
          });
        }
      } finally {
        reorderInProgressRef.current = false;
        if (mountedRef.current) setIsReordering(false);

        const shouldRefresh = deferredRefreshRef.current;
        deferredRefreshRef.current = false;
        if (shouldRefresh && mountedRef.current) {
          void loadGroupSettingsData();
        }
      }
    },
    [loadGroupSettingsData],
  );

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <button
          type="button"
          onClick={() => nav(-1)}
          aria-label="前の画面へ戻る"
          style={styles.backButton}
        >
          ←
        </button>
        <span style={styles.headerTitle}>グループ設定</span>
      </header>

      <main style={styles.main}>
        {message && (
          <div
            role={message.tone === "danger" ? "alert" : "status"}
            aria-live={message.tone === "danger" ? "assertive" : "polite"}
            aria-atomic="true"
            style={{
              ...styles.message,
              ...(message.tone === "danger"
                ? styles.messageDanger
                : styles.messageInfo),
            }}
          >
            {message.text}
          </div>
        )}

        <section style={styles.card}>
          <h2 style={styles.sectionLabel}>グループ名</h2>
          <div style={styles.groupName}>{groupName || "読み込み中"}</div>
        </section>

        <section style={styles.card} aria-busy={isReordering}>
          <div style={styles.sectionHeader}>
            <div>
              <h2 style={styles.sectionLabel}>メンバー（並び替え可）</h2>
              {isReordering && (
                <div role="status" aria-live="polite" style={styles.savingText}>
                  並び順を保存中です
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => nav("/settings/member/edit")}
              disabled={isReordering}
              style={{
                ...styles.addButton,
                ...(isReordering ? styles.disabledButton : null),
              }}
            >
              ＋ メンバー追加
            </button>
          </div>

          {users.length === 0 ? (
            <div style={styles.emptyText}>メンバーが登録されていません。</div>
          ) : (
            <div style={styles.userList}>
              {users.map((user, index) => {
                const canMoveUp = index > 0 && !isReordering;
                const canMoveDown = index < users.length - 1 && !isReordering;

                return (
                  <div key={user.uuid} style={styles.userRow}>
                    <div style={styles.userSummary}>
                      <div style={styles.arrowColumn}>
                        <button
                          type="button"
                          onClick={() => void move(index, -1)}
                          disabled={!canMoveUp}
                          aria-label={`${user.name}を上へ移動`}
                          style={{
                            ...styles.arrowButton,
                            ...(!canMoveUp ? styles.arrowButtonDisabled : null),
                          }}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => void move(index, 1)}
                          disabled={!canMoveDown}
                          aria-label={`${user.name}を下へ移動`}
                          style={{
                            ...styles.arrowButton,
                            ...(!canMoveDown
                              ? styles.arrowButtonDisabled
                              : null),
                          }}
                        >
                          ↓
                        </button>
                      </div>

                      <div style={styles.userText}>
                        <div style={styles.userName}>{user.name}</div>
                        <div style={styles.birthDate}>
                          {user.birth_date
                            ? new Date(user.birth_date).toLocaleDateString(
                                "ja-JP",
                              )
                            : "生年月日未設定"}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        nav(`/settings/member/edit?id=${user.uuid}`)
                      }
                      disabled={isReordering}
                      style={{
                        ...styles.editButton,
                        ...(isReordering ? styles.disabledButton : null),
                      }}
                    >
                      編集
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: "100dvh",
    background: COLORS.bg,
  },
  header: {
    minHeight: 56,
    background: COLORS.primary,
    display: "flex",
    alignItems: "center",
    padding: "0 8px",
    color: COLORS.surface,
  },
  backButton: {
    width: 40,
    minHeight: 40,
    border: "none",
    background: "transparent",
    color: COLORS.surface,
    fontSize: 20,
    cursor: "pointer",
  },
  headerTitle: {
    fontWeight: 700,
    fontSize: 16,
  },
  main: {
    padding: 16,
    display: "grid",
    gap: 16,
  },
  message: {
    borderRadius: 10,
    border: "1px solid",
    padding: "10px 12px",
    fontSize: 13,
    lineHeight: 1.5,
  },
  messageDanger: {
    color: COLORS.danger,
    background: COLORS.dangerBg,
    borderColor: COLORS.danger,
  },
  messageInfo: {
    color: COLORS.primaryDark,
    background: COLORS.primaryLight,
    borderColor: COLORS.primary,
  },
  card: {
    background: COLORS.surface,
    padding: 16,
    borderRadius: 12,
  },
  sectionLabel: {
    margin: 0,
    fontSize: 13,
    color: COLORS.textSubtle,
  },
  groupName: {
    marginTop: 8,
    fontSize: 16,
    fontWeight: 700,
    color: COLORS.text,
    overflowWrap: "anywhere",
  },
  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  savingText: {
    marginTop: 4,
    fontSize: 12,
    color: COLORS.primaryDark,
  },
  addButton: {
    minHeight: 40,
    border: "none",
    background: COLORS.primaryLight,
    color: COLORS.primaryDark,
    padding: "6px 12px",
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  disabledButton: {
    cursor: "not-allowed",
    opacity: 0.5,
  },
  emptyText: {
    padding: "16px 0 4px",
    color: COLORS.textMuted,
    fontSize: 14,
    textAlign: "center",
  },
  userList: {
    display: "grid",
    gap: 8,
  },
  userRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    border: `1px solid ${COLORS.borderLight}`,
    padding: 10,
    borderRadius: 8,
  },
  userSummary: {
    minWidth: 0,
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  arrowColumn: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  arrowButton: {
    width: 36,
    minHeight: 32,
    border: "none",
    borderRadius: 6,
    background: COLORS.primaryLight,
    color: COLORS.primaryDark,
    fontWeight: 700,
    cursor: "pointer",
  },
  arrowButtonDisabled: {
    background: "transparent",
    color: COLORS.border,
    cursor: "not-allowed",
  },
  userText: {
    minWidth: 0,
  },
  userName: {
    color: COLORS.text,
    fontWeight: 700,
    overflowWrap: "anywhere",
  },
  birthDate: {
    marginTop: 2,
    fontSize: 12,
    color: COLORS.textMuted,
  },
  editButton: {
    minWidth: 64,
    minHeight: 40,
    border: `1px solid ${COLORS.border}`,
    background: COLORS.surface,
    color: COLORS.text,
    padding: "6px 12px",
    borderRadius: 8,
    fontSize: 12,
    cursor: "pointer",
  },
};
