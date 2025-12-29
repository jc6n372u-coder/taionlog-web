import { useEffect } from 'react';
import { LocalDb } from '../../data/local/localDb';

type Options = {
  groupId: string;
  enabled: boolean;
};

// 簡易通知ロジック (SSOT準拠: OS通知API利用、許可は別途取得済み前提)
export function useNotifications({ groupId, enabled }: Options) {
  useEffect(() => {
    if (!enabled) return;

    // 定期チェック (60秒毎)
    const timer = setInterval(async () => {
       // ここでLocalDbのreminders等をチェックし、
       // 条件に合致すれば new Notification() を呼ぶ実装が入る想定
       // 今回は枠組みのみ
    }, 60_000);

    return () => clearInterval(timer);
  }, [groupId, enabled]);

  return {};
}
