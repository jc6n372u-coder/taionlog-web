import { ensureTier0Scheduler } from "../notifications/tier0";
import { ensurePwa } from "../notifications/tier1_pwa";
import { startSyncCoordinator } from "./syncCoordinator";

type BootstrapState = {
  initialized: boolean;
};

type BootstrapGlobal = typeof globalThis & {
  __TAIONLOG_BOOTSTRAP_STATE__?: BootstrapState;
};

function getBootstrapState(): BootstrapState {
  const globalObject = globalThis as BootstrapGlobal;

  if (!globalObject.__TAIONLOG_BOOTSTRAP_STATE__) {
    globalObject.__TAIONLOG_BOOTSTRAP_STATE__ = { initialized: false };
  }

  return globalObject.__TAIONLOG_BOOTSTRAP_STATE__;
}

/**
 * アプリ全体の一度限りの起動処理。
 *
 * 画面描画を待たせないため、この関数自身は同期完了を待たない。
 * 起動時同期、定期同期、オンライン復帰時同期などは
 * syncCoordinator がバックグラウンドで管理する。
 */
export function bootstrap(): void {
  const state = getBootstrapState();

  if (!state.initialized) {
    state.initialized = true;

    // Tier0（必須）: アプリ内リマインド計算を定期実行する。
    ensureTier0Scheduler();

    // Tier1（任意）: PWA導線と通知権限の前提確認を行う。
    ensurePwa();
  }

  // startSyncCoordinator 自体も多重起動を防止する。
  // 開発時の再評価等で bootstrap が再度呼ばれても、同期タイマーは重複しない。
  startSyncCoordinator();
}

export function isBootstrapInitialized(): boolean {
  return getBootstrapState().initialized;
}
