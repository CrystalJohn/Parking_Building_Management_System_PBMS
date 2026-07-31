import { useEffect, useState } from 'react'
import { Car, Clock3, Plus, ShieldCheck, XCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { getUser } from '../../lib/auth'
import { getMyVehicleRegistrationRequests, getMyVehicles, type DriverVehicle, type VehicleRegistrationRequest } from '../../lib/driver-api'
import { formatVehicleType } from '../../lib/plate-format'
import { formatDateTimeVN } from '../../lib/date-time'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export default function Profile() {
  const user = getUser()
  const [vehicles, setVehicles] = useState<DriverVehicle[]>([])
  const [requests, setRequests] = useState<VehicleRegistrationRequest[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadProfileData() {
      try {
        const [vData, rData] = await Promise.all([
          getMyVehicles(),
          getMyVehicleRegistrationRequests(),
        ])
        setVehicles(vData)
        setRequests(rData)
      } catch {
        // Silently handle if profile fails
      } finally {
        setLoading(false)
      }
    }
    void loadProfileData()
  }, [])

  return (
    <div className="min-h-[calc(100dvh-3.5rem)] bg-slate-50/70 p-4 sm:p-6 dark:bg-slate-950/40">
      <div className="mx-auto max-w-3xl space-y-6">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Account Overview</p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">My Profile</h1>
          <p className="mt-1 text-sm text-muted-foreground">Driver account details, linked vehicles, and registration requests.</p>
        </header>

        {/* User Info Card */}
        <section className="rounded-2xl border bg-card p-5 sm:p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-blue-600 font-bold text-white text-xl shadow-md shadow-primary/20">
              {getInitials(user?.fullName)}
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-bold text-foreground">{user?.fullName ?? 'No name set'}</h2>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{user?.role === 'driver' ? 'Driver Account' : user?.role ?? 'User'}</p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border bg-muted/30 p-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Full Name</p>
              <p className="mt-1 font-medium text-foreground text-sm">{user?.fullName ?? 'No name set'}</p>
            </div>
            <div className="rounded-xl border bg-muted/30 p-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Phone Number</p>
              <p className="mt-1 font-medium text-foreground text-sm">{user?.phone ?? 'No phone set'}</p>
            </div>
          </div>
        </section>

        {/* Linked Vehicles Section */}
        <section className="rounded-2xl border bg-card p-5 sm:p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-foreground">Linked Vehicles</h3>
              <p className="text-xs text-muted-foreground">Vehicles approved for parking reservation and gate entry.</p>
            </div>
            <Button asChild size="sm" variant="outline" className="h-9 font-semibold text-xs">
              <Link to="/driver/reservations?action=register">
                <Plus className="mr-1 size-3.5" />
                Link Vehicle
              </Link>
            </Button>
          </div>

          {loading ? (
            <div className="h-20 animate-pulse rounded-xl bg-muted" />
          ) : vehicles.length === 0 ? (
            <div className="rounded-xl border border-dashed p-6 text-center text-xs text-muted-foreground">
              No vehicles linked yet. Submit a registration request to link your vehicle.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {vehicles.map((v) => (
                <div key={v.id} className="flex items-center justify-between rounded-xl border bg-muted/20 p-3.5">
                  <div className="flex items-center gap-3">
                    <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Car className="size-4" />
                    </div>
                    <div>
                      <p className="font-mono text-sm font-bold tracking-wider text-foreground">{v.plateDisplay ?? v.plateNumber}</p>
                      <p className="text-[11px] text-muted-foreground">{formatVehicleType(v.vehicleType)}</p>
                    </div>
                  </div>
                  <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[10px]">
                    Approved
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Registration Request History Section */}
        <section className="rounded-2xl border bg-card p-5 sm:p-6 shadow-sm space-y-4">
          <div>
            <h3 className="text-base font-bold text-foreground">Vehicle Registration Requests</h3>
            <p className="text-xs text-muted-foreground">Status of Cà vẹt document verification requests submitted for manager review.</p>
          </div>

          {loading ? (
            <div className="h-20 animate-pulse rounded-xl bg-muted" />
          ) : requests.length === 0 ? (
            <div className="rounded-xl border border-dashed p-6 text-center text-xs text-muted-foreground">
              No vehicle registration requests found.
            </div>
          ) : (
            <div className="space-y-3">
              {requests.map((r) => {
                const isPending = r.status === 'pending'
                const isApproved = r.status === 'approved'

                return (
                  <div key={r.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border p-4 bg-muted/20">
                    <div className="flex items-center gap-3">
                      <div className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${
                        isPending ? 'bg-amber-500/10 text-amber-600' : isApproved ? 'bg-emerald-500/10 text-emerald-600' : 'bg-rose-500/10 text-rose-600'
                      }`}>
                        {isPending ? <Clock3 className="size-4" /> : isApproved ? <ShieldCheck className="size-4" /> : <XCircle className="size-4" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-bold text-foreground">{r.plateDisplay ?? r.plateNumber}</span>
                          <span className="text-xs text-muted-foreground">({formatVehicleType(r.vehicleType)})</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">Submitted: {formatDateTimeVN(r.createdAt)}</p>
                      </div>
                    </div>
                    <div>
                      {isPending ? (
                        <Badge className="border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300 font-semibold text-xs gap-1">
                          <span className="size-1.5 rounded-full bg-amber-500 animate-ping" />
                          Pending Manager Review
                        </Badge>
                      ) : isApproved ? (
                        <Badge className="border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-semibold text-xs">
                          Approved
                        </Badge>
                      ) : (
                        <Badge className="border-rose-500/30 bg-rose-500/15 text-rose-700 dark:text-rose-300 font-semibold text-xs">
                          Rejected
                        </Badge>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function getInitials(fullName?: string): string {
  if (!fullName?.trim()) return 'U'
  const parts = fullName.trim().split(/\s+/)
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}
