import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import HomePage from '../ui/pages/HomePage';
import ChartPage from '../ui/pages/ChartPage';
import SettingsPage from '../ui/pages/SettingsPage';
import MembersPage from '../ui/pages/MembersPage';
import OnboardingPage from '../ui/pages/OnboardingPage';

export default function AppRouter() {
  // 同意状態をlocalStorageから取得
  const hasAcceptedPolicy = localStorage.getItem('policyAccepted') === 'true';

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
        <Route path="/members" element={<MembersPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}