import ReactDOM from "react-dom/client";
import AppRouter from "./app/AppRouter";
import { bootstrap } from "./services/sync/bootstrap";
// import { registerPwa } from "./app/pwa"; // ★ここをコメントアウト（一時停止）
import { ErrorBoundary } from "./ui/components/ErrorBoundary";

// ★追加：古いService Workerを強制削除するコード
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.unregister(); // 強制削除
    }
  });
}

bootstrap();
// registerPwa(); // ★ここもコメントアウト

ReactDOM.createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <AppRouter />
  </ErrorBoundary>
);