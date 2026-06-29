import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { getToken, getUser } from '../../lib/auth'
import type { AuthUser } from '../../lib/auth'
import AuthenticatedLayout from '../layout/AuthenticatedLayout'

interface RequireAuthProps {
  /** Child routes/components to render when access is granted */
  children: ReactNode
  /**
   * One or more roles that are allowed to access this route.
   * If omitted, any authenticated user is allowed.
   */
  allowedRoles?: AuthUser['role'][]
}

/**
 * Wraps a route and enforces:
 *  1. The user must be authenticated (valid JWT in localStorage).
 *  2. Optionally, the user's role must be in `allowedRoles`.
 *
 * Unauthenticated users are redirected to /login (with `from` state so
 * the login page can redirect back after a successful login).
 * Authenticated users with the wrong role are redirected to their default
 * home page instead of showing a blank screen.
 */
export default function RequireAuth({
  children,
  allowedRoles,
}: RequireAuthProps) {
  const location = useLocation()
  const token = getToken()
  const user = getUser()

  // Not logged in — send to /login, preserve intended destination
  if (!token || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // Logged in but wrong role
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={defaultHomeForRole(user.role)} replace />
  }

  return <AuthenticatedLayout>{children}</AuthenticatedLayout>
}

/** Returns the default landing page for each role. */
function defaultHomeForRole(role: AuthUser['role']): string {
  switch (role) {
    case 'admin':
      return '/admin/dashboard'
    case 'manager':
      return '/manager/dashboard'
    case 'staff':
      return '/staff/gate'
    case 'driver':
      return '/driver/home'
    default:
      return '/login'
  }
}
