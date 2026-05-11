import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { NavConfigProvider, useNavConfig } from "./contexts/NavConfigContext";
import { useEffect, useState, lazy, Suspense } from "react";
import { supabase } from "@/integrations/supabase/client";
import Navbar from "./components/Navbar";

// Lazy-loaded pages for performance
const LandingPage = lazy(() => import("./pages/LandingPage"));
const AuthPage = lazy(() => import("./pages/AuthPage"));
const ContactPage = lazy(() => import("./pages/ContactPage"));
const AdminLoginPage = lazy(() => import("./pages/AdminLoginPage"));
const EventsPage = lazy(() => import("./pages/EventsPage"));
const BetDetailPage = lazy(() => import("./pages/BetDetailPage"));
const LeaderboardPage = lazy(() => import("./pages/LeaderboardPage"));
const KissMarryPage = lazy(() => import("./pages/KissMarryPage"));
const GamesPage = lazy(() => import("./pages/GamesPage"));
const ProposalsPage = lazy(() => import("./pages/ProposalsPage"));
const GazettePage = lazy(() => import("./pages/GazettePage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const AdminPage = lazy(() => import("./pages/AdminPage"));
const MaintenancePage = lazy(() => import("./pages/MaintenancePage"));
const NotFound = lazy(() => import("./pages/NotFound"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage"));
const WelcomePage = lazy(() => import("./pages/WelcomePage"));
const BlackjackPage = lazy(() => import("./pages/BlackjackPage"));
const WordlePage = lazy(() => import("./pages/WordlePage"));
const SudokuPage = lazy(() => import("./pages/SudokuPage"));
const PariExternePage = lazy(() => import("./pages/PariExternePage"));
const MotsCroisesPage = lazy(() => import("./pages/MotsCroisesPage"));
const DuelsPage = lazy(() => import("./pages/DuelsPage"));
const PenduPage = lazy(() => import("./pages/PenduPage"));
const Puissance4Page = lazy(() => import("./pages/Puissance4Page"));
const EchecsPage = lazy(() => import("./pages/EchecsPage"));
import ResolutionNotifier from "./components/ResolutionNotifier";
import RulesScreen from "./components/RulesScreen";
import ErrorBoundary from "./components/ErrorBoundary";

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="animate-pulse text-primary font-display text-2xl">DAIMBet...</div>
  </div>
);

const queryClient = new QueryClient();

/** Route guard: redirects to /feed if tab is hidden by admin */
function GuardedRoute({ tabKey, children }: { tabKey: string; children: React.ReactNode }) {
  const { visibleTabs } = useNavConfig();
  if (visibleTabs[tabKey] === false) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

function AppRoutes() {
  const { user, loading, hasAcceptedCharter, isAdmin, rulesAccepted, refreshProfile } = useAuth();
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceChecked, setMaintenanceChecked] = useState(false);
  // Auto-accept charter silently for new users
  useEffect(() => {
    if (user && !hasAcceptedCharter && !isAdmin) {
      supabase
        .from('profiles')
        .update({ has_accepted_charter: true })
        .eq('user_id', user.id)
        .then(() => refreshProfile());
    }
  }, [user, hasAcceptedCharter, isAdmin]);

  useEffect(() => {
    const checkMaintenance = async () => {
      const { data } = await supabase
        .from('platform_settings')
        .select('value')
        .eq('key', 'maintenance_mode')
        .single();
      setMaintenanceMode(data?.value === 'true');
      setMaintenanceChecked(true);
    };
    checkMaintenance();
  }, []);

  if (loading || !maintenanceChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-primary font-display text-2xl">DAIMBet...</div>
      </div>
    );
  }

  // ─── MAINTENANCE MODE (admin routes always accessible) ───
  if (maintenanceMode && !isAdmin) {
    return (
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/admin/login" element={<AdminLoginPage />} />
          <Route path="*" element={<MaintenancePage />} />
        </Routes>
      </Suspense>
    );
  }

  // ─── NOT LOGGED IN ───
  if (!user) {
    return (
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/connexion" element={<AuthPage />} />
          <Route path="/inscription" element={<AuthPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/admin/login" element={<AdminLoginPage />} />
          <Route path="/welcome" element={<WelcomePage />} />
          <Route path="*" element={<LandingPage />} />
        </Routes>
      </Suspense>
    );
  }



  // ─── RULES GUARD (logged in but rules not yet accepted, e.g. legacy accounts) ───
  if (user && !isAdmin && !rulesAccepted) {
    return (
      <RulesScreen
        acceptLabel="J'accepte les règles"
        onAccept={async () => {
          await supabase
            .from('profiles')
            .update({ rules_accepted: true, rules_accepted_at: new Date().toISOString() } as any)
            .eq('user_id', user.id);
          await refreshProfile();
        }}
      />
    );
  }

  // ─── LOGGED IN ───
  return (
    <>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/welcome" element={<WelcomePage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/" element={<><Navbar /><ResolutionNotifier /><EventsPage /></>} />
          <Route path="/bet/:id" element={<><Navbar /><ResolutionNotifier /><BetDetailPage /></>} />
          <Route path="/connexion" element={<Navigate to="/" replace />} />
          <Route path="/inscription" element={<Navigate to="/" replace />} />
          <Route path="/gazette" element={<><Navbar /><ResolutionNotifier /><GazettePage /></>} />
          <Route path="/classement" element={<><Navbar /><ResolutionNotifier /><GuardedRoute tabKey="classement"><LeaderboardPage /></GuardedRoute></>} />
          <Route path="/jeux" element={<><Navbar /><ResolutionNotifier /><GuardedRoute tabKey="jeux"><GamesPage /></GuardedRoute></>} />
          <Route path="/jeux/blackjack" element={<><Navbar /><ResolutionNotifier /><CasinoGate gameId="blackjack" label="Blackjack"><BlackjackPage /></CasinoGate></>} />
          <Route path="/jeux/wordle" element={<><Navbar /><ResolutionNotifier /><CasinoGate gameId="wordle" label="Wordle"><WordlePage /></CasinoGate></>} />
          <Route path="/jeux/sudoku" element={<><Navbar /><ResolutionNotifier /><CasinoGate gameId="sudoku" label="Sudoku"><SudokuPage /></CasinoGate></>} />
          <Route path="/jeux/pari-externe" element={<><Navbar /><ResolutionNotifier /><CasinoGate gameId="pari-externe" label="Pari externe"><PariExternePage /></CasinoGate></>} />
          <Route path="/jeux/mots-croises" element={<><Navbar /><ResolutionNotifier /><CasinoGate gameId="mots-croises" label="Mots croisés"><MotsCroisesPage /></CasinoGate></>} />
          <Route path="/jeux/duels" element={<><Navbar /><ResolutionNotifier /><CasinoGate gameId="duels" label="Duels"><ErrorBoundary label="DuelsPage"><DuelsPage /></ErrorBoundary></CasinoGate></>} />
          <Route path="/jeux/pendu/:sessionId" element={<><Navbar /><ResolutionNotifier /><PenduPage /></>} />
          <Route path="/jeux/puissance4/:sessionId" element={<><Navbar /><ResolutionNotifier /><Puissance4Page /></>} />
          <Route path="/jeux/echecs/:sessionId" element={<><Navbar /><ResolutionNotifier /><EchecsPage /></>} />
          <Route path="/kiss-marry" element={<Navigate to="/jeux" replace />} />
          <Route path="/profil" element={<><Navbar /><ResolutionNotifier /><ProfilePage /></>} />
          <Route path="/proposals" element={<><Navbar /><ResolutionNotifier /><ProposalsPage /></>} />
          <Route path="/admin" element={<><Navbar /><ResolutionNotifier /><AdminPage /></>} />
          <Route path="/admin/login" element={<><Navbar /><ResolutionNotifier /><AdminPage /></>} />
          <Route path="/archives" element={isAdmin ? <Navigate to="/admin" replace /> : <Navigate to="/" replace />} />
          <Route path="/reset-password" element={<><Navbar /><ResolutionNotifier /><ResetPasswordPage /></>} />
          <Route path="*" element={<><Navbar /><NotFound /></>} />
        </Routes>
      </Suspense>
    </>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <NavConfigProvider>
            <AppRoutes />
          </NavConfigProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
