import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { LocalDb } from "../../data/local/localDb";
import { onDataRefreshRequested, type SyncStoreName } from "../../services/sync/syncEvents";
import type { RecordRow, SettingsRow, User } from "../../utils/types";
import { showAppConfirm } from "../feedback/feedbackService";
import { COLORS } from "../tokens";

const HOME_REFRESH_STORES = new Set<SyncStoreName>(["groups", "users", "records", "settings"]);
const dateFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  month: "numeric",
  day: "numeric",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function includesHomeRefreshStore(stores: readonly SyncStoreName[]): boolean {
  return stores.some((store) => HOME_REFRESH_STORES.has(store));
}

export default function HomePage() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [settings, setSettings] = useState<SettingsRow | null>(null);
  const [isAiReady, setIsAiReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);
  const loadRequestIdRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadData = useCallback(async () => {
    const requestId = ++loadRequestIdRef.current;
    const group = await LocalDb.getCurrentGroup();
    if (!group) {
      if (mountedRef.current) navigate("/onboarding", { replace: true });
      return;
    }

    const [nextSettings, nextUsers, aiSettings] = await Promise.all([
      LocalDb.ensureSettings(group.group_id),
      LocalDb.listUsers(group.group_id),
      LocalDb.getAiSettings(),
    ]);
    const latestRecords = await Promise.all(
      nextUsers.map(async (user) => (await LocalDb.listRecords(user.uuid))[0] ?? null),
    );
    if (!mountedRef.current || requestId !== loadRequestIdRef.current) return;
    setSettings(nextSettings);
    setUsers(nextUsers);
    setRecords(latestRecords.filter((record): record is RecordRow => record !== null));
    setIsAiReady(Boolean(aiSettings?.geminiApiKey || aiSettings?.groqApiKey));
    setLoading(false);
  }, [navigate]);

  useEffect(() => {
    queueMicrotask(() => void loadData());
  }, [loadData]);

  useEffect(() => {
    return onDataRefreshRequested(({ stores }) => {
      if (includesHomeRefreshStore(stores)) void loadData();
    });
  }, [loadData]);

  const handleSupportClick = async () => {
    if (isAiReady) {
      navigate("/ai-support");
      return;
    }
    const move = await showAppConfirm({
      title: "AIサポートの設定が必要です",
      message: "AIサポート機能を使うにはAPIキーを設定してください。設定画面へ移動しますか？",
      confirmLabel: "設定画面へ移動",
      cancelLabel: "あとで",
    });
    if (move) navigate("/settings/ai");
  };

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <h1 data-page-heading style={styles.title}>たいおんログ</h1>
          <p style={styles.subtitle}>記録するメンバーを選んでください</p>
        </div>
      </header>

      <div style={styles.body}>
        <section style={styles.card} aria-labelledby="latest-heading">
          <div style={styles.cardHeader}>
            <h2 id="latest-heading" style={styles.sectionTitle}>最新の記録</h2>
            <button type="button" onClick={() => navigate("/chart")} style={styles.textButton}>
              グラフを見る
            </button>
          </div>

          {loading && (
            <div role="status" style={styles.emptyState}>
              <strong>記録を読み込んでいます</strong>
              <span>保存済みデータは変更していません。</span>
            </div>
          )}

          {!loading && users.length === 0 && (
            <div style={styles.emptyState}>
              <strong>メンバーがまだ登録されていません</strong>
              <span>設定からメンバーを追加すると、体温を記録できます。</span>
              <button type="button" onClick={() => navigate("/settings/group")} style={styles.primaryButton}>
                メンバーを追加する
              </button>
            </div>
          )}

          <div style={styles.memberList}>
            {users.map((user) => {
              const record = records.find((item) => item.user_uuid === user.uuid);
              const showTemp = settings?.show_temp_on_home ?? true;
              const tempText = !record
                ? "未記録"
                : record.temp === 0
                  ? "投薬"
                  : showTemp
                    ? `${record.temp.toFixed(1)}℃`
                    : "**.*℃";
              const isFever = Boolean(record && record.temp >= 37.5);
              return (
                <button
                  key={user.uuid}
                  type="button"
                  onClick={() => navigate(`/input?userId=${user.uuid}`)}
                  aria-label={`${user.name}の体温を記録する。最新記録は${tempText}`}
                  style={styles.memberCard}
                >
                  <span style={styles.memberTopRow}>
                    <strong style={styles.memberName}>{user.name}</strong>
                    <span style={{ ...styles.temperature, color: isFever ? COLORS.fever : COLORS.primaryDark }}>
                      {tempText}
                    </span>
                  </span>
                  <span style={styles.memberBottomRow}>
                    <span>{record ? dateFormatter.format(new Date(record.measured_at)) : "まだ記録がありません"}</span>
                    <strong style={styles.recordAction}>体温を記録する <span aria-hidden="true">›</span></strong>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section style={styles.quickCard} aria-labelledby="quick-heading">
          <h2 id="quick-heading" style={styles.sectionTitle}>よく使う機能</h2>
          <div style={styles.quickGrid}>
            <button type="button" onClick={() => navigate("/medication-book")} style={styles.quickButton}>お薬手帳</button>
            <button type="button" onClick={() => navigate("/invite")} style={styles.quickButton}>家族を招待</button>
          </div>
        </section>
      </div>

      <button type="button" onClick={() => void handleSupportClick()} style={{ ...styles.fab, background: isAiReady ? COLORS.dark : COLORS.textMuted }}>
        {isAiReady ? "AIサポート" : "AI設定が必要"}
      </button>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: "100%", background: COLORS.bg, paddingBottom: 96 },
  header: { maxWidth: 680, margin: "0 auto", padding: "18px 16px 8px" },
  title: { margin: 0, fontSize: 24, color: COLORS.text },
  subtitle: { margin: "4px 0 0", color: COLORS.textMuted },
  body: { maxWidth: 680, margin: "0 auto", padding: "8px 12px", display: "grid", gap: 14 },
  card: { background: COLORS.surface, borderRadius: 16, padding: 16, border: `1px solid ${COLORS.borderLight}` },
  quickCard: { background: COLORS.surface, borderRadius: 16, padding: 16, border: `1px solid ${COLORS.borderLight}` },
  cardHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 },
  sectionTitle: { margin: 0, fontSize: 17, color: COLORS.text },
  textButton: { border: "none", background: "transparent", color: COLORS.primaryDark, fontWeight: 700, padding: "0 8px" },
  memberList: { marginTop: 12, display: "grid", gap: 10 },
  memberCard: { width: "100%", minHeight: 92, display: "grid", gap: 10, padding: 14, borderRadius: 14, border: `1px solid ${COLORS.border}`, background: COLORS.surface, textAlign: "left" },
  memberTopRow: { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 },
  memberName: { fontSize: 18, color: COLORS.text },
  temperature: { fontSize: 22, fontWeight: 800 },
  memberBottomRow: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, color: COLORS.textMuted, fontSize: 13 },
  recordAction: { color: COLORS.primaryDark, whiteSpace: "nowrap" },
  emptyState: { minHeight: 150, display: "grid", placeItems: "center", alignContent: "center", gap: 8, textAlign: "center", color: COLORS.textMuted, padding: 20 },
  primaryButton: { minHeight: 48, padding: "10px 18px", border: "none", borderRadius: 10, background: COLORS.primaryDark, color: "white", fontWeight: 800 },
  quickGrid: { marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  quickButton: { minHeight: 54, border: `1px solid ${COLORS.border}`, borderRadius: 12, background: COLORS.surface, color: COLORS.text, fontWeight: 700 },
  fab: { position: "fixed", right: 20, bottom: "calc(80px + env(safe-area-inset-bottom))", minHeight: 48, border: "none", borderRadius: 24, padding: "0 20px", color: "white", fontWeight: 800, boxShadow: "0 8px 22px rgba(15,23,42,0.22)", zIndex: 500 },
};
