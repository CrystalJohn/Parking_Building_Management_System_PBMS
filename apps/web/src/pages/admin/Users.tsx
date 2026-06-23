import { useEffect, useState } from 'react'
import { isAxiosError } from 'axios'
import api from '../../lib/api'
import { ToastContainer } from '../../components/ui/Toast'
import { useToasts } from '../../lib/use-toasts'

// ─── Types ───────────────────────────────────────────────────────────────────

type Role = 'admin' | 'manager' | 'staff' | 'driver'

interface User {
  id: string
  phone: string
  fullName: string | null
  role: Role
  isActive: boolean
  createdAt: string
}

const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin',
  manager: 'Manager',
  staff: 'Staff',
  driver: 'Driver',
}

const ROLE_COLORS: Record<Role, string> = {
  admin: 'bg-purple-100 text-purple-800',
  manager: 'bg-blue-100 text-blue-800',
  staff: 'bg-green-100 text-green-800',
  driver: 'bg-gray-100 text-gray-700',
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * 30: Admin User Management page.
 * Table list + filter by role + create/edit modal + toggle activate/deactivate.
 * Req 12.2, 12.4
 */
export default function Users() {
  const toasts = useToasts()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [filterRole, setFilterRole] = useState<Role | 'all'>('all')
  const [showModal, setShowModal] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)

  useEffect(() => {
    loadUsers()
  }, [])

  const loadUsers = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/users')
      setUsers(data)
    } catch {
      toasts.showError('Unable to load user list')
    } finally {
      setLoading(false)
    }
  }

  const handleToggleActive = async (user: User) => {
    const action = user.isActive ? 'deactivate' : 'activate'
    if (!confirm(`Are you sure you want to ${action} account ${user.phone}?`)) return

    try {
      if (user.isActive) {
        await api.delete(`/users/${user.id}`)
      } else {
        await api.patch(`/users/${user.id}`, { isActive: true })
      }
      toasts.showSuccess(`Account ${user.phone} has been ${action}d`)
      await loadUsers()
    } catch (err) {
      if (isAxiosError(err)) {
        const msg = err.response?.data?.message
        toasts.showError(typeof msg === 'string' ? msg : `Error: ${action}`)
      }
    }
  }

  const handleEdit = (user: User) => {
    setEditingUser(user)
    setShowModal(true)
  }

  const handleCreate = () => {
    setEditingUser(null)
    setShowModal(true)
  }

  const handleModalClose = () => {
    setShowModal(false)
    setEditingUser(null)
  }

  const handleModalSave = async () => {
    await loadUsers()
    handleModalClose()
  }

  const filteredUsers =
    filterRole === 'all'
      ? users
      : users.filter((u) => u.role === filterRole)

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">User management</h1>
            <p className="text-sm text-gray-500">{users.length} accounts</p>
          </div>
          <button onClick={handleCreate} className="btn-primary">
            + Create account
          </button>
        </header>

        {/* Filter */}
        <div className="flex gap-2">
          {(['all', 'admin', 'manager', 'staff', 'driver'] as const).map((role) => (
            <button
              key={role}
              onClick={() => setFilterRole(role)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                filterRole === role
                  ? 'bg-primary-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              {role === 'all' ? 'All' : ROLE_LABELS[role]}
              {role !== 'all' && (
                <span className="ml-1 text-xs opacity-70">
                  ({users.filter((u) => u.role === role).length})
                </span>
              )}
            </button>
          ))}
        </div>

        {loading && <p className="text-gray-500">Loading...</p>}

        {!loading && (
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-2 text-left">Phone</th>
                  <th className="px-4 py-2 text-left">Name</th>
                  <th className="px-4 py-2 text-left">Role</th>
                  <th className="px-4 py-2 text-center">Status</th>
                  <th className="px-4 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredUsers.map((user) => (
                  <tr key={user.id} className={!user.isActive ? 'opacity-50' : ''}>
                    <td className="px-4 py-2 font-mono">{user.phone}</td>
                    <td className="px-4 py-2">{user.fullName ?? '—'}</td>
                    <td className="px-4 py-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${ROLE_COLORS[user.role]}`}>
                        {ROLE_LABELS[user.role]}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-center">
                      {user.isActive ? (
                        <span className="text-xs text-green-700">Active</span>
                      ) : (
                        <span className="text-xs text-red-600">Inactive</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right space-x-2">
                      <button
                        onClick={() => handleEdit(user)}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleToggleActive(user)}
                        className={`text-xs ${user.isActive ? 'text-red-600' : 'text-green-600'} hover:underline`}
                      >
                        {user.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                      No users found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {showModal && (
          <UserModal
            user={editingUser}
            onClose={handleModalClose}
            onSave={handleModalSave}
            toasts={toasts}
          />
        )}

        <ToastContainer toasts={toasts.toasts} onDismiss={toasts.dismiss} />
      </div>
    </div>
  )
}

// ─── User Modal ──────────────────────────────────────────────────────────────

function UserModal({
  user,
  onClose,
  onSave,
  toasts,
}: {
  user: User | null
  onClose: () => void
  onSave: () => void
  toasts: ReturnType<typeof useToasts>
}) {
  const isEdit = user !== null
  const [phone, setPhone] = useState(user?.phone ?? '')
  const [fullName, setFullName] = useState(user?.fullName ?? '')
  const [role, setRole] = useState<Role>(user?.role ?? 'driver')
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaving(true)

    try {
      if (isEdit) {
        const payload: Record<string, unknown> = { fullName, role }
        if (password) payload.password = password
        await api.patch(`/users/${user.id}`, payload)
        toasts.showSuccess('Account updated')
      } else {
        if (!password || password.length < 6) {
          setError('Password must be at least 6 characters')
          setSaving(false)
          return
        }
        await api.post('/users', { phone, password, fullName, role })
        toasts.showSuccess('Account created')
      }
      onSave()
    } catch (err) {
      if (isAxiosError(err)) {
        const msg = err.response?.data?.message
        setError(
          typeof msg === 'string'
            ? msg
            : Array.isArray(msg)
              ? msg.join(', ')
              : 'Error saving data',
        )
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold">
            {isEdit ? 'Edit account' : 'Create new account'}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Phone
            </label>
            <input
              className="input"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={isEdit}
              placeholder="0901234567"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Full name
            </label>
            <input
              className="input"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="John Doe"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Role
            </label>
            <select
              className="input"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
            >
              <option value="driver">Driver</option>
              <option value="staff">Staff</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {isEdit ? 'New password (leave blank to keep current)' : 'Password'}
            </label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isEdit ? '••••••' : 'At least 6 characters'}
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-2">
              {error}
            </p>
          )}

          <div className="flex gap-2 pt-2">
            <button type="submit" className="btn-primary flex-1" disabled={saving}>
              {saving ? 'Saving...' : isEdit ? 'Update' : 'Create'}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary flex-1" disabled={saving}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
