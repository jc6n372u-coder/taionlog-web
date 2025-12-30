import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import OnboardingPage from "../ui/pages/OnboardingPage";
import HomePage from "../ui/pages/HomePage";
import InvitePage from "../ui/pages/InvitePage";
import SettingsPage from "../ui/pages/SettingsPage";
import MedicationSettingsPage from "../ui/pages/MedicationSettingsPage";
import InputPage from "../ui/pages/InputPage"; // 追加
import { LocalDb } from "../data/local/localDb";
import { useEffect, useState } from "react";

export default function AppRouter() {
  const [hasGroup, setHasGroup] = useState<boolean | null>(null);

  useEffect(() => {
    checkGroup();
  }, []);

  const checkGroup = async () => {
    const g = await LocalDb.getCurrentGroup();
    setHasGroup(!!g);
  };

  if (hasGroup === null) return <div>Loading...</div>;

  return (
    <BrowserRouter>
      <Routes>
        {/* 初回起動チェック */}
        <Route path="/" element={hasGroup ? <Navigate to="/home" /> : <Navigate to="/onboarding" />} />
        
        {/* 各ページ定義 */}
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/home" element={<HomePage />} />
        <Route path="/invite" element={<InvitePage />} />
        <Route path="/settings" element={<SettingsPage />} />
        
        {/* 追加した新しいページ */}
        <Route path="/settings/medications" element={<MedicationSettingsPage />} />
        <Route path="/input/:userUuid" element={<InputPage />} />

        {/* 未定義のパスはホームへ */}
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}