// SSOT 18.15: PWAインストール済みチェック
export function isPwaInstalled(): boolean {
  const m = window.matchMedia("(display-mode: standalone)");
  return (m && m.matches) || (navigator as any).standalone === true;
}

export function ensurePwa() {
  if (!isPwaInstalled()) return;
  // ここに将来的なPush自動登録などを書けるが、現在は設定画面の手動ボタンに任せる
}