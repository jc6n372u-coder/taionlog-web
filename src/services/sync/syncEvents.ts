export const SYNC_EVENT_NAMES = {
  localChange: "taionlog:sync-local-change",
  statusChanged: "taionlog:sync-status-changed",
  completed: "taionlog:sync-completed",
  refreshRequested: "taionlog:data-refresh-requested",
} as const;

export type SyncStoreName =
  | "groups"
  | "users"
  | "records"
  | "medications"
  | "events"
  | "reminders"
  | "settings";

export type SyncTrigger =
  | "startup"
  | "local-change"
  | "interval"
  | "visibility"
  | "online"
  | "manual"
  | "force-full-sync"
  | "retry";

export type SyncStatusKind = "idle" | "pending" | "syncing" | "offline" | "error";

export type SyncErrorInfo = {
  message: string;
  code: string | null;
  retryable: boolean;
};

export type SyncPendingCountByStore = Partial<
  Record<Exclude<SyncStoreName, "groups">, number>
>;

export type SyncStatusSnapshot = {
  kind: SyncStatusKind;
  hasPendingChanges: boolean;
  pendingChangeCount: number;
  pendingCountByStore: SyncPendingCountByStore;
  conflictCount: number;
  trigger: SyncTrigger | null;
  queuedAt: string | null;
  startedAt: string | null;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastSuccessObservedMonotonicMs: number | null;
  lastError: SyncErrorInfo | null;
  retryCount: number;
  nextRetryAt: string | null;
  retryDelayMs: number | null;
  retryStartedMonotonicMs: number | null;
  lastPushCount: number;
  lastPullCount: number;
  changedAt: string;
};

export type LocalChangeDetail = {
  stores: SyncStoreName[];
  groupId: string | null;
  changedAt: string;
};

export type SyncCompletedDetail = {
  trigger: SyncTrigger;
  pushed: number;
  pulled: number;
  changedStores: SyncStoreName[];
  completedAt: string;
};

export type DataRefreshReason = "sync-completed" | "local-change" | "manual";

export type DataRefreshRequestedDetail = {
  reason: DataRefreshReason;
  stores: SyncStoreName[];
  requestedAt: string;
};

const syncEventTarget = new EventTarget();

let currentSyncStatus: SyncStatusSnapshot = {
  kind: "idle",
  hasPendingChanges: false,
  pendingChangeCount: 0,
  pendingCountByStore: {},
  conflictCount: 0,
  trigger: null,
  queuedAt: null,
  startedAt: null,
  lastAttemptAt: null,
  lastSuccessAt: null,
  lastSuccessObservedMonotonicMs: null,
  lastError: null,
  retryCount: 0,
  nextRetryAt: null,
  retryDelayMs: null,
  retryStartedMonotonicMs: null,
  lastPushCount: 0,
  lastPullCount: 0,
  changedAt: new Date().toISOString(),
};

function uniqueStores(stores: readonly SyncStoreName[]): SyncStoreName[] {
  return [...new Set(stores)];
}

function dispatchDetail<T>(eventName: string, detail: T): void {
  syncEventTarget.dispatchEvent(new CustomEvent<T>(eventName, { detail }));
}

function subscribe<T>(eventName: string, listener: (detail: T) => void): () => void {
  const handler: EventListener = (event) => {
    listener((event as CustomEvent<T>).detail);
  };

  syncEventTarget.addEventListener(eventName, handler);
  return () => syncEventTarget.removeEventListener(eventName, handler);
}

export function getSyncStatusSnapshot(): SyncStatusSnapshot {
  return currentSyncStatus;
}

export function publishSyncStatus(
  patch: Partial<Omit<SyncStatusSnapshot, "changedAt">>,
): SyncStatusSnapshot {
  currentSyncStatus = {
    ...currentSyncStatus,
    ...patch,
    changedAt: new Date().toISOString(),
  };

  dispatchDetail<SyncStatusSnapshot>(SYNC_EVENT_NAMES.statusChanged, currentSyncStatus);
  return currentSyncStatus;
}

export function emitLocalChange(
  stores: readonly SyncStoreName[],
  groupId: string | null = null,
): void {
  const normalizedStores = uniqueStores(stores);
  if (normalizedStores.length === 0) return;

  dispatchDetail<LocalChangeDetail>(SYNC_EVENT_NAMES.localChange, {
    stores: normalizedStores,
    groupId,
    changedAt: new Date().toISOString(),
  });
}

export function emitSyncCompleted(
  detail: Omit<SyncCompletedDetail, "changedStores" | "completedAt"> & {
    changedStores?: readonly SyncStoreName[];
    completedAt?: string;
  },
): void {
  dispatchDetail<SyncCompletedDetail>(SYNC_EVENT_NAMES.completed, {
    ...detail,
    changedStores: uniqueStores(detail.changedStores ?? []),
    completedAt: detail.completedAt ?? new Date().toISOString(),
  });
}

export function emitDataRefreshRequested(
  reason: DataRefreshReason,
  stores: readonly SyncStoreName[],
): void {
  dispatchDetail<DataRefreshRequestedDetail>(SYNC_EVENT_NAMES.refreshRequested, {
    reason,
    stores: uniqueStores(stores),
    requestedAt: new Date().toISOString(),
  });
}

export function onLocalChange(listener: (detail: LocalChangeDetail) => void): () => void {
  return subscribe<LocalChangeDetail>(SYNC_EVENT_NAMES.localChange, listener);
}

export function onSyncStatusChanged(
  listener: (status: SyncStatusSnapshot) => void,
): () => void {
  return subscribe<SyncStatusSnapshot>(SYNC_EVENT_NAMES.statusChanged, listener);
}

export function onSyncCompleted(
  listener: (detail: SyncCompletedDetail) => void,
): () => void {
  return subscribe<SyncCompletedDetail>(SYNC_EVENT_NAMES.completed, listener);
}

export function onDataRefreshRequested(
  listener: (detail: DataRefreshRequestedDetail) => void,
): () => void {
  return subscribe<DataRefreshRequestedDetail>(SYNC_EVENT_NAMES.refreshRequested, listener);
}
