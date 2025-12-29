import React from "react";
import ReactDOM from "react-dom/client";
import AppRouter from "./app/AppRouter";
import { bootstrap } from "./services/sync/bootstrap";
import { registerPwa } from "./app/pwa";
import { ErrorBoundary } from "./ui/components/ErrorBoundary"; // 追加

// 起動処理
bootstrap();
registerPwa();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {/* 全体をErrorBoundaryで囲むことで、エラー時に詳細を表示する */}
    <ErrorBoundary>
      <AppRouter />
    </ErrorBoundary>
  </React.StrictMode>
);