import { useState, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  BarChart3,
  CalendarClock,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  ShieldCheck,
  Sun,
  Users,
  X,
} from 'lucide-react'
import { clearAuth, getUser, type AuthUser } from '../lib/auth'
import { useTheme } from '../lib/ThemeContext'

interface AdminLayoutProps {
  children: ReactNode
}

interface AdminNavItem {
  to: string
  label: string
  roles: AuthUser['role'][]
  icon: typeof LayoutDashboard
}

const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  {
    to: '/admin/dashboard',
    label: 'Dashboard',
    roles: ['admin', 'manager'],
    icon: LayoutDashboard,
  },
  {
    to: '/admin/users',
    label: 'Manage Users',
    roles: ['admin'],
    icon: Users,
  },
  {
    to: '/admin/reservations',
    label: 'Reservations',
    roles: ['admin', 'manager'],
    icon: CalendarClock,
  },
  {
    to: '/admin/reports',
    label: 'Reports & Flags',
    roles: ['admin', 'manager'],
    icon: BarChart3,
  },
]

const ROLE_LABELS: Record<AuthUser['role'], string> = {
  admin: 'Administrator',
  manager: 'Manager',
  staff: 'Staff',
  driver: 'Driver',
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const user = getUser()
  const navigate = useNavigate()
  const { theme, toggle } = useTheme()
  const [mobileOpen, setMobileOpen] = useState(false)
  const role = user?.role ?? 'admin'
  const navItems = ADMIN_NAV_ITEMS.filter((item) => item.roles.includes(role))

  const handleLogout = () => {
    clearAuth()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-[100dvh] bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-white">
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="fixed left-4 top-4 z-40 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-primary-200 hover:text-primary-700 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 lg:hidden"
        aria-label="Open admin navigation"
      >
        <Menu className="h-5 w-5" strokeWidth={1.8} />
      </button>

      {mobileOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden"
          aria-label="Close admin navigation"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r border-slate-200 bg-white shadow-xl shadow-slate-200/40 transition-transform duration-200 dark:border-white/10 dark:bg-slate-900 dark:shadow-none lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex h-full flex-col p-4">
          <div className="flex items-center justify-between gap-3 px-1 py-2">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary-600 text-white shadow-sm shadow-primary-600/30">
                <ShieldCheck className="h-5 w-5" strokeWidth={1.8} />
              </div>
              <div>
                <p className="text-sm font-black tracking-tight">PBMS</p>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Admin Console
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-white/10 dark:hover:text-white lg:hidden"
              aria-label="Close admin navigation"
            >
              <X className="h-5 w-5" strokeWidth={1.8} />
            </button>
          </div>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/[0.04]">
            <p className="truncate text-sm font-bold text-slate-900 dark:text-white">
              {user?.fullName || user?.phone || 'Admin user'}
            </p>
            <p className="mt-0.5 text-xs font-semibold text-primary-700 dark:text-primary-100">
              {ROLE_LABELS[role]}
            </p>
          </div>

          <nav className="mt-6 space-y-1" aria-label="Admin navigation">
            {navItems.map((item) => (
              <SidebarNavItem
                key={item.to}
                item={item}
                onNavigate={() => setMobileOpen(false)}
              />
            ))}
          </nav>

          <div className="mt-auto space-y-2 border-t border-slate-200 pt-4 dark:border-white/10">
            <button
              type="button"
              onClick={toggle}
              className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
            >
              {theme === 'dark' ? (
                <Sun className="h-4 w-4" strokeWidth={1.8} />
              ) : (
                <Moon className="h-4 w-4" strokeWidth={1.8} />
              )}
              {theme === 'dark' ? 'Light mode' : 'Dark mode'}
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-bold text-rose-600 transition hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-500/10"
            >
              <LogOut className="h-4 w-4" strokeWidth={1.8} />
              Sign out
            </button>
          </div>
        </div>
      </aside>

      <main className="min-h-[100dvh] px-4 py-6 pt-16 sm:px-6 lg:ml-60 lg:px-8 lg:py-8 lg:pt-8">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
    </div>
  )
}

function SidebarNavItem({
  item,
  onNavigate,
}: {
  item: AdminNavItem
  onNavigate: () => void
}) {
  const Icon = item.icon

  return (
    <NavLink
      to={item.to}
      onClick={onNavigate}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-bold transition ${
          isActive
            ? 'bg-primary-50 text-primary-700 ring-1 ring-primary-100 dark:bg-primary-500/15 dark:text-primary-100 dark:ring-primary-400/20'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white'
        }`
      }
    >
      <Icon className="h-4 w-4" strokeWidth={1.8} />
      <span>{item.label}</span>
    </NavLink>
  )
}
