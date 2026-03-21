import { useState } from "react";
import { LocalDb } from "../../data/local/localDb";
import { getDb } from "../../data/local/db";
import { ApiClient } from "../../data/remote/apiClient";
import type { PushData } from "../../utils/types";

export type SyncResult = { success: true; pushed: number; pulled: number } | { success: false; error: string };

function toUpdatedMs_(v: unknown): number {
  if (v === null || v === undefined || v === "") return NaN;
  if (v instanceof Date) return v.getTime();
  const t = new Date(String(v)).getTime();
  return Number.isNaN(t) ? NaN : t;
}

// ★修正: "groups" を追加して、グループ情報の保存を許可
async function guardedUpsert(store: "users"|"records"|"medications"|"events"|"reminders"|"groups", rows: any[]) {
  const db = await getDb();
  // @ts-ignore dynamic store name
  const tx = db.transaction(store, "readwrite");

  for (const r of rows) {
    const cur = await tx.store.get(r.uuid);

    if (!cur) {
      await tx.store.put(r);
      continue;
    }

    const nextUpdatedMs = toUpdatedMs_(r.updated_at);
    const curUpdatedMs = toUpdatedMs_(cur.updated_at);

    // 両方とも日時として比較可能なら、より新しい方のみ採用
    if (!Number.isNaN(nextUpdatedMs) && !Number.isNaN(curUpdatedMs)) {
      if (nextUpdatedMs > curUpdatedMs) {
        await tx.store.put(r);
      }
      continue;
    }

    // 片方または両方が不正な場合のフォールバック
    const nextUpdated = String(r.updated_at ?? "");
    const currentUpdated = String(cur.updated_at ?? "");

    if (!nextUpdated && currentUpdated) {
      continue;
    }

    if (nextUpdated && !currentUpdated) {
      await tx.store.put(r);
      continue;
    }

    if (nextUpdated > currentUpdated) {
      await tx.store.put(r);
    }
  }

  await tx.done;
}

// 同期処理本体
export async function syncNow(): Promise<SyncResult> {
  try {
    const cg = await LocalDb.getCurrentGroup();
    if (!cg) return { success: false, error: "グループ未設定です" };

    const lastSync = (await LocalDb.getMeta("last_sync")) ?? "1970-01-01T00:00:00.000Z";

    const s = await LocalDb.getSettings(cg.group_id);
    
    if (!LocalDb.getUpdatedRows) {
        throw new Error("LocalDb.getUpdatedRows is not implemented");
    }

    const push: PushData = {
      users: await LocalDb.getUpdatedRows(cg.group_id, lastSync, "users"),
      records: await LocalDb.getUpdatedRows(cg.group_id, lastSync, "records"),
      medications: await LocalDb.getUpdatedRows(cg.group_id, lastSync, "medications"),
      events: await LocalDb.getUpdatedRows(cg.group_id, lastSync, "events"),
      reminders: await LocalDb.getUpdatedRows(cg.group_id, lastSync, "reminders"),
      settings: s && (s.updated_at > lastSync) ? s : undefined,
    };

    const resp = await ApiClient.sync(cg.group_id, lastSync, push);
    const pulled = resp.data.pulled;
    
    let pullCount = 0;

    // ★修正: ここに "groups" を追加しました！
    // これにより、サーバーから返ってきた「参加コード入りグループ情報」が処理されます
    for (const key of ["users","records","medications","events","reminders","groups"] as const) {
      // @ts-ignore
      const rows = (pulled as any)[key] as any[];
      if (rows?.length) {
        // @ts-ignore
        await guardedUpsert(key, rows);
        pullCount += rows.length;
      }
    }
    if (pulled.settings) await LocalDb.upsertSettings(pulled.settings);
    
    // last_sync をpullデータ内の最大 updated_at に基づいて設定（クライアント時計に依存しない）
    let maxUpdatedAt = lastSync;
    for (const key of ["users","records","medications","events","reminders","groups"] as const) {
      const rows = (pulled as any)[key] as any[] | undefined;
      if (!rows?.length) continue;
      for (const r of rows) {
        const u = String(r.updated_at ?? "");
        if (u && u > maxUpdatedAt) maxUpdatedAt = u;
      }
    }
    if (pulled.settings?.updated_at && pulled.settings.updated_at > maxUpdatedAt) {
      maxUpdatedAt = pulled.settings.updated_at;
    }
    await LocalDb.setMeta("last_sync", maxUpdatedAt);

    const pushed = resp.data.pushed ?? {};
    const pushCount = Object.values(pushed).reduce((s, v) => s + (typeof v === "number" ? v : 0), 0);

    try {
      if (LocalDb.pruneLocalEventsIfNeeded) {
        await LocalDb.pruneLocalEventsIfNeeded(cg.group_id, 10000);
      }
    } catch (e) {
      console.warn("Auto prune failed:", e);
    }

    return { success: true, pushed: pushCount, pulled: pullCount };
  } catch (e: any) {
    const msg = (e?.message ?? String(e)).replace("Exception: ", "");
    console.error("Sync Error:", e);
    return { success: false, error: msg };
  }
}

export function useSync() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runSync = async () => {
    if (isLoading) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await syncNow();
      if (!result.success) {
        throw new Error(result.error);
      }
    } catch (e: any) {
      setError(e.message);
      alert("同期エラー: " + e.message);
    } finally {
      setIsLoading(false);
    }
  };

  return { syncState: { isLoading, error }, runSync };
}