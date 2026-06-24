import { type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { useSyncStatus, type SyncStatusTone } from "../../services/sync/useSyncStatus";
import type { SyncStatusSnapshot } from "../../services/sync/syncEvents";
import { COLORS } from "../tokens";

export type SyncStatusIndicatorProps = {
  compact?: boolean;
  hideWhenSynced?: boolean;
};

type ToneStyle = {
  background: string;
  border: string;
  icon: string;
  label: string;
};

const TONE_STYLES: Record<SyncStatusTone, ToneStyle> = {
  muted: {
    background: COLORS.surface,
    border: COLORS.border,
    icon: COLORS.textMuted,
    label: COLORS.textMuted,
  },
  info: {
    background: COLORS.primaryLight,
    border: COLORS.primary,
    icon: COLORS.primaryDark,
    label: COLORS.primaryDark,
  },
  warning: {
    background: COLORS.warningBg,
    border: COLORS.warning,
    icon: COLORS.warning,
    label: COLORS.darkInk,
  },
  danger: {
    background: COLORS.dangerBg,
    border: COLORS.danger,
    icon: COLORS.danger,
    label: COLORS.danger,
  },
  success: {
    background: COLORS.successBg,
    border: COLORS.success,
    icon: COLORS.success,
    label: COLORS.success,
  },
};

function getStatusSymbol(status: SyncStatusSnapshot): string {
  if (status.conflictCount > 0) return "!";
  switch (status.kind) {
    case "syncing":
      return "↻";
    case "offline":
      return "×";
    case "error":
      return "!";
    case "pending":
      return "↑";
    default:
      return status.lastSuccessAt ? "✓" : "○";
  }
}

function isSettledSuccess(status: SyncStatusSnapshot): boolean {
  return (
    status.kind === "idle" &&
    status.pendingChangeCount === 0 &&
    status.conflictCount === 0 &&
    Boolean(status.lastSuccessAt) &&
    !status.lastError
  );
}

export function SyncStatusIndicator({
  compact = false,
  hideWhenSynced = false,
}: SyncStatusIndicatorProps) {
  const navigate = useNavigate();
  const { status, display } = useSyncStatus();

  if (hideWhenSynced && isSettledSuccess(status)) return null;

  const tone = TONE_STYLES[display.tone];
  const destination = status.conflictCount > 0 ? "/sync/conflicts" : "/sync";

  return (
    <button
      type="button"
      onClick={() => navigate(destination)}
      aria-label={`${display.label}${display.detail ? `。${display.detail}` : ""}。同期状況を開く`}
      aria-live={display.ariaLive}
      aria-busy={status.kind === "syncing"}
      style={{
        ...styles.container,
        ...(compact ? styles.compact : null),
        background: tone.background,
        borderColor: tone.border,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          ...styles.icon,
          color: tone.icon,
          ...(status.kind === "syncing" ? styles.spinning : null),
        }}
      >
        {getStatusSymbol(status)}
      </span>
      <span style={styles.textBlock}>
        <span style={{ ...styles.label, color: tone.label }}>{display.label}</span>
        {!compact && display.detail && <span style={styles.detail}>{display.detail}</span>}
      </span>
      <span aria-hidden="true" style={styles.chevron}>›</span>
    </button>
  );
}

const styles: Record<string, CSSProperties> = {
  container: {
    width: "100%",
    minHeight: 48,
    display: "flex",
    alignItems: "center",
    gap: 10,
    border: "1px solid",
    borderRadius: 12,
    padding: "9px 12px",
    textAlign: "left",
    cursor: "pointer",
  },
  compact: { minHeight: 44, padding: "7px 10px" },
  icon: {
    width: 24,
    height: 24,
    display: "grid",
    placeItems: "center",
    flex: "0 0 auto",
    fontWeight: 800,
  },
  spinning: { animation: "taionlog-spin 1s linear infinite" },
  textBlock: { minWidth: 0, display: "grid", gap: 2, flex: 1 },
  label: { fontWeight: 800, fontSize: 14 },
  detail: { color: COLORS.textMuted, fontSize: 12, lineHeight: 1.4 },
  chevron: { color: COLORS.textMuted, fontSize: 24, lineHeight: 1 },
};
