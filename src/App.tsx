import React, { useEffect } from 'react';
import { RouterProvider, useRouter } from './context/RouterContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { HomePage } from './pages/HomePage';
import { ServicesPage } from './pages/ServicesPage';
import { PricingPage } from './pages/PricingPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { BlogsPage } from './pages/BlogsPage';
import { AboutPage } from './pages/AboutPage';
import { ContactPage } from './pages/ContactPage';
import { LegalPage } from './pages/LegalPage';
import { LoginPage } from './pages/LoginPage';
import { SignUpPage } from './pages/SignUpPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { VerifyOtpPage } from './pages/VerifyOtpPage';
import { DashboardOverviewPage } from './pages/dashboard/DashboardOverviewPage';
import { ReleasesPage } from './pages/dashboard/ReleasesPage';
import {
  MyLabelsPage,
  ProfilePage,
  ReportsPage,
  FinancialPage,
  UserManagementPage,
  SupportPage,
  SubscriptionPlanPage,
  WalletTransactionsPage,
  OthersPage,
  YouTubePage,
  ManageArtistsPage,
  SmartLinksPage,
  OtherRequestsPage,
  AdminDashboardPage
} from './pages/dashboard/DashboardModules';
import { SmartLandingPage } from './pages/SmartLandingPage';
import { GoogleDrivePage } from './pages/dashboard/GoogleDrivePage';
import { GoogleSheetsPage } from './pages/dashboard/GoogleSheetsPage';
import { GmailPage } from './pages/dashboard/GmailPage';
import { SuperAdminLoginPage } from './pages/SuperAdminLoginPage';
import { SuperAdminDashboardPage } from './pages/SuperAdminDashboardPage';
import { SeoHead } from './components/common/SeoHead';
import { SeoLandingPage } from './pages/SeoLandingPage';
import { SEO_LANDING_PAGES } from './data/seoLandingPagesData';

const Redirect: React.FC<{ to: string }> = ({ to }) => {
  const { navigate } = useRouter();
  useEffect(() => {
    navigate(to, { replace: true });
  }, [to, navigate]);
  return (
    <div className="min-h-screen bg-[#070b14] flex items-center justify-center text-xs font-mono text-slate-500">
      Redirecting to login...
    </div>
  );
};

const RouteRenderer: React.FC = () => {
  const { path } = useRouter();
  const { user, token, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#070b14] flex items-center justify-center text-xs font-mono text-slate-500">
        Loading Rudraatma Music...
      </div>
    );
  }

  // Protected Dashboard Routes - Strictly redirect unauthenticated users to /login
  if (path === '/dashboard' || path.startsWith('/dashboard/')) {
    if (!user || !token) {
      return <Redirect to={`/login?redirect=${encodeURIComponent(path)}`} />;
    }

    if (path === '/dashboard/labels') return <MyLabelsPage />;
    if (path === '/dashboard/profile') return <ProfilePage />;
    if (path.startsWith('/dashboard/releases')) return <ReleasesPage />;
    if (path === '/dashboard/reports') return <ReportsPage />;
    if (path === '/dashboard/financial') return <FinancialPage />;
    if (path === '/dashboard/users') return <UserManagementPage />;
    if (path === '/dashboard/support') return <SupportPage />;
    if (path === '/dashboard/subscription') return <SubscriptionPlanPage />;
    if (path === '/dashboard/wallet-transactions') return <WalletTransactionsPage />;
    if (path === '/dashboard/others') return <OthersPage />;
    if (path === '/dashboard/youtube') return <YouTubePage />;
    if (path === '/dashboard/artists') return <ManageArtistsPage />;
    if (path === '/dashboard/smart-links') return <SmartLinksPage />;
    if (path === '/dashboard/drive') return <GoogleDrivePage />;
    if (path === '/dashboard/sheets') return <GoogleSheetsPage />;
    if (path === '/dashboard/gmail') return <GmailPage />;
    if (path === '/dashboard/other-requests') return <OtherRequestsPage />;
    return <DashboardOverviewPage />;
  }

  // Super Admin Routes (strictly isolated to SUPER_ADMIN role)
  if (path === '/super-admin/login') {
    if (user && token && user.role === 'SUPER_ADMIN') {
      return <Redirect to="/super-admin" />;
    }
    return <SuperAdminLoginPage />;
  }

  if (path === '/super-admin' || path.startsWith('/super-admin/')) {
    if (!user || !token || user.role !== 'SUPER_ADMIN') {
      return <Redirect to="/super-admin/login" />;
    }
    return <SuperAdminDashboardPage />;
  }

  // Admin Routes
  if (path === '/admin' || path.startsWith('/admin/')) {
    if (!user || !token || (user.role !== 'admin' && user.role !== 'SUPER_ADMIN')) {
      return <Redirect to={`/login?redirect=${encodeURIComponent(path)}`} />;
    }
    return <AdminDashboardPage />;
  }

  // Public Smart Link Landing Pages (/link/:slug)
  if (path.startsWith('/link/')) {
    const slug = path.replace(/^\/link\//, '').split('?')[0].split('/')[0];
    return <SmartLandingPage slug={slug} />;
  }

  // Dedicated SEO Topic & India Distribution Landing Pages
  if (SEO_LANDING_PAGES[path]) {
    return <SeoLandingPage config={SEO_LANDING_PAGES[path]} />;
  }

  // Individual Blog Article Routes (/blogs/:slug)
  if (path.startsWith('/blogs/')) {
    const slug = path.replace(/^\/blogs\//, '').split('?')[0].split('/')[0];
    return <BlogsPage articleSlug={slug} />;
  }

  // Public Routes
  if (path === '/services') return <ServicesPage />;
  if (path === '/pricing') return <PricingPage />;
  if (path === '/checkout' || path === '/checkout/success' || path === '/checkout/failure') return <CheckoutPage />;
  if (path === '/blogs') return <BlogsPage />;
  if (path === '/about') return <AboutPage />;
  if (path === '/contact') return <ContactPage />;
  if (path === '/login') return <LoginPage />;
  if (path === '/signup') return <SignUpPage />;
  if (path === '/verify-otp') return <VerifyOtpPage />;
  if (path === '/forgot-password') return <ForgotPasswordPage />;

  // Legal & Policy Routes
  if (
    path === '/terms' ||
    path === '/privacy' ||
    path === '/refund-policy' ||
    path === '/cancellation-policy' ||
    path === '/distribution-agreement'
  ) {
    return <LegalPage />;
  }

  // Default Home
  return <HomePage />;
};

export default function App() {
  return (
    <ThemeProvider>
      <RouterProvider>
        <AuthProvider>
          <SeoHead />
          <RouteRenderer />
        </AuthProvider>
      </RouterProvider>
    </ThemeProvider>
  );
}
