// force update 1

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import HomePage from '../features/home/HomePage';
import ChartPage from '../features/chart/ChartPage';
import SettingsPage from '../ui/pages/SettingsPage';
import GroupSettingsPage from '../features/settings/group/GroupSettingsPage';
import MedicationSettingsPage from '../features/settings/medication/MedicationSettingsPage';
import PersonalSettingsPage from '../features/settings/personal/PersonalSettingsPage';
import OnboardingPage from '../ui/pages/OnboardingPage';

export default function AppRouter() {
  // ★ここを一時的に false に書き換えます
  // これにより、強制的に「ご利用前の確認（同意画面）」が表示されるようになります
  const hasAcceptedPolicy = false;

  if (!hasAcceptedPolicy) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="*" element={<OnboardingPage />} />
        </Routes>
      </BrowserRouter>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/chart" element={<ChartPage />} />
        
        {/* 設定関連 */}
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/settings/group" element={<GroupSettingsPage />} />
        <Route path="/settings/medication" element={<MedicationSettingsPage />} />
        <Route path="/settings/personal" element={<PersonalSettingsPage />} />

        {/* 未知のパスはホームへ */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}