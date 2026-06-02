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
}

export interface UnitAccess {
  unitId: string
  unitName: string
  roleName: string
}

export interface LoginRequest {
  email: string
  password: string
}

export interface RegisterRequest {
  email: string
  password: string
  confirmPassword: string
  firstName: string
  lastName: string
  dateOfBirth?: string
}
