import { BrowserRouter, Routes, Route } from 'react-router'
import { ProtectedRoute } from '@/components/auth/protected-route'
import { AdminRoute } from '@/components/auth/admin-route'
import { AppLayout } from '@/components/layout/app-layout'
import { PublicLayout } from '@/components/public/public-layout'
import PublicHomePage from '@/pages/public/home'
import PublicUnitsPage from '@/pages/public/units'
import PublicUnitDetailPage from '@/pages/public/unit-detail'
import PublicNewsPage from '@/pages/public/news'
import PublicNewsArticlePage from '@/pages/public/news-article'
import PublicStandalonePage from '@/pages/public/page'
import PublicContactPage from '@/pages/public/contact'
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
import MyDocumentsPage from '@/pages/my-documents'
import CotisationDashboardPage from '@/pages/admin/cotisation-dashboard'
import ReportTemplatesPage from '@/pages/admin/report-templates'
import ProgressionPathPage from '@/pages/admin/progression-path'
import ForgotPasswordPage from '@/pages/forgot-password'
import ResetPasswordPage from '@/pages/reset-password'
import { ApplicantProtectedRoute } from '@/components/applicant/applicant-protected-route'
import InscriptionLandingPage from '@/pages/inscription/index'
import ApplicantLoginPage from '@/pages/inscription/login'
import ApplicantRegisterPage from '@/pages/inscription/register'
import ApplicantVerifyPage from '@/pages/inscription/verify'
import ApplicantPortalPage from '@/pages/inscription/portail'
import DemandeWizardPage from '@/pages/inscription/demande-wizard'
import DemandeValidationPage from '@/pages/admin/demande-validation'
import AdminNewsPage from '@/pages/admin/news'
import AdminPagesPage from '@/pages/admin/pages'
import AdminSiteTextsPage from '@/pages/admin/site-texts'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public group website (anonymous, modern marketing-style layout) */}
        <Route element={<PublicLayout />}>
          <Route path="/" element={<PublicHomePage />} />
          <Route path="/unites" element={<PublicUnitsPage />} />
          <Route path="/unites/:slug" element={<PublicUnitDetailPage />} />
          <Route path="/actualites" element={<PublicNewsPage />} />
          <Route path="/actualites/:slug" element={<PublicNewsArticlePage />} />
          <Route path="/p/:slug" element={<PublicStandalonePage />} />
          <Route path="/contact" element={<PublicContactPage />} />
        </Route>

        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        {/* Public membership-application portal (isolated applicant auth) */}
        <Route path="/inscription" element={<InscriptionLandingPage />} />
        <Route path="/inscription/login" element={<ApplicantLoginPage />} />
        <Route path="/inscription/register" element={<ApplicantRegisterPage />} />
        <Route path="/inscription/verify" element={<ApplicantVerifyPage />} />
        <Route element={<ApplicantProtectedRoute />}>
          <Route path="/inscription/portail" element={<ApplicantPortalPage />} />
          <Route path="/inscription/portail/demande/:id" element={<DemandeWizardPage />} />
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/my-profile" element={<MyProfilePage />} />
            <Route path="/my-documents" element={<MyDocumentsPage />} />
            <Route path="/units" element={<UnitsPage />} />
            <Route path="/units/:id" element={<UnitDetailPage />} />
            <Route path="/members" element={<MembersPage />} />
            <Route path="/members/:id" element={<MembersPage />} />
            <Route path="/unit-documents" element={<UnitDocumentsPage />} />
            <Route path="/passage" element={<PassagePage />} />
            <Route path="/photo-session" element={<PhotoSessionPage />} />
            <Route element={<AdminRoute />}>
              <Route path="/admin/associations" element={<AssociationsPage />} />
              <Route path="/admin/unit-types" element={<UnitTypesPage />} />
              <Route path="/admin/unit-types/:id" element={<UnitTypeDetailPage />} />
              <Route path="/admin/roles" element={<RolesPage />} />
              <Route path="/admin/document-types" element={<DocumentTypesPage />} />
              <Route path="/admin/progression" element={<ProgressionPage />} />
              <Route path="/admin/security-profiles" element={<SecurityProfilesPage />} />
              <Route path="/admin/audit-logs" element={<AuditLogsPage />} />
              <Route path="/admin/passage-validation" element={<PassageValidationPage />} />
              <Route path="/admin/demandes" element={<DemandeValidationPage />} />
              <Route path="/admin/news" element={<AdminNewsPage />} />
              <Route path="/admin/pages" element={<AdminPagesPage />} />
              <Route path="/admin/site-texts" element={<AdminSiteTextsPage />} />
              <Route path="/admin/api-keys" element={<ApiKeysPage />} />
              <Route path="/admin/custom-fields" element={<CustomFieldsPage />} />
              <Route path="/admin/card-designer" element={<CardDesignerPage />} />
              <Route path="/admin/email-settings" element={<EmailSettingsPage />} />
              <Route path="/admin/settings" element={<SettingsPage />} />
              <Route path="/admin/cotisations" element={<CotisationDashboardPage />} />
              <Route path="/admin/report-templates" element={<ReportTemplatesPage />} />
              <Route path="/admin/progression-path" element={<ProgressionPathPage />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={
          <div className="flex flex-col items-center justify-center h-screen gap-4">
            <h1 className="text-4xl font-bold text-muted-foreground">404</h1>
            <p className="text-muted-foreground">Page introuvable</p>
            <a href="/" className="text-primary hover:underline">Retour à l'accueil</a>
          </div>
        } />
      </Routes>
    </BrowserRouter>
  )
}
