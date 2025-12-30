import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import OnboardingPage from "../ui/pages/OnboardingPage";
import HomePage from "../ui/pages/HomePage";
import InvitePage from "../ui/pages/InvitePage";
import SettingsPage from "../ui/pages/SettingsPage";
import MedicationSettingsPage from "../ui/pages/MedicationSettingsPage";
import InputPage from "../ui/pages/InputPage";
import { LocalDb } from "../data/local/localDb";
import { useEffect, useState } from "react";

export default function AppRouter() {
  const [hasGroup, setHasGroup] = useState<boolean | null>(null);

  useEffect(() => {
    checkGroup();
  }, []);

  const checkGroup = async () => {
    try {
      const g = await LocalDb.getCurrentGroup();
      setHasGroup(!!g);
    } catch (e) {
      // エラー時は安全側に倒して「グループなし」扱いにする
      console.error(e);
      setHasGroup(false);
    }
  };

  // 判定中はローディング表示
  if (hasGroup === null) {
      return (
        <div style={{display:"flex", justifyContent:"center", alignItems:"center", height:"100vh", color:"#999"}}>
            Loading...
        </div>
      );
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* ★重要修正: replace={true} をつけて、リダイレクト時の履歴ループを防ぐ */}
        <Route path="/" element={
            hasGroup ? <Navigate to="/home" replace /> : <Navigate to="/onboarding" replace />
        } />
        
        {/* 各ページ定義（ここは変更なし） */}
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/home" element={<HomePage />} />
        <Route path="/invite" element={<InvitePage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/settings/medications" element={<MedicationSettingsPage />} />
        <Route path="/input/:userUuid" element={<InputPage />} />

        {/* 404対策: 存在しないURLへのアクセス時も、履歴を残さずに適切な場所へ戻す */}
        <Route path="*" element={
            hasGroup ? <Navigate to="/home" replace /> : <Navigate to="/onboarding" replace />
        } />
      </Routes>
    </BrowserRouter>
  );
}