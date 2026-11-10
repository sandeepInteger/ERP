import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AuthGuard } from "./components/AuthGuard.js";
import { ToastProvider } from "./context/ToastContext.js";
import LoginPage from "./pages/LoginPage.js";
import DashboardPage from "./pages/DashboardPage.js";
import SitesPage from "./pages/ericsson/SitesPage.js";
import NewSitePage from "./pages/ericsson/NewSitePage.js";
import SiteDetailPage from "./pages/ericsson/SiteDetailPage.js";
import ChangeRequestsPage from "./pages/ericsson/ChangeRequestsPage.js";
import UsersPage from "./pages/admin/UsersPage.js";
import RaciPage from "./pages/admin/RaciPage.js";

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<AuthGuard />}>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/ericsson/sites" element={<SitesPage />} />
            <Route path="/ericsson/sites/new" element={<NewSitePage />} />
            <Route path="/ericsson/sites/:id" element={<SiteDetailPage />} />
            <Route path="/ericsson/change-requests" element={<ChangeRequestsPage />} />
            <Route path="/admin/users" element={<UsersPage />} />
            <Route path="/admin/raci" element={<RaciPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </ToastProvider>
    </BrowserRouter>
  );
}
