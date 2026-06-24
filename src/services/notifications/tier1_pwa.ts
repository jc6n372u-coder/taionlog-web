type NavigatorWithStandalone = Navigator & { standalone?: boolean };

// 重要: Pushは安定運用の障害になりやすい。SSOTとして『PWAインストール済みで、ユーザーが明示的に許可した場合のみ』有効化する。
export function isPwaInstalled(): boolean {
  // display-mode: standalone でPWA起動時
  const m = window.matchMedia("(display-mode: standalone)");
  return (m && m.matches) || (navigator as NavigatorWithStandalone).standalone === true;
}

export function ensurePwa() {
  // ここでは「PWA導線」と「権限チェック」だけ置く
  if (!isPwaInstalled()) return;
  // 例: 設定画面に「通知を有効化」ボタンを表示するのがSSOT推奨
}
