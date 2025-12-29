import { LocalDb } from '../data/local/localDb';

// WEBではネイティブの端末IDが無いので、初回にUUIDを生成して永続化する（安定用）
export async function getDeviceId(): Promise<string> {
  const existing = await LocalDb.getMeta('device_id');
  if (existing) return existing;
  const id = crypto.randomUUID();
  await LocalDb.setMeta('device_id', id);
  return id;
}
