import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext.jsx';
import RegistrationApp from './pages/RegistrationApp.jsx';
import CensusPortal from './pages/CensusPortal.jsx';
import SiteLayout from './pages/site/SiteLayout.jsx';
import Home from './pages/site/Home.jsx';
import Misa from './pages/site/Misa.jsx';
import Pahibalo from './pages/site/Pahibalo.jsx';
import Komunidad, { GkkDetail } from './pages/site/Komunidad.jsx';
import Serbisyo, { Kontak, Blood } from './pages/site/Serbisyo.jsx';
import CheckStatus from './pages/site/CheckStatus.jsx';
import RequestForm from './pages/site/RequestForm.jsx';
import { EventDetail, AnnouncementDetail, BulletinDetail, ArticleDetail } from './pages/site/Details.jsx';
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
import ManageMinistries from './pages/admin/ManageMinistries.jsx';
import ManageOrgs from './pages/admin/ManageOrgs.jsx';
import ManageStaff from './pages/admin/ManageStaff.jsx';

function RequireAuth({ children }) {
  const { user, ready } = useAuth();
  if (!ready) return null;
  if (!user) return <Navigate to="/admin/login" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route element={<SiteLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/misa" element={<Misa />} />
          <Route path="/misa/kalihokan/:id" element={<EventDetail />} />
          <Route path="/pahibalo" element={<Pahibalo />} />
          <Route path="/pahibalo/bulletin/:id" element={<BulletinDetail />} />
          <Route path="/pahibalo/:id" element={<AnnouncementDetail />} />
          <Route path="/komunidad" element={<Komunidad />} />
          <Route path="/komunidad/balita/:id" element={<ArticleDetail />} />
          <Route path="/komunidad/gkk/:name" element={<GkkDetail />} />
          <Route path="/serbisyo" element={<Serbisyo />} />
          <Route path="/serbisyo/susiha" element={<CheckStatus />} />
          <Route path="/serbisyo/dugo" element={<Blood />} />
          <Route path="/serbisyo/hangyo/:form" element={<RequestForm />} />
          <Route path="/kontak" element={<Kontak />} />
        </Route>
        <Route path="/register" element={<RegistrationApp />} />
        <Route path="/census" element={<CensusPortal />} />
        <Route path="/admin/login" element={<AdminLogin />} />
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
          <Route path="census" element={<Census />} />
          <Route path="requests" element={<Requests />} />
          <Route path="website" element={<Website />} />
          <Route path="reports" element={<Reports />} />
          <Route path="exports" element={<Exports />} />
          <Route path="settings" element={<ParishConfig />} />
          <Route path="settings/ministries" element={<ManageMinistries />} />
          <Route path="settings/organizations" element={<ManageOrgs />} />
          <Route path="settings/staff" element={<ManageStaff />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
