import ReactDOM from "react-dom/client";
import AppRouter from "./app/AppRouter";
import { bootstrap } from "./services/sync/bootstrap";
import { registerPwa } from "./app/pwa";
import { ErrorBoundary } from "./ui/components/ErrorBoundary";

// 起動処理
bootstrap();
registerPwa();

// StrictMode を外して、Chart.js の Canvas重複エラーを回避
ReactDOM.createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <AppRouter />
  </ErrorBoundary>
);