import { Link, useLocation } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { getUser } from '@/lib/auth'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'

const SECTION_LABELS: Record<string, string> = {
  admin: 'Admin',
  manager: 'Manager',
  staff: 'Staff',
  driver: 'Driver',
}

const PAGE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  users: 'Users',
  reservations: 'Reservations',
  sessions: 'Session History',
  reports: 'Reports',
  operations: 'Operations',
  payments: 'Payments',
  config: 'Config',
  vehicles: 'Vehicles',
  gate: 'Gate',
  'lost-ticket': 'Lost Ticket',
  home: 'Availability',
  history: 'History',
  'my-session': 'My QR',
  'my-qr': 'My QR',
  profile: 'Profile',
}

const SECTION_HOME: Record<string, string> = {
  admin: '/admin/dashboard',
  manager: '/manager/dashboard',
  staff: '/staff/gate',
  driver: '/driver/home',
}

export default function AppHeader() {
  const { pathname } = useLocation()
  const user = getUser()
  const [section = '', page = ''] = pathname.split('/').filter(Boolean)
  const sectionLabel = SECTION_LABELS[section] ?? 'PBMS'
  const pageLabel =
    pathname === '/admin/reports'
      ? 'Reports & Flags'
      : user?.role === 'driver' && page === 'reservations'
        ? 'Reserve'
      : PAGE_LABELS[page] ?? sectionLabel
  const sectionHome = SECTION_HOME[section] ?? '/'

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 print:hidden">
      {user?.role === 'driver' ? <div className="flex min-w-0 items-center gap-2 md:hidden"><span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground"><ShieldCheck className="size-4" /></span><span className="truncate text-sm font-black">PBMS</span><span className="text-muted-foreground">/</span><span className="truncate text-sm font-medium">{pageLabel === 'Reservations' ? 'Reserve' : pageLabel}</span></div> : null}
      <Breadcrumb>
        <BreadcrumbList className={user?.role === 'driver' ? 'hidden md:flex' : ''}>
          <BreadcrumbItem className="hidden md:inline-flex">
            <BreadcrumbLink asChild>
              <Link to={sectionHome}>{sectionLabel}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator className="hidden md:inline-flex" />
          <BreadcrumbItem>
            <BreadcrumbPage>{pageLabel}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    </header>
  )
}
