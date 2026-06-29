import { Link, useLocation } from 'react-router-dom'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'

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
  reports: 'Reports',
  operations: 'Operations',
  payments: 'Payments',
  config: 'Config',
  gate: 'Gate',
  'lost-ticket': 'Lost Ticket',
  home: 'Availability',
  history: 'History',
  'my-session': 'My QR',
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
  const [section = '', page = ''] = pathname.split('/').filter(Boolean)
  const sectionLabel = SECTION_LABELS[section] ?? 'PBMS'
  const pageLabel = PAGE_LABELS[page] ?? sectionLabel
  const sectionHome = SECTION_HOME[section] ?? '/'

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 print:hidden">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />
      <Breadcrumb>
        <BreadcrumbList>
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
