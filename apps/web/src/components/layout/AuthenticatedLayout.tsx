import type { ReactNode } from 'react'
import AppHeader from '../ui/AppHeader'

interface Props {
  children: ReactNode
}

/**
 * Layout wrapper for all authenticated pages.
 * Renders the shared header (with logout button) above page content.
 */
export default function AuthenticatedLayout({ children }: Props) {
  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader />
      <main className="flex-1">{children}</main>
    </div>
  )
}
