import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { I18nProvider } from './contexts/I18nContext';
import { PortalPage } from './pages/PortalPage';
import { CustomerMenuPage } from './pages/customer/CustomerMenuPage';
import { StaffPortalPage } from './pages/staff/StaffPortalPage';
import { ChefKdsPage } from './pages/chef/ChefKdsPage';
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage';

export default function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<PortalPage />} />
            <Route path="/menu" element={<CustomerMenuPage />} />
            <Route path="/menu/t/:token" element={<CustomerMenuPage />} />
            <Route path="/staff" element={<StaffPortalPage />} />
            <Route path="/chef" element={<ChefKdsPage />} />
            <Route path="/admin" element={<AdminDashboardPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </I18nProvider>
  );
}
