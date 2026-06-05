import { BrowserRouter, Routes, Route } from 'react-router'
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
import ProgressionPage from '@/pages/admin/progression'
import UnitsPage from '@/pages/units/index'
import UnitDetailPage from '@/pages/units/detail'
import MembersPage from '@/pages/members/index'
import UnitDocumentsPage from '@/pages/unit-documents'
import PassagePage from '@/pages/passage'
import PhotoSessionPage from '@/pages/photo-session'
import PassageValidationPage from '@/pages/admin/passage-validation'
import ApiKeysPage from '@/pages/admin/api-keys'
import CustomFieldsPage from '@/pages/admin/custom-fields'
import CardDesignerPage from '@/pages/admin/card-designer'
import EmailSettingsPage from '@/pages/admin/email-settings'
import ForgotPasswordPage from '@/pages/forgot-password'
import ResetPasswordPage from '@/pages/reset-password'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/my-profile" element={<MyProfilePage />} />
            <Route path="/units" element={<UnitsPage />} />
            <Route path="/units/:id" element={<UnitDetailPage />} />
            <Route path="/members" element={<MembersPage />} />
            <Route path="/members/:id" element={<MembersPage />} />
            <Route path="/unit-documents" element={<UnitDocumentsPage />} />
            <Route path="/passage" element={<PassagePage />} />
            <Route path="/photo-session" element={<PhotoSessionPage />} />
            <Route path="/admin/associations" element={<AssociationsPage />} />
            <Route path="/admin/unit-types" element={<UnitTypesPage />} />
            <Route path="/admin/unit-types/:id" element={<UnitTypeDetailPage />} />
            <Route path="/admin/roles" element={<RolesPage />} />
            <Route path="/admin/document-types" element={<DocumentTypesPage />} />
            <Route path="/admin/progression" element={<ProgressionPage />} />
            <Route path="/admin/security-profiles" element={<SecurityProfilesPage />} />
            <Route path="/admin/audit-logs" element={<AuditLogsPage />} />
            <Route path="/admin/passage-validation" element={<PassageValidationPage />} />
            <Route path="/admin/api-keys" element={<ApiKeysPage />} />
            <Route path="/admin/custom-fields" element={<CustomFieldsPage />} />
            <Route path="/admin/card-designer" element={<CardDesignerPage />} />
            <Route path="/admin/email-settings" element={<EmailSettingsPage />} />
            <Route path="/admin/settings" element={<SettingsPage />} />
          </Route>
        </Route>

        <Route path="*" element={
          <div className="flex flex-col items-center justify-center h-screen gap-4">
            <h1 className="text-4xl font-bold text-muted-foreground">404</h1>
            <p className="text-muted-foreground">Page introuvable</p>
            <a href="/" className="text-primary hover:underline">Retour au tableau de bord</a>
          </div>
        } />
      </Routes>
    </BrowserRouter>
  )
}
