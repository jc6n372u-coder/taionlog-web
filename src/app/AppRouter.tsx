import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from './shell';
import HomePage from '../ui/pages/HomePage';
import ChartPage from '../ui/pages/ChartPage';
import SettingsPage from '../ui/pages/SettingsPage';
import InvitePage from '../ui/pages/InvitePage';
import MemberEditPage from '../ui/pages/MemberEditPage'; // ★追加: メンバー編集画面
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
        
        {/* 青いヘッダーを持つ独立したページ群 (AppShellの外) */}
        <Route path="/" element={<HomePage />} />
        <Route path="/chart" element={<ChartPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/invite" element={<InvitePage />} />
        <Route path="/settings/member/edit" element={<MemberEditPage />} /> {/* ★追加: ここにルート定義 */}

        {/* 既存の設定ページ群 (まだ青ヘッダー化していないものはAppShellを利用) */}
        {/* ※GroupSettingsPageは青ヘッダー化しましたが、レイアウト崩れを防ぐため一旦このブロックに残すか、
           あるいは外に出しても動きます。ここでは安全のため既存配置の中に置いておきます */}
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