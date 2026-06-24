import { LocalDb } from "../../data/local/localDb";
import { syncNow } from "./syncService";
import {
  emitDataRefreshRequested,
  emitSyncCompleted,
  getSyncStatusSnapshot,
  onLocalChange,
  publishSyncStatus,
  type SyncErrorInfo,
  type SyncStoreName,
  type SyncTrigger,
} from "./syncEvents";

export const SYNC_COORDINATOR_CONFIG = {
  localChangeDelayMs: 2_000,
  visibleIntervalMs: 30_000,
  minimumForegroundGapMs: 10_000,
  retryDelaysMs: [5_000, 15_000, 30_000, 60_000, 300_000] as const,
} as const;

export type CoordinatorSyncResult =
  | {
      success: true;
      pushed: number;
      pulled: number;
      changedStores: SyncStoreName[];
      skipped?: "no-group";
    }
  | {
      success: false;
      error: string;
      code: string | null;
      retryable: boolean;
    };

type RawSyncResult = Awaited<ReturnType<typeof syncNow>>;
type RawSyncSuccess = Extract<RawSyncResult, { success: true }> & {
  changedStores?: readonly SyncStoreName[];
};
type RawSyncFailure = Extract<RawSyncResult, { success: false }> & {
  code?: string | null;
  retryable?: boolean;
};

const EPOCH_ISO = "1970-01-01T00:00:00.000Z";
const ALL_SHARED_STORES: readonly SyncStoreName[] = [
  "groups",
  "users",
  "records",
  "medications",
  "events",
  "reminders",
  "settings",
];

const TRIGGER_PRIORITY: Record<SyncTrigger, number> = {
  interval: 10,
  startup: 20,
  visibility: 30,
  "local-change": 40,
  retry: 50,
  online: 60,
  manual: 70,
  "force-full-sync": 80,
};

let started = false;
let localChangeTimerId: number | null = null;
let intervalTimerId: number | null = null;
let retryTimerId: number | null = null;
let unsubscribeLocalChange: (() => void) | null = null;
let processorPromise: Promise<CoordinatorSyncResult> | null = null;
let queuedTrigger: SyncTrigger | null = null;
let retryCount = 0;
let automaticSyncBlocked = false;

const pendingStores = new Set<SyncStoreName>();

function nowIso(): string {
  return new Date().toISOString();
}

function monotonicNow(): number | null {
  return typeof performance !== "undefined" ? performance.now() : null;
}

export async function refreshSyncStatusCounts(): Promise<void> {
  const currentGroup = await LocalDb.getCurrentGroup();
  if (!currentGroup) {
    publishSyncStatus({
      pendingChangeCount: 0,
      pendingCountByStore: {},
      conflictCount: 0,
      hasPendingChanges: false,
    });
    return;
  }
  const overview = await LocalDb.getSyncOverview(currentGroup.group_id);
  publishSyncStatus({
    ...overview,
    hasPendingChanges: overview.pendingChangeCount > 0,
  });
}

function uniqueStores(stores: readonly SyncStoreName[]): SyncStoreName[] {
  return [...new Set(stores)];
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isOnline(): boolean {
  return !isBrowser() || window.navigator.onLine;
}

function isVisible(): boolean {
  return !isBrowser() || document.visibilityState === "visible";
}

function clearTimer(timerId: number | null): void {
  if (timerId !== null && isBrowser()) {
    window.clearTimeout(timerId);
  }
}

function clearLocalChangeTimer(): void {
  clearTimer(localChangeTimerId);
  localChangeTimerId = null;
}

function clearRetryTimer(): void {
  clearTimer(retryTimerId);
  retryTimerId = null;
}

function mergeTrigger(
  current: SyncTrigger | null,
  next: SyncTrigger,
): SyncTrigger {
  if (!current) return next;
  return TRIGGER_PRIORITY[next] > TRIGGER_PRIORITY[current] ? next : current;
}

function isExplicitTrigger(trigger: SyncTrigger): boolean {
  return trigger === "manual" || trigger === "force-full-sync";
}

function currentFailureResult(): CoordinatorSyncResult {
  const error = getSyncStatusSnapshot().lastError;
  return {
    success: false,
    error: error?.message ?? "同期は再試行待ちです",
    code: error?.code ?? "SYNC_RETRY_PENDING",
    retryable: error?.retryable ?? true,
  };
}

function addPendingStores(stores: readonly SyncStoreName[]): void {
  for (const store of stores) pendingStores.add(store);
}

function takePendingStores(): SyncStoreName[] {
  const stores = [...pendingStores];
  pendingStores.clear();
  return stores;
}

function restorePendingStores(stores: readonly SyncStoreName[]): void {
  addPendingStores(stores);
}

function millisecondsSince(iso: string | null): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const value = new Date(iso).getTime();
  return Number.isNaN(value) ? Number.POSITIVE_INFINITY : Date.now() - value;
}

function wasAttemptedRecently(): boolean {
  return (
    millisecondsSince(getSyncStatusSnapshot().lastAttemptAt) <
    SYNC_COORDINATOR_CONFIG.minimumForegroundGapMs
  );
}

function normalizeChangedStores(result: RawSyncSuccess): SyncStoreName[] {
  const stores = uniqueStores(result.changedStores ?? []);
  if (stores.length > 0) return stores;

  // 旧syncServiceとの段階的互換性維持。
  // Pull件数があるのに変更ストア情報が無い間は、表示対象を安全側で全更新する。
  return result.pulled > 0 ? [...ALL_SHARED_STORES] : [];
}

function classifyFailure(result: RawSyncFailure): SyncErrorInfo {
  const message = result.error || "同期に失敗しました";
  const normalized = message.toLowerCase();

  let code = result.code ?? null;
  if (!code) {
    if (normalized.includes("認証") || normalized.includes("unauthorized")) {
      code = "UNAUTHORIZED";
    } else if (normalized.includes("グループ未設定")) {
      code = "GROUP_NOT_CONFIGURED";
    } else if (normalized.includes("グループが見つかりません")) {
      code = "GROUP_NOT_FOUND";
    } else if (normalized.includes("環境変数")) {
      code = "CLIENT_CONFIG_ERROR";
    } else if (normalized.includes("混雑") || normalized.includes("busy")) {
      code = "SYNC_BUSY";
    } else {
      code = "SYNC_FAILED";
    }
  }

  const retryable =
    result.retryable ??
    ![
      "UNAUTHORIZED",
      "GROUP_NOT_CONFIGURED",
      "GROUP_NOT_FOUND",
      "CLIENT_CONFIG_ERROR",
    ].includes(code);

  return { message, code, retryable };
}

function getRetryDelayMs(nextRetryCount: number): number {
  const index = Math.min(
    Math.max(nextRetryCount - 1, 0),
    SYNC_COORDINATOR_CONFIG.retryDelaysMs.length - 1,
  );
  return SYNC_COORDINATOR_CONFIG.retryDelaysMs[index];
}

function scheduleRetry(): {
  nextRetryAt: string | null;
  delayMs: number | null;
  startedMonotonicMs: number | null;
} {
  clearRetryTimer();
  if (!started || !isBrowser() || !isOnline()) {
    return { nextRetryAt: null, delayMs: null, startedMonotonicMs: null };
  }

  const delayMs = getRetryDelayMs(retryCount);
  const nextRetryAt = new Date(Date.now() + delayMs).toISOString();
  const startedMonotonicMs = monotonicNow();

  retryTimerId = window.setTimeout(() => {
    retryTimerId = null;
    if (!started || !isOnline() || !isVisible()) return;
    void requestSyncNow("retry");
  }, delayMs);

  return { nextRetryAt, delayMs, startedMonotonicMs };
}

function schedulePendingLocalChanges(): void {
  clearLocalChangeTimer();

  if (!started || pendingStores.size === 0) return;

  if (!isOnline()) {
    publishSyncStatus({
      kind: "offline",
      hasPendingChanges: true,
      trigger: "local-change",
      queuedAt: nowIso(),
      nextRetryAt: null,
    });
    return;
  }

  if (automaticSyncBlocked || retryTimerId !== null) {
    publishSyncStatus({
      hasPendingChanges: true,
      queuedAt: nowIso(),
    });
    return;
  }

  publishSyncStatus({
    kind: "pending",
    hasPendingChanges: true,
    trigger: "local-change",
    queuedAt: nowIso(),
    lastError: null,
    nextRetryAt: null,
  });

  if (!isBrowser()) {
    void requestSyncNow("local-change");
    return;
  }

  localChangeTimerId = window.setTimeout(() => {
    localChangeTimerId = null;
    void requestSyncNow("local-change");
  }, SYNC_COORDINATOR_CONFIG.localChangeDelayMs);
}

function finalizeFailure(
  trigger: SyncTrigger,
  error: SyncErrorInfo,
  storesToRestore: readonly SyncStoreName[],
): CoordinatorSyncResult {
  restorePendingStores(storesToRestore);

  let retrySchedule = {
    nextRetryAt: null as string | null,
    delayMs: null as number | null,
    startedMonotonicMs: null as number | null,
  };
  if (error.retryable) {
    automaticSyncBlocked = false;
    retryCount += 1;
    retrySchedule = !queuedTrigger ? scheduleRetry() : retrySchedule;
  } else {
    automaticSyncBlocked = true;
    retryCount = 0;
    clearRetryTimer();
  }

  void refreshSyncStatusCounts();
  publishSyncStatus({
    kind: "error",
    hasPendingChanges: pendingStores.size > 0,
    trigger,
    queuedAt: null,
    startedAt: null,
    lastAttemptAt: nowIso(),
    lastError: error,
    retryCount,
    nextRetryAt: retrySchedule.nextRetryAt,
    retryDelayMs: retrySchedule.delayMs,
    retryStartedMonotonicMs: retrySchedule.startedMonotonicMs,
  });

  return {
    success: false,
    error: error.message,
    code: error.code,
    retryable: error.retryable,
  };
}

async function runSingleSync(
  trigger: SyncTrigger,
): Promise<CoordinatorSyncResult> {
  const attemptAt = nowIso();
  let storesAtStart: SyncStoreName[] = [];

  try {
    if (!isOnline()) {
      const error: SyncErrorInfo = {
        message: "オフラインです。通信復帰後に自動同期します",
        code: "OFFLINE",
        retryable: true,
      };

      publishSyncStatus({
        kind: "offline",
        hasPendingChanges: pendingStores.size > 0,
        trigger,
        lastAttemptAt: attemptAt,
        lastError: error,
        nextRetryAt: null,
      });

      return {
        success: false,
        error: error.message,
        code: error.code,
        retryable: true,
      };
    }

    const currentGroup = await LocalDb.getCurrentGroup();
    if (!currentGroup) {
      pendingStores.clear();
      retryCount = 0;
      automaticSyncBlocked = false;
      clearRetryTimer();

      publishSyncStatus({
        kind: "idle",
        hasPendingChanges: false,
        pendingChangeCount: 0,
        pendingCountByStore: {},
        conflictCount: 0,
        trigger: null,
        queuedAt: null,
        startedAt: null,
        lastAttemptAt: attemptAt,
        lastError: null,
        retryCount: 0,
        nextRetryAt: null,
      });

      return {
        success: true,
        pushed: 0,
        pulled: 0,
        changedStores: [],
        skipped: "no-group",
      };
    }

    storesAtStart = takePendingStores();
    const startedAt = nowIso();

    publishSyncStatus({
      kind: "syncing",
      hasPendingChanges: storesAtStart.length > 0 || pendingStores.size > 0,
      trigger,
      queuedAt: null,
      startedAt,
      lastAttemptAt: startedAt,
      lastError: null,
      nextRetryAt: null,
    });

    let result: RawSyncResult;
    try {
      result = await syncNow();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result = { success: false, error: message } as RawSyncResult;
    }

    if (result.success) {
      retryCount = 0;
      automaticSyncBlocked = false;
      clearRetryTimer();

      const successResult = result as RawSyncSuccess;
      const changedStores = normalizeChangedStores(successResult);
      const completedAt = successResult.serverTime;
      const attemptCompletedAt = nowIso();

      emitSyncCompleted({
        trigger,
        pushed: successResult.pushed,
        pulled: successResult.pulled,
        changedStores,
        completedAt,
      });

      if (changedStores.length > 0) {
        emitDataRefreshRequested("sync-completed", changedStores);
      }

      const overview = await LocalDb.getSyncOverview(currentGroup.group_id);
      const hasPendingChanges = overview.pendingChangeCount > 0;
      publishSyncStatus({
        kind: hasPendingChanges ? "pending" : "idle",
        hasPendingChanges,
        pendingChangeCount: overview.pendingChangeCount,
        pendingCountByStore: overview.pendingCountByStore,
        conflictCount: overview.conflictCount,
        trigger: hasPendingChanges ? "local-change" : null,
        queuedAt: hasPendingChanges ? nowIso() : null,
        startedAt: null,
        lastAttemptAt: attemptCompletedAt,
        lastSuccessAt: completedAt,
        lastSuccessObservedMonotonicMs: monotonicNow(),
        lastError: null,
        retryCount: 0,
        nextRetryAt: null,
        retryDelayMs: null,
        retryStartedMonotonicMs: null,
        lastPushCount: successResult.pushed,
        lastPullCount: successResult.pulled,
      });

      if (hasPendingChanges) {
        if (!queuedTrigger) schedulePendingLocalChanges();
      } else {
        clearLocalChangeTimer();
      }

      return {
        success: true,
        pushed: successResult.pushed,
        pulled: successResult.pulled,
        changedStores,
      };
    }

    const failureResult = result as RawSyncFailure;
    return finalizeFailure(
      trigger,
      classifyFailure(failureResult),
      storesAtStart,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failureResult = { success: false, error: message } as RawSyncFailure;
    return finalizeFailure(
      trigger,
      classifyFailure(failureResult),
      storesAtStart,
    );
  }
}

async function processQueue(): Promise<CoordinatorSyncResult> {
  let finalResult: CoordinatorSyncResult = {
    success: true,
    pushed: 0,
    pulled: 0,
    changedStores: [],
    skipped: "no-group",
  };

  while (queuedTrigger) {
    const trigger = queuedTrigger;
    queuedTrigger = null;

    if (trigger === "force-full-sync") {
      await LocalDb.setMeta("sync_pull_cursor", EPOCH_ISO);
      await LocalDb.setMeta("last_sync", EPOCH_ISO);
    }

    finalResult = await runSingleSync(trigger);
  }

  return finalResult;
}

export function requestSyncNow(
  trigger: SyncTrigger = "manual",
): Promise<CoordinatorSyncResult> {
  const explicit = isExplicitTrigger(trigger);

  if (automaticSyncBlocked && !explicit) {
    return Promise.resolve(currentFailureResult());
  }

  if (
    retryTimerId !== null &&
    !explicit &&
    trigger !== "retry" &&
    trigger !== "online"
  ) {
    return Promise.resolve(currentFailureResult());
  }

  if (processorPromise) {
    if (explicit) queuedTrigger = mergeTrigger(queuedTrigger, trigger);
    return processorPromise;
  }

  if (explicit || trigger === "online") {
    automaticSyncBlocked = false;
    clearRetryTimer();
  }
  clearLocalChangeTimer();

  queuedTrigger = mergeTrigger(queuedTrigger, trigger);
  processorPromise = processQueue().finally(() => {
    processorPromise = null;
  });

  return processorPromise;
}

export function requestFullSync(): Promise<CoordinatorSyncResult> {
  return requestSyncNow("force-full-sync");
}

function handleLocalChange(detail: { stores: SyncStoreName[] }): void {
  addPendingStores(detail.stores);
  void refreshSyncStatusCounts();
  schedulePendingLocalChanges();
}

function handleVisibilityChange(): void {
  if (!started || !isVisible()) return;

  if (!isOnline()) {
    publishSyncStatus({
      kind: "offline",
      hasPendingChanges: pendingStores.size > 0,
      trigger: "visibility",
      nextRetryAt: null,
    });
    return;
  }

  if (automaticSyncBlocked || retryTimerId !== null) return;

  void requestSyncNow("visibility");
}

function handleOnline(): void {
  if (!started || automaticSyncBlocked) return;
  clearRetryTimer();
  void requestSyncNow("online");
}

function handleOffline(): void {
  if (!started) return;
  clearRetryTimer();
  publishSyncStatus({
    kind: "offline",
    hasPendingChanges: pendingStores.size > 0,
    trigger: null,
    lastError: {
      message: "オフラインです。通信復帰後に自動同期します",
      code: "OFFLINE",
      retryable: true,
    },
    nextRetryAt: null,
  });
}

function startVisibleInterval(): void {
  if (!isBrowser()) return;

  if (intervalTimerId !== null) {
    window.clearInterval(intervalTimerId);
  }

  intervalTimerId = window.setInterval(() => {
    if (
      !started ||
      !isVisible() ||
      !isOnline() ||
      automaticSyncBlocked ||
      retryTimerId !== null ||
      wasAttemptedRecently()
    ) {
      return;
    }
    void requestSyncNow("interval");
  }, SYNC_COORDINATOR_CONFIG.visibleIntervalMs);
}

async function initializeStatusAndStartupSync(): Promise<void> {
  const lastSuccessAt = await LocalDb.getMeta("last_sync_success_at");
  if (lastSuccessAt) {
    publishSyncStatus({ lastSuccessAt, lastSuccessObservedMonotonicMs: null });
  }

  const currentGroup = await LocalDb.getCurrentGroup();
  if (!started || !currentGroup) return;

  const queuedChanges = await LocalDb.getQueuedChanges(currentGroup.group_id);
  addPendingStores(queuedChanges.map((entry) => entry.store));
  const overview = await LocalDb.getSyncOverview(currentGroup.group_id);
  publishSyncStatus({
    ...overview,
    hasPendingChanges: overview.pendingChangeCount > 0,
  });
  await LocalDb.purgeExpiredDrafts();

  if (isOnline()) {
    await requestSyncNow("startup");
  } else {
    handleOffline();
  }
}

export function startSyncCoordinator(): void {
  if (started) return;
  started = true;

  unsubscribeLocalChange = onLocalChange(handleLocalChange);

  if (isBrowser()) {
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    startVisibleInterval();
  }

  void initializeStatusAndStartupSync().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    const failureResult = { success: false, error: message } as RawSyncFailure;
    finalizeFailure("startup", classifyFailure(failureResult), []);
  });
}

export function stopSyncCoordinator(): void {
  if (!started) return;
  started = false;

  unsubscribeLocalChange?.();
  unsubscribeLocalChange = null;

  clearLocalChangeTimer();
  clearRetryTimer();

  if (isBrowser()) {
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    window.removeEventListener("online", handleOnline);
    window.removeEventListener("offline", handleOffline);

    if (intervalTimerId !== null) {
      window.clearInterval(intervalTimerId);
      intervalTimerId = null;
    }
  }

  queuedTrigger = null;
  automaticSyncBlocked = false;
  retryCount = 0;
}

export function isSyncCoordinatorStarted(): boolean {
  return started;
}
