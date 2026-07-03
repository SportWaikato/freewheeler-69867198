import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";

import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import Leaderboards from "./pages/Leaderboards";
import Info from "./pages/Info";
import OgImageDownload from "./pages/OgImageDownload";
import NfcTap from "./pages/NfcTap";
import ResetPassword from "./pages/ResetPassword";
import StudentRegistration from "./pages/StudentRegistration";
import Terms from "./pages/Terms";
import BookBike from "./pages/BookBike";
import ProgrammeOverview from "./pages/ProgrammeOverview";
import Resources from "./pages/Resources";
import AdminFlowchart from "./pages/AdminFlowchart";
import LeagueInfo from "./pages/LeagueInfo";
import AdminRegistrations from "./pages/AdminRegistrations";
import AdminBookings from "./pages/AdminBookings";
import PrintBraceletCard from "./pages/PrintBraceletCard";
import A3Poster from "./pages/A3Poster";
import NewsletterBlurb from "./pages/NewsletterBlurb";
import ConsentForm from "./pages/ConsentForm";
import MouTemplate from "./pages/MouTemplate";
import RideGuide from "./pages/RideGuide";
import TeacherGuide from "./pages/TeacherGuide";
import ParentFaq from "./pages/ParentFaq";
import SocialGraphic from "./pages/SocialGraphic";
import EmailInitialOutreach from "./pages/EmailInitialOutreach";
import EmailMouFollowup from "./pages/EmailMouFollowup";
import Help from "./pages/Help";
import RidePage from "./pages/RidePage";
import GamePage from "./pages/GamePage";
import CycleCupPage from "./pages/CycleCupPage";

const queryClient = new QueryClient();

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, loading, nfcSession } = useAuth();

  if (nfcSession) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="font-display text-xl uppercase tracking-wider text-foreground animate-pulse">
          Loading...
        </div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
};

const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, role, loading } = useAuth();

  if (loading) return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="font-display text-xl uppercase tracking-wider text-foreground animate-pulse">Loading...</div>
    </div>
  );
  if (!session) return <Navigate to="/auth" replace />;
  if (role !== 'admin') return <Navigate to="/" replace />;

  return <>{children}</>;
};


const AuthRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, loading } = useAuth();

  if (loading) return null;
  if (session) return <Navigate to="/" replace />;

  return <>{children}</>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/auth" element={<AuthRoute><Auth /></AuthRoute>} />

            <Route path="/" element={<Index />} />
            <Route path="/leaderboards" element={<ProtectedRoute><Leaderboards /></ProtectedRoute>} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/info" element={<ProtectedRoute><Info /></ProtectedRoute>} />
            <Route path="/og-download" element={<ProtectedRoute><OgImageDownload /></ProtectedRoute>} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/league-info" element={<LeagueInfo />} />
            <Route path="/programme-overview" element={<ProgrammeOverview />} />
            <Route path="/book" element={<BookBike />} />
            <Route path="/resources" element={<Resources />} />
            <Route path="/studentregistration" element={<StudentRegistration />} />
            <Route path="/ride" element={<ProtectedRoute><RidePage /></ProtectedRoute>} />
            <Route path="/game/:routeId" element={<ProtectedRoute><GamePage /></ProtectedRoute>} />
            <Route path="/cycle-cup" element={<ProtectedRoute><CycleCupPage /></ProtectedRoute>} />
            <Route path="/admin/flowchart" element={<AdminRoute><AdminFlowchart /></AdminRoute>} />
            <Route path="/admin/registrations" element={<AdminRoute><AdminRegistrations /></AdminRoute>} />
            <Route path="/admin/bookings" element={<AdminRoute><AdminBookings /></AdminRoute>} />
            <Route path="/print/bracelet-card" element={<PrintBraceletCard />} />
            <Route path="/print/a3-poster" element={<A3Poster />} />
            <Route path="/print/consent-form" element={<ConsentForm />} />
            <Route path="/print/mou-template" element={<MouTemplate />} />
            <Route path="/print/ride-guide" element={<RideGuide />} />
            <Route path="/print/bike-instructions" element={<RideGuide />} />
            <Route path="/print/teacher-guide" element={<TeacherGuide />} />
            <Route path="/print/parent-faq" element={<ParentFaq />} />
            <Route path="/print/social-graphic" element={<SocialGraphic />} />
            <Route path="/resources/newsletter-blurb" element={<NewsletterBlurb />} />
            <Route path="/resources/email-initial-outreach" element={<EmailInitialOutreach />} />
            <Route path="/resources/email-mou-followup" element={<EmailMouFollowup />} />
            <Route path="/help" element={<Help />} />
            <Route path="/tap/:token" element={<NfcTap />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
