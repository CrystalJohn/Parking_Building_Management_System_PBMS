import { NavLink, useNavigate } from 'react-router-dom'
import { clearAuth, getUser, type AuthUser } from '../../lib/auth'
import { useTheme } from '../../lib/ThemeContext'

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  manager: 'Manager',
  staff: 'Staff',
  driver: 'Driver',
}

interface NavItem {
  to: string
  label: string
}

const NAV_BY_ROLE: Record<AuthUser['role'], NavItem[]> = {
  driver: [
    { to: '/driver/home', label: 'Availability' },
    { to: '/driver/reservations', label: 'Reserve' },
    { to: '/driver/my-session', label: 'My QR' },
    { to: '/driver/history', label: 'History' },
    { to: '/driver/profile', label: 'Profile' },
  ],
  staff: [
    { to: '/staff/gate', label: 'Gate' },
    { to: '/staff/lost-ticket', label: 'Lost Ticket' },
  ],
  manager: [
    { to: '/manager/dashboard', label: 'Dashboard' },
    { to: '/manager/reports', label: 'Reports' },
    { to: '/manager/config', label: 'Config' },
  ],
  admin: [
    { to: '/admin/users', label: 'Users' },
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
    <header className="sticky top-0 z-50 bg-slate-200/40 dark:bg-slate-900/40 backdrop-blur-md px-4 py-3 print:hidden">
      <div className="max-w-[1400px] mx-auto flex items-center justify-between gap-4">
        {/* Left: Menu toggle + Profile avatar */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="w-10 h-10 flex items-center justify-center rounded-full bg-white/70 dark:bg-slate-800/70 border border-slate-200/50 shadow-sm text-slate-700 dark:text-slate-200 transition hover:bg-white"
            aria-label="Menu"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 bg-gradient-to-br from-primary-500 to-slate-950 rounded-full flex items-center justify-center shadow-md text-white font-bold text-sm">
              {(user?.fullName ?? 'U')[0].toUpperCase()}
            </div>
            <div className="hidden md:block">
              <p className="text-xs font-bold text-slate-800 dark:text-slate-100 leading-tight">
                {user?.fullName ?? 'User'}
              </p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                {user?.role && (ROLE_LABELS[user.role] ?? user.role)}
              </p>
            </div>
          </div>
        </div>

        {/* Middle: Pill tabs container */}
        <nav
          className="rounded-full border border-slate-200 bg-white/70 p-1 shadow-sm flex items-center gap-1 dark:border-slate-800 dark:bg-slate-900/60"
          aria-label="Main navigation"
        >
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }: { isActive: boolean }) =>
                `rounded-full px-5 py-1.5 text-xs font-bold transition-all ${
                  isActive
                    ? 'bg-slate-900 text-white shadow-sm dark:bg-slate-100 dark:text-slate-950'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-950 hover:bg-white/50 dark:hover:bg-slate-800/50'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Right: Theme, notification, and sign out */}
        <div className="flex items-center gap-2">
          {/* Notification bell (mock) */}
          <button
            type="button"
            className="w-10 h-10 flex items-center justify-center rounded-full bg-white/70 dark:bg-slate-800/70 border border-slate-200/50 shadow-sm text-slate-700 dark:text-slate-200 transition hover:bg-white relative"
            aria-label="Notifications"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
            </svg>
            <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-rose-500 rounded-full border border-white" />
          </button>

          {/* Theme toggle */}
          <button
            onClick={toggle}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-white/70 dark:bg-slate-800/70 border border-slate-200/50 shadow-sm text-slate-700 dark:text-slate-200 transition hover:bg-white"
          >
            {theme === 'dark' ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
              </svg>
            )}
          </button>

          {/* Logout */}
          <button
            onClick={handleLogout}
            title="Sign out"
            className="w-10 h-10 flex items-center justify-center rounded-full bg-white/70 dark:bg-slate-800/70 border border-slate-200/50 shadow-sm text-slate-700 dark:text-rose-400 hover:text-rose-500 transition hover:bg-white"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  )
}
