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
import UnitsPage from '@/pages/units/index'
import UnitDetailPage from '@/pages/units/detail'
import MembersPage from '@/pages/members/index'
import MemberDetailPage from '@/pages/members/detail'

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
            <Route path="/members/:id" element={<MemberDetailPage />} />
            <Route path="/admin/associations" element={<AssociationsPage />} />
            <Route path="/admin/unit-types" element={<UnitTypesPage />} />
            <Route path="/admin/unit-types/:id" element={<UnitTypeDetailPage />} />
            <Route path="/admin/roles" element={<RolesPage />} />
            <Route path="/admin/settings" element={<SettingsPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
