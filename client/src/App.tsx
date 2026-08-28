import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router'
import { ProtectedRoute } from '@/components/auth/protected-route'
import { AdminRoute } from '@/components/auth/admin-route'
import { PermissionRoute } from '@/components/auth/permission-route'
import { PERMISSIONS } from '@/lib/constants'
import { AppLayout } from '@/components/layout/app-layout'
import { PublicLayout } from '@/components/public/public-layout'
import { ApplicantProtectedRoute } from '@/components/applicant/applicant-protected-route'
import { ApplicantOpenRoute } from '@/components/applicant/applicant-open-route'
import { ApplicantMaintenanceGate } from '@/components/applicant/applicant-maintenance-gate'
import { ApplicantTermsGate } from '@/components/applicant/applicant-terms-gate'
import { ApplicantVerifyGate } from '@/components/applicant/applicant-verify-gate'
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
const ForgotUsernamePage = lazy(() => import('@/pages/forgot-username'))
const ResetPasswordPage = lazy(() => import('@/pages/reset-password'))
const InscriptionLandingPage = lazy(() => import('@/pages/inscription/index'))
const ApplicantLoginPage = lazy(() => import('@/pages/inscription/login'))
const ApplicantRegisterPage = lazy(() => import('@/pages/inscription/register'))
const ApplicantVerifyPage = lazy(() => import('@/pages/inscription/verify'))
const ApplicantForgotPasswordPage = lazy(() => import('@/pages/inscription/forgot-password'))
const ApplicantResetPasswordPage = lazy(() => import('@/pages/inscription/reset-password'))
const ApplicantConditionsPage = lazy(() => import('@/pages/inscription/conditions'))
const ApplicantPortalPage = lazy(() => import('@/pages/inscription/portail'))
const DemandeWizardPage = lazy(() => import('@/pages/inscription/demande-wizard'))
const DemandeResultPage = lazy(() => import('@/pages/inscription/demande-result'))
const DashboardPage = lazy(() => import('@/pages/dashboard'))
const MyProfilePage = lazy(() => import('@/pages/my-profile'))
const MyDocumentsPage = lazy(() => import('@/pages/my-documents'))
const MyTrombinoscopePage = lazy(() => import('@/pages/my-trombinoscope'))
const UnitsPage = lazy(() => import('@/pages/units/index'))
const UnitDetailPage = lazy(() => import('@/pages/units/detail'))
const MembersPage = lazy(() => import('@/pages/members/index'))
const UnitDocumentsPage = lazy(() => import('@/pages/unit-documents'))
const PassagePage = lazy(() => import('@/pages/passage'))
const PhotoSessionPage = lazy(() => import('@/pages/photo-session'))
const RentreePage = lazy(() => import('@/pages/rentree'))
const AttendancePage = lazy(() => import('@/pages/attendance/index'))
const RentreeTemplatePage = lazy(() => import('@/pages/admin/rentree-template'))
const MaitrisesPage = lazy(() => import('@/pages/maitrises'))
const SiblingsPage = lazy(() => import('@/pages/admin/siblings'))
const CommunicationsAccesPage = lazy(() => import('@/pages/admin/communications-acces'))
const ManagedListsPage = lazy(() => import('@/pages/admin/managed-lists'))
const CampPage = lazy(() => import('@/pages/camp'))
const CampsAdminPage = lazy(() => import('@/pages/admin/camps'))
const CampDetailPage = lazy(() => import('@/pages/admin/camp-detail'))
const RolesAccessPage = lazy(() => import('@/pages/admin/roles-access'))
const DemandeValidationPage = lazy(() => import('@/pages/admin/demande-validation'))
const ChangeRequestsPage = lazy(() => import('@/pages/admin/change-requests'))
const OrganizeUnitPage = lazy(() => import('@/pages/organize-unit'))
const DeletedMembersPage = lazy(() => import('@/pages/admin/deleted-members'))
const DocumentsSuiviPage = lazy(() => import('@/pages/admin/documents-suivi'))
const DemandeStatsPage = lazy(() => import('@/pages/admin/demande-stats'))
const DemandeAccountsPage = lazy(() => import('@/pages/admin/demande-accounts'))
const DemandeArchivesPage = lazy(() => import('@/pages/admin/demande-archives'))
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
const ErrorLogPage = lazy(() => import('@/pages/admin/error-log'))
const EmailOutboxPage = lazy(() => import('@/pages/admin/email-outbox'))
const ChangelogPage = lazy(() => import('@/pages/admin/changelog'))
const UnitTypesPage = lazy(() => import('@/pages/admin/unit-types'))
const UnitTypeDetailPage = lazy(() => import('@/pages/admin/unit-type-detail'))
const RolesPage = lazy(() => import('@/pages/admin/roles'))
const ApiKeysPage = lazy(() => import('@/pages/admin/api-keys'))
// Associations / Champs personnalisés / Carte membre are now tabs inside Paramètres (settings.tsx), not routes.
const EmailSettingsPage = lazy(() => import('@/pages/admin/email-settings'))
const SettingsPage = lazy(() => import('@/pages/admin/settings'))
const AppearancePage = lazy(() => import('@/pages/admin/appearance'))
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
        <Route path="/forgot-username" element={<ForgotUsernamePage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        {/* Public membership-application portal (isolated applicant auth). The gate shows a maintenance page
            for the whole area when the site or "demande" module is turned off from settings. */}
        <Route element={<ApplicantMaintenanceGate />}>
          <Route path="/inscription" element={<InscriptionLandingPage />} />
          {/* Anonymous entry points — hidden (redirected to the landing's "fermées" notice) when inscriptions are closed. */}
          <Route element={<ApplicantOpenRoute />}>
            <Route path="/inscription/login" element={<ApplicantLoginPage />} />
            <Route path="/inscription/verify" element={<ApplicantVerifyPage />} />
            {/* Password reset — reachable whenever the portal is open (like login), even during the review phase. */}
            <Route path="/inscription/forgot-password" element={<ApplicantForgotPasswordPage />} />
            <Route path="/inscription/reset-password" element={<ApplicantResetPasswordPage />} />
          </Route>
          {/* Register also needs the submission window open (blocked during the CG review phase). */}
          <Route element={<ApplicantOpenRoute submissionsRequired />}>
            <Route path="/inscription/register" element={<ApplicantRegisterPage />} />
          </Route>
          <Route element={<ApplicantProtectedRoute />}>
            {/* Enforce email verification (when required) FIRST, then T&C, before the portal/wizard. /verify
                (anonymous route above) and /conditions sit outside their own gate to avoid a redirect loop. */}
            <Route element={<ApplicantVerifyGate />}>
              <Route path="/inscription/conditions" element={<ApplicantConditionsPage />} />
              <Route element={<ApplicantTermsGate />}>
                <Route path="/inscription/portail" element={<ApplicantPortalPage />} />
                {/* Result page for a demande whose response has been sent (accepted → steps / declined → reason). */}
                <Route path="/inscription/portail/demande/:id/resultat" element={<DemandeResultPage />} />
                <Route path="/inscription/portail/demande/:id" element={<DemandeWizardPage />} />
              </Route>
            </Route>
          </Route>
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/my-profile" element={<MyProfilePage />} />
            <Route path="/my-documents" element={<MyDocumentsPage />} />
            <Route path="/my-trombinoscope" element={<MyTrombinoscopePage />} />
            <Route path="/units" element={<UnitsPage />} />
            <Route path="/units/:id" element={<UnitDetailPage />} />
            <Route path="/members" element={<MembersPage />} />
            <Route path="/members/:id" element={<MembersPage />} />
            <Route path="/unit-documents" element={<UnitDocumentsPage />} />
            <Route path="/passage" element={<PassagePage />} />
            <Route path="/photo-session" element={<PhotoSessionPage />} />
            <Route path="/rentree" element={<RentreePage />} />
            {/* Réunions / absences — authenticated-only (a chef d'équipe has no permission; the page shows an
                empty scope if the caller manages nothing). Backend enforces per-unit/per-team access. */}
            <Route path="/attendance" element={<AttendancePage />} />
            <Route element={<PermissionRoute permission={PERMISSIONS.MEMBERS_EDIT} />}>
              <Route path="/change-requests" element={<ChangeRequestsPage />} />
              <Route path="/organiser" element={<OrganizeUnitPage />} />
            </Route>
            <Route element={<PermissionRoute permission={PERMISSIONS.MEMBERS_DELETE} />}>
              <Route path="/admin/deleted-members" element={<DeletedMembersPage />} />
            </Route>
            <Route element={<PermissionRoute permission={PERMISSIONS.MEMBERS_RESET_PASSWORD} />}>
              <Route path="/admin/communications-acces" element={<CommunicationsAccesPage />} />
              {/* Back-compat: "Envoyer les accès" + "Message aux chefs" merged into "Communications & accès". */}
              <Route path="/admin/send-access" element={<Navigate to="/admin/communications-acces?tab=acces" replace />} />
              <Route path="/admin/communications" element={<Navigate to="/admin/communications-acces?tab=chefs" replace />} />
            </Route>
            <Route element={<PermissionRoute permission={PERMISSIONS.MAITRISE_MANAGE} />}>
              <Route path="/admin/documents-suivi" element={<DocumentsSuiviPage />} />
              {/* Back-compat: the two pages were merged into "Suivi des documents". */}
              <Route path="/admin/document-verification" element={<Navigate to="/admin/documents-suivi" replace />} />
              <Route path="/admin/document-reminders" element={<Navigate to="/admin/documents-suivi" replace />} />
            </Route>
            <Route element={<PermissionRoute permission={PERMISSIONS.RENTREE_MANAGE} />}>
              <Route path="/admin/rentree-template" element={<RentreeTemplatePage />} />
            </Route>
            {/* Permission-gated admin pages — super-admins always pass; a Chef de Groupe reaches the
                ones their profile allows (group management, no system config). */}
            <Route element={<PermissionRoute permission={PERMISSIONS.MAITRISE_MANAGE} />}>
              <Route path="/maitrises" element={<MaitrisesPage />} />
              <Route path="/admin/siblings" element={<SiblingsPage />} />
              <Route path="/admin/lists" element={<ManagedListsPage />} />
            </Route>
            <Route element={<PermissionRoute permission={PERMISSIONS.CAMP_GRADE} />}>
              <Route path="/camp" element={<CampPage />} />
            </Route>
            <Route element={<PermissionRoute permission={PERMISSIONS.CAMP_MANAGE} />}>
              <Route path="/admin/camps" element={<CampsAdminPage />} />
              <Route path="/admin/camps/:id" element={<CampDetailPage />} />
            </Route>
            <Route element={<PermissionRoute permission={PERMISSIONS.MAITRISE_MANAGE} />}>
              {/* Merged "Profils & accès" page (security profiles + group-access delegation, each a permission-gated tab).
                  Manager-only (maitrise.manage): a Chef d'Unité holds roles.view for the Fonction picker but must NOT
                  browse the authorization model / enumerate who holds each profile — matches the backend gate. */}
              <Route path="/admin/roles-access" element={<RolesAccessPage />} />
              {/* Back-compat redirects for the two former routes/bookmarks. */}
              <Route path="/admin/security-profiles" element={<Navigate to="/admin/roles-access" replace />} />
              <Route path="/admin/group-access" element={<Navigate to="/admin/roles-access" replace />} />
            </Route>
            <Route element={<PermissionRoute permission={PERMISSIONS.DEMANDE_VIEW} />}>
              <Route path="/admin/demandes" element={<DemandeValidationPage />} />
              <Route path="/admin/demande-stats" element={<DemandeStatsPage />} />
              <Route path="/admin/demande-accounts" element={<DemandeAccountsPage />} />
              <Route path="/admin/demande-archives" element={<DemandeArchivesPage />} />
            </Route>
            {/* Rejection motifs moved into Paramètres → Inscriptions tab; keep the old route as a redirect. */}
            <Route path="/admin/rejection-reasons" element={<Navigate to="/admin/settings" replace />} />
            <Route element={<PermissionRoute permission={PERMISSIONS.PASSAGE_MANAGE} />}>
              <Route path="/admin/passage-validation" element={<PassageValidationPage />} />
            </Route>
            {/* Group-wide cotisation dashboard = CG only (every CU has cotisations.view for their own unit
                cells, so gating on that leaked the whole group's totals to a CU). CU stats live on their unit page. */}
            <Route element={<PermissionRoute permission={PERMISSIONS.MAITRISE_MANAGE} />}>
              <Route path="/admin/cotisations" element={<CotisationDashboardPage />} />
            </Route>
            <Route element={<PermissionRoute permission={PERMISSIONS.PROGRESSION_MANAGE} />}>
              <Route path="/admin/progression" element={<ProgressionPage />} />
            </Route>
            {/* Paramètres is CG-reachable: the page + backend filter it to the operational categories a
                Chef de Groupe may edit (super-admin sees every category + the admin-only config tabs). */}
            <Route element={<PermissionRoute permission={PERMISSIONS.MAITRISE_MANAGE} />}>
              <Route path="/admin/settings" element={<SettingsPage />} />
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
              <Route path="/admin/unit-types" element={<UnitTypesPage />} />
              <Route path="/admin/unit-types/:id" element={<UnitTypeDetailPage />} />
              <Route path="/admin/roles" element={<RolesPage />} />
              <Route path="/admin/api-keys" element={<ApiKeysPage />} />
              <Route path="/admin/email-settings" element={<EmailSettingsPage />} />
              <Route path="/admin/appearance" element={<AppearancePage />} />
              <Route path="/admin/error-log" element={<ErrorLogPage />} />
              <Route path="/admin/email-outbox" element={<EmailOutboxPage />} />
              <Route path="/admin/changelog" element={<ChangelogPage />} />
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
