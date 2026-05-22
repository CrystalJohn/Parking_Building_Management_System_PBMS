import { NavLink, useNavigate } from 'react-router-dom'
import { clearAuth, getUser, type AuthUser } from '../../lib/auth'

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  manager: 'Quản lý',
  staff: 'Nhân viên',
  driver: 'Tài xế',
}

interface NavItem {
  to: string
  label: string
}

const NAV_BY_ROLE: Record<AuthUser['role'], NavItem[]> = {
  driver: [
    { to: '/driver/home', label: 'Chỗ trống' },
    { to: '/driver/reservations', label: 'Đặt chỗ' },
    { to: '/driver/my-session', label: 'QR của tôi' },
    { to: '/driver/history', label: 'Lịch sử' },
  ],
  staff: [
    { to: '/staff/gate', label: 'Cổng ra/vào' },
    { to: '/staff/lost-ticket', label: 'Mất vé' },
  ],
  manager: [
    { to: '/manager/dashboard', label: 'Bảng điều khiển' },
    { to: '/manager/reports', label: 'Báo cáo' },
    { to: '/manager/config', label: 'Cấu hình' },
  ],
  admin: [
    { to: '/admin/users', label: 'Người dùng' },
  ],
}

/**
 * Shared top header bar with role-based navigation, user info, and logout.
 */
export default function AppHeader() {
  const navigate = useNavigate()
  const user = getUser()
  const navItems = user?.role ? NAV_BY_ROLE[user.role] ?? [] : []

  const handleLogout = () => {
    clearAuth()
    navigate('/login', { replace: true })
  }

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-700">
              {user?.fullName ?? 'User'}
            </span>
            {user?.role && (
              <span className="badge-blue text-xs">
                {ROLE_LABELS[user.role] ?? user.role}
              </span>
            )}
          </div>

          {/* Navigation links */}
          <nav className="flex items-center gap-1 ml-4" aria-label="Main navigation">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }: { isActive: boolean }) =>
                  `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-primary-50 text-primary-700'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>

        <button
          onClick={handleLogout}
          className="btn-secondary text-sm px-3 py-1.5"
        >
          Đăng xuất
        </button>
      </div>
    </header>
  )
}
