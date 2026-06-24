import { useState } from "react";
import {
  LocalDb,
  type LegacySyncSnapshot,
  type PushAcknowledgement,
  type PushConflict,
  type SharedRowStore,
  type SyncQueueEntry,
} from "../../data/local/localDb";
import {
  ApiClient,
  type SyncApiPulledPayload,
  type SyncApiResponseData,
} from "../../data/remote/apiClient";
import type { SettingsRow } from "../../utils/types";
import type { SyncStoreName } from "./syncEvents";

export type SyncResult =
  | {
      success: true;
      pushed: number;
      pulled: number;
      changedStores: SyncStoreName[];
      conflicts: number;
      serverTime: string;
    }
  | {
      success: false;
      error: string;
      code: string | null;
      retryable: boolean;
    };

type ErrorWithMetadata = {
  message?: unknown;
  code?: unknown;
  retryable?: unknown;
};

const EPOCH_ISO = "1970-01-01T00:00:00.000Z";
const PULL_CURSOR_KEY = "sync_pull_cursor";
const LAST_SUCCESS_KEY = "last_sync_success_at";
const LEGACY_RECONCILIATION_KEY_PREFIX = "legacy_sync_reconciled_v1";
const MAX_PUSH_ROWS_PER_REQUEST = 100;

const ROW_STORES: readonly SharedRowStore[] = [
  "users",
  "records",
  "medications",
  "events",
  "reminders",
  "groups",
];

function getPulledRows(
  pulled: SyncApiPulledPayload,
  store: SharedRowStore
): Record<string, unknown>[] {
  const rows = pulled[store];
  return Array.isArray(rows) ? rows : [];
}

function getErrorDetails(error: unknown): {
  message: string;
  code: string | null;
  retryable: boolean;
} {
  const metadata =
    error && typeof error === "object" ? (error as ErrorWithMetadata) : null;

  const rawMessage =
    typeof metadata?.message === "string"
      ? metadata.message
      : error instanceof Error
        ? error.message
        : String(error);

  const message = rawMessage.replace(/^Exception:\s*/i, "").trim() || "同期に失敗しました";
  const normalized = message.toLowerCase();

  let code = typeof metadata?.code === "string" ? metadata.code : null;
  let retryable =
    typeof metadata?.retryable === "boolean" ? metadata.retryable : undefined;

  if (!code) {
    if (normalized.includes("認証") || normalized.includes("unauthorized")) {
      code = "UNAUTHORIZED";
    } else if (normalized.includes("グループ未設定")) {
      code = "GROUP_NOT_CONFIGURED";
    } else if (normalized.includes("グループが見つかりません")) {
      code = "GROUP_NOT_FOUND";
    } else if (normalized.includes("環境変数")) {
      code = "CLIENT_CONFIG_ERROR";
    } else if (
      normalized.includes("failed to fetch") ||
      normalized.includes("networkerror") ||
      normalized.includes("network error") ||
      normalized.includes("ネットワーク") ||
      normalized.includes("通信")
    ) {
      code = "NETWORK_ERROR";
    } else if (normalized.includes("rate limit") || normalized.includes("アクセス頻度")) {
      code = "RATE_LIMITED";
    } else if (normalized.includes("busy") || normalized.includes("混雑")) {
      code = "SYNC_BUSY";
    } else {
      code = "SYNC_FAILED";
    }
  }

  if (retryable === undefined) {
    retryable = ![
      "UNAUTHORIZED",
      "GROUP_NOT_CONFIGURED",
      "GROUP_NOT_FOUND",
      "CLIENT_CONFIG_ERROR",
    ].includes(code);
  }

  return { message, code, retryable };
}

function countPushedRows(pushed: Record<string, number> | null | undefined): number {
  if (!pushed) return 0;
  return Object.values(pushed).reduce(
    (sum, value) => sum + (typeof value === "number" ? value : 0),
    0
  );
}

function chunkQueuedChanges(
  entries: readonly SyncQueueEntry[],
): SyncQueueEntry[][] {
  if (entries.length === 0) return [[]];

  const chunks: SyncQueueEntry[][] = [];
  for (let index = 0; index < entries.length; index += MAX_PUSH_ROWS_PER_REQUEST) {
    chunks.push(entries.slice(index, index + MAX_PUSH_ROWS_PER_REQUEST));
  }
  return chunks;
}

function addStores(
  target: Set<SyncStoreName>,
  stores: readonly SyncStoreName[],
): void {
  for (const store of stores) target.add(store);
}

type LegacyReconciliationState = {
  cursor: string;
  pulled: number;
  conflicts: number;
  changedStores: SyncStoreName[];
};

async function ensureLegacySyncReconciled(
  groupId: string,
  currentCursor: string,
): Promise<LegacyReconciliationState> {
  const migrationKey = `${LEGACY_RECONCILIATION_KEY_PREFIX}:${groupId}`;
  if ((await LocalDb.getMeta(migrationKey)) === "done") {
    return {
      cursor: currentCursor,
      pulled: 0,
      conflicts: 0,
      changedStores: [],
    };
  }

  const response = await ApiClient.sync(
    groupId,
    EPOCH_ISO,
    LocalDb.buildSyncPushPayload([]),
  );
  const data = response.data;
  validateSyncResponse(data);

  const reconciled = await LocalDb.reconcileLegacySyncSnapshot(
    groupId,
    data.pulled as LegacySyncSnapshot,
  );

  await LocalDb.setMeta(PULL_CURSOR_KEY, data.server_cursor);
  await LocalDb.setMeta("last_sync", data.server_cursor);
  await LocalDb.setMeta(LAST_SUCCESS_KEY, data.server_cursor);
  await LocalDb.setMeta(migrationKey, "done");

  return {
    cursor: data.server_cursor,
    pulled: reconciled.pulled,
    conflicts: reconciled.conflicts,
    changedStores: reconciled.changedStores,
  };
}

function isSettingsRow(value: Record<string, unknown>): value is Record<string, unknown> & SettingsRow {
  return (
    typeof value.group_id === "string" &&
    typeof value.show_temp_on_home === "boolean" &&
    typeof value.updated_at === "string"
  );
}

async function applyPushResults(
  acknowledgements: PushAcknowledgement[],
  conflicts: PushConflict[]
): Promise<void> {
  await LocalDb.applyPushAcknowledgements(acknowledgements);
  await LocalDb.savePushConflicts(conflicts);
}

async function applyPulledData(
  pulled: SyncApiPulledPayload,
  groupId: string
): Promise<{ count: number; stores: SyncStoreName[] }> {
  const changedStores = new Set<SyncStoreName>();
  let count = 0;

  for (const store of ROW_STORES) {
    const rows = getPulledRows(pulled, store);
    if (rows.length === 0) continue;

    const changed = await LocalDb.guardedUpsertAll(store, rows, "remote");
    if (changed > 0) {
      count += changed;
      changedStores.add(store);
    }
  }

  const settings = pulled.settings;
  if (
    settings &&
    isSettingsRow(settings) &&
    settings.group_id === groupId &&
    !(await LocalDb.hasPendingOrConflict("settings", groupId))
  ) {
    await LocalDb.upsertSettings(settings, "remote");
    count += 1;
    changedStores.add("settings");
  }

  return { count, stores: [...changedStores] };
}

function validateSyncResponse(data: SyncApiResponseData): void {
  if (!data.server_cursor || typeof data.server_cursor !== "string") {
    throw new Error("同期サーバーから有効なカーソルが返されませんでした");
  }
  if (!Array.isArray(data.acknowledgements) || !Array.isArray(data.conflicts)) {
    throw new Error("同期サーバーのPush応答形式が正しくありません");
  }
}

export async function syncNow(): Promise<SyncResult> {
  try {
    const currentGroup = await LocalDb.getCurrentGroup();
    if (!currentGroup) {
      return {
        success: false,
        error: "グループ未設定です",
        code: "GROUP_NOT_CONFIGURED",
        retryable: false,
      };
    }

    const groupId = currentGroup.group_id;
    const initialCursor =
      (await LocalDb.getMeta(PULL_CURSOR_KEY)) || EPOCH_ISO;
    const migration = await ensureLegacySyncReconciled(
      groupId,
      initialCursor,
    );

    let cursor = migration.cursor;
    let pushedCount = 0;
    let pulledCount = migration.pulled;
    let conflictCount = migration.conflicts;
    const changedStores = new Set<SyncStoreName>();
    addStores(changedStores, migration.changedStores);

    const queuedChanges = await LocalDb.getQueuedChanges(groupId);
    const batches = chunkQueuedChanges(queuedChanges);

    for (const batch of batches) {
      const push = LocalDb.buildSyncPushPayload(batch);
      const response = await ApiClient.sync(groupId, cursor, push);
      const data = response.data;
      validateSyncResponse(data);

      await applyPushResults(data.acknowledgements, data.conflicts);
      const applied = await applyPulledData(data.pulled, groupId);

      pushedCount += countPushedRows(data.pushed);
      pulledCount += applied.count;
      conflictCount += data.conflicts.length;
      addStores(changedStores, applied.stores);
      cursor = data.server_cursor;
    }

    await LocalDb.setMeta(PULL_CURSOR_KEY, cursor);
    await LocalDb.setMeta("last_sync", cursor);
    await LocalDb.setMeta(LAST_SUCCESS_KEY, cursor);

    try {
      await LocalDb.pruneLocalEventsIfNeeded(groupId, 10_000);
    } catch (error) {
      console.warn("Auto prune failed:", error);
    }

    return {
      success: true,
      pushed: pushedCount,
      pulled: pulledCount,
      changedStores: [...changedStores],
      conflicts: conflictCount,
      serverTime: cursor,
    };
  } catch (error) {
    const details = getErrorDetails(error);
    console.error("Sync Error:", error);
    return {
      success: false,
      error: details.message,
      code: details.code,
      retryable: details.retryable,
    };
  }
}

export function useSync() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runSync = async (): Promise<SyncResult | null> => {
    if (isLoading) return null;
    setIsLoading(true);
    setError(null);

    try {
      const result = await syncNow();
      if (!result.success) {
        setError(result.error);
        console.warn("同期エラー:", result.error);
      }
      return result;
    } finally {
      setIsLoading(false);
    }
  };

  return { syncState: { isLoading, error }, runSync };
}
