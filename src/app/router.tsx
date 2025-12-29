import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppShell } from "./shell";
import { OnboardingPage } from "../ui/pages/OnboardingPage";
import { HomePage } from "../ui/pages/HomePage";
import { ChartPage } from "../ui/pages/ChartPage";
import { MembersPage } from "../ui/pages/MembersPage";
import { SettingsPage } from "../ui/pages/SettingsPage";

// ★ここが判定ポイント
// 動作確認のため、強制的に false（未同意）にします
const hasAcceptedPolicy = false;

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { 
        index: true, 
        element: hasAcceptedPolicy ? <HomePage /> : <Navigate to="/onboarding" replace /> 
      },
      { path: "onboarding", element: <OnboardingPage /> },
      { path: "chart", element: <ChartPage /> },
      { path: "members", element: <MembersPage /> },
      { path: "settings", element: <SettingsPage /> },
    ],
  },
]);