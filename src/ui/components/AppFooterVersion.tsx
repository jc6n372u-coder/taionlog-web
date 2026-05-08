/**
 * バージョン情報フッター
 *
 * vite.config.ts で git から自動注入される
 * __APP_VERSION__ / __APP_UPDATED_AT__ を表示する。
 *
 * 旧ファイル: src/components/VersionUpdateNotice.tsx
 * 「アップデート通知モーダル」と紛らわしかったため改名。
 * モーダル側は元々未参照だったため削除済み。
 */
import type React from "react";

export function AppFooterVersion() {
  return (
    <div style={styles.container}>
      <p style={styles.text}>最終更新: {__APP_UPDATED_AT__}</p>
      <p style={styles.subText}>Ver: {__APP_VERSION__}</p>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    marginTop: 24,
    marginBottom: 40,
    padding: 16,
    textAlign: "center",
    borderTop: "1px solid #eee",
  },
  text: {
    margin: 0,
    fontSize: 12,
    color: "#666",
    fontWeight: "bold",
  },
  subText: {
    margin: "4px 0 0",
    fontSize: 10,
    color: "#999",
    fontFamily: "monospace",
  },
};
