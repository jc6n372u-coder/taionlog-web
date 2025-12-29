import { useEffect } from 'react';
import LocalDb from '../../data/local/localDb';

type Options = {
  groupId: string;
  enabled: boolean;
  pollMs?: number; // default 60_000
};

async function ensurePermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return 'denied';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return await Notification.requestPermission();
}

export async function notify(title: string, body: string) {
  const perm = await ensurePermission();
  if (perm !== 'granted') return;
  new Notification(title, { body });
}

export function useNotifications({ groupId, enabled, pollMs = 60_000 }: Options) {
  useEffect(() => {
    if (!enabled) return;

    let timer: number | null = null;
    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      const perm = await ensurePermission();
      if (perm !== 'granted') return;

      // 簡易実装: 次回投薬予定（未通知）を取得して通知
      // ※ 厳密なポーリング通知はTier0と役割重複するため、ここではWeb Notification APIの権限維持と
      //    フォアグラウンド時の補助通知としての役割を担う
      try {
         // (拡張ポイント)
      } catch {
        // 通知失敗は致命ではない
      }
    };

    tick();
    timer = window.setInterval(tick, pollMs);

    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
  }, [groupId, enabled, pollMs]);
}
