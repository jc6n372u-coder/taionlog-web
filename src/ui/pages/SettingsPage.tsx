import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useNavigate } from "react-router-dom";
import { LocalDb } from "../../data/local/localDb";
import {
  onDataRefreshRequested,
  type SyncStoreName,
} from "../../services/sync/syncEvents";
import type { SettingsRow } from "../../utils/types";
import { AdminToolsPanel } from "../components/AdminToolsPanel";
import { AppFooterVersion } from "../components/AppFooterVersion";
import { COLORS } from "../tokens";
import { showAppAlert } from "../feedback/feedbackService";

const SETTINGS_REFRESH_STORES = new Set<SyncStoreName>(["groups", "settings"]);

type GroupSummary = {
  group_id: string;
  group_name: string;
};

type SettingMessage = {
  tone: "danger";
  text: string;
};

function includesSettingsRefreshStore(stores: readonly SyncStoreName[]): boolean {
  return stores.some((store) => SETTINGS_REFRESH_STORES.has(store));
}

function toGroupSummary(value: unknown): GroupSummary | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as {
    group_id?: unknown;
    group_name?: unknown;
  };
  const groupId = String(candidate.group_id ?? "").trim();
  if (!groupId) return null;

  const groupName = String(candidate.group_name ?? "").trim();
  return {
    group_id: groupId,
    group_name: groupName || "名称未設定のグループ",
  };
}

// 通知許可
async function requestNotification() {
  if (!("Notification" in window)) {
    await showAppAlert("通知を利用できません", "このブラウザーは通知に対応していません。");
    return;
  }
  const permission = await Notification.requestPermission();
  await showAppAlert("通知権限", permission === "granted" ? "通知が許可されました。" : "通知が許可されませんでした。");
}

export default function SettingsPage() {
  const nav = useNavigate();
  const [group, setGroup] = useState<GroupSummary | null>(null);
  const [settings, setSettings] = useState<SettingsRow | null>(null);
  const [isSavingSetting, setIsSavingSetting] = useState(false);
  const [settingMessage, setSettingMessage] = useState<SettingMessage | null>(null);

  const mountedRef = useRef(true);
  const loadRequestIdRef = useRef(0);
  const settingsRef = useRef<SettingsRow | null>(null);
  const settingSaveInProgressRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      loadRequestIdRef.current += 1;
    };
  }, []);

  const loadData = useCallback(async () => {
    const requestId = ++loadRequestIdRef.current;
    const currentGroup = toGroupSummary(await LocalDb.getCurrentGroup());

    if (!currentGroup) {
      if (mountedRef.current && requestId === loadRequestIdRef.current) {
        setGroup(null);
        settingsRef.current = null;
        setSettings(null);
        nav("/onboarding", { replace: true });
      }
      return;
    }

    const nextSettings = await LocalDb.ensureSettings(currentGroup.group_id);

    if (!mountedRef.current || requestId !== loadRequestIdRef.current) return;

    setGroup(currentGroup);
    settingsRef.current = nextSettings;
    setSettings(nextSettings);
    setSettingMessage(null);
  }, [nav]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadData();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [loadData]);

  useEffect(() => {
    return onDataRefreshRequested(({ stores }) => {
      if (!includesSettingsRefreshStore(stores)) return;
      void loadData();
    });
  }, [loadData]);

  const toggleShowTemp = useCallback(async () => {
    const currentSettings = settingsRef.current;
    if (!currentSettings || settingSaveInProgressRef.current) return;

    settingSaveInProgressRef.current = true;
    setIsSavingSetting(true);
    setSettingMessage(null);

    // 進行中の古い読込結果が、このローカル変更を上書きしないよう無効化する。
    loadRequestIdRef.current += 1;

    const next: SettingsRow = {
      ...currentSettings,
      show_temp_on_home: !currentSettings.show_temp_on_home,
      updated_at: new Date().toISOString(),
    };

    try {
      await LocalDb.upsertSettings(next);
      if (!mountedRef.current) return;

      settingsRef.current = next;
      setSettings(next);
    } catch {
      if (!mountedRef.current) return;
      setSettingMessage({
        tone: "danger",
        text: "表示設定を保存できませんでした。時間をおいて再度お試しください。",
      });
    } finally {
      settingSaveInProgressRef.current = false;
      if (mountedRef.current) setIsSavingSetting(false);
    }
  }, []);

  const tempSwitchDisabled = !settings || isSavingSetting;

  return (
    <div style={styles.page}>
      <header style={styles.appBar}>
        <button type="button" onClick={() => nav(-1)} style={styles.iconBtn}>
          ←
        </button>
        <span style={styles.appBarTitle}>設定</span>
        <div style={styles.appBarSpacer} />
      </header>

      <main style={styles.body}>
        <section style={styles.card}>
          <h3 style={styles.h3}>グループ設定（共有）</h3>
          <button type="button" onClick={() => nav("/settings/group")} style={styles.menuItem}>
            <div>
              <span style={styles.menuTitle}>{group?.group_name ?? "..."}</span>
              <div style={styles.menuDescription}>メンバー追加・編集・並び替え</div>
            </div>
            <span style={styles.chevron}>›</span>
          </button>

          <button
            type="button"
            onClick={() => nav("/settings/medications")}
            style={styles.menuItem}
          >
            <div>
              <span style={styles.menuTitle}>お薬の管理</span>
              <div style={styles.menuDescription}>よく使う薬の登録・削除</div>
            </div>
            <span style={styles.chevron}>›</span>
          </button>

          <button
            type="button"
            onClick={() => nav("/settings/symptoms")}
            style={styles.menuItem}
          >
            <div>
              <span style={styles.menuTitle}>症状タグの管理</span>
              <div style={styles.menuDescription}>記録時の症状ボタンを編集</div>
            </div>
            <span style={styles.chevron}>›</span>
          </button>

          <button type="button" onClick={() => nav("/settings/ai")} style={styles.menuItem}>
            <div>
              <span style={styles.menuTitle}>AI機能の設定</span>
              <div style={styles.menuDescription}>APIキー・モデルの変更</div>
            </div>
            <span style={styles.chevron}>›</span>
          </button>

          <button type="button" onClick={() => nav("/invite")} style={styles.menuItem}>
            <span>参加コード確認</span>
            <span style={styles.chevron}>›</span>
          </button>
        </section>

        <section style={styles.card}>
          <h3 style={styles.h3}>表示設定（共有）</h3>
          <div style={styles.switchRow}>
            <div style={styles.switchText}>
              <div style={styles.switchTitle}>ホームで体温を表示</div>
              <div style={styles.menuDescription}>OFFにすると「**.*℃」になります</div>
              <div style={styles.sharedNote}>この設定は共有グループの端末へ同期されます</div>
            </div>
            <label
              style={{
                ...styles.switch,
                ...(tempSwitchDisabled ? styles.switchDisabled : null),
              }}
            >
              <input
                type="checkbox"
                checked={Boolean(settings?.show_temp_on_home)}
                disabled={tempSwitchDisabled}
                onChange={() => void toggleShowTemp()}
                aria-label="ホームで体温を表示"
                style={styles.hiddenInput}
              />
              <span
                aria-hidden="true"
                style={{
                  ...styles.switchTrack,
                  background: settings?.show_temp_on_home
                    ? COLORS.primary
                    : COLORS.border,
                }}
              >
                <span
                  style={{
                    ...styles.switchKnob,
                    transform: settings?.show_temp_on_home
                      ? "translateX(22px)"
                      : "translateX(2px)",
                  }}
                />
              </span>
            </label>
          </div>

          {settingMessage && (
            <div
              role="alert"
              aria-live="assertive"
              aria-atomic="true"
              style={styles.settingError}
            >
              {settingMessage.text}
            </div>
          )}
        </section>

        <section style={styles.card}>
          <h3 style={styles.h3}>端末設定（この端末のみ）</h3>
          <button
            type="button"
            onClick={() => void requestNotification()}
            style={{ ...styles.menuItem, borderBottom: "none" }}
          >
            <span>通知の許可設定</span>
            <span style={styles.chevron}>›</span>
          </button>
        </section>

        <section style={styles.card}>
          <h3 style={styles.h3}>管理メニュー</h3>
          <AdminToolsPanel />
        </section>

        <AppFooterVersion />
      </main>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: "100dvh",
    background: COLORS.bg,
  },
  appBar: {
    height: 56,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 8px",
    background: COLORS.primary,
    color: COLORS.surface,
  },
  appBarTitle: {
    fontWeight: 700,
    fontSize: 16,
  },
  appBarSpacer: {
    width: 40,
  },
  iconBtn: {
    width: 40,
    height: 40,
    border: "none",
    background: "transparent",
    color: COLORS.surface,
    fontSize: 20,
    cursor: "pointer",
  },
  body: {
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  card: {
    background: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
  },
  h3: {
    margin: "0 0 12px 0",
    fontSize: 13,
    color: COLORS.textMuted,
    fontWeight: 700,
  },
  menuItem: {
    width: "100%",
    minHeight: 44,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    background: "transparent",
    border: "none",
    padding: "12px 0",
    fontSize: 15,
    color: COLORS.text,
    cursor: "pointer",
    borderBottom: `1px solid ${COLORS.borderLight}`,
    textAlign: "left",
  },
  menuTitle: {
    fontWeight: 700,
  },
  menuDescription: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 1.4,
    color: COLORS.textSubtle,
  },
  chevron: {
    color: COLORS.border,
    flexShrink: 0,
  },
  switchRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
  },
  switchText: {
    minWidth: 0,
  },
  switchTitle: {
    fontWeight: 700,
    fontSize: 14,
    color: COLORS.text,
  },
  sharedNote: {
    marginTop: 4,
    fontSize: 11,
    lineHeight: 1.4,
    color: COLORS.primaryDark,
  },
  switch: {
    position: "relative",
    cursor: "pointer",
    width: 48,
    height: 26,
    flexShrink: 0,
  },
  switchDisabled: {
    cursor: "not-allowed",
    opacity: 0.55,
  },
  hiddenInput: {
    position: "absolute",
    opacity: 0,
    pointerEvents: "none",
  },
  switchTrack: {
    display: "block",
    position: "relative",
    width: "100%",
    height: "100%",
    borderRadius: 13,
    transition: "background 0.2s",
  },
  switchKnob: {
    display: "block",
    width: 22,
    height: 22,
    background: COLORS.surface,
    borderRadius: "50%",
    position: "absolute",
    top: 2,
    left: 0,
    transition: "transform 0.2s",
    boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
  },
  settingError: {
    marginTop: 12,
    border: `1px solid ${COLORS.danger}`,
    borderRadius: 8,
    padding: "9px 10px",
    background: COLORS.dangerBg,
    color: COLORS.danger,
    fontSize: 12,
    lineHeight: 1.5,
  },
};
