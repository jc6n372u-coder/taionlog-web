import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from './shell';

import HomePage from '../ui/pages/HomePage';
import ChartPage from '../ui/pages/ChartPage';
import SettingsPage from '../ui/pages/SettingsPage';
import InvitePage from '../ui/pages/InvitePage';
import MemberEditPage from '../ui/pages/MemberEditPage';
import { InputPage } from '../ui/pages/InputPage';
import OnboardingPage from '../ui/pages/OnboardingPage';

import GroupSettingsPage from '../features/settings/group/GroupSettingsPage';
import MedicationSettingsPage from '../features/settings/medication/MedicationSettingsPage';
import PersonalSettingsPage from '../features/settings/personal/PersonalSettingsPage';
import SymptomSettingsPage from '../ui/pages/SymptomSettingsPage';

import SecurityPolicyGate from '../ui/components/SecurityPolicyGate';
import VersionUpdateNotice from '../ui/components/VersionUpdateNotice';

// ★ Phase 2 新機能
import JoinGroupPage from '../ui/pages/JoinGroupPage';
import AiSupportPage from '../ui/pages/AiSupportPage';
import AiSettingsPage from '../ui/pages/settings/AiSettingsPage';
import MedicationBookPage from '../ui/pages/MedicationBookPage';
import MedicationEditPage from '../ui/pages/MedicationEditPage';

// ★ Phase 2 拡張機能
import ConsultationPage from '../ui/pages/ConsultationPage';
import HomeCarePage from '../ui/pages/HomeCarePage';
import QuestionnairePage from '../ui/pages/QuestionnairePage';

export default function AppRouter() {
  return (
    <BrowserRouter>
      <SecurityPolicyGate />
      <VersionUpdateNotice />
      <Routes>
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/join" element={<JoinGroupPage />} />
        
        <Route path="/" element={<HomePage />} />
        <Route path="/chart" element={<ChartPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/invite" element={<InvitePage />} />
        <Route path="/settings/member/edit" element={<MemberEditPage />} />
        <Route path="/input" element={<InputPage />} />

        {/* AIサポート系 */}
        <Route path="/ai-support" element={<AiSupportPage />} />
        <Route path="/settings/ai" element={<AiSettingsPage />} />
        
        {/* お薬手帳 */}
        <Route path="/medication-book" element={<MedicationBookPage />} />
        <Route path="/medication-book/new" element={<MedicationEditPage />} />
        <Route path="/medication-book/edit/:id" element={<MedicationEditPage />} />

        {/* 拡張機能 */}
        <Route path="/consultation" element={<ConsultationPage />} />
        <Route path="/home-care" element={<HomeCarePage />} />
        <Route path="/questionnaire" element={<QuestionnairePage />} />

        <Route element={<AppShell />}>
          <Route path="/settings/group" element={<GroupSettingsPage />} />
          <Route path="/settings/medications" element={<MedicationSettingsPage />} />
          <Route path="/settings/symptoms" element={<SymptomSettingsPage />} />
          <Route path="/settings/personal" element={<PersonalSettingsPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}