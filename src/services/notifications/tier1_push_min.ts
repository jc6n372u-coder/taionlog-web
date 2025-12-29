export async function requestBrowserNotificationPermission(): Promise<NotificationPermission> {
  if (!("Notification" in window)) return "denied";
  // iOS Safari は制限が強い。ここでは取得だけ。
  return await Notification.requestPermission();
}

export async function showLocalBrowserNotification(title: string, body?: string) {
  // 注意: 通知表示はブラウザがフォアグラウンドでも出ないことがある。Tier0が主役。
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    new Notification(title, { body: body ?? "" });
  } catch {
    // noop
  }
}
