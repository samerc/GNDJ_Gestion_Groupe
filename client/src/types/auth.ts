// Member/chef/admin auth contracts. MeResponse drives client-side authz (permissions + unitAccess);
// isSuperAdmin short-circuits every permission/unit check in the auth store.
export interface AuthResponse {
  userId: string
  memberId: string
  email: string
  accessToken: string
  refreshToken: string
  expiresAt: string
  permissions: string[]
}

export interface MeResponse {
  userId: string
  memberId: string
  email: string
  firstName: string
  lastName: string
  isSuperAdmin: boolean
  permissions: string[]
  unitAccess: UnitAccess[]
  // True when the user must set a new password before using the app (temp/imported/reset password). The app
  // shell shows a blocking change-password screen until it's cleared.
  mustChangePassword?: boolean
  // True when the member leads at least one team (active chef d'équipe assignment) — drives the "Séances" nav
  // for a chef d'équipe who otherwise has no admin permission.
  leadsTeam?: boolean
  // True when the member's dossier was put on hold at the end of the document-verification campaign — Ma fiche /
  // Mes documents show a suspended banner and disable the member's document upload until the CG reactivates them.
  isOnHold?: boolean
}

export interface UnitAccess {
  unitId: string
  unitName: string
  roleName: string
  // True when the member LEADS this unit (role grants members.edit) vs. just belonging to it as a youth.
  isLeader: boolean
  // True when this is a GROUP-LEVEL role (CG/ACG) — the Maîtrise de Groupe assignment, not a real CU/ACU unit.
  isGroupLevel: boolean
}

export interface LoginRequest {
  email: string
  password: string
  website?: string // honeypot — must stay empty for real users
}

export interface RegisterRequest {
  email: string
  password: string
  confirmPassword: string
  firstName: string
  lastName: string
  dateOfBirth?: string
  website?: string // honeypot — must stay empty for real users
}
