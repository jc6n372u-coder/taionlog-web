import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from './shell';
import HomePage from '../ui/pages/HomePage';
import ChartPage from '../ui/pages/ChartPage';
import SettingsPage from '../ui/pages/SettingsPage';
import InvitePage from '../ui/pages/InvitePage'; // ★新規作成します
import GroupSettingsPage from '../features/settings/group/GroupSettingsPage';
import MedicationSettingsPage from '../features/settings/medication/MedicationSettingsPage';
import PersonalSettingsPage from '../features/settings/personal/PersonalSettingsPage';
import OnboardingPage from '../ui/pages/OnboardingPage';
import SecurityPolicyGate from '../ui/components/SecurityPolicyGate';
import VersionUpdateNotice from '../ui/components/VersionUpdateNotice';

export default function AppRouter() {
  return (
    <BrowserRouter>
      <SecurityPolicyGate />
      <VersionUpdateNotice />
      
      <Routes>
        <Route path="/onboarding" element={<OnboardingPage />} />
        
        {/* ★ここ修正: AppShellの外に出して、独自の青ヘッダーを使う */}
        <Route path="/" element={<HomePage />} />
        <Route path="/chart" element={<ChartPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/invite" element={<InvitePage />} />

        {/* 詳細設定は既存のページを使うため AppShell の中でも外でも良いが、
            今回は統一感のため AppShell (白ヘッダー) を使うか、
            またはこれらも青ヘッダー化する必要がある。
            一旦、機能維持のため既存のまま残す */}
        <Route element={<AppShell />}>
          <Route path="/settings/group" element={<GroupSettingsPage />} />
          <Route path="/settings/medication" element={<MedicationSettingsPage />} />
          <Route path="/settings/personal" element={<PersonalSettingsPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}