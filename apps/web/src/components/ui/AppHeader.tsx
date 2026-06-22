import { NavLink, useNavigate } from 'react-router-dom'
import { clearAuth, getUser, type AuthUser } from '../../lib/auth'
import { useTheme } from '../../lib/ThemeContext'

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
    { to: '/driver/profile', label: 'Hồ sơ' },
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
 * Glassmorphism top header bar with role-based navigation, user info, and logout.
 */
export default function AppHeader() {
  const navigate = useNavigate()
  const user = getUser()
  const { theme, toggle } = useTheme()
  const navItems = user?.role ? NAV_BY_ROLE[user.role] ?? [] : []

  const handleLogout = () => {
    clearAuth()
    navigate('/login', { replace: true })
  }

  return (
    <header className="sticky top-0 z-50 bg-white/60 dark:bg-[#0a0a0a]/60 backdrop-blur-2xl border-b border-white/20 dark:border-white/10">
      <div className="max-w-[1400px] mx-auto px-6 h-14 flex items-center justify-between">
        {/* Left: User + Nav */}
        <div className="flex items-center gap-4">
          {/* User info */}
          <div className="flex items-center gap-2.5">
            {/* Avatar */}
            <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-600/20">
              <span className="text-white text-xs font-bold">
                {(user?.fullName ?? 'U')[0]}
              </span>
            </div>
            <div>
              <span className="text-[13px] font-semibold text-[#171717] dark:text-[#ededed] block leading-tight">
                {user?.fullName ?? 'User'}
              </span>
              <span className="text-[10px] font-mono text-[#888]">
                {user?.role && (ROLE_LABELS[user.role] ?? user.role)}
              </span>
            </div>
          </div>

          {/* Navigation links */}
          <nav className="hidden sm:flex items-center gap-1 ml-2" aria-label="Main navigation">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }: { isActive: boolean }) =>
                  `px-3 py-1.5 rounded-xl text-[13px] font-medium transition-all ${
                    isActive
                      ? 'bg-white/60 dark:bg-white/10 text-[#171717] dark:text-[#ededed] shadow-sm backdrop-blur-sm border border-white/30 dark:border-white/10'
                      : 'text-[#666] dark:text-[#888] hover:text-[#171717] dark:hover:text-[#ededed] hover:bg-white/40 dark:hover:bg-white/5'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>

        {/* Right: Theme toggle + Logout */}
        <div className="flex items-center gap-2">
          {/* Theme toggle */}
          <button
            onClick={toggle}
            aria-label={theme === 'dark' ? 'Chuyển sang light mode' : 'Chuyển sang dark mode'}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/50 dark:bg-white/10 border border-white/30 dark:border-white/10 hover:bg-white/80 dark:hover:bg-white/20 backdrop-blur-sm transition-all text-[#666] dark:text-[#888] hover:text-[#171717] dark:hover:text-[#ededed]"
          >
            {theme === 'dark' ? (
              /* Sun icon */
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
              </svg>
            ) : (
              /* Moon icon */
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
              </svg>
            )}
          </button>

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="h-8 px-4 flex items-center text-[13px] font-medium bg-white/50 dark:bg-white/10 border border-white/30 dark:border-white/10 rounded-xl hover:bg-white/80 dark:hover:bg-white/20 backdrop-blur-sm transition-all text-[#666] dark:text-[#888] hover:text-[#171717] dark:hover:text-[#ededed]"
          >
            Đăng xuất
          </button>
        </div>
      </div>
    </header>
  )
}
