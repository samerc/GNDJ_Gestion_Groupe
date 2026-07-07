import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router'
import { ProtectedRoute } from '@/components/auth/protected-route'
import { AdminRoute } from '@/components/auth/admin-route'
import { PermissionRoute } from '@/components/auth/permission-route'
import { PERMISSIONS } from '@/lib/constants'
import { AppLayout } from '@/components/layout/app-layout'
import { PublicLayout } from '@/components/public/public-layout'
import { ApplicantProtectedRoute } from '@/components/applicant/applicant-protected-route'
import { ApplicantOpenRoute } from '@/components/applicant/applicant-open-route'
import { LoadingSpinner } from '@/components/shared/loading-spinner'

// Pages are lazy-loaded so each route is its own chunk. This keeps heavy, rarely-reached deps
// (TipTap rich editor, @dnd-kit, dompurify, the camera/photo code) out of the initial bundle —
// a read-only youth member downloads almost none of the admin code. Route guards + layouts stay
// static (they're tiny and frame every route).
const PublicHomePage = lazy(() => import('@/pages/public/home'))
const PublicUnitsPage = lazy(() => import('@/pages/public/units'))
const PublicUnitDetailPage = lazy(() => import('@/pages/public/unit-detail'))
const PublicNewsPage = lazy(() => import('@/pages/public/news'))
const PublicNewsArticlePage = lazy(() => import('@/pages/public/news-article'))
const PublicAgendaPage = lazy(() => import('@/pages/public/agenda'))
const PublicEventPage = lazy(() => import('@/pages/public/event'))
const PublicResourcesPage = lazy(() => import('@/pages/public/ressources'))
const PublicResourcePage = lazy(() => import('@/pages/public/resource'))
const PublicStandalonePage = lazy(() => import('@/pages/public/page'))
const PublicContactPage = lazy(() => import('@/pages/public/contact'))
const LoginPage = lazy(() => import('@/pages/login'))
const ForgotPasswordPage = lazy(() => import('@/pages/forgot-password'))
const ResetPasswordPage = lazy(() => import('@/pages/reset-password'))
const InscriptionLandingPage = lazy(() => import('@/pages/inscription/index'))
const ApplicantLoginPage = lazy(() => import('@/pages/inscription/login'))
const ApplicantRegisterPage = lazy(() => import('@/pages/inscription/register'))
const ApplicantVerifyPage = lazy(() => import('@/pages/inscription/verify'))
const ApplicantPortalPage = lazy(() => import('@/pages/inscription/portail'))
const DemandeWizardPage = lazy(() => import('@/pages/inscription/demande-wizard'))
const DashboardPage = lazy(() => import('@/pages/dashboard'))
const MyProfilePage = lazy(() => import('@/pages/my-profile'))
const MyDocumentsPage = lazy(() => import('@/pages/my-documents'))
const UnitsPage = lazy(() => import('@/pages/units/index'))
const UnitDetailPage = lazy(() => import('@/pages/units/detail'))
const MembersPage = lazy(() => import('@/pages/members/index'))
const UnitDocumentsPage = lazy(() => import('@/pages/unit-documents'))
const PassagePage = lazy(() => import('@/pages/passage'))
const PhotoSessionPage = lazy(() => import('@/pages/photo-session'))
const RentreePage = lazy(() => import('@/pages/rentree'))
const RentreeTemplatePage = lazy(() => import('@/pages/admin/rentree-template'))
const MaitrisesPage = lazy(() => import('@/pages/maitrises'))
const CitiesAdminPage = lazy(() => import('@/pages/admin/cities'))
const CampPage = lazy(() => import('@/pages/camp'))
const CampsAdminPage = lazy(() => import('@/pages/admin/camps'))
const CampDetailPage = lazy(() => import('@/pages/admin/camp-detail'))
const GroupAccessPage = lazy(() => import('@/pages/admin/group-access'))
const SecurityProfilesPage = lazy(() => import('@/pages/admin/security-profiles'))
const DemandeValidationPage = lazy(() => import('@/pages/admin/demande-validation'))
const DemandeStatsPage = lazy(() => import('@/pages/admin/demande-stats'))
const PassageValidationPage = lazy(() => import('@/pages/admin/passage-validation'))
const CotisationDashboardPage = lazy(() => import('@/pages/admin/cotisation-dashboard'))
const ProgressionPage = lazy(() => import('@/pages/admin/progression'))
const DocumentTypesPage = lazy(() => import('@/pages/admin/document-types'))
const AdminNewsPage = lazy(() => import('@/pages/admin/news'))
const AdminEventsPage = lazy(() => import('@/pages/admin/events'))
const AdminResourcesPage = lazy(() => import('@/pages/admin/resources'))
const AdminPagesPage = lazy(() => import('@/pages/admin/pages'))
const AdminSiteTextsPage = lazy(() => import('@/pages/admin/site-texts'))
const AuditLogsPage = lazy(() => import('@/pages/admin/audit-logs'))
const AssociationsPage = lazy(() => import('@/pages/admin/associations'))
const UnitTypesPage = lazy(() => import('@/pages/admin/unit-types'))
const UnitTypeDetailPage = lazy(() => import('@/pages/admin/unit-type-detail'))
const RolesPage = lazy(() => import('@/pages/admin/roles'))
const ApiKeysPage = lazy(() => import('@/pages/admin/api-keys'))
const CustomFieldsPage = lazy(() => import('@/pages/admin/custom-fields'))
const CardDesignerPage = lazy(() => import('@/pages/admin/card-designer'))
const EmailSettingsPage = lazy(() => import('@/pages/admin/email-settings'))
const SettingsPage = lazy(() => import('@/pages/admin/settings'))
const ReportTemplatesPage = lazy(() => import('@/pages/admin/report-templates'))
const ProgressionPathPage = lazy(() => import('@/pages/admin/progression-path'))

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<div className="flex h-screen items-center justify-center"><LoadingSpinner /></div>}>
      <Routes>
        {/* Public group website (anonymous, modern marketing-style layout) */}
        <Route element={<PublicLayout />}>
          <Route path="/" element={<PublicHomePage />} />
          <Route path="/unites" element={<PublicUnitsPage />} />
          <Route path="/unites/:slug" element={<PublicUnitDetailPage />} />
          <Route path="/actualites" element={<PublicNewsPage />} />
          <Route path="/actualites/:slug" element={<PublicNewsArticlePage />} />
          <Route path="/agenda" element={<PublicAgendaPage />} />
          <Route path="/agenda/:slug" element={<PublicEventPage />} />
          <Route path="/ressources" element={<PublicResourcesPage />} />
          <Route path="/ressources/:slug" element={<PublicResourcePage />} />
          <Route path="/p/:slug" element={<PublicStandalonePage />} />
          <Route path="/contact" element={<PublicContactPage />} />
        </Route>

        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        {/* Public membership-application portal (isolated applicant auth) */}
        <Route path="/inscription" element={<InscriptionLandingPage />} />
        {/* Anonymous entry points — hidden (redirected to the landing's "fermées" notice) when inscriptions are closed. */}
        <Route element={<ApplicantOpenRoute />}>
          <Route path="/inscription/login" element={<ApplicantLoginPage />} />
          <Route path="/inscription/register" element={<ApplicantRegisterPage />} />
          <Route path="/inscription/verify" element={<ApplicantVerifyPage />} />
        </Route>
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
            <Route path="/rentree" element={<RentreePage />} />
            <Route element={<PermissionRoute permission={PERMISSIONS.RENTREE_MANAGE} />}>
              <Route path="/admin/rentree-template" element={<RentreeTemplatePage />} />
            </Route>
            {/* Permission-gated admin pages — super-admins always pass; a Chef de Groupe reaches the
                ones their profile allows (group management, no system config). */}
            <Route element={<PermissionRoute permission={PERMISSIONS.MAITRISE_MANAGE} />}>
              <Route path="/maitrises" element={<MaitrisesPage />} />
              <Route path="/admin/cities" element={<CitiesAdminPage />} />
            </Route>
            <Route element={<PermissionRoute permission={PERMISSIONS.CAMP_GRADE} />}>
              <Route path="/camp" element={<CampPage />} />
            </Route>
            <Route element={<PermissionRoute permission={PERMISSIONS.CAMP_MANAGE} />}>
              <Route path="/admin/camps" element={<CampsAdminPage />} />
              <Route path="/admin/camps/:id" element={<CampDetailPage />} />
            </Route>
            <Route element={<PermissionRoute permission={PERMISSIONS.ROLES_VIEW} />}>
              <Route path="/admin/security-profiles" element={<SecurityProfilesPage />} />
            </Route>
            <Route element={<PermissionRoute permission={PERMISSIONS.ROLES_MANAGE_GROUP} />}>
              <Route path="/admin/group-access" element={<GroupAccessPage />} />
            </Route>
            <Route element={<PermissionRoute permission={PERMISSIONS.DEMANDE_VIEW} />}>
              <Route path="/admin/demandes" element={<DemandeValidationPage />} />
              <Route path="/admin/demande-stats" element={<DemandeStatsPage />} />
            </Route>
            <Route element={<PermissionRoute permission={PERMISSIONS.PASSAGE_MANAGE} />}>
              <Route path="/admin/passage-validation" element={<PassageValidationPage />} />
            </Route>
            <Route element={<PermissionRoute permission={PERMISSIONS.COTISATIONS_VIEW} />}>
              <Route path="/admin/cotisations" element={<CotisationDashboardPage />} />
            </Route>
            <Route element={<PermissionRoute permission={PERMISSIONS.PROGRESSION_MANAGE} />}>
              <Route path="/admin/progression" element={<ProgressionPage />} />
            </Route>
            <Route element={<PermissionRoute permission={PERMISSIONS.DOCUMENT_TYPES_VIEW} />}>
              <Route path="/admin/document-types" element={<DocumentTypesPage />} />
            </Route>
            <Route element={<PermissionRoute permission={PERMISSIONS.CONTENT_MANAGE} />}>
              <Route path="/admin/news" element={<AdminNewsPage />} />
              <Route path="/admin/events" element={<AdminEventsPage />} />
              <Route path="/admin/resources" element={<AdminResourcesPage />} />
              <Route path="/admin/pages" element={<AdminPagesPage />} />
              <Route path="/admin/site-texts" element={<AdminSiteTextsPage />} />
            </Route>
            <Route element={<PermissionRoute permission={PERMISSIONS.AUDIT_VIEW} />}>
              <Route path="/admin/audit-logs" element={<AuditLogsPage />} />
            </Route>
            {/* Super-admin only: org structure, roles/permissions, system settings */}
            <Route element={<AdminRoute />}>
              <Route path="/admin/associations" element={<AssociationsPage />} />
              <Route path="/admin/unit-types" element={<UnitTypesPage />} />
              <Route path="/admin/unit-types/:id" element={<UnitTypeDetailPage />} />
              <Route path="/admin/roles" element={<RolesPage />} />
              <Route path="/admin/api-keys" element={<ApiKeysPage />} />
              <Route path="/admin/custom-fields" element={<CustomFieldsPage />} />
              <Route path="/admin/card-designer" element={<CardDesignerPage />} />
              <Route path="/admin/email-settings" element={<EmailSettingsPage />} />
              <Route path="/admin/settings" element={<SettingsPage />} />
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
      </Suspense>
    </BrowserRouter>
  )
}
