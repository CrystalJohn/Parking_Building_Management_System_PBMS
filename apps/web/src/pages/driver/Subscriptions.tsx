import { useEffect, useState } from 'react'
import {
  getMySubscriptions, getMyVehicles, createSubscription,
  type SubscriptionInfo, type DriverVehicle, type SubscriptionPlanType,
} from '../../lib/driver-api'
import { CreditCard, Zap, Calendar, CheckCircle, XCircle, Clock, ArrowUpRight, Loader } from 'lucide-react'

const PLANS: { type: SubscriptionPlanType; label: string; desc: string }[] = [
  { type: 'monthly', label: 'Monthly', desc: '30 days of free parking' },
  { type: 'yearly', label: 'Yearly', desc: '365 days of free parking' },
]

const STATUS_CONFIG: Record<string, { color: string; bg: string; icon: typeof Clock; label: string }> = {
  pending: { color: '#d97706', bg: '#fef3c7', icon: Clock, label: 'Pending' },
  active: { color: '#16a34a', bg: '#dcfce7', icon: CheckCircle, label: 'Active' },
  expired: { color: '#64748b', bg: '#f1f5f9', icon: XCircle, label: 'Expired' },
  cancelled: { color: '#dc2626', bg: '#fef2f2', icon: XCircle, label: 'Cancelled' },
}

export default function Subscriptions() {
  const [subscriptions, setSubscriptions] = useState<SubscriptionInfo[]>([])
  const [vehicles, setVehicles] = useState<DriverVehicle[]>([])
  const [loading, setLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)
  const [selectedVehicle, setSelectedVehicle] = useState<string>('')
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlanType>('monthly')

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [subs, vcls] = await Promise.all([getMySubscriptions(), getMyVehicles()])
      setSubscriptions(subs)
      setVehicles(vcls)
    } catch { }
    setLoading(false)
  }

  async function handleSubscribe() {
    if (!selectedVehicle) return
    try {
      const result = await createSubscription(selectedVehicle, selectedPlan)
      setShowDialog(false)
      window.open(result.checkoutUrl, '_blank')
      await loadData()
    } catch { }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Subscriptions</h1>
            <p className="text-sm text-gray-500 mt-1">Subscribe for free parking (base fee waived)</p>
          </div>
          <button
            onClick={() => setShowDialog(true)}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Zap size={18} />
            Subscribe
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader className="animate-spin text-gray-400" size={32} /></div>
        ) : subscriptions.length === 0 ? (
          <div className="bg-white rounded-xl p-12 text-center shadow-sm border border-gray-200">
            <CreditCard size={48} className="mx-auto text-gray-300 mb-4" />
            <h2 className="text-lg font-semibold text-gray-600">No subscriptions yet</h2>
            <p className="text-sm text-gray-400 mt-1">Subscribe to waive the base parking fee for your vehicle.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {subscriptions.map((sub) => {
              const cfg = STATUS_CONFIG[sub.status] ?? STATUS_CONFIG.pending
              const StatusIcon = cfg.icon
              return (
                <div key={sub.id} className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900">{sub.plateNumber}</span>
                        <span className="text-xs text-gray-400 uppercase">{sub.vehicleType}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-2 text-sm text-gray-500">
                        <span className="flex items-center gap-1">
                          <Calendar size={14} />
                          {sub.planType === 'monthly' ? 'Monthly' : 'Yearly'}
                        </span>
                        {sub.validFrom && (
                          <span>From {new Date(sub.validFrom).toLocaleDateString()}</span>
                        )}
                        {sub.validTo && (
                          <span>To {new Date(sub.validTo).toLocaleDateString()}</span>
                        )}
                      </div>
                    </div>
                    <span className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium`}
                      style={{ color: cfg.color, background: cfg.bg }}>
                      <StatusIcon size={14} />
                      {cfg.label}
                    </span>
                  </div>
                  {sub.status === 'pending' && sub.payment?.checkoutUrl && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <a
                        href={sub.payment.checkoutUrl}
                        target="_blank"
                        className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium"
                      >
                        Complete Payment <ArrowUpRight size={14} />
                      </a>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {showDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowDialog(false)}>
            <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
              <h2 className="text-lg font-bold text-gray-900 mb-4">New Subscription</h2>

              <label className="block text-sm font-medium text-gray-700 mb-1">Vehicle</label>
              <select
                value={selectedVehicle}
                onChange={e => setSelectedVehicle(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-4 text-sm"
              >
                <option value="">Select a vehicle...</option>
                {vehicles.map(v => (
                  <option key={v.id} value={v.id}>
                    {v.plateNumber} ({v.vehicleType}) {v.activeSubscription ? '— Active subscription' : ''}
                  </option>
                ))}
              </select>

              <label className="block text-sm font-medium text-gray-700 mb-2">Plan</label>
              <div className="grid grid-cols-2 gap-3 mb-6">
                {PLANS.map(plan => (
                  <button
                    key={plan.type}
                    onClick={() => setSelectedPlan(plan.type)}
                    disabled={!selectedVehicle}
                    className={`p-3 rounded-lg border-2 text-left transition-colors ${selectedPlan === plan.type ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'} ${!selectedVehicle ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <div className="font-medium text-sm text-gray-900">{plan.label}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{plan.desc}</div>
                  </button>
                ))}
              </div>

              <div className="flex gap-3">
                <button onClick={() => setShowDialog(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
                <button
                  onClick={handleSubscribe}
                  disabled={!selectedVehicle}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Subscribe & Pay
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
