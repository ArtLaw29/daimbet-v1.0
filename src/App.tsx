import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { NavConfigProvider, useNavConfig } from "./contexts/NavConfigContext";
import { useEffect, useState, lazy, Suspense } from "react";
import { motion } from "framer-motion";
import { Shield } from "lucide-react";
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
const ProposalsPage = lazy(() => import("./pages/ProposalsPage"));
const GazettePage = lazy(() => import("./pages/GazettePage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const AdminPage = lazy(() => import("./pages/AdminPage"));
const MaintenancePage = lazy(() => import("./pages/MaintenancePage"));
const NotFound = lazy(() => import("./pages/NotFound"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage"));
import CharterModal from "./components/CharterModal";
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
  const [showCharterFlash, setShowCharterFlash] = useState(() => {
    if (isAdmin) return false;
    const count = parseInt(localStorage.getItem('daimbet_login_count') || '0', 10) + 1;
    localStorage.setItem('daimbet_login_count', String(count));
    return count % 4 === 0;
  });

  useEffect(() => {
    if (showCharterFlash) {
      const timer = setTimeout(() => setShowCharterFlash(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [showCharterFlash]);

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

  // ─── CHARTER MODAL ───
  if (!hasAcceptedCharter && !isAdmin) {
    return (
      <>
        <CharterModal userId={user.id} onAccepted={refreshProfile} />
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="*" element={<div />} />
          </Routes>
        </Suspense>
      </>
    );
  }




  // ─── LOGGED IN ───
  return (
    <>
      {showCharterFlash && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-300">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.4, type: 'spring' }}
            className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 card-glow shadow-2xl"
          >
            <div className="text-center mb-4">
              <Shield className="w-10 h-10 mx-auto text-primary mb-2" />
              <h2 className="text-xl font-display gold-text">📜 Rappel — Charte DaimBet</h2>
            </div>
            <div className="bg-secondary/50 rounded-xl p-4 border border-border/50">
              <p className="text-sm leading-relaxed text-foreground">
                🦌 <strong>On rigole ensemble, jamais aux dépens de quelqu'un.</strong> Les paris méchants ou humiliants n'ont pas leur place ici.
              </p>
              <p className="text-xs text-muted-foreground mt-2">Rake de 5% • Résolution par l'admin • Bonne chance 💸</p>
            </div>
            <div className="mt-3 flex justify-center">
              <div className="h-1 w-full rounded-full bg-secondary overflow-hidden">
                <motion.div
                  className="h-full bg-primary"
                  initial={{ width: '100%' }}
                  animate={{ width: '0%' }}
                  transition={{ duration: 5, ease: 'linear' }}
                />
              </div>
            </div>
          </motion.div>
        </div>
      )}
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
          <Route path="/kiss-marry" element={
            <GuardedRoute tabKey="kiss-marry"><KissMarryPage /></GuardedRoute>
          } />
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
