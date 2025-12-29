import { useEffect, useRef } from 'react';
import { syncNow } from '../../services/syncService';

// 自動整理の二重実行ガード（軽量メモリフラグ）
let lastPruneAtMs = 0;
const PRUNE_GUARD_MS = 60_000;

export function useHomeSync() {
  const runningRef = useRef(false);

  const trigger = async () => {
    if (runningRef.current) return;
    
    // ガード: 短時間の連打防止
    const now = Date.now();
    if (now - lastPruneAtMs < 5000) return; // 5秒以内の同期連打防止

    runningRef.current = true;
    try {
      await syncNow();
      // 成功したらPrune時刻更新
      lastPruneAtMs = Date.now();
    } finally {
      runningRef.current = false;
    }
  };

  useEffect(() => {
    // 1. 初回マウント時
    trigger();

    // 2. 画面復帰時 (Visibility Change)
    const onVis = () => {
      if (document.visibilityState === 'visible') trigger();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);
}
