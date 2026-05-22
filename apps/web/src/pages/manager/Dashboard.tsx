import { useEffect, useState, useCallback } from 'react'
import api from '../../lib/api'

// ─── Types ───────────────────────────────────────────────────────────────────

type SlotStatus = 'available' | 'occupied' | 'reserved' | 'maintenance'
type Zone = 'A' | 'B'
type VehicleType = 'car' | 'motorbike'

interface Slot {
  id: number
  code: string
  zone: Zone
  slotNumber: number
  status: SlotStatus
  vehicleType: VehicleType
  floor: {
    id: number
    floorNumber: number
    name: string
  }
}

interface FloorGroup {
  floorNumber: number
  floorName: string
  zoneA: Slot[]
  zoneB: Slot[]
}

// ─── Constants ───────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 5000

const STATUS_COLORS: Record<SlotStatus, string> = {
  available: 'bg-green-100 border-green-400 text-green-800',
  occupied: 'bg-red-100 border-red-400 text-red-800',
  reserved: 'bg-yellow-100 border-yellow-400 text-yellow-800',
  maintenance: 'bg-gray-200 border-gray-400 text-gray-500',
}

const STATUS_LABELS: Record<SlotStatus, string> = {
  available: 'Trống',
  occupied: 'Có xe',
  reserved: 'Đặt trước',
  maintenance: 'Bảo trì',
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * 27: Manager Dashboard — slot map visualization with real-time polling.
 * Req 4
 */
export default function Dashboard() {
  const [floors, setFloors] = useState<FloorGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const fetchSlots = useCallback(async () => {
    try {
      const { data } = await api.get<Slot[]>('/slots')
      const grouped = groupByFloor(data)
      setFloors(grouped)
      setLastUpdated(new Date())
      setError(null)
    } catch {
      setError('Không thể tải dữ liệu slot')
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial load + polling (27.2)
  useEffect(() => {
    fetchSlots()
    const interval = setInterval(fetchSlots, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [fetchSlots])

  // Compute totals (27.3)
  const allSlots = floors.flatMap((f) => [...f.zoneA, ...f.zoneB])
  const totalSlots = allSlots.length
  const totalAvailable = allSlots.filter((s) => s.status === 'available').length
  const totalOccupied = allSlots.filter((s) => s.status === 'occupied').length
  const totalReserved = allSlots.filter((s) => s.status === 'reserved').length
  const overallOccupancy = totalSlots > 0
    ? Math.round(((totalOccupied + totalReserved) / totalSlots) * 100)
    : 0

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Bảng điều khiển</h1>
            <p className="text-sm text-gray-500">
              Sơ đồ slot thời gian thực — tự động cập nhật mỗi 5 giây
            </p>
          </div>
          {lastUpdated && (
            <p className="text-xs text-gray-400">
              Cập nhật: {lastUpdated.toLocaleTimeString('vi-VN')}
            </p>
          )}
        </header>

        {loading && <p className="text-gray-500">Đang tải...</p>}
        {error && <p className="text-red-600 text-sm">{error}</p>}

        {!loading && !error && (
          <>
            {/* Summary cards (27.3) */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Tổng slot" value={totalSlots} />
              <StatCard label="Trống" value={totalAvailable} color="text-green-700" />
              <StatCard label="Có xe" value={totalOccupied} color="text-red-700" />
              <StatCard
                label="Tỷ lệ lấp đầy"
                value={`${overallOccupancy}%`}
                color={overallOccupancy > 80 ? 'text-red-700' : 'text-gray-900'}
              />
            </div>

            {/* Floor maps (27.1) */}
            {floors.map((floor) => (
              <FloorMap key={floor.floorNumber} floor={floor} />
            ))}

            {/* Legend */}
            <div className="flex flex-wrap gap-4 text-xs">
              {(Object.entries(STATUS_COLORS) as [SlotStatus, string][]).map(
                ([status, cls]) => (
                  <div key={status} className="flex items-center gap-1.5">
                    <div className={`w-4 h-4 rounded border ${cls}`} />
                    <span className="text-gray-600">{STATUS_LABELS[status]}</span>
                  </div>
                ),
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  color = 'text-gray-900',
}: {
  label: string
  value: number | string
  color?: string
}) {
  return (
    <div className="card text-center">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
    </div>
  )
}

function FloorMap({ floor }: { floor: FloorGroup }) {
  const allSlots = [...floor.zoneA, ...floor.zoneB]
  const available = allSlots.filter((s) => s.status === 'available').length
  const total = allSlots.length
  const occupancy = total > 0 ? Math.round(((total - available) / total) * 100) : 0

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">{floor.floorName} (Tầng {floor.floorNumber})</h2>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-green-700 font-medium">{available} trống</span>
          <span className="text-gray-400">|</span>
          <span className="text-gray-600">{occupancy}% lấp đầy</span>
        </div>
      </div>

      {/* Zone A — Cars */}
      <div className="mb-4">
        <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">
          Zone A — Ô tô ({floor.zoneA.filter((s) => s.status === 'available').length}/{floor.zoneA.length} trống)
        </p>
        <div className="grid grid-cols-5 md:grid-cols-10 gap-1.5">
          {floor.zoneA.map((slot) => (
            <SlotCell key={slot.id} slot={slot} />
          ))}
        </div>
      </div>

      {/* Zone B — Motorbikes */}
      <div>
        <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">
          Zone B — Xe máy ({floor.zoneB.filter((s) => s.status === 'available').length}/{floor.zoneB.length} trống)
        </p>
        <div className="grid grid-cols-5 md:grid-cols-10 gap-1.5">
          {floor.zoneB.map((slot) => (
            <SlotCell key={slot.id} slot={slot} />
          ))}
        </div>
      </div>
    </div>
  )
}

function SlotCell({ slot }: { slot: Slot }) {
  const colorClass = STATUS_COLORS[slot.status]

  return (
    <div
      className={`border rounded px-1 py-1.5 text-center text-xs font-mono ${colorClass}`}
      title={`${slot.code} — ${STATUS_LABELS[slot.status]}`}
    >
      {slot.slotNumber}
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function groupByFloor(slots: Slot[]): FloorGroup[] {
  const map = new Map<number, FloorGroup>()

  for (const slot of slots) {
    if (!map.has(slot.floor.floorNumber)) {
      map.set(slot.floor.floorNumber, {
        floorNumber: slot.floor.floorNumber,
        floorName: slot.floor.name,
        zoneA: [],
        zoneB: [],
      })
    }
    const group = map.get(slot.floor.floorNumber)!
    if (slot.zone === 'A') {
      group.zoneA.push(slot)
    } else {
      group.zoneB.push(slot)
    }
  }

  // Sort slots within each zone
  for (const group of map.values()) {
    group.zoneA.sort((a, b) => a.slotNumber - b.slotNumber)
    group.zoneB.sort((a, b) => a.slotNumber - b.slotNumber)
  }

  return Array.from(map.values()).sort((a, b) => a.floorNumber - b.floorNumber)
}
