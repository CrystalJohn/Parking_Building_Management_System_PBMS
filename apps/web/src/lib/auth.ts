const TOKEN_KEY = 'parking_jwt'
const USER_KEY = 'parking_user'

export interface AuthUser {
  id: string
  phone: string
  username?: string | null
  role: 'admin' | 'manager' | 'staff' | 'driver'
  fullName: string
}

// Token management
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function removeToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

export function isAuthenticated(): boolean {
  return getToken() !== null
}

// User info management
export function getUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as AuthUser
  } catch {
    return null
  }
}

export function setUser(user: AuthUser): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function removeUser(): void {
  localStorage.removeItem(USER_KEY)
}

// Combined login/logout helpers
export function saveAuth(token: string, user: AuthUser): void {
  setToken(token)
  setUser(user)
}

export function clearAuth(): void {
  removeToken()
  removeUser()
}

// Role helpers
export function hasRole(role: AuthUser['role']): boolean {
  return getUser()?.role === role
}

export function isStaff(): boolean {
  return hasRole('staff')
}

export function isManager(): boolean {
  return hasRole('manager')
}

export function isAdmin(): boolean {
  return hasRole('admin')
}

export function isDriver(): boolean {
  return hasRole('driver')
}
