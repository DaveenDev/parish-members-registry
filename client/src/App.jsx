import React, { Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext.jsx';
import RegistrationApp from './pages/RegistrationApp.jsx';
import CensusPortal from './pages/CensusPortal.jsx';
import MaintenanceGate from './components/MaintenanceGate.jsx';
import SiteLayout from './pages/site/SiteLayout.jsx';
import Home from './pages/site/Home.jsx';
import Simbahan from './pages/site/Simbahan.jsx';
import Pahibalo from './pages/site/Pahibalo.jsx';
import Komunidad, { GkkDetail } from './pages/site/Komunidad.jsx';
import Serbisyo, { Kontak, Blood } from './pages/site/Serbisyo.jsx';
import CheckStatus from './pages/site/CheckStatus.jsx';
import RequestForm from './pages/site/RequestForm.jsx';
import { EventDetail, AnnouncementDetail, BulletinDetail, ArticleDetail, ArticleRedirect } from './pages/site/Details.jsx';
import AdminLogin from './pages/admin/AdminLogin.jsx';
import AdminLayout from './pages/admin/AdminLayout.jsx';
import Dashboard from './pages/admin/Dashboard.jsx';
import Households from './pages/admin/Households.jsx';
import Members from './pages/admin/Members.jsx';
import Duplicates from './pages/admin/Duplicates.jsx';
import Sacraments from './pages/admin/Sacraments.jsx';
import BloodTypes from './pages/admin/BloodTypes.jsx';
import Ministries from './pages/admin/Ministries.jsx';
import Organizations from './pages/admin/Organizations.jsx';
import Reports from './pages/admin/Reports.jsx';
import Exports from './pages/admin/Exports.jsx';
import ParishConfig from './pages/admin/ParishConfig.jsx';
import Census from './pages/admin/Census.jsx';
import Website from './pages/admin/Website.jsx';
import Requests from './pages/admin/Requests.jsx';
import ManageOrgs from './pages/admin/ManageOrgs.jsx';
import ChangePassword from './pages/admin/ChangePassword.jsx';
import ManageStaff from './pages/admin/ManageStaff.jsx';
import AdminNotFound from './pages/admin/NotFound.jsx';
import ActivityLog from './pages/admin/ActivityLog.jsx';
import Trash from './pages/admin/Trash.jsx';
import Notifications from './pages/admin/Notifications.jsx';
import { LoadingState } from './components/admin.jsx';

// The org chart editor brings React Flow: loaded only when it's opened.
const OrgStructure = React.lazy(() => import('./pages/admin/OrgStructure.jsx'));

function ToSimbahan() {
  const { search, hash } = useLocation();
  return <Navigate to={`/simbahan${search}${hash}`} replace />;
}

function RequireAuth({ children }) {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) return null;
  // Remember the page asked for, so signing in goes back to it.
  const from = location.pathname + location.search + location.hash;
  if (!user) return <Navigate to="/admin/login" replace state={{ from }} />;
  // A new account or an admin password reset: choose a password before anything else.
  if (user.mustChangePassword) return <Navigate to="/admin/change-password" replace state={{ from }} />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route element={<MaintenanceGate />}>
        <Route element={<SiteLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/simbahan" element={<Simbahan />} />
          {/* The page was Misa ug Sakramento: old links keep their ?view=. */}
          <Route path="/misa" element={<ToSimbahan />} />
          <Route path="/misa/kalihokan/:id" element={<EventDetail />} />
          <Route path="/pahibalo" element={<Pahibalo />} />
          <Route path="/pahibalo/bulletin/:id" element={<BulletinDetail />} />
          {/* Articles moved to Komunidad: old shared links still open them. */}
          <Route path="/pahibalo/artikulo/:id" element={<ArticleRedirect />} />
          <Route path="/pahibalo/:id" element={<AnnouncementDetail />} />
          <Route path="/komunidad" element={<Komunidad />} />
          <Route path="/komunidad/artikulo/:id" element={<ArticleDetail />} />
          <Route path="/komunidad/balita/:id" element={<ArticleRedirect />} />
          <Route path="/komunidad/gkk/:name" element={<GkkDetail />} />
          <Route path="/serbisyo" element={<Serbisyo />} />
          <Route path="/serbisyo/susiha" element={<CheckStatus />} />
          <Route path="/serbisyo/dugo" element={<Blood />} />
          <Route path="/serbisyo/hangyo/:form" element={<RequestForm />} />
          <Route path="/kontak" element={<Kontak />} />
        </Route>
        <Route path="/register" element={<RegistrationApp />} />
        <Route path="/census" element={<CensusPortal />} />
        </Route>
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin/change-password" element={<ChangePassword />} />
        <Route
          path="/admin"
          element={
            <RequireAuth>
              <AdminLayout />
            </RequireAuth>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="households" element={<Households />} />
          {/* Old link to the full-page form: open the New Household panel instead. */}
          <Route path="households/new" element={<Navigate to="/admin/households" replace state={{ newHousehold: true }} />} />
          <Route path="members" element={<Members />} />
          <Route path="duplicates" element={<Duplicates />} />
          <Route path="sacraments" element={<Sacraments />} />
          <Route path="blood" element={<BloodTypes />} />
          <Route path="ministries" element={<Ministries />} />
          <Route path="organizations" element={<Organizations />} />
          <Route path="org-structure" element={<Suspense fallback={<LoadingState label="Loading the editor…" />}><OrgStructure /></Suspense>} />
          <Route path="census" element={<Census />} />
          {/* My GKK is a tab of GKK Config now; old links still land there. */}
          <Route path="my-gkk" element={<Navigate to="/admin/settings?tab=mygkk" replace />} />
          <Route path="requests" element={<Requests />} />
          <Route path="website" element={<Website />} />
          <Route path="reports" element={<Reports />} />
          <Route path="exports" element={<Exports />} />
          <Route path="settings" element={<ParishConfig />} />
          <Route path="settings/ministries" element={<Navigate to="/admin/settings/organizations?tab=ministries" replace />} />
          <Route path="settings/organizations" element={<ManageOrgs />} />
          <Route path="settings/staff" element={<ManageStaff />} />
          <Route path="settings/activity" element={<ActivityLog />} />
          <Route path="settings/trash" element={<Trash />} />
          <Route path="settings/notifications" element={<Notifications />} />
          {/* A mistyped admin URL stays inside the admin, not on the public home page. */}
          <Route path="*" element={<AdminNotFound />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
