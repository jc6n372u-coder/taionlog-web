import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Flutter寄せの共通レイアウト（AppBar固定 + Body + optional FAB）
 * - どの画面でも「同じ型」になるように統一
 * - スマホで「上側に文字が寄って小さく見える」問題を、
 * AppBar固定 + Body余白/最大幅制御で緩和
 */
type Props = {
  title: string;
  children: ReactNode;
  /** 戻るボタンを表示（デフォルト true） */
  back?: boolean;
  /** 右側に置く要素（並び替え/更新/設定アイコンなど） */
  right?: ReactNode;
  /** 画面背景色（Flutterは薄いグレー） */
  background?: string;
  /** Bodyの最大幅（カード中心レイアウト） */
  maxWidth?: number;
  /** FAB（右下＋ボタン） */
  fabLabel?: string;
  onFabClick?: (() => void) | null;
};

export function AppShell({
  title,
  children,
  back = true,
  right = null,
  background = "#f4f5f7",
  maxWidth = 720,
  fabLabel = "+",
  onFabClick = null,
}: Props) {
  const nav = useNavigate();

  return (
    <div style={{ minHeight: "100dvh", background }}>
      <header style={styles.appBar}>
        <div style={styles.appBarLeft}>
          {back ? (
            <button
              type="button"
              onClick={() => nav(-1)}
              style={styles.iconBtn}
              aria-label="戻る"
              title="戻る"
            >
              ←
            </button>
          ) : (
            <div style={{ width: 40, height: 40 }} />
          )}
        </div>
        <div style={styles.appBarTitle}>{title}</div>
        <div style={styles.appBarRight}>{right}</div>
      </header>

      <main style={styles.body}>
        <div style={{ width: "100%", maxWidth, margin: "0 auto" }}>{children}</div>
      </main>

      {onFabClick ? (
        <button
          type="button"
          onClick={onFabClick}
          style={styles.fab}
          aria-label={fabLabel}
          title={fabLabel}
        >
          {fabLabel}
        </button>
      ) : null}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  appBar: {
    height: 56,
    display: "grid",
    gridTemplateColumns: "56px 1fr 56px",
    alignItems: "center",
    background: "#66A9D9", // Flutter寄せの青
    color: "white",
    position: "sticky",
    top: 0,
    zIndex: 10,
    boxShadow: "0 1px 0 rgba(0,0,0,0.08)",
  },
  appBarLeft: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-start",
    paddingLeft: 8,
  },
  appBarTitle: {
    textAlign: "center",
    fontSize: 18,
    fontWeight: 700,
    letterSpacing: 0.5,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    padding: "0 6px",
  },
  appBarRight: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingRight: 8,
  },
  iconBtn: {
    height: 40,
    width: 40,
    border: "none",
    borderRadius: 999,
    background: "transparent",
    color: "white",
    fontSize: 18,
    cursor: "pointer",
  },
  body: {
    padding: 12,
    display: "block",
  },
  fab: {
    position: "fixed",
    right: 18,
    bottom: 18,
    width: 56,
    height: 56,
    borderRadius: 999,
    border: "none",
    background: "#66A9D9",
    color: "white",
    fontSize: 28,
    lineHeight: "56px",
    textAlign: "center",
    cursor: "pointer",
    boxShadow: "0 10px 24px rgba(0,0,0,0.18)",
  },
};