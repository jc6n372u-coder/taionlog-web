import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { LocalDb, type ConflictResolutionChoice, type SyncConflictEntry } from "../../data/local/localDb";
import { refreshSyncStatusCounts } from "../../services/sync/syncCoordinator";
import { useSyncStatus } from "../../services/sync/useSyncStatus";
import { presentConflict, type ConflictLookup } from "../components/conflictPresentation";
import { showAppConfirm, showSnackbar } from "../feedback/feedbackService";
import { COLORS } from "../tokens";

type Decision = "local" | "remote";

export default function SyncConflictsPage() {
  const navigate = useNavigate();
  const { runFullSync } = useSyncStatus();
  const [conflicts, setConflicts] = useState<SyncConflictEntry[]>([]);
  const [lookup, setLookup] = useState<ConflictLookup>({ userNames: new Map(), medicationNames: new Map() });
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [index, setIndex] = useState(0);
  const [reviewing, setReviewing] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const group = await LocalDb.getCurrentGroup();
      if (!group) {
        setConflicts([]);
        return;
      }
      const [nextConflicts, users, medications] = await Promise.all([
        LocalDb.listSyncConflicts(group.group_id),
        LocalDb.listUsers(group.group_id),
        LocalDb.getMedications(group.group_id),
      ]);
      setConflicts(nextConflicts);
      setLookup({
        userNames: new Map(users.map((user) => [user.uuid, user.name])),
        medicationNames: new Map(medications.map((medication) => [medication.uuid, medication.name])),
      });
      setIndex((current) => Math.min(current, Math.max(nextConflicts.length - 1, 0)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const current = conflicts[index] ?? null;
  const presented = useMemo(
    () => (current ? presentConflict(current, lookup) : null),
    [current, lookup],
  );
  const decidedCount = Object.keys(decisions).filter((key) => decisions[key]).length;
  const allDecided = conflicts.length > 0 && conflicts.every((conflict) => decisions[conflict.key]);

  const select = (decision: Decision) => {
    if (!current) return;
    setDecisions((existing) => ({ ...existing, [current.key]: decision }));
  };

  const goNext = () => {
    if (!current || !decisions[current.key]) return;
    if (index < conflicts.length - 1) setIndex(index + 1);
    else setReviewing(true);
  };

  const commit = async () => {
    if (!allDecided || processing) return;
    const confirmed = await showAppConfirm({
      title: "選択した内容を確定しますか？",
      message: `${conflicts.length}件の確認結果をまとめて反映し、その後に全データを1回同期します。`,
      confirmLabel: "確定して同期する",
    });
    if (!confirmed) return;

    setProcessing(true);
    try {
      const choices: ConflictResolutionChoice[] = conflicts.map((conflict) => ({
        key: conflict.key,
        choice: decisions[conflict.key],
      }));
      await LocalDb.applyConflictResolutions(choices);
      await runFullSync();
      await refreshSyncStatusCounts();
      showSnackbar("競合の確認結果を反映しました");
      navigate("/sync", { replace: true });
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return <StatePanel title="競合を読み込んでいます" detail="入力や保存済みデータは変更していません。" />;
  }

  if (conflicts.length === 0) {
    return (
      <StatePanel
        title="確認が必要な変更はありません"
        detail="端末と共有側のデータは競合していません。"
        actionLabel="同期状況へ戻る"
        onAction={() => navigate("/sync", { replace: true })}
      />
    );
  }

  if (reviewing) {
    return (
      <div style={styles.page}>
        <PageHeader title="確認結果" onBack={() => setReviewing(false)} />
        <div style={styles.body}>
          <section style={styles.card}>
            <h2 style={styles.sectionTitle}>確定前の確認</h2>
            <p style={styles.description}>各データで残す内容を確認してください。項目を押すと選択を修正できます。</p>
            <ol style={styles.reviewList}>
              {conflicts.map((conflict, itemIndex) => {
                const item = presentConflict(conflict, lookup);
                return (
                  <li key={conflict.key}>
                    <button
                      type="button"
                      onClick={() => {
                        setIndex(itemIndex);
                        setReviewing(false);
                      }}
                      style={styles.reviewButton}
                    >
                      <span>
                        <strong>{item.title}</strong>
                        <small style={styles.reviewChoice}>
                          {decisions[conflict.key] === "local" ? "この端末の内容を共有する" : "共有側の内容を残す"}
                        </small>
                      </span>
                      <span aria-hidden="true">›</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>
          <button
            type="button"
            disabled={processing}
            aria-busy={processing}
            onClick={() => void commit()}
            style={styles.commitButton}
          >
            {processing ? "反映して同期中…" : "確認結果を確定して同期する"}
          </button>
        </div>
      </div>
    );
  }

  if (!current || !presented) return null;
  const selected = decisions[current.key];

  return (
    <div style={styles.page}>
      <PageHeader title="同期競合の確認" onBack={() => navigate("/sync")} />
      <div style={styles.body}>
        <div style={styles.progress} aria-label={`${conflicts.length}件中${index + 1}件目`}>
          <span>{conflicts.length}件中 {index + 1}件目</span>
          <span>{decidedCount}件選択済み</span>
        </div>

        <section style={styles.card}>
          <h2 style={styles.conflictTitle}>{presented.title}</h2>
          {presented.subtitle && <p style={styles.subtitle}>{presented.subtitle}</p>}
          <p style={styles.description}>異なる項目だけを表示しています。</p>

          <div style={styles.comparison}>
            {presented.fields.map((field) => (
              <div key={field.key} style={styles.fieldRow}>
                <div style={styles.fieldLabel}>{field.label}</div>
                <div style={styles.valueCard}>
                  <span style={styles.valueHeading}>この端末</span>
                  <span>{field.localValue}</span>
                </div>
                <div style={styles.valueCard}>
                  <span style={styles.valueHeading}>共有側</span>
                  <span>{field.remoteValue}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <fieldset style={styles.choiceCard} disabled={processing}>
          <legend style={styles.sectionTitle}>残す内容を選択</legend>
          <label style={{ ...styles.choice, ...(selected === "local" ? styles.choiceSelected : null) }}>
            <input type="radio" name="decision" checked={selected === "local"} onChange={() => select("local")} />
            <span><strong>この端末の内容を共有する</strong><small>この端末で編集した内容を送信します</small></span>
          </label>
          <label style={{ ...styles.choice, ...(selected === "remote" ? styles.choiceSelected : null) }}>
            <input type="radio" name="decision" checked={selected === "remote"} onChange={() => select("remote")} />
            <span><strong>共有側の内容を残す</strong><small>別の端末から共有された内容を使用します</small></span>
          </label>
        </fieldset>

        <div style={styles.footerActions}>
          <button type="button" disabled={index === 0} onClick={() => setIndex(index - 1)} style={styles.secondaryButton}>前へ</button>
          <button type="button" disabled={!selected} onClick={goNext} style={styles.primaryButton}>
            {index === conflicts.length - 1 ? "確認結果へ" : "次へ"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PageHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <header style={styles.header}>
      <button type="button" onClick={onBack} aria-label="前の画面へ戻る" style={styles.backButton}>←</button>
      <h1 data-page-heading style={styles.pageTitle}>{title}</h1>
    </header>
  );
}

function StatePanel({ title, detail, actionLabel, onAction }: { title: string; detail: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <div style={styles.page}>
      <div style={styles.body}>
        <section style={{ ...styles.card, marginTop: 24, textAlign: "center" }} role="status">
          <h1 data-page-heading style={styles.pageTitle}>{title}</h1>
          <p style={styles.description}>{detail}</p>
          {actionLabel && onAction && <button type="button" onClick={onAction} style={styles.primaryButton}>{actionLabel}</button>}
        </section>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: "100%", background: COLORS.bg },
  header: { maxWidth: 680, margin: "0 auto", minHeight: 56, padding: "0 12px", display: "flex", alignItems: "center", gap: 8 },
  backButton: { width: 44, border: "none", background: "transparent", fontSize: 24 },
  pageTitle: { margin: 0, fontSize: 20, color: COLORS.text },
  body: { maxWidth: 680, margin: "0 auto", padding: "0 12px 28px", display: "grid", gap: 12 },
  progress: { display: "flex", justifyContent: "space-between", gap: 12, color: COLORS.textMuted, fontSize: 13 },
  card: { background: COLORS.surface, borderRadius: 14, padding: 16, border: `1px solid ${COLORS.borderLight}` },
  conflictTitle: { margin: 0, fontSize: 20, color: COLORS.text },
  subtitle: { margin: "4px 0 0", color: COLORS.textMuted },
  description: { margin: "10px 0 0", color: COLORS.textMuted, lineHeight: 1.6 },
  comparison: { marginTop: 14, display: "grid", gap: 14 },
  fieldRow: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 },
  fieldLabel: { gridColumn: "1 / -1", fontWeight: 800, color: COLORS.text },
  valueCard: { minHeight: 72, borderRadius: 10, padding: 12, background: COLORS.bg, display: "grid", gap: 6, alignContent: "start", overflowWrap: "anywhere" },
  valueHeading: { fontSize: 12, color: COLORS.textMuted, fontWeight: 800 },
  choiceCard: { margin: 0, border: `1px solid ${COLORS.borderLight}`, borderRadius: 14, padding: 16, background: COLORS.surface, display: "grid", gap: 10 },
  sectionTitle: { margin: 0, fontSize: 16, fontWeight: 800, color: COLORS.text },
  choice: { minHeight: 64, display: "flex", alignItems: "center", gap: 12, padding: 12, border: `1px solid ${COLORS.border}`, borderRadius: 10, cursor: "pointer" },
  choiceSelected: { borderColor: COLORS.primaryDark, background: COLORS.primaryLight },
  footerActions: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  primaryButton: { minHeight: 48, border: "none", borderRadius: 10, background: COLORS.primaryDark, color: "white", fontWeight: 800, padding: "10px 16px" },
  secondaryButton: { minHeight: 48, border: `1px solid ${COLORS.border}`, borderRadius: 10, background: COLORS.surface, color: COLORS.text, fontWeight: 800, padding: "10px 16px" },
  reviewList: { listStyle: "none", margin: "14px 0 0", padding: 0, display: "grid", gap: 8 },
  reviewButton: { width: "100%", minHeight: 58, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, border: `1px solid ${COLORS.borderLight}`, borderRadius: 10, background: COLORS.surface, padding: 12, textAlign: "left" },
  reviewChoice: { display: "block", marginTop: 4, color: COLORS.textMuted },
  commitButton: { minHeight: 52, border: "none", borderRadius: 12, background: COLORS.primaryDark, color: "white", fontWeight: 800, fontSize: 16 },
};
