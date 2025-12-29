import React from "react";
import ReactDOM from "react-dom/client";
import AppRouter from "./app/AppRouter"; // 読み込み先をAppRouterに変更
import { bootstrap } from "./services/sync/bootstrap";
import { registerPwa } from "./app/pwa";
import "./index.css";

// 1. 起動時の初期化（グループロード、背景同期、通知の準備）を実行 
bootstrap();

// 2. PWA（ホーム画面追加機能）の有効化 [cite: 826]
registerPwa();

// 3. アプリのレンダリング
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {/* ルーティングの司令塔であるAppRouterを呼び出す [cite: 259, 1840] */}
    <AppRouter />
  </React.StrictMode>
);