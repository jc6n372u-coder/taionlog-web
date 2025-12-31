import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from './shell';
import HomePage from '../ui/pages/HomePage';
import ChartPage from '../ui/pages/ChartPage';
import SettingsPage from '../ui/pages/SettingsPage';
import InvitePage from '../ui/pages/InvitePage';
import MemberEditPage from '../ui/pages/MemberEditPage';
import { InputPage } from '../ui/pages/InputPage';
import GroupSettingsPage from '../features/settings/group/GroupSettingsPage';
import MedicationSettingsPage from '../features/settings/medication/MedicationSettingsPage';
import PersonalSettingsPage from '../features/settings/personal/PersonalSettingsPage';
import SymptomSettingsPage from '../ui/pages/SymptomSettingsPage';
import OnboardingPage from '../ui/pages/OnboardingPage';
import SecurityPolicyGate from '../ui/components/SecurityPolicyGate';
import VersionUpdateNotice from '../ui/components/VersionUpdateNotice';

export default function AppRouter() {
  return (
    <BrowserRouter>
      {/* 初回同意や更新通知のゲート（不要ならコメントアウト可） */}
      <SecurityPolicyGate />
      <VersionUpdateNotice />
      
      <Routes>
        {/* オンボーディング */}
        <Route path="/onboarding" element={<OnboardingPage />} />
        
        {/* === メイン画面群（青ヘッダー持ちの独立ページ） === */}
        {/* ※これらは各ページ内でヘッダーを持っているので AppShell の外に置きます */}
        <Route path="/" element={<HomePage />} />
        <Route path="/chart" element={<ChartPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/invite" element={<InvitePage />} />
        <Route path="/settings/member/edit" element={<MemberEditPage />} />
        
        {/* 記録入力画面（独立ヘッダー） */}
        <Route path="/input" element={<InputPage />} />

        {/* === 設定サブメニュー群 === */}
        {/* 共通レイアウト(AppShell)を適用する場合 */}
        <Route element={<AppShell />}>
          <Route path="/settings/group" element={<GroupSettingsPage />} />
          <Route path="/settings/medications" element={<MedicationSettingsPage />} />
          <Route path="/settings/symptoms" element={<SymptomSettingsPage />} />
          <Route path="/settings/personal" element={<PersonalSettingsPage />} />
        </Route>

        {/* 未定義のパスはホームへ */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}