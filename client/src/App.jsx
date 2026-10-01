import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext.jsx';
import RegistrationApp from './pages/RegistrationApp.jsx';
import CensusPortal from './pages/CensusPortal.jsx';
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
        <Route path="/" element={<RegistrationApp />} />
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
