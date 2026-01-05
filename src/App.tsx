// src/App.tsx
import { Routes, Route } from "react-router-dom";

// ui/pages (リストにあったもの)
import HomePage from "./ui/pages/HomePage";
import OnboardingPage from "./ui/pages/OnboardingPage";
import SettingsPage from "./ui/pages/SettingsPage";
import InvitePage from "./ui/pages/InvitePage";       // 旧 QrCodePage
import MemberEditPage from "./ui/pages/MemberEditPage"; // 旧 ProfileEditPage
import InputPage from "./ui/pages/InputPage";
import ChartPage from "./ui/pages/ChartPage";

// ui/pages (今回作成したもの)
import JoinGroupPage from "./ui/pages/JoinGroupPage"; // ★Step1で作成
import AiSupportPage from "./ui/pages/AiSupportPage";
import MedicationBookPage from "./ui/pages/MedicationBookPage";
import MedicationEditPage from "./ui/pages/MedicationEditPage";
import AiSettingsPage from "./ui/pages/settings/AiSettingsPage";

// features (リストにあった別の場所にあるファイル)
import MedicationSettingsPage from "./features/settings/medication/MedicationSettingsPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/onboarding" element={<OnboardingPage />} />
      
      {/* 設定・管理系 */}
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/join" element={<JoinGroupPage />} />
      <Route path="/settings/qr" element={<InvitePage />} />
      <Route path="/settings/profiles" element={<MemberEditPage />} />
      <Route path="/settings/medications" element={<MedicationSettingsPage />} />
      
      {/* 記録・グラフ (既存機能) */}
      <Route path="/input" element={<InputPage />} />
      <Route path="/chart" element={<ChartPage />} />

      {/* AI機能・サポート系 (フェーズ2) */}
      <Route path="/settings/ai" element={<AiSettingsPage />} />
      <Route path="/ai-support" element={<AiSupportPage />} />
      
      {/* お薬手帳・詳細登録 (フェーズ2) */}
      <Route path="/medication-book" element={<MedicationBookPage />} />
      <Route path="/medication-book/new" element={<MedicationEditPage />} />
      <Route path="/medication-book/edit/:id" element={<MedicationEditPage />} />
    </Routes>
  );
}