import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { NavConfigProvider, useNavConfig } from "./contexts/NavConfigContext";
import Navbar from "./components/Navbar";
import LandingPage from "./pages/LandingPage";
import AuthPage from "./pages/AuthPage";
import AdminLoginPage from "./pages/AdminLoginPage";
import EventsPage from "./pages/EventsPage";
import BetDetailPage from "./pages/BetDetailPage";
import LeaderboardPage from "./pages/LeaderboardPage";
import KissMarryPage from "./pages/KissMarryPage";
import ProposalsPage from "./pages/ProposalsPage";
import GazettePage from "./pages/GazettePage";
import ProfilePage from "./pages/ProfilePage";
import AdminPage from "./pages/AdminPage";
import NotFound from "./pages/NotFound";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import CharterModal from "./components/CharterModal";

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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-primary font-display text-2xl">DAIMBet...</div>
      </div>
    );
  }

  // ─── NOT LOGGED IN ───
  if (!user) {
    return (
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/connexion" element={<AuthPage />} />
        <Route path="/inscription" element={<AuthPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="*" element={<LandingPage />} />
      </Routes>
    );
  }

  // ─── CHARTER MODAL ───
  if (!hasAcceptedCharter && !isAdmin) {
    return (
      <>
        <CharterModal userId={user.id} onAccepted={refreshProfile} />
        <Routes>
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="*" element={<div />} />
        </Routes>
      </>
    );
  }

  // ─── LOGGED IN ───
  return (
    <>
      <Navbar />
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
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
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
