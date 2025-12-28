import { createBrowserRouter } from "react-router-dom";
import { AppShell } from "./shell";
import { OnboardingPage } from "../ui/pages/OnboardingPage";
import { HomePage } from "../ui/pages/HomePage";
import { ChartPage } from "../ui/pages/ChartPage";
import { MembersPage } from "../ui/pages/MembersPage";
import { SettingsPage } from "../ui/pages/SettingsPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "onboarding", element: <OnboardingPage /> },
      { path: "chart", element: <ChartPage /> },
      { path: "members", element: <MembersPage /> },
      { path: "settings", element: <SettingsPage /> },
    ],
  },
]);