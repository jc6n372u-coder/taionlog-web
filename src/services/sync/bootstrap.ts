import { LocalDb } from "../../data/local/localDb";
import { syncNow } from "./syncService";
import { ensureTier0Scheduler } from "../notifications/tier0";
import { ensurePwa } from "../notifications/tier1_pwa";

export function bootstrap() {
  // Tier0（必須）: アプリ内リマインド計算を定期実行
  ensureTier0Scheduler();

  // Tier1（任意）: PWAセットアップ（インストール済みの場合のみ案内）
  ensurePwa();

  // 既にグループ設定があるなら背景同期（失敗してもUIは壊さない）
  void (async () => {
    const cg = await LocalDb.getCurrentGroup();
    if (!cg) return;
    await syncNow();
  })();
}