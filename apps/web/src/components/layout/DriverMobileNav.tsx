import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { CalendarClock, CarFront, History, LogOut, Moon, MoreHorizontal, QrCode, UserRound, Zap, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { clearAuth } from '@/lib/auth'
import { useTheme } from '@/lib/ThemeContext'

const NAV = [
  { to: '/driver/home', label: 'Availability', icon: CarFront },
  { to: '/driver/reservations', label: 'Reserve', icon: CalendarClock },
  { to: '/driver/my-session', label: 'My QR', icon: QrCode },
]

export default function DriverMobileNav() {
  const [moreOpen, setMoreOpen] = useState(false)
  const navigate = useNavigate()
  const { theme, toggle } = useTheme()
  const signOut = () => { clearAuth(); navigate('/login', { replace: true }) }

  return <>
    <nav aria-label="Driver navigation" className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur md:hidden">
      <div className="grid h-16 grid-cols-4 px-2">
        {NAV.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} className={({ isActive }) => `flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${isActive ? 'text-primary' : 'text-muted-foreground'}`}><Icon className="size-5" strokeWidth={1.9} /><span>{label}</span></NavLink>)}
        <button type="button" aria-label="Open more driver options" aria-expanded={moreOpen} onClick={() => setMoreOpen(true)} className={`flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-medium text-muted-foreground transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${moreOpen ? 'text-primary' : ''}`}><MoreHorizontal className="size-5" /><span>More</span></button>
      </div>
    </nav>
    <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
      <SheetContent side="bottom" className="rounded-t-3xl pb-[calc(1rem+env(safe-area-inset-bottom))] md:hidden">
        <SheetHeader><SheetTitle>More</SheetTitle><SheetDescription>Manage your driver account and parking history.</SheetDescription></SheetHeader>
        <div className="grid gap-2 px-4 pb-2">
          <MoreLink to="/driver/subscriptions" label="Subscriptions" icon={Zap} onClick={() => setMoreOpen(false)} />
          <MoreLink to="/driver/history" label="History" icon={History} onClick={() => setMoreOpen(false)} />
          <MoreLink to="/driver/profile" label="Profile" icon={UserRound} onClick={() => setMoreOpen(false)} />
          <Button type="button" variant="outline" className="min-h-11 justify-start" onClick={toggle}><Moon className="mr-3 size-4" />{theme === 'dark' ? 'Use light mode' : 'Use dark mode'}</Button>
          <Button type="button" variant="outline" className="min-h-11 justify-start text-rose-700 dark:text-rose-200" onClick={signOut}><LogOut className="mr-3 size-4" />Sign out</Button>
        </div>
      </SheetContent>
    </Sheet>
  </>
}

function MoreLink({ to, label, icon: Icon, onClick }: { to: string; label: string; icon: LucideIcon; onClick: () => void }) { return <Button asChild variant="outline" className="min-h-11 justify-start" onClick={onClick}><NavLink to={to}><Icon className="mr-3 size-4" />{label}</NavLink></Button> }
