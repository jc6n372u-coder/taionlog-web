import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 20, background: "#fff0f0", color: "#d00", border: "2px solid red", margin: 20 }}>
          <h2>エラーが発生しました</h2>
          <details style={{ whiteSpace: "pre-wrap" }}>
            {this.state.error && this.state.error.toString()}
          </details>
          <button onClick={() => window.location.reload()} style={{ marginTop: 20, padding: 10 }}>
            リロードする
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}