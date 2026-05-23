import { useEffect, useState } from 'react'
import { isAxiosError } from 'axios'
import api from '../../lib/api'
import { ToastContainer } from '../../components/ui/Toast'
import { useToasts } from '../../lib/use-toasts'

// ─── Types ───────────────────────────────────────────────────────────────────

interface PricingConfig {
  id: number
  vehicleType: 'car' | 'motorbike'
  hourlyRate: number
  overtimePenalty: number
  lostTicketPenalty: number
  overtimeThresholdHours: number
}

interface BuildingFloor {
  id: number
  floorNumber: number
  name: string
  zoneA: { total: number; occupied: number; maintenance: number }
  zoneB: { total: number; occupied: number; maintenance: number }
}

interface BuildingConfig {
  floors: BuildingFloor[]
  summary: {
    totalFloors: number
    slotsPerFloorZoneA: number
    slotsPerFloorZoneB: number
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * 29.4: Manager Config page — pricing + building config.
 * Req 10.1, 10.2, 10.4
 */
export default function Config() {
  const toasts = useToasts()

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-3xl mx-auto space-y-8">
        <header>
          <h1 className="text-2xl font-bold">Cấu hình hệ thống</h1>
          <p className="text-sm text-gray-500">Quản lý giá và cấu trúc tòa nhà</p>
        </header>

        <PricingSection toasts={toasts} />
        <BuildingSection toasts={toasts} />

        <ToastContainer toasts={toasts.toasts} onDismiss={toasts.dismiss} />
      </div>
    </div>
  )
}

// ─── Pricing Section ─────────────────────────────────────────────────────────

function PricingSection({ toasts }: { toasts: ReturnType<typeof useToasts> }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editValues, setEditValues] = useState<Record<string, PricingConfig>>({})

  useEffect(() => {
    loadPricing()
  }, [])

  const loadPricing = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/config/pricing')
      const map: Record<string, PricingConfig> = {}
      for (const c of data) {
        map[c.vehicleType] = { ...c }
      }
      setEditValues(map)
    } catch {
      toasts.showError('Không thể tải cấu hình giá')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (vehicleType: 'car' | 'motorbike') => {
    const values = editValues[vehicleType]
    if (!values) return

    setSaving(true)
    try {
      await api.put('/config/pricing', {
        vehicleType,
        hourlyRate: values.hourlyRate,
        overtimePenalty: values.overtimePenalty,
        lostTicketPenalty: values.lostTicketPenalty,
        overtimeThresholdHours: values.overtimeThresholdHours,
      })
      toasts.showSuccess(`Đã cập nhật giá ${vehicleType === 'car' ? 'ô tô' : 'xe máy'}`)
      await loadPricing()
    } catch (err) {
      if (isAxiosError(err)) {
        const msg = err.response?.data?.message
        toasts.showError(typeof msg === 'string' ? msg : 'Lỗi cập nhật')
      }
    } finally {
      setSaving(false)
    }
  }

  const updateField = (
    vehicleType: string,
    field: keyof PricingConfig,
    value: number,
  ) => {
    setEditValues((prev) => ({
      ...prev,
      [vehicleType]: { ...prev[vehicleType], [field]: value },
    }))
  }

  if (loading) return <p className="text-gray-500">Đang tải...</p>

  return (
    <section className="card">
      <h2 className="text-lg font-semibold mb-4">Bảng giá</h2>

      <div className="grid md:grid-cols-2 gap-6">
        {(['car', 'motorbike'] as const).map((type) => {
          const values = editValues[type]
          if (!values) return null
          const label = type === 'car' ? 'Ô tô (Zone A)' : 'Xe máy (Zone B)'

          return (
            <div key={type} className="space-y-3 border border-gray-200 rounded-md p-4">
              <h3 className="font-medium">{label}</h3>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Giá/giờ (VND)</label>
                <input
                  type="number"
                  className="input"
                  value={values.hourlyRate}
                  onChange={(e) => updateField(type, 'hourlyRate', Number(e.target.value))}
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Phụ thu quá giờ (VND)</label>
                <input
                  type="number"
                  className="input"
                  value={values.overtimePenalty}
                  onChange={(e) => updateField(type, 'overtimePenalty', Number(e.target.value))}
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Phụ thu mất vé (VND)</label>
                <input
                  type="number"
                  className="input"
                  value={values.lostTicketPenalty}
                  onChange={(e) => updateField(type, 'lostTicketPenalty', Number(e.target.value))}
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Ngưỡng quá giờ (giờ)</label>
                <input
                  type="number"
                  className="input"
                  value={values.overtimeThresholdHours}
                  onChange={(e) => updateField(type, 'overtimeThresholdHours', Number(e.target.value))}
                />
              </div>

              <button
                onClick={() => handleSave(type)}
                className="btn-primary text-sm w-full"
                disabled={saving}
              >
                {saving ? 'Đang lưu...' : 'Lưu'}
              </button>
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ─── Building Section ────────────────────────────────────────────────────────

function BuildingSection({ toasts }: { toasts: ReturnType<typeof useToasts> }) {
  const [building, setBuilding] = useState<BuildingConfig | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadBuilding()
  }, [])

  const loadBuilding = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/config/building')
      setBuilding(data)
    } catch {
      toasts.showError('Không thể tải cấu hình tòa nhà')
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <p className="text-gray-500">Đang tải...</p>
  if (!building) return null

  return (
    <section className="card">
      <h2 className="text-lg font-semibold mb-4">Cấu trúc tòa nhà</h2>

      <div className="grid grid-cols-3 gap-2 text-sm text-center mb-4">
        <div className="bg-gray-50 rounded p-2">
          <p className="text-gray-500 text-xs">Số tầng</p>
          <p className="font-bold text-lg">{building.summary.totalFloors}</p>
        </div>
        <div className="bg-gray-50 rounded p-2">
          <p className="text-gray-500 text-xs">Ô tô/tầng</p>
          <p className="font-bold text-lg">{building.summary.slotsPerFloorZoneA}</p>
        </div>
        <div className="bg-gray-50 rounded p-2">
          <p className="text-gray-500 text-xs">Xe máy/tầng</p>
          <p className="font-bold text-lg">{building.summary.slotsPerFloorZoneB}</p>
        </div>
      </div>

      <div className="space-y-4">
        {building.floors.map((floor) => (
          <div key={floor.id} className="border border-gray-200 rounded-md p-3">
            <h3 className="font-medium mb-2">{floor.name} (Tầng {floor.floorNumber})</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-gray-500 mb-1">Zone A — Ô tô</p>
                <p>
                  Tổng: {floor.zoneA.total} | Đang dùng: {floor.zoneA.occupied} | Bảo trì: {floor.zoneA.maintenance}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Zone B — Xe máy</p>
                <p>
                  Tổng: {floor.zoneB.total} | Đang dùng: {floor.zoneB.occupied} | Bảo trì: {floor.zoneB.maintenance}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-400 mt-4">
        Để đặt slot bảo trì, sử dụng trang Bảng điều khiển hoặc API PATCH /slots/:id/status.
      </p>
    </section>
  )
}
