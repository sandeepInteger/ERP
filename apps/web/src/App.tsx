import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AuthGuard } from "./components/AuthGuard.js";
import { ToastProvider } from "./context/ToastContext.js";
import LoginPage from "./pages/LoginPage.js";
import DashboardPage from "./pages/DashboardPage.js";
import SitesPage from "./pages/ericsson/SitesPage.js";
import NewSitePage from "./pages/ericsson/NewSitePage.js";
import SiteDetailPage from "./pages/ericsson/SiteDetailPage.js";
import ChangeRequestsPage from "./pages/ericsson/ChangeRequestsPage.js";
import MyWorkPage from "./pages/ericsson/MyWorkPage.js";
import ExpensesPage from "./pages/ericsson/ExpensesPage.js";
import ReportsPage from "./pages/ericsson/ReportsPage.js";
import FieldTodayPage from "./pages/field/FieldTodayPage.js";
import FieldLogPage from "./pages/field/FieldLogPage.js";
import FieldCrPage from "./pages/field/FieldCrPage.js";
import FieldWorkUpdatePage from "./pages/field/FieldWorkUpdatePage.js";
import FieldExpensesPage from "./pages/field/FieldExpensesPage.js";
import ExpenseApprovalsPage from "./pages/ExpenseApprovalsPage.js";
import UsersPage from "./pages/admin/UsersPage.js";
import RaciPage from "./pages/admin/RaciPage.js";
import NotificationsSettingsPage from "./pages/admin/NotificationsSettingsPage.js";

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
            <Route path="/my-work" element={<MyWorkPage />} />
            <Route path="/ericsson/expenses" element={<ExpensesPage />} />
            <Route path="/ericsson/reports" element={<ReportsPage />} />
            <Route path="/field" element={<FieldTodayPage />} />
            <Route path="/field/sites/:id/log" element={<FieldLogPage />} />
            <Route path="/field/sites/:id/cr" element={<FieldCrPage />} />
            <Route path="/field/work/:id" element={<FieldWorkUpdatePage />} />
            <Route path="/field/expenses" element={<FieldExpensesPage />} />
            <Route path="/approvals/expenses" element={<ExpenseApprovalsPage />} />
            <Route path="/admin/users" element={<UsersPage />} />
            <Route path="/admin/raci" element={<RaciPage />} />
            <Route path="/admin/notifications" element={<NotificationsSettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </ToastProvider>
    </BrowserRouter>
  );
}
