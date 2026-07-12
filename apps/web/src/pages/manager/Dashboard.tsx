import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  Banknote,
  CalendarClock,
  Car,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  CreditCard,
  Flag,
  Gauge,
  Layers3,
  ParkingCircle,
  ShieldCheck,
  Timer,
  AlertTriangle,
  AlertCircle,
  Clock,
  Bike,
} from 'lucide-react'
import api from '../../lib/api'
import { useManagerOperations } from '../../lib/ManagerOperationsContext'
import {
  getAdminPendingPayments,
  getAdminSummary,
  getAdminSlotOccupancyMap,
  type AdminOperationFlag,
  type AdminOperationsFlags,
  type AdminPendingPaymentItem,
  type AdminPendingPayments,
  type AdminSummary,
  type PaymentMonitoringRisk,
  type AdminSlotOccupancyMap,
  type SlotOccupancyMapSlot,
  type SlotOccupancyMapSession,
  type SlotOccupancyMapRiskLevel,
} from '../../lib/admin-api'
import { type OperationIssue } from '../../lib/operation-issues-api'
import { formatDateTimeVN } from '../../lib/date-time'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/card'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog'

// ─── Types ────────────────────────────────────────────────────────────────────

type Zone = 'A' | 'B'

interface FloorGroup {
  floorNumber: number
  floorName: string
  zoneA: SlotOccupancyMapSlot[]
  zoneB: SlotOccupancyMapSlot[]
}

interface TrafficRow {
  entryCount: number
  exitCount: number
}

interface TodayTraffic {
  checkIns: number | null
  checkOuts: number | null
}

// ─── Constants ─────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 10_000

const STATUS_LABELS: Record<string, string> = {
  available: 'Available',
  occupied: 'Occupied',
  reserved: 'Reserved',
  maintenance: 'Maintenance',
}

const STATUS_DOT: Record<string, string> = {
  available: 'bg-emerald-400',
  occupied: 'bg-rose-400',
  reserved: 'bg-amber-400',
  maintenance: 'bg-slate-500',
}

const RISK_BORDER: Record<SlotOccupancyMapRiskLevel, string> = {
  normal: 'border-l-emerald-400',
  warning: 'border-l-amber-400',
  critical: 'border-l-rose-500',
}

const RISK_BADGE_CLASS: Record<SlotOccupancyMapRiskLevel, string> = {
  normal: 'bg-emerald-400/10 text-emerald-700 dark:text-emerald-300 ring-emerald-400/20',
  warning: 'bg-amber-400/10 text-amber-700 dark:text-amber-300 ring-amber-400/20',
  critical: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-rose-500/20',
}

export const todayIsoDate = () => new Date().toISOString().slice(0, 10)

// ─── LiveClock ────────────────────────────────────────────────────────────────
function LiveClock() {
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const dateStr = now.toLocaleDateString('en-GB', {
    weekday: 'long',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })

  const timeStr = now.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })

  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm dark:border-white/10 dark:bg-white/[0.02]">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-50 text-cyan-600 dark:bg-cyan-400/10 dark:text-cyan-400">
        <Clock className="h-4 w-4" strokeWidth={2.5} />
      </div>
      <div className="flex flex-col">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{dateStr}</span>
        <span className="text-sm font-black text-slate-950 dark:text-white tabular-nums leading-tight">{timeStr}</span>
      </div>
    </div>
  )
}

// ─── LiveDuration ─────────────────────────────────────────────────────────────
/**
 * Ticks every minute and formats as "Xh Ym" or "Ym".
 * Uses a stable container width to prevent layout shift.
 */
function LiveDuration({ checkInTime }: { checkInTime: string }) {
  const calcDuration = () => {
    const mins = Math.floor((Date.now() - new Date(checkInTime).getTime()) / 60_000)
    if (mins < 60) return `${mins}m`
    const h = Math.floor(mins / 60)
    const m = mins % 60
    return m > 0 ? `${h}h ${m}m` : `${h}h`
  }

  const [label, setLabel] = useState(calcDuration)

  useEffect(() => {
    const id = window.setInterval(() => setLabel(calcDuration()), 60_000)
    return () => clearInterval(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkInTime])

  return <span className="tabular-nums">{label}</span>
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const [occupancyMap, setOccupancyMap] = useState<AdminSlotOccupancyMap | null>(null)
  const [summary, setSummary] = useState<AdminSummary | null>(null)
  const [pendingPayments, setPendingPayments] = useState<AdminPendingPayments | null>(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedFloorNumber, setSelectedFloorNumber] = useState<number | null>(null)
  const [selectedZone, setSelectedZone] = useState<Zone>('A')
  const [selectedSlot, setSelectedSlot] = useState<SlotOccupancyMapSlot | null>(null)
  const { issues: operationIssues, summary: operationIssueSummary, connected: issueStreamConnected } = useManagerOperations()

  const loadDashboard = useCallback(async () => {
    try {
      const [mapData, summaryData, paymentData] = await Promise.all([
        getAdminSlotOccupancyMap(),
        getAdminSummary(),
        getAdminPendingPayments(),
      ])

      setOccupancyMap(mapData)
      setSummary(summaryData)
      setPendingPayments(paymentData)
      setError(null)
    } catch {
      setError('Unable to load manager operations telemetry')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadDashboard()
    const interval = window.setInterval(() => void loadDashboard(), POLL_INTERVAL_MS)
    return () => window.clearInterval(interval)
  }, [loadDashboard])

  // Build flat floor groups from occupancy map
  const floors = useMemo<FloorGroup[]>(() => {
    if (!occupancyMap) return []
    return occupancyMap.floors.map((floor) => {
      const zoneA: SlotOccupancyMapSlot[] = []
      const zoneB: SlotOccupancyMapSlot[] = []
      for (const zone of floor.zones) {
        if (zone.zone === 'A') zoneA.push(...zone.slots)
        else zoneB.push(...zone.slots)
      }
      return { floorNumber: floor.floorNumber, floorName: floor.floorName, zoneA, zoneB }
    })
  }, [occupancyMap])

  // Auto-select first floor if none selected or current is gone
  useEffect(() => {
    if (floors.length === 0) { setSelectedFloorNumber(null); return }
    const hasSelected = floors.some((f) => f.floorNumber === selectedFloorNumber)
    if (!hasSelected) setSelectedFloorNumber(floors[0].floorNumber)
  }, [floors, selectedFloorNumber])

  // Keep selectedSlot fresh after each poll
  useEffect(() => {
    if (!selectedSlot) return
    const allSlots = floors.flatMap((f) => [...f.zoneA, ...f.zoneB])
    const updated = allSlots.find((s) => s.id === selectedSlot.id)
    if (updated) setSelectedSlot(updated)
    else setSelectedSlot(null)
  }, [floors]) // eslint-disable-line react-hooks/exhaustive-deps

  const slotTotals = useMemo(() => {
    const slots = floors.flatMap((f) => [...f.zoneA, ...f.zoneB])
    const total = slots.length
    const available = slots.filter((s) => s.status === 'available').length
    const occupied = slots.filter((s) => s.status === 'occupied').length
    const reserved = slots.filter((s) => s.status === 'reserved').length
    const maintenance = slots.filter((s) => s.status === 'maintenance').length
    const occupancyRate = total > 0 ? Math.round((occupied / total) * 100) : 0
    return { total, available, occupied, reserved, maintenance, occupancyRate }
  }, [floors])

  const selectedFloor = useMemo(
    () => floors.find((f) => f.floorNumber === selectedFloorNumber) ?? null,
    [floors, selectedFloorNumber],
  )

  const currentSlots = useMemo(() => {
    if (!selectedFloor) return []
    return selectedZone === 'A' ? selectedFloor.zoneA : selectedFloor.zoneB
  }, [selectedFloor, selectedZone])

  const kpis = buildKpis(summary, pendingPayments, slotTotals)

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-5 text-slate-950 transition-colors duration-300 dark:bg-slate-950 dark:text-slate-100 lg:px-6">
      <div className="mx-auto max-w-[1500px] space-y-5">
        
        {/* Header with Live Clock */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white">Manager Dashboard</h1>
            <p className="mt-1 text-sm font-medium text-slate-500">Live operational telemetry and facility overview.</p>
          </div>
          <LiveClock />
        </div>

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-100">
            {error}
          </div>
        ) : null}

        {loading ? <DashboardSkeleton /> : null}

        {!loading ? (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {kpis.map((kpi) => (
                <KpiCard key={kpi.label} {...kpi} />
              ))}
            </section>

            <OperationsQueueCard
              issues={operationIssues}
              openTotal={operationIssueSummary.openTotal}
              connected={issueStreamConnected}
            />

            {/* ─── Slot Occupancy Map ─────────────────────────────────────── */}
            <Card className="shadow-sm">
              <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between pb-4">
                <div>
                  <CardTitle className="text-lg font-black tracking-tight text-slate-950 dark:text-white">
                    Slot occupancy map
                  </CardTitle>
                  <CardDescription className="mt-1 font-medium">
                    Operational view · occupied tiles include live session details and risk indicators.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <SlotLegend status="available" count={slotTotals.available} />
                  <SlotLegend status="occupied" count={slotTotals.occupied} />
                  <SlotLegend status="reserved" count={slotTotals.reserved} />
                  {slotTotals.maintenance > 0 ? <SlotLegend status="maintenance" count={slotTotals.maintenance} /> : null}
                  
                  {/* Risk legend */}
                  <Badge variant="secondary" className="gap-1.5 px-2.5 py-0.5">
                    <span className="h-2 w-2 rounded-full bg-amber-400" />warning
                  </Badge>
                  <Badge variant="secondary" className="gap-1.5 px-2.5 py-0.5">
                    <span className="h-2 w-2 rounded-full bg-rose-500" />critical
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
              {/* Floor tabs */}
              {floors.length > 0 ? (
                <Tabs 
                  value={String(selectedFloorNumber)} 
                  onValueChange={(v) => setSelectedFloorNumber(Number(v))}
                  className="mb-4"
                >
                  <TabsList>
                    {floors.map((floor) => (
                      <TabsTrigger key={floor.floorNumber} value={String(floor.floorNumber)}>
                        Floor {floor.floorNumber}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              ) : null}

              {/* Zone tabs */}
              <Tabs
                value={selectedZone}
                onValueChange={(v) => setSelectedZone(v as Zone)}
                className="mb-5"
              >
                <TabsList>
                  {(['A', 'B'] as Zone[]).map((zone) => (
                    <TabsTrigger key={zone} value={zone}>
                      Zone {zone} <span className="ml-1 opacity-70">({zone === 'A' ? 'Car' : 'Motorbike'})</span>
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>

              {/* Slot grid */}
              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 transition-colors dark:border-white/10 dark:bg-slate-950/70">
                {currentSlots.length === 0 ? (
                  <EmptyPanel
                    title="No slots configured for this zone."
                    description="The backend did not return any slot records for the selected floor and zone."
                  />
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8">
                    {currentSlots.map((slot) => (
                      <OccupancySlotTile
                        key={slot.id}
                        slot={slot}
                        selected={selectedSlot?.id === slot.id}
                        onSelect={() => setSelectedSlot(slot)}
                      />
                    ))}
                  </div>
                )}
              </div>
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>

      {/* Slot Inspect Modal */}
      <Dialog open={!!selectedSlot} onOpenChange={(open) => { if (!open) setSelectedSlot(null) }}>
        {selectedSlot ? <SlotInspectModal slot={selectedSlot} /> : null}
      </Dialog>
    </div>
  )
}

// ─── OccupancySlotTile ────────────────────────────────────────────────────────

function OccupancySlotTile({
  slot,
  selected,
  onSelect,
}: {
  slot: SlotOccupancyMapSlot
  selected: boolean
  onSelect: () => void
}) {
  const isOccupied = slot.status === 'occupied' && slot.session !== null

  if (selected) {
    return (
      <button
        type="button"
        onClick={onSelect}
        className="flex aspect-[3/2] flex-col items-center justify-center rounded-xl bg-[#2563eb] text-white transition hover:-translate-y-0.5 shadow-lg shadow-blue-500/30 ring-2 ring-white/20"
      >
        <span className="text-[10px] md:text-xs font-medium">Selected</span>
        <span className="font-bold text-sm">{slot.code}</span>
      </button>
    )
  }

  if (isOccupied && slot.session) {
    return <OccupiedSlotTile slot={slot} session={slot.session} onSelect={onSelect} />
  }

  // Available / reserved / maintenance — compact
  const styleClass =
    slot.status === 'available'
      ? 'bg-white text-slate-950 dark:bg-white dark:text-slate-950 ring-1 ring-black/5'
      : slot.status === 'reserved'
        ? 'border border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-400/30 dark:bg-amber-500/15 dark:text-amber-100'
        : 'border border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-500/40 dark:bg-slate-800/80 dark:text-slate-300'

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex aspect-[3/2] flex-col items-center justify-center rounded-xl transition hover:-translate-y-0.5 shadow-sm ${styleClass}`}
    >
      <span className="text-[10px] md:text-xs font-medium capitalize opacity-70">
        {STATUS_LABELS[slot.status]}
      </span>
      <span className="font-bold text-sm">{slot.code}</span>
    </button>
  )
}

// ─── OccupiedSlotTile ─────────────────────────────────────────────────────────
/**
 * Larger tile for occupied slots — shows thumbnail, plate, check-in, duration, risk badge.
 */
function OccupiedSlotTile({
  slot,
  session,
  onSelect,
}: {
  slot: SlotOccupancyMapSlot
  session: SlotOccupancyMapSession
  onSelect: () => void
}) {
  const risk = slot.risk.level
  const [imgError, setImgError] = useState(false)
  const hasThumbnail = !!session.thumbnailUrl && !imgError

  const borderColor = RISK_BORDER[risk]

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group relative flex flex-col overflow-hidden rounded-xl border border-l-4 ${borderColor} border-slate-200/60 bg-white dark:border-slate-700/60 dark:bg-slate-900 text-left transition hover:-translate-y-0.5 hover:shadow-lg shadow-sm`}
    >
      {/* Thumbnail strip */}
      <div className="relative h-[72px] w-full overflow-hidden bg-slate-900">
        {hasThumbnail ? (
          <img
            src={session.thumbnailUrl!}
            alt={`Check-in ${session.plate}`}
            className="h-full w-full object-cover opacity-90 group-hover:opacity-100 transition-opacity"
            onError={() => setImgError(true)}
          />
        ) : (
          <img
            src={slot.vehicleType === 'motorbike' ? '/motor.jpg' : '/car.jpg'}
            alt={`Placeholder for ${slot.vehicleType}`}
            className="h-full w-full object-cover opacity-60 grayscale group-hover:opacity-80 transition-opacity"
          />
        )}
        {/* Risk badge overlay */}
        {risk !== 'normal' && (
          <span className={`absolute right-1.5 top-1.5 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-black ring-1 ${RISK_BADGE_CLASS[risk]}`}>
            {risk === 'critical' ? <AlertCircle className="h-2.5 w-2.5" /> : <AlertTriangle className="h-2.5 w-2.5" />}
            {risk}
          </span>
        )}
      </div>

      {/* Info section */}
      <div className="flex flex-col gap-0.5 px-2 py-1.5">
        {/* Plate */}
        <span className="font-mono text-[11px] font-black leading-tight text-slate-950 dark:text-white truncate">
          {session.plate}
        </span>
        {/* Slot code */}
        <span className="text-[10px] font-semibold text-slate-400 leading-tight">{slot.code}</span>
        
        {/* Check-in time & Duration */}
        <div className="mt-0.5 flex items-center justify-between text-[10px] font-bold leading-tight">
          <span className="text-slate-400">
            {new Date(session.checkInTime).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' })}
          </span>
          <span className="flex items-center gap-1 text-slate-600 dark:text-slate-400">
            <Clock className="h-2.5 w-2.5 shrink-0" />
            <LiveDuration checkInTime={session.checkInTime} />
          </span>
        </div>
      </div>
    </button>
  )
}

// ─── SlotInspectModal ─────────────────────────────────────────────────────────

function SlotInspectModal({ slot }: { slot: SlotOccupancyMapSlot }) {
  const session = slot.session
  const [imgError, setImgError] = useState(false)
  const hasThumbnail = session?.thumbnailUrl && !imgError
  const risk = slot.risk

  return (
    <DialogContent className="sm:max-w-md p-0 overflow-hidden border-slate-200 dark:border-white/10 shadow-2xl bg-white dark:bg-slate-900 gap-0">
      <DialogHeader className="p-5 border-b border-slate-100 dark:border-white/10 text-left">
        <div className="flex items-center gap-3">
          <DialogTitle className="font-mono text-2xl font-black text-slate-950 dark:text-white">{slot.code}</DialogTitle>
          <StatusBadge tone={slotStatusTone(slot.status)} label={STATUS_LABELS[slot.status]} />
          {risk.level !== 'normal' && (
            <RiskBadge level={risk.level} />
          )}
        </div>
        <p className="mt-1 text-sm text-slate-500">
          {slot.floorName} · Zone {slot.zone} · {titleCase(slot.vehicleType)}
        </p>
      </DialogHeader>

        {/* Body */}
        <div className="p-5">
          {slot.status !== 'occupied' || !session ? (
            <div className="rounded-xl border border-dashed border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-slate-950/50 p-6 text-sm font-semibold text-slate-500 text-center">
              {slot.status === 'available' && 'Slot is available — no active session.'}
              {slot.status === 'reserved' && 'Slot is reserved — vehicle has not checked in yet.'}
              {slot.status === 'maintenance' && 'Slot is under maintenance.'}
              {slot.status === 'occupied' && !session && 'Slot is occupied but session data is unavailable.'}
            </div>
          ) : (
            <div className="space-y-3">
              {/* Thumbnail */}
              {hasThumbnail ? (
                <div className="overflow-hidden rounded-xl">
                  <img
                    src={session.thumbnailUrl!}
                    alt={`Check-in evidence — ${session.plate}`}
                    className="w-full object-cover max-h-44"
                    onError={() => setImgError(true)}
                  />
                </div>
              ) : null}

              {/* Risk reason banner */}
              {risk.level !== 'normal' && risk.reason ? (
                <div className={`flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold ${
                  risk.level === 'critical'
                    ? 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-200/60 dark:border-rose-400/20'
                    : 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-200/60 dark:border-amber-400/20'
                }`}>
                  {risk.level === 'critical'
                    ? <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                  {risk.reason}
                </div>
              ) : null}

              <dl className="space-y-2">
                <InspectRow label="Session code" value={session.sessionCode} mono />
                <InspectRow label="License plate" value={session.plate} mono />
                <InspectRow label="Vehicle type" value={titleCase(slot.vehicleType)} />
                <InspectRow label="Check-in time" value={formatDateTimeVN(session.checkInTime)} />
                <InspectRow
                  label="Duration"
                  valueNode={<span className="text-right text-xs font-black text-slate-800 dark:text-slate-200 tabular-nums"><LiveDuration checkInTime={session.checkInTime} /></span>}
                />
                <InspectRow label="Session status" value={session.status.replace(/_/g, ' ')} />
              </dl>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5">
          <p className="text-xs font-medium text-slate-400 text-center">
            Read-only view · No checkout or payment actions available here
          </p>
        </div>
    </DialogContent>
  )
}

function InspectRow({
  label,
  value,
  mono = false,
  valueNode,
}: {
  label: string
  value?: string
  mono?: boolean
  valueNode?: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-slate-950/50 px-3 py-2">
      <dt className="text-xs font-semibold text-slate-500">{label}</dt>
      {valueNode ?? (
        <dd className={`text-right text-xs font-black text-slate-800 dark:text-slate-200 ${mono ? 'font-mono' : ''}`}>
          {value}
        </dd>
      )}
    </div>
  )
}

// ─── KPI Cards ────────────────────────────────────────────────────────────────

function buildKpis(
  summary: AdminSummary | null,
  pendingPayments: AdminPendingPayments | null,
  fallback: {
    total: number
    available: number
    occupied: number
    reserved: number
    maintenance: number
    occupancyRate: number
  },
) {
  const totalSlots = summary?.slots.total ?? fallback.total
  const availableSlots = summary?.slots.available ?? fallback.available
  const reservedSlots = summary?.slots.reserved ?? fallback.reserved
  const occupiedSlots = summary?.slots.occupied ?? fallback.occupied
  const maintenanceSlots = fallback.maintenance
  const occupancyRate = summary?.slots.occupancyRate ?? fallback.occupancyRate

  return [
    {
      label: 'Total Capacity',
      value: totalSlots,
      helper: 'Total parking slots configured in facility',
      note: `${availableSlots} available · ${occupiedSlots} occupied · ${reservedSlots} reserved${maintenanceSlots > 0 ? ` · ${maintenanceSlots} under maintenance` : ''}`,
      icon: <ParkingCircle className="h-5 w-5" strokeWidth={1.8} />,
    },
    {
      label: 'Available Slots',
      value: `${availableSlots}/${totalSlots}`,
      helper: 'Ready for incoming vehicles',
      note: 'Excludes occupied slots and reserved holds',
      icon: <CheckCircle2 className="h-5 w-5" strokeWidth={1.8} />,
    },
    {
      label: 'Occupied Slots',
      value: `${occupiedSlots}/${totalSlots}`,
      helper: 'Vehicles currently parked in facility',
      note: 'Does not include reservations or maintenance',
      icon: <Car className="h-5 w-5" strokeWidth={1.8} />,
    },
    {
      label: 'Occupancy Rate',
      value: `${occupancyRate}%`,
      helper: 'Space utilization percentage',
      note: 'Excludes reserved and maintenance slots',
      icon: <Gauge className="h-5 w-5" strokeWidth={1.8} />,
    },
    {
      label: 'Active Sessions',
      value: summary?.sessions.active ?? 'Unavailable',
      helper: `${summary?.sessions.checkoutPending ?? 0} checking out now`,
      note: 'Vehicles currently checked in',
      icon: <Timer className="h-5 w-5" strokeWidth={1.8} />,
      unavailable: !summary,
    },
    {
      label: "Today's Revenue",
      value: summary ? formatVnd(summary.payments.revenueToday) : 'Unavailable',
      helper: `${formatVnd(summary?.payments.byMethod.bankQr ?? 0)} Bank QR · ${formatVnd(summary?.payments.byMethod.cash ?? 0)} Cash`,
      note: 'Total collected since midnight today',
      icon: <CircleDollarSign className="h-5 w-5" strokeWidth={1.8} />,
      unavailable: !summary,
    },
    {
      label: 'Pending Payments',
      value: pendingPayments?.summary.total ?? summary?.payments.pending ?? 'Unavailable',
      helper: `${pendingPayments?.summary.overdue ?? 0} overdue payments`,
      note: 'Awaiting customer payment or bank confirmation',
      icon: <CreditCard className="h-5 w-5" strokeWidth={1.8} />,
      unavailable: !summary && !pendingPayments,
    },
    {
      label: 'Active Reservations',
      value: summary?.reservations.active ?? 'Unavailable',
      helper: `${summary?.reservations.expiredToday ?? 0} expired today`,
      note: 'Held spots booked in advance by drivers',
      icon: <CalendarClock className="h-5 w-5" strokeWidth={1.8} />,
      unavailable: !summary,
    },
  ]
}

function KpiCard({
  label,
  value,
  helper,
  note,
  icon,
  unavailable = false,
}: {
  label: string
  value: number | string
  helper: string
  note?: string
  icon: ReactNode
  unavailable?: boolean
}) {
  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-400">
            {label}
          </CardTitle>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200 dark:bg-cyan-300/10 dark:text-cyan-200 dark:ring-cyan-300/20">
            {icon}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className={`text-2xl font-black tracking-tight ${unavailable ? 'text-slate-500' : 'text-slate-950 dark:text-white'}`}>
          {value}
        </p>
        <p className="mt-2 text-xs font-semibold text-slate-500">{helper}</p>
        {note ? (
          <p className="mt-1 text-[11px] font-medium leading-4 text-slate-400 dark:text-slate-500">
            {note}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}

// ─── Operations Queue Card ────────────────────────────────────────────────────

export function OperationsQueueCard({
  issues,
  openTotal,
  connected,
}: {
  issues: OperationIssue[]
  openTotal: number
  connected: boolean
}) {
  const activeIssues = issues
    .filter((issue) => issue.status === 'open' || issue.status === 'in_review')
    .slice(0, 3)

  return (
    <InfoCard
      title="Operations Queue"
      icon={<ClipboardList className="h-4 w-4" strokeWidth={1.8} />}
      action={<LinkButton to="/manager/operations" label="Open Queue" />}
    >
      <div className="grid gap-2 sm:grid-cols-[160px_minmax(0,1fr)]">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-slate-950/60">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Open reviews</p>
          <p className="mt-2 text-3xl font-black text-cyan-700 dark:text-cyan-100">{openTotal}</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">{connected ? 'Live stream' : 'Fallback refresh'}</p>
        </div>
        {activeIssues.length === 0 ? (
          <EmptyInline title="No staff review requests waiting." />
        ) : (
          <ul className="grid gap-2">
            {activeIssues.map((issue) => (
              <li
                key={issue.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-slate-950/60"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-slate-950 dark:text-white">
                    {issue.plateNumber ?? issue.session?.plateNumberConfirmed ?? issue.session?.licensePlate ?? 'Manual review'}
                  </p>
                  <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">
                    {titleCase(issue.type.replace(/_/g, ' '))} · {issue.status.replace(/_/g, ' ')}
                  </p>
                </div>
                <StatusBadge tone={issue.severity === 'critical' ? 'critical' : issue.severity === 'warning' ? 'warning' : 'normal'} label={issue.severity} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </InfoCard>
  )
}

export function OperationalFlagsCard({
  flags,
  latestFlag,
  recentFlags,
}: {
  flags: AdminOperationsFlags | null
  latestFlag: AdminOperationFlag | null
  recentFlags: AdminOperationFlag[]
}) {
  return (
    <InfoCard
      title="Operational Flags"
      icon={<Flag className="h-4 w-4" strokeWidth={1.8} />}
      action={<LinkButton to="/manager/reports" label="View Reports & Flags" />}
    >
      <div className="grid grid-cols-3 gap-2">
        <MiniMetric label="Critical" value={flags?.summary.critical ?? 0} tone="critical" />
        <MiniMetric label="Warning" value={flags?.summary.warning ?? 0} tone="warning" />
        <MiniMetric label="Info" value={flags?.summary.info ?? 0} tone="normal" />
      </div>

      {latestFlag ? (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-slate-950/70 p-3">
          <div className="flex items-start justify-between gap-3">
            <StatusBadge tone={flagTone(latestFlag.severity)} label={latestFlag.severity} />
            <span className="text-xs font-semibold text-slate-500">
              {formatAge(latestFlag.ageMinutes)}
            </span>
          </div>
          <p className="mt-3 text-sm font-bold leading-5 text-slate-950 dark:text-white">{latestFlag.message}</p>
          <p className="mt-2 text-xs font-semibold text-slate-500">
            {latestFlag.sessionCode ?? latestFlag.plateNumber ?? 'No linked session'}
          </p>
        </div>
      ) : (
        <EmptyInline title="No operational flags detected." />
      )}

      {recentFlags.length > 1 ? (
        <ul className="mt-3 space-y-2">
          {recentFlags.slice(1).map((flag) => (
            <li key={`${flag.type}-${flag.createdAt}-${flag.sessionCode ?? ''}`} className="flex items-start gap-2 text-xs">
              <span className={`mt-1 h-2 w-2 rounded-full ${flagDot(flag.severity)}`} />
              <span className="font-medium leading-5 text-slate-600 dark:text-slate-400">{flag.message}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </InfoCard>
  )
}

export function PaymentMonitoringCard({
  pendingPayments,
  recentPaymentIssues,
}: {
  pendingPayments: AdminPendingPayments | null
  recentPaymentIssues: AdminPendingPaymentItem[]
}) {
  return (
    <InfoCard
      title="Payment Monitoring"
      icon={<CreditCard className="h-4 w-4" strokeWidth={1.8} />}
      action={<LinkButton to="/manager/reports" label="View Payment Monitoring" />}
    >
      <div className="grid grid-cols-3 gap-2">
        <MiniMetric label="Pending" value={pendingPayments?.summary.total ?? 0} tone="normal" />
        <MiniMetric label="Overdue" value={pendingPayments?.summary.overdue ?? 0} tone="warning" />
        <MiniMetric label="Critical" value={pendingPayments?.summary.critical ?? 0} tone="critical" />
      </div>

      {recentPaymentIssues.length === 0 ? (
        <EmptyInline title="No pending payment issues detected." />
      ) : (
        <ul className="mt-4 space-y-3">
          {recentPaymentIssues.map((item) => (
            <li key={item.paymentId} className="rounded-xl border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-slate-950/70 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-xs font-black text-slate-950 dark:text-white">
                    {item.sessionCode ?? 'Not linked'}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    {item.plateNumber ?? 'Unknown plate'} - {item.locationLabel}
                  </p>
                </div>
                <StatusBadge tone={riskTone(item.risk)} label={item.risk} />
              </div>
              <div className="mt-3 flex items-center justify-between gap-3 text-xs">
                <span className="font-black text-slate-800 dark:text-slate-200">{formatVnd(item.amount)}</span>
                <span className="font-semibold text-slate-500">
                  Staff: {item.responsibleStaff.name ?? 'Unassigned'}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </InfoCard>
  )
}

export function ReservationOverviewCard({ summary }: { summary: AdminSummary | null }) {
  return (
    <InfoCard title="Reservation Overview" icon={<CalendarClock className="h-4 w-4" strokeWidth={1.8} />}>
      <div className="grid grid-cols-2 gap-2">
        <MiniMetric label="Active" value={summary?.reservations.active ?? 0} tone="normal" />
        <MiniMetric label="Fulfilled" value={summary?.reservations.fulfilledToday ?? 0} tone="normal" />
        <MiniMetric label="Cancelled" value={summary?.reservations.cancelledToday ?? 0} tone="muted" />
        <MiniMetric label="Expired" value={summary?.reservations.expiredToday ?? 0} tone="warning" />
      </div>
      <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 dark:border-white/10 dark:bg-slate-950/50 p-3 text-xs font-semibold leading-5 text-slate-500">
        Active reservation counts are available from backend summary. A reservation detail list is unavailable on this manager endpoint.
      </div>
    </InfoCard>
  )
}

export function CurrentParkedCard({
  slot,
  paymentIssue,
}: {
  slot: SlotOccupancyMapSlot | null
  paymentIssue: AdminPendingPaymentItem | null
}) {
  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between pb-2 space-y-0">
        <div>
          <CardTitle className="text-base font-black text-slate-950 dark:text-white">Current Parked</CardTitle>
          <CardDescription className="mt-1">
            Read-only slot inspection.
          </CardDescription>
        </div>
        <Layers3 className="h-5 w-5 text-cyan-700 dark:text-cyan-200" strokeWidth={1.8} />
      </CardHeader>
      <CardContent>

      {!slot ? (
        <EmptyPanel
          title="Select a slot to inspect vehicle/session details."
          description="No checkout, payment confirmation, or exit actions are available in the manager view."
        />
      ) : (
        <div className="mt-5 space-y-3">
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-slate-950/60 p-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Slot code</p>
              <p className="mt-1 font-mono text-lg font-black text-slate-950 dark:text-white">{slot.code}</p>
            </div>
            <StatusBadge tone={slotStatusTone(slot.status)} label={STATUS_LABELS[slot.status]} />
          </div>

          <DetailGrid
            rows={[
              ['Plate number', paymentIssue?.plateNumber ?? slot.session?.plate ?? 'Unavailable'],
              ['Vehicle type', titleCase(slot.vehicleType)],
              ['Session code', paymentIssue?.sessionCode ?? slot.session?.sessionCode ?? 'Unavailable'],
              ['Check-in time', slot.session ? formatDateTimeVN(slot.session.checkInTime) : 'Unavailable'],
              ['Session status', slot.session?.status?.replace(/_/g, ' ') ?? slot.status],
            ]}
          />

          {slot.session?.thumbnailUrl ? (
            <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-white/10">
              <img
                src={slot.session.thumbnailUrl}
                alt={`Check-in ${slot.session.plate}`}
                className="w-full h-32 object-cover bg-slate-100 dark:bg-slate-900"
              />
            </div>
          ) : null}

          {!slot.session ? (
            <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 dark:border-white/10 dark:bg-slate-950/50 p-3 text-xs font-semibold leading-5 text-slate-500">
              Vehicle and session fields require an active session detail endpoint for managers. This view does not fabricate plate numbers or timers.
            </p>
          ) : null}
        </div>
      )}
      </CardContent>
    </Card>
  )
}

export function DailyOperationsCard({
  summary,
  traffic,
  selectedDate,
}: {
  summary: AdminSummary | null
  traffic: TodayTraffic
  selectedDate: string
}) {
  const isToday = selectedDate === todayIsoDate()
  const cardTitle = isToday ? `Operations for Today · ${selectedDate}` : `Operations for ${selectedDate}`

  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between pb-2 space-y-0">
        <div>
          <CardTitle className="text-base font-black text-slate-950 dark:text-white">{cardTitle}</CardTitle>
          <CardDescription className="mt-1">Movement and session status.</CardDescription>
        </div>
        <ClipboardList className="h-5 w-5 text-cyan-700 dark:text-cyan-200" strokeWidth={1.8} />
      </CardHeader>
      <CardContent>
      <div className="grid grid-cols-2 gap-2">
        <MiniMetric label="Daily Check-ins" value={traffic.checkIns ?? 'Unavailable'} tone="normal" />
        <MiniMetric label="Daily Checkouts" value={traffic.checkOuts ?? 'Unavailable'} tone="normal" />
        <MiniMetric label="Daily Completed" value={summary?.sessions.completedToday ?? 0} tone="normal" />
        <MiniMetric label="Current Active" value={summary?.sessions.active ?? 0} tone="normal" />
        <MiniMetric label="Current Pending" value={summary?.sessions.checkoutPending ?? 0} tone="warning" />
        <MiniMetric label="Current Auth'd" value={summary?.sessions.exitAuthorized ?? 0} tone="normal" />
      </div>
      </CardContent>
    </Card>
  )
}

export function RevenueSummaryCard({ summary }: { summary: AdminSummary | null }) {
  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between pb-2 space-y-0">
        <div>
          <CardTitle className="text-base font-black text-slate-950 dark:text-white">Revenue Summary</CardTitle>
          <CardDescription className="mt-1">Payments collected today.</CardDescription>
        </div>
        <Banknote className="h-5 w-5 text-cyan-700 dark:text-cyan-200" strokeWidth={1.8} />
      </CardHeader>
      <CardContent>
      <div className="space-y-3">
        <div className="rounded-xl border border-cyan-300/20 bg-cyan-300/10 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-cyan-700 dark:text-cyan-200">Today revenue</p>
          <p className="mt-2 text-2xl font-black text-slate-950 dark:text-white">
            {summary ? formatVnd(summary.payments.revenueToday) : 'Unavailable'}
          </p>
        </div>
        <DetailGrid
          rows={[
            ['Paid today', String(summary?.payments.paidToday ?? 0)],
            ['Cash', formatVnd(summary?.payments.byMethod.cash ?? 0)],
            ['Bank QR', formatVnd(summary?.payments.byMethod.bankQr ?? 0)],
            ['Failed today', String(summary?.payments.failedToday ?? 0)],
            ['Expired today', String(summary?.payments.expiredToday ?? 0)],
          ]}
        />
      </div>
      </CardContent>
    </Card>
  )
}

// ─── Shared UI Components ─────────────────────────────────────────────────────

export function InfoCard({
  title,
  icon,
  action,
  children,
}: {
  title: string
  icon: ReactNode
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200 dark:bg-cyan-300/10 dark:text-cyan-200 dark:ring-cyan-300/20">
            {icon}
          </span>
          <CardTitle className="text-base font-black text-slate-950 dark:text-white">{title}</CardTitle>
        </div>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

export function DetailGrid({ rows }: { rows: Array<[string, string]> }) {
  return (
    <dl className="grid gap-2">
      {rows.map(([label, value]) => (
        <div
          key={label}
          className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-slate-950/50 px-3 py-2"
        >
          <dt className="text-xs font-semibold text-slate-500">{label}</dt>
          <dd className="text-right text-xs font-black text-slate-800 dark:text-slate-200">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function MiniMetric({
  label,
  value,
  tone,
}: {
  label: string
  value: number | string
  tone: 'normal' | 'warning' | 'critical' | 'muted'
}) {
  const toneClass = {
    normal: 'text-cyan-700 dark:text-cyan-100',
    warning: 'text-amber-700 dark:text-amber-100',
    critical: 'text-rose-700 dark:text-rose-100',
    muted: 'text-slate-700 dark:text-slate-300',
  }[tone]

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-slate-950/60 p-3">
      <p className="text-[11px] font-bold text-slate-500">{label}</p>
      <p className={`mt-2 text-xl font-black ${toneClass}`}>{value}</p>
    </div>
  )
}

export function StatusBadge({
  label,
  tone,
}: {
  label: string
  tone: 'normal' | 'warning' | 'critical' | 'muted'
}) {
  const toneClass = {
    normal: 'bg-emerald-400/10 text-emerald-100 ring-emerald-400/20',
    warning: 'bg-amber-400/10 text-amber-700 dark:text-amber-100 ring-amber-400/20',
    critical: 'bg-rose-400/10 text-rose-700 dark:text-rose-100 ring-rose-400/20',
    muted: 'bg-slate-100 text-slate-800 ring-slate-200 dark:bg-slate-700/60 dark:text-slate-200 dark:ring-white/10',
  }[tone]

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-black capitalize ring-1 ${toneClass}`}>
      {label}
    </span>
  )
}

function RiskBadge({ level }: { level: SlotOccupancyMapRiskLevel }) {
  const cls = RISK_BADGE_CLASS[level]
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-black capitalize ring-1 ${cls}`}>
      {level === 'critical' ? <AlertCircle className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
      {level}
    </span>
  )
}

export function SlotLegend({ status, count }: { status: string; count: number }) {
  return (
    <Badge variant="secondary" className="gap-1.5 px-2.5 py-0.5">
      <span className={`h-2 w-2 rounded-full ${STATUS_DOT[status] ?? 'bg-slate-400'}`} />
      {count} {STATUS_LABELS[status]?.toLowerCase() ?? status}
    </Badge>
  )
}

export function LinkButton({ to, label }: { to: string; label: string }) {
  return (
    <Button variant="outline" size="sm" asChild>
      <Link to={to} className="text-xs font-black">
        {label}
      </Link>
    </Button>
  )
}

export function EmptyPanel({ title, description }: { title: string; description: string }) {
  return (
    <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 dark:border-white/10 dark:bg-slate-950/50 p-6 text-center">
      <ShieldCheck className="mx-auto h-6 w-6 text-slate-500" strokeWidth={1.8} />
      <p className="mt-3 text-sm font-black text-slate-800 dark:text-slate-200">{title}</p>
      <p className="mx-auto mt-2 max-w-lg text-xs font-medium leading-5 text-slate-500">
        {description}
      </p>
    </div>
  )
}

export function EmptyInline({ title }: { title: string }) {
  return (
    <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 dark:border-white/10 dark:bg-slate-950/50 p-3 text-sm font-bold text-slate-600 dark:text-slate-400">
      {title}
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="h-32 rounded-2xl bg-white/[0.06]" />
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_410px]">
        <div className="h-[520px] rounded-2xl bg-white/[0.06]" />
        <div className="h-[520px] rounded-2xl bg-white/[0.06]" />
      </div>
    </div>
  )
}

// ─── Utility Functions ────────────────────────────────────────────────────────

export async function getTodayTraffic(date?: string): Promise<TodayTraffic> {
  try {
    const targetDate = date || todayIsoDate()
    const { data } = await api.get<TrafficRow[]>('/reports/traffic', {
      params: { period: 'daily', date: targetDate },
    })
    return {
      checkIns: data.reduce((total, row) => total + Number(row.entryCount || 0), 0),
      checkOuts: data.reduce((total, row) => total + Number(row.exitCount || 0), 0),
    }
  } catch {
    return { checkIns: null, checkOuts: null }
  }
}

export function formatVnd(value: number) {
  return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(value)} VND`
}

export function formatAge(ageMinutes: number) {
  if (ageMinutes >= 1440) return `${Math.floor(ageMinutes / 1440)}d`
  if (ageMinutes >= 60) return `${Math.floor(ageMinutes / 60)}h ${ageMinutes % 60}m`
  return `${ageMinutes}m`
}

export function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

export function slotStatusTone(status: string): 'normal' | 'warning' | 'critical' | 'muted' {
  if (status === 'available') return 'normal'
  if (status === 'reserved') return 'warning'
  if (status === 'occupied') return 'critical'
  return 'muted'
}

export function riskTone(risk: PaymentMonitoringRisk): 'normal' | 'warning' | 'critical' {
  if (risk === 'critical') return 'critical'
  if (risk === 'warning') return 'warning'
  return 'normal'
}

export function flagTone(severity: AdminOperationFlag['severity']): 'normal' | 'warning' | 'critical' {
  if (severity === 'critical') return 'critical'
  if (severity === 'warning') return 'warning'
  return 'normal'
}

export function flagDot(severity: AdminOperationFlag['severity']) {
  if (severity === 'critical') return 'bg-rose-400'
  if (severity === 'warning') return 'bg-amber-400'
  return 'bg-cyan-300'
}

// Keep legacy export name for any existing imports
export { OccupancySlotTile as SlotButton }
