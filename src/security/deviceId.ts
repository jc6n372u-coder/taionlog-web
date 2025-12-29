import { LocalDb } from "../data/local/localDb";

export async function getDeviceId(): Promise<string> {
  const existing = await LocalDb.getMeta("device_id");
  if (existing) return existing;
  const id = crypto.randomUUID();
  await LocalDb.setMeta("device_id", id);
  return id;
}
