import { useEffect, useState } from 'react'
import { isAxiosError } from 'axios'
import {
  getAvailability,
  type AvailabilityItem,
} from '../../lib/driver-api'

/**
 * 23.1: Driver Home — slot availability by floor/zone + pricing.
 * Req 9.4
 */
export default function DriverHome() {
  const [availability, setAvailability] = useState<AvailabilityItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      const avail = await getAvailability()
      setAvailability(avail)
    } catch (err) {
      setError(isAxiosError(err) ? 'Unable to load data' : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const carSlots = availability.filter((a) => a.vehicleType === 'car')
  const motorbikeSlots = availability.filter((a) => a.vehicleType === 'motorbike')

  const totalAvailable = (items: AvailabilityItem[]) =>
    items.reduce((sum, i) => sum + i.available, 0)
  const totalSlots = (items: AvailabilityItem[]) =>
    items.reduce((sum, i) => sum + i.total, 0)

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <header>
          <h1 className="text-2xl font-bold">Parking</h1>
          <p className="text-sm text-gray-500">Availability by floor</p>
        </header>

        {loading && <p className="text-gray-500">Loading...</p>}
        {error && <p className="text-red-600 text-sm">{error}</p>}

        {!loading && !error && (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-4">
              <SummaryCard
                label="Car (Zone A)"
                available={totalAvailable(carSlots)}
                total={totalSlots(carSlots)}
                rate="20.000 VND/h"
              />
              <SummaryCard
                label="Motorbike (Zone B)"
                available={totalAvailable(motorbikeSlots)}
                total={totalSlots(motorbikeSlots)}
                rate="10.000 VND/h"
              />
            </div>

            {/* Detail table */}
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">Floor</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">Zone</th>
                    <th className="px-4 py-2 text-center font-medium text-gray-600">Available</th>
                    <th className="px-4 py-2 text-center font-medium text-gray-600">Total</th>
                    <th className="px-4 py-2 text-center font-medium text-gray-600">Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {availability.map((item, idx) => {
                    const pct = item.total > 0
                      ? Math.round(((item.total - item.available) / item.total) * 100)
                      : 0
                    return (
                      <tr key={idx}>
                        <td className="px-4 py-2 font-medium">{item.floorName}</td>
                        <td className="px-4 py-2">
                          {item.zone === 'A' ? 'A (Car)' : 'B (Motorbike)'}
                        </td>
                        <td className="px-4 py-2 text-center">
                          <span className={item.available === 0 ? 'text-red-600 font-bold' : 'text-green-700 font-bold'}>
                            {item.available}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-center text-gray-500">{item.total}</td>
                        <td className="px-4 py-2 text-center">
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full ${pct > 80 ? 'bg-red-500' : pct > 50 ? 'bg-yellow-500' : 'bg-green-500'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-500">{pct}%</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Pricing info */}
            <div className="card">
              <h2 className="text-lg font-semibold mb-3">Pricing</h2>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="space-y-1">
                  <p className="font-medium">Car</p>
                  <p className="text-gray-600">20.000 VND / hour</p>
                  <p className="text-gray-600">Over 24h: +50.000 VND</p>
                  <p className="text-gray-600">Lost ticket: +100.000 VND</p>
                </div>
                <div className="space-y-1">
                  <p className="font-medium">Motorbike</p>
                  <p className="text-gray-600">10.000 VND / hour</p>
                  <p className="text-gray-600">Over 24h: +50.000 VND</p>
                  <p className="text-gray-600">Lost ticket: +100.000 VND</p>
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-3">
                Parking time is rounded up to the nearest hour. e.g. 2h15m is charged as 3 hours.
              </p>
            </div>

            <button onClick={loadData} className="btn-secondary text-sm">
              Refresh
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function SummaryCard({
  label,
  available,
  total,
  rate,
}: {
  label: string
  available: number
  total: number
  rate: string
}) {
  return (
    <div className="card text-center">
      <p className="text-sm text-gray-500 mb-1">{label}</p>
      <p className="text-3xl font-bold">
        <span className={available === 0 ? 'text-red-600' : 'text-green-700'}>
          {available}
        </span>
        <span className="text-gray-400 text-lg">/{total}</span>
      </p>
      <p className="text-xs text-gray-500 mt-1">{rate}</p>
    </div>
  )
}
