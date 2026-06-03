import { BrowserRouter, Routes, Route, Navigate } from 'react-router'
import { ProtectedRoute } from '@/components/auth/protected-route'
import { AppLayout } from '@/components/layout/app-layout'
import LoginPage from '@/pages/login'
import DashboardPage from '@/pages/dashboard'
import MyProfilePage from '@/pages/my-profile'
import AssociationsPage from '@/pages/admin/associations'
import UnitTypesPage from '@/pages/admin/unit-types'
import UnitTypeDetailPage from '@/pages/admin/unit-type-detail'
import RolesPage from '@/pages/admin/roles'
import SettingsPage from '@/pages/admin/settings'
import DocumentTypesPage from '@/pages/admin/document-types'
import AuditLogsPage from '@/pages/admin/audit-logs'
import SecurityProfilesPage from '@/pages/admin/security-profiles'
import UnitsPage from '@/pages/units/index'
import UnitDetailPage from '@/pages/units/detail'
import MembersPage from '@/pages/members/index'
import UnitDocumentsPage from '@/pages/unit-documents'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/my-profile" element={<MyProfilePage />} />
            <Route path="/units" element={<UnitsPage />} />
            <Route path="/units/:id" element={<UnitDetailPage />} />
            <Route path="/members" element={<MembersPage />} />
            <Route path="/members/:id" element={<MembersPage />} />
            <Route path="/unit-documents" element={<UnitDocumentsPage />} />
            <Route path="/admin/associations" element={<AssociationsPage />} />
            <Route path="/admin/unit-types" element={<UnitTypesPage />} />
            <Route path="/admin/unit-types/:id" element={<UnitTypeDetailPage />} />
            <Route path="/admin/roles" element={<RolesPage />} />
            <Route path="/admin/document-types" element={<DocumentTypesPage />} />
            <Route path="/admin/security-profiles" element={<SecurityProfilesPage />} />
            <Route path="/admin/audit-logs" element={<AuditLogsPage />} />
            <Route path="/admin/settings" element={<SettingsPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
