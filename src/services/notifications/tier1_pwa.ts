export function isPwaInstalled(): boolean {
  // display-mode: standalone でPWA起動時
  const m = window.matchMedia('(display-mode: standalone)');
  return (m && m.matches) || (navigator as any).standalone === true;
}

export function ensurePwa() {
  // ここでは「PWA導線」と「権限チェック」だけ置く
  // 無理に権限を要求しない
  if (!isPwaInstalled()) return;
}
