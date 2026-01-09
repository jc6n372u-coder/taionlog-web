import React from "react";

/**
 * Gitから自動取得したバージョン情報を表示するコンポーネント
 * 面倒な手動更新は不要です。git commitするだけで日時が更新されます。
 */
export const VersionUpdateNotice = () => {
  return (
    <div style={styles.container}>
      <p style={styles.text}>
        最終更新: {__APP_UPDATED_AT__}
      </p>
      <p style={styles.subText}>
        Ver: {__APP_VERSION__}
      </p>
    </div>
  );
};

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