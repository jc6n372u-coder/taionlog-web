import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from './shell';
import HomePage from '../features/home/HomePage';
import ChartPage from '../features/chart/ChartPage';
import SettingsPage from '../features/settings/SettingsPage';
import GroupSettingsPage from '../features/settings/group/GroupSettingsPage';
import MedicationSettingsPage from '../features/settings/medication/MedicationSettingsPage';
import PersonalSettingsPage from '../features/settings/personal/PersonalSettingsPage';
import OnboardingPage from '../ui/pages/OnboardingPage';
import SecurityPolicyGate from '../ui/components/SecurityPolicyGate';
import VersionUpdateNotice from '../ui/components/VersionUpdateNotice';

export default function AppRouter() {
  // Policy check is handled inside OnboardingPage and SecurityPolicyGate
  return (
    <BrowserRouter>
      {/* グローバルモーダル */}
      <SecurityPolicyGate />
      <VersionUpdateNotice />
      
      <Routes>
        {/* OnboardingはShellの外 */}
        <Route path="/onboarding" element={<OnboardingPage />} />
        
        {/* メインアプリはShellの中 */}
        <Route element={<AppShell />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/chart" element={<ChartPage />} />
          
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/settings/group" element={<GroupSettingsPage />} />
          <Route path="/settings/medication" element={<MedicationSettingsPage />} />
          <Route path="/settings/personal" element={<PersonalSettingsPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
