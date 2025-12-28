import { LocalDb } from "../../data/local/localDb";
import { getDb } from "../../data/local/db";
import { ApiClient } from "../../data/remote/apiClient";
import type { PushData } from "../../utils/types";

export type SyncResult = { success: true; pushed: number; pulled: number } | { success: false; error: string };

// SSOT 21.2: サーバーの更新が新しい場合のみ上書き（LWW）
async function guardedUpsert(store: "users"|"records"|"medications"|"events"|"reminders", rows: any[]) {
  const db = await getDb();
  const tx = db.transaction(store as any, "readwrite");
  for (const r of rows) {
    const cur = await tx.store.get(r.uuid);
    if (!cur) {
      await tx.store.put(r);
      continue;
    }
    if ((r.updated_at ?? "") > (cur.updated_at ?? "")) {
      await tx.store.put(r);
    }
  }
  await tx.done;
}

export async function syncNow(): Promise<SyncResult> {
  try {
    const cg = await LocalDb.getCurrentGroup();
    if (!cg) return { success: false, error: "グループ未設定です" };

    const lastSync = (await LocalDb.getMeta("last_sync")) ?? "1970-01-01T00:00:00.000Z";
    
    // SSOT 24.1: 設定（Settings）も含めてPushデータを作成
    const s = await LocalDb.getSettings(cg.group_id);
    const push: PushData = {
      users: await LocalDb.getUpdatedRows(cg.group_id, lastSync, "users"),
      records: await LocalDb.getUpdatedRows(cg.group_id, lastSync, "records"),
      medications: await LocalDb.getUpdatedRows(cg.group_id, lastSync, "medications"),
      events: await LocalDb.getUpdatedRows(cg.group_id, lastSync, "events"),
      reminders: await LocalDb.getUpdatedRows(cg.group_id, lastSync, "reminders"),
      settings: s && (s.updated_at > lastSync) ? s : null,
    };

    const resp = await ApiClient.sync(cg.group_id, lastSync, push);
    
    const pulled = resp.data.pulled;
    let pullCount = 0;

    for (const key of ["users","records","medications","events","reminders"] as const) {
      const rows = (pulled as any)[key] as any[];
      if (rows?.length) {
        await guardedUpsert(key, rows);
        pullCount += rows.length;
      }
    }
    
    if (pulled.settings) await LocalDb.upsertSettings(pulled.settings);
    
    await LocalDb.setMeta("last_sync", new Date().toISOString());

    const pushed = resp.data.pushed ?? {};
    const pushCount = Object.values(pushed).reduce((s, v) => s + (typeof v === "number" ? v : 0), 0);

    return { success: true, pushed: pushCount, pulled: pullCount };
  } catch (e: any) {
    const msg = (e?.message ?? String(e)).replace("Exception: ", "");
    return { success: false, error: msg };
  }
}