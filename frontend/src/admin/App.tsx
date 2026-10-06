import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { LoginScreen } from './Login';
import { FlagsScreen } from './screens/Flags';
import { GroupsScreen } from './screens/Groups';
import { OverviewScreen } from './screens/Overview';
import { SettingsScreen } from './screens/Settings';
import { StudentsScreen } from './screens/Students';
import { SessionProvider, useSession } from './session';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false } },
});

function Gate() {
  const { state } = useSession();
  if (state.kind !== 'signed-in') return <LoginScreen />;
  const owner = state.user.role === 'OWNER';
  return (
    <Routes>
      <Route path="/" element={<OverviewScreen />} />
      <Route path="/students" element={<StudentsScreen />} />
      <Route path="/students/:id" element={<StudentsScreen />} />
      <Route path="/flags" element={<FlagsScreen />} />
      <Route path="/flags/:id" element={<FlagsScreen />} />
      <Route path="/groups" element={<GroupsScreen />} />
      <Route path="/settings" element={owner ? <SettingsScreen /> : <Navigate to="/" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <HashRouter>
          <Gate />
        </HashRouter>
      </SessionProvider>
    </QueryClientProvider>
  );
}
