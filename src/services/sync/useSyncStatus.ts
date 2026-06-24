import {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import {
  requestFullSync,
  requestSyncNow,
  type CoordinatorSyncResult,
} from "./syncCoordinator";
import {
  getSyncStatusSnapshot,
  onSyncStatusChanged,
  type SyncStatusSnapshot,
  type SyncTrigger,
} from "./syncEvents";

export type SyncStatusTone = "muted" | "info" | "warning" | "danger" | "success";

export type SyncStatusDisplay = {
  label: string;
  detail: string | null;
  tone: SyncStatusTone;
  showSpinner: boolean;
  canSyncNow: boolean;
  canFullSync: boolean;
  ariaLive: "off" | "polite" | "assertive";
  absoluteLastSuccessLabel: string | null;
  relativeLastSuccessLabel: string | null;
  retryRemainingSeconds: number | null;
};

export type UseSyncStatusResult = {
  status: SyncStatusSnapshot;
  display: SyncStatusDisplay;
  runSyncNow: () => Promise<CoordinatorSyncResult>;
  runFullSync: () => Promise<CoordinatorSyncResult>;
};

const absoluteFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function subscribeToSyncStatus(onStoreChange: () => void): () => void {
  return onSyncStatusChanged(() => onStoreChange());
}

function monotonicNow(): number | null {
  return typeof performance !== "undefined" ? performance.now() : null;
}

function formatAbsoluteSyncTime(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return absoluteFormatter.format(date);
}

function formatElapsedLabel(status: SyncStatusSnapshot): string | null {
  const observed = status.lastSuccessObservedMonotonicMs;
  const now = monotonicNow();
  if (observed === null || now === null || now < observed) return null;
  const elapsedSeconds = Math.max(0, Math.floor((now - observed) / 1000));
  if (elapsedSeconds < 60) return elapsedSeconds < 10 ? "たった今" : `${elapsedSeconds}秒前`;
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) return `${elapsedMinutes}分前`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  return `${elapsedHours}時間前`;
}

function getRetryRemainingSeconds(status: SyncStatusSnapshot): number | null {
  const started = status.retryStartedMonotonicMs;
  const delay = status.retryDelayMs;
  const now = monotonicNow();
  if (started === null || delay === null || now === null) return null;
  return Math.max(0, Math.ceil((delay - (now - started)) / 1000));
}

function getTriggerLabel(trigger: SyncTrigger | null): string {
  switch (trigger) {
    case "startup":
      return "起動時";
    case "local-change":
      return "保存後";
    case "interval":
      return "自動";
    case "visibility":
      return "再表示時";
    case "online":
      return "通信復帰時";
    case "manual":
      return "手動";
    case "force-full-sync":
      return "全データ";
    case "retry":
      return "再試行";
    default:
      return "";
  }
}

export function getSyncStatusDisplay(status: SyncStatusSnapshot): SyncStatusDisplay {
  const triggerLabel = getTriggerLabel(status.trigger);
  const absoluteLastSuccessLabel = formatAbsoluteSyncTime(status.lastSuccessAt);
  const relativeLastSuccessLabel = formatElapsedLabel(status);
  const retryRemainingSeconds = getRetryRemainingSeconds(status);
  const shared = { absoluteLastSuccessLabel, relativeLastSuccessLabel, retryRemainingSeconds };

  if (status.conflictCount > 0) {
    return {
      label: `確認が必要な変更 ${status.conflictCount}件`,
      detail: "同じデータが別の端末でも変更されています",
      tone: "danger",
      showSpinner: false,
      canSyncNow: true,
      canFullSync: true,
      ariaLive: "assertive",
      ...shared,
    };
  }

  if (status.kind === "syncing") {
    return {
      label: "同期中",
      detail: triggerLabel ? `${triggerLabel}同期を実行しています` : "変更を送受信しています",
      tone: "info",
      showSpinner: true,
      canSyncNow: false,
      canFullSync: false,
      ariaLive: "polite",
      ...shared,
    };
  }

  if (status.kind === "offline") {
    return {
      label: "オフライン",
      detail:
        status.pendingChangeCount > 0
          ? `端末に保存済みの未送信データが${status.pendingChangeCount}件あります。通信復帰後に自動同期します`
          : "通信復帰後に自動同期します",
      tone: "warning",
      showSpinner: false,
      canSyncNow: false,
      canFullSync: false,
      ariaLive: "polite",
      ...shared,
    };
  }

  if (status.kind === "error") {
    return {
      label: "一時的に同期できません",
      detail:
        retryRemainingSeconds !== null
          ? `${retryRemainingSeconds}秒後に自動で再試行します`
          : status.lastError?.retryable
            ? "自動で再試行します"
            : "同期状況を開いて接続設定を確認してください",
      tone: "danger",
      showSpinner: false,
      canSyncNow: true,
      canFullSync: true,
      ariaLive: "assertive",
      ...shared,
    };
  }

  if (status.kind === "pending" || status.pendingChangeCount > 0) {
    return {
      label: `端末に保存済み・未送信 ${status.pendingChangeCount}件`,
      detail: "数秒後に自動同期します",
      tone: "warning",
      showSpinner: false,
      canSyncNow: true,
      canFullSync: true,
      ariaLive: "polite",
      ...shared,
    };
  }

  if (absoluteLastSuccessLabel) {
    return {
      label: relativeLastSuccessLabel ? `同期済み・${relativeLastSuccessLabel}` : "同期済み",
      detail: absoluteLastSuccessLabel,
      tone: "success",
      showSpinner: false,
      canSyncNow: true,
      canFullSync: true,
      ariaLive: "off",
      ...shared,
    };
  }

  return {
    label: "同期待ち",
    detail: "初回同期は自動で実行されます",
    tone: "muted",
    showSpinner: false,
    canSyncNow: true,
    canFullSync: true,
    ariaLive: "off",
    ...shared,
  };
}

export function useSyncStatus(): UseSyncStatusResult {
  const status = useSyncExternalStore(
    subscribeToSyncStatus,
    getSyncStatusSnapshot,
    getSyncStatusSnapshot,
  );
  const [clockTick, setClockTick] = useState(0);

  useEffect(() => {
    if (
      status.lastSuccessObservedMonotonicMs === null &&
      status.retryStartedMonotonicMs === null
    ) {
      return;
    }
    const timer = window.setInterval(() => setClockTick((value) => value + 1), 1_000);
    return () => window.clearInterval(timer);
  }, [status.lastSuccessObservedMonotonicMs, status.retryStartedMonotonicMs]);

  void clockTick;
  const display = getSyncStatusDisplay(status);

  const runSyncNow = useCallback(() => requestSyncNow("manual"), []);
  const runFullSync = useCallback(() => requestFullSync(), []);

  return {
    status,
    display,
    runSyncNow,
    runFullSync,
  };
}
