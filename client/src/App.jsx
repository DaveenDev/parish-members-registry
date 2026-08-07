import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext.jsx';
import RegistrationApp from './pages/RegistrationApp.jsx';
import AdminLogin from './pages/admin/AdminLogin.jsx';
import ForgotPassword from './pages/admin/ForgotPassword.jsx';
import ResetPassword from './pages/admin/ResetPassword.jsx';
import AdminLayout from './pages/admin/AdminLayout.jsx';
import Dashboard from './pages/admin/Dashboard.jsx';
import Households from './pages/admin/Households.jsx';
import NewHousehold from './pages/admin/NewHousehold.jsx';
import Members from './pages/admin/Members.jsx';
import Sacraments from './pages/admin/Sacraments.jsx';
import Ministries from './pages/admin/Ministries.jsx';
import Organizations from './pages/admin/Organizations.jsx';
import Reports from './pages/admin/Reports.jsx';
import Exports from './pages/admin/Exports.jsx';
import ParishConfig from './pages/admin/ParishConfig.jsx';
import ManageMinistries from './pages/admin/ManageMinistries.jsx';
import ManageOrgs from './pages/admin/ManageOrgs.jsx';

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
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin/forgot-password" element={<ForgotPassword />} />
        <Route path="/admin/reset-password" element={<ResetPassword />} />
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
          <Route path="households/new" element={<NewHousehold />} />
          <Route path="members" element={<Members />} />
          <Route path="sacraments" element={<Sacraments />} />
          <Route path="ministries" element={<Ministries />} />
          <Route path="organizations" element={<Organizations />} />
          <Route path="reports" element={<Reports />} />
          <Route path="exports" element={<Exports />} />
          <Route path="settings" element={<ParishConfig />} />
          <Route path="settings/ministries" element={<ManageMinistries />} />
          <Route path="settings/organizations" element={<ManageOrgs />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
