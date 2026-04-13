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
import ResolutionNotifier from "./components/ResolutionNotifier";

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
  const { user, loading, hasAcceptedCharter, isAdmin, refreshProfile } = useAuth();
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
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/admin/login" element={<AdminLoginPage />} />
          <Route path="*" element={<LandingPage />} />
        </Routes>
      </Suspense>
    );
  }





  // ─── LOGGED IN ───
  return (
    <>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/welcome" element={<WelcomePage />} />
          <Route path="*" element={
            <>
              <Navbar />
              <ResolutionNotifier />
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  <Route path="/" element={<EventsPage />} />
                  <Route path="/bet/:id" element={<BetDetailPage />} />
                  <Route path="/connexion" element={<Navigate to="/" replace />} />
                  <Route path="/inscription" element={<Navigate to="/" replace />} />
                  <Route path="/gazette" element={<GazettePage />} />
                  <Route path="/classement" element={
                    <GuardedRoute tabKey="classement"><LeaderboardPage /></GuardedRoute>
                  } />
                  <Route path="/jeux" element={
                    <GuardedRoute tabKey="jeux"><GamesPage /></GuardedRoute>
                  } />
                  <Route path="/kiss-marry" element={<Navigate to="/jeux" replace />} />
                  <Route path="/profil" element={<ProfilePage />} />
                  <Route path="/proposals" element={<ProposalsPage />} />
                  <Route path="/admin" element={<AdminPage />} />
                  <Route path="/admin/login" element={<AdminPage />} />
                  <Route path="/archives" element={isAdmin ? <Navigate to="/admin" replace /> : <Navigate to="/" replace />} />
                  <Route path="/reset-password" element={<ResetPasswordPage />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </>
          } />
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
