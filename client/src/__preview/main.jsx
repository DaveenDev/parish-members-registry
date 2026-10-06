// TEMP: dev-only preview of the registration wizard, without the maintenance gate.
import React from 'react';
import ReactDOM from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from '../ThemeContext.jsx';
import { ToastProvider } from '../ToastContext.jsx';
import { ConfirmProvider } from '../components/ConfirmDialog.jsx';
import { AuthProvider } from '../AuthContext.jsx';
import RegistrationApp from '../pages/RegistrationApp.jsx';
import '../index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <ThemeProvider><ToastProvider><ConfirmProvider><AuthProvider>
    <MemoryRouter initialEntries={['/register']}>
      <Routes><Route path="/register" element={<RegistrationApp />} /></Routes>
    </MemoryRouter>
  </AuthProvider></ConfirmProvider></ToastProvider></ThemeProvider>
);
