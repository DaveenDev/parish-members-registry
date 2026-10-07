import React, { Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext.jsx';
import MaintenanceGate from './components/MaintenanceGate.jsx';
import SiteLayout from './pages/site/SiteLayout.jsx';
import Home from './pages/site/Home.jsx';
import Simbahan from './pages/site/Simbahan.jsx';
import Pagbasa from './pages/site/Pagbasa.jsx';
import Pahibalo from './pages/site/Pahibalo.jsx';
import Komunidad, { GkkDetail } from './pages/site/Komunidad.jsx';
import { ArticlesArchive } from './pages/site/Articles.jsx';
import Serbisyo, { Kontak, Blood } from './pages/site/Serbisyo.jsx';
import CheckStatus from './pages/site/CheckStatus.jsx';
import RequestForm from './pages/site/RequestForm.jsx';
import SiteNotFound from './pages/site/NotFound.jsx';
import { EventDetail, AnnouncementDetail, BulletinDetail, ArticleDetail, ArticleRedirect } from './pages/site/Details.jsx';

// The public website is in the main bundle. Registration, the census portal
// and the whole admin load only when they're opened, so visitors on mobile
// data don't download the staff pages. The admin pages show their spinner
// inside AdminLayout while they load.
const RegistrationApp = React.lazy(() => import('./pages/RegistrationApp.jsx'));
const CensusPortal = React.lazy(() => import('./pages/CensusPortal.jsx'));
const AdminLogin = React.lazy(() => import('./pages/admin/AdminLogin.jsx'));
const AdminLayout = React.lazy(() => import('./pages/admin/AdminLayout.jsx'));
const Dashboard = React.lazy(() => import('./pages/admin/Dashboard.jsx'));
const Households = React.lazy(() => import('./pages/admin/Households.jsx'));
const Members = React.lazy(() => import('./pages/admin/Members.jsx'));
const Duplicates = React.lazy(() => import('./pages/admin/Duplicates.jsx'));
const Sacraments = React.lazy(() => import('./pages/admin/Sacraments.jsx'));
const BloodTypes = React.lazy(() => import('./pages/admin/BloodTypes.jsx'));
const Ministries = React.lazy(() => import('./pages/admin/Ministries.jsx'));
const Organizations = React.lazy(() => import('./pages/admin/Organizations.jsx'));
const Reports = React.lazy(() => import('./pages/admin/Reports.jsx'));
const Exports = React.lazy(() => import('./pages/admin/Exports.jsx'));
const ParishConfig = React.lazy(() => import('./pages/admin/ParishConfig.jsx'));
const Census = React.lazy(() => import('./pages/admin/Census.jsx'));
const Website = React.lazy(() => import('./pages/admin/Website.jsx'));
const Requests = React.lazy(() => import('./pages/admin/Requests.jsx'));
const ManageOrgs = React.lazy(() => import('./pages/admin/ManageOrgs.jsx'));
const ChangePassword = React.lazy(() => import('./pages/admin/ChangePassword.jsx'));
const ManageStaff = React.lazy(() => import('./pages/admin/ManageStaff.jsx'));
const AdminNotFound = React.lazy(() => import('./pages/admin/NotFound.jsx'));
const ActivityLog = React.lazy(() => import('./pages/admin/ActivityLog.jsx'));
const Trash = React.lazy(() => import('./pages/admin/Trash.jsx'));
const Notifications = React.lazy(() => import('./pages/admin/Notifications.jsx'));
// The org chart editor brings React Flow.
const OrgStructure = React.lazy(() => import('./pages/admin/OrgStructure.jsx'));

/** A page loaded on demand, outside the admin layout: the plain background while it loads. */
function Lazy({ children }) {
  return <Suspense fallback={<div className="min-h-screen bg-parish-bg" />}>{children}</Suspense>;
}

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
          <Route path="/simbahan/pagbasa" element={<Pagbasa />} />
          {/* The page was Misa ug Sakramento: old links keep their ?view=. */}
          <Route path="/misa" element={<ToSimbahan />} />
          <Route path="/misa/kalihokan/:id" element={<EventDetail />} />
          <Route path="/pahibalo" element={<Pahibalo />} />
          <Route path="/pahibalo/bulletin/:id" element={<BulletinDetail />} />
          {/* Articles moved to Komunidad: old shared links still open them. */}
          <Route path="/pahibalo/artikulo/:id" element={<ArticleRedirect />} />
          <Route path="/pahibalo/:id" element={<AnnouncementDetail />} />
          <Route path="/komunidad" element={<Komunidad />} />
          <Route path="/komunidad/artikulo" element={<ArticlesArchive />} />
          <Route path="/komunidad/artikulo/:id" element={<ArticleDetail />} />
          <Route path="/komunidad/balita/:id" element={<ArticleRedirect />} />
          <Route path="/komunidad/gkk/:name" element={<GkkDetail />} />
          <Route path="/serbisyo" element={<Serbisyo />} />
          <Route path="/serbisyo/susiha" element={<CheckStatus />} />
          <Route path="/serbisyo/dugo" element={<Blood />} />
          <Route path="/serbisyo/hangyo/:form" element={<RequestForm />} />
          <Route path="/kontak" element={<Kontak />} />
          {/* A mistyped or old public link says so, instead of quietly opening Home. */}
          <Route path="*" element={<SiteNotFound />} />
        </Route>
        <Route path="/register" element={<Lazy><RegistrationApp /></Lazy>} />
        <Route path="/census" element={<Lazy><CensusPortal /></Lazy>} />
        </Route>
        <Route path="/admin/login" element={<Lazy><AdminLogin /></Lazy>} />
        <Route path="/admin/change-password" element={<Lazy><ChangePassword /></Lazy>} />
        <Route
          path="/admin"
          element={
            <RequireAuth>
              <Lazy><AdminLayout /></Lazy>
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
          <Route path="org-structure" element={<OrgStructure />} />
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
      </Routes>
    </AuthProvider>
  );
}
