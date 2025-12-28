// SSOT 24.2: 最小限のPush権限取得ロジック
export async function requestBrowserNotificationPermission(): Promise<NotificationPermission> {
  if (!("Notification" in window)) return "denied";
  return await Notification.requestPermission();
}

export async function showLocalBrowserNotification(title: string, body?: string) {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    new Notification(title, { body: body ?? "" });
  } catch {
    // noop
  }
}