import { useEffect, useRef } from 'react';
import { syncNow } from '../../services/syncService';
import LocalDb from '../../data/local/localDb';

// 責務:
// ・アプリ起動時／バックグラウンド復帰時に同期をトリガー
// ・同期完了後、自動整理（pruneLocalEventsIfNeeded）を guarded 実行
// ・UI描画はブロックしない

async function pruneIfNeeded(groupId: string, maxEvents: number) {
  try {
    await LocalDb.pruneLocalEventsIfNeeded(groupId, maxEvents);
  } catch {
    // 自動整理の失敗でアプリを止めない
  }
}

export function useHomeSync(groupId: string) {
  const runningRef = useRef(false);

  const trigger = async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    try {
      // 同期実行 (SSOT: maxEvents等はService側で定数管理または引数)
      await syncNow();
      // 自動整理はsyncNow内でも呼ばれるが、念のためここでも呼ぶ設計(Phase B-3ガード付き推奨)
      // 今回はsyncService内呼び出しを主とするためここはトリガーのみ
    } finally {
      runningRef.current = false;
    }
  };

  useEffect(() => {
    // 初回
    if(groupId) trigger();
    
    // 復帰時
    const onVis = () => {
      if (document.visibilityState === 'visible' && groupId) trigger();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [groupId]);
}
