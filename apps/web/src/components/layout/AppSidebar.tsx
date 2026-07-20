import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  BarChart3,
  CalendarClock,
  Car,
  CircleDollarSign,
  ClipboardList,
  History,
  LayoutDashboard,
  LogOut,
  Moon,
  QrCode,
  ScanLine,
  Settings,
  ShieldCheck,
  Sun,
  Ticket,
  Users,
  type LucideIcon,
} from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from '@/components/ui/sidebar'
import { Badge } from '@/components/ui/badge'
import { useManagerOperations } from '@/lib/ManagerOperationsContext'
import { clearAuth, getUser, type AuthUser } from '@/lib/auth'
import { useTheme } from '@/lib/ThemeContext'
import { cn } from '@/lib/utils'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  match?: (pathname: string, search: string) => boolean
}

const ROLE_LABELS: Record<AuthUser['role'], string> = {
  admin: 'Administrator',
  manager: 'Manager',
  staff: 'Gate Staff',
  driver: 'Driver',
}

const HOME_BY_ROLE: Record<AuthUser['role'], string> = {
  admin: '/admin/dashboard',
  manager: '/manager/dashboard',
  staff: '/staff/gate',
  driver: '/driver/home',
}

const NAV_BY_ROLE: Record<AuthUser['role'], NavItem[]> = {
  admin: [
    { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/admin/users', label: 'Users', icon: Users },
    { to: '/admin/reservations', label: 'Reservations', icon: CalendarClock },
    { to: '/admin/sessions', label: 'Session History', icon: History },
    { to: '/admin/reports', label: 'Reports & Flags', icon: BarChart3 },
  ],
  manager: [
    { to: '/manager/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/manager/operations', label: 'Operations', icon: ClipboardList },
    { to: '/manager/payments', label: 'Payments', icon: CircleDollarSign },
    { to: '/manager/reservations', label: 'Reservations', icon: CalendarClock },
    { to: '/manager/sessions', label: 'Session History', icon: History },
    { to: '/manager/reports', label: 'Reports', icon: BarChart3 },
    { to: '/manager/vehicles', label: 'Vehicles', icon: Car },
    { to: '/manager/config', label: 'Config', icon: Settings },
  ],
  staff: [
    {
      to: '/staff/gate',
      label: 'Gate',
      icon: ScanLine,
      match: (pathname) => pathname === '/staff/gate',
    },
    { to: '/staff/lost-ticket', label: 'Lost Ticket', icon: Ticket },
  ],
  driver: [
    { to: '/driver/home', label: 'Availability', icon: Car },
    { to: '/driver/reservations', label: 'Reserve', icon: CalendarClock },
    { to: '/driver/my-session', label: 'My QR', icon: QrCode },
    { to: '/driver/history', label: 'History', icon: History },
    { to: '/driver/profile', label: 'Profile', icon: Users },
  ],
}

export default function AppSidebar() {
  const user = getUser()
  const role = user?.role ?? 'driver'
  const navItems = NAV_BY_ROLE[role]
  const navigate = useNavigate()
  const { theme, toggle } = useTheme()
  const initial = (user?.fullName || user?.phone || role)[0].toUpperCase()

  const handleLogout = () => {
    clearAuth()
    navigate('/login', { replace: true })
  }

  return (
    <Sidebar collapsible="icon" className="border-sidebar-border">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg" tooltip="PBMS">
              <NavLink to={HOME_BY_ROLE[role]} className="min-w-0">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-600 text-white shadow-sm shadow-primary-600/20">
                  <ShieldCheck className="size-4" strokeWidth={1.8} />
                </span>
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className="truncate text-sm font-black">PBMS</span>
                  <span className="truncate text-xs text-sidebar-foreground/60">
                    Parking Console
                  </span>
                </span>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <AppSidebarItem key={item.to} item={item} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarSeparator />
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip={theme === 'dark' ? 'Light mode' : 'Dark mode'}
              onClick={toggle}
            >
              {theme === 'dark' ? (
                <Sun className="size-4" strokeWidth={1.8} />
              ) : (
                <Moon className="size-4" strokeWidth={1.8} />
              )}
              <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Sign out"
              onClick={handleLogout}
              className="text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-300 dark:hover:bg-rose-500/10 dark:hover:text-rose-100"
            >
              <LogOut className="size-4" strokeWidth={1.8} />
              <span>Sign out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        <div className="flex items-center gap-3 rounded-lg border border-sidebar-border bg-background/70 p-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:border-transparent group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:p-0">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-xs font-black text-primary-700 ring-1 ring-primary-100 dark:bg-primary-500/15 dark:text-primary-100 dark:ring-primary-400/20">
            {initial}
          </div>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <p className="truncate text-sm font-bold text-sidebar-foreground">
              {user?.fullName || user?.phone || 'User'}
            </p>
            <p className="truncate text-xs font-medium text-sidebar-foreground/60">
              {ROLE_LABELS[role]}
            </p>
          </div>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

function AppSidebarItem({ item }: { item: NavItem }) {
  const location = useLocation()
  const { summary } = useManagerOperations()
  const isActive = item.match
    ? item.match(location.pathname, location.search)
    : location.pathname === item.to
  const Icon = item.icon
  const issueCount = item.to === '/manager/operations' ? summary.openTotal : 0

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        tooltip={item.label}
        isActive={isActive}
        className={cn(
          'min-h-9',
          isActive && 'bg-sidebar-accent text-sidebar-accent-foreground font-semibold',
        )}
      >
        <NavLink to={item.to}>
          <Icon className="size-4" strokeWidth={1.8} />
          <span>{item.label}</span>
          {issueCount > 0 ? (
            <Badge className="ml-auto h-5 min-w-5 justify-center rounded-full px-1.5 text-[10px] font-black group-data-[collapsible=icon]:hidden">
              {issueCount > 99 ? '99+' : issueCount}
            </Badge>
          ) : null}
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}
