import { useEffect, useMemo, useState } from 'react'
import { isAxiosError } from 'axios'
import { Plus, Search } from 'lucide-react'
import api from '../../lib/api'
import { ToastContainer } from '../../components/ui/Toast'
import { useToasts } from '../../lib/use-toasts'
import {
  AdminPageHeader,
  EmptyState,
  LoadingRows,
  ROLE_LABELS,
  RoleBadge,
  StatusBadge,
} from './admin-ui'

type Role = 'admin' | 'manager' | 'staff' | 'driver'

interface User {
  id: string
  phone: string
  fullName: string | null
  role: Role
  isActive: boolean
  createdAt: string
}

const FILTERS: Array<Role | 'all'> = ['all', 'admin', 'manager', 'staff', 'driver']

export default function Users() {
  const toasts = useToasts()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterRole, setFilterRole] = useState<Role | 'all'>('all')
  const [query, setQuery] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)

  useEffect(() => {
    void loadUsers()
  }, [])

  const loadUsers = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get<User[]>('/users')
      setUsers(data)
    } catch {
      setError('Unable to load user list')
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
        toasts.showError(typeof msg === 'string' ? msg : `Unable to ${action} account`)
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

  const filteredUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return users.filter((user) => {
      const roleMatches = filterRole === 'all' || user.role === filterRole
      const queryMatches =
        !normalizedQuery ||
        user.phone.toLowerCase().includes(normalizedQuery) ||
        (user.fullName ?? '').toLowerCase().includes(normalizedQuery)
      return roleMatches && queryMatches
    })
  }, [filterRole, query, users])

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Manage Users"
        description="Create accounts, assign roles, and control access for administrators, managers, staff, and drivers."
        action={
          <button
            type="button"
            onClick={handleCreate}
            className="inline-flex h-11 items-center gap-2 rounded-2xl bg-primary-600 px-4 text-sm font-black text-white shadow-sm shadow-primary-600/20 transition hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-slate-950"
          >
            <Plus className="h-4 w-4" strokeWidth={1.8} />
            Create account
          </button>
        }
      />

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((role) => (
              <button
                key={role}
                type="button"
                onClick={() => setFilterRole(role)}
                className={`rounded-xl px-3 py-2 text-sm font-black transition ${
                  filterRole === role
                    ? 'bg-primary-600 text-white shadow-sm shadow-primary-600/20'
                    : 'border border-slate-200 bg-white text-slate-600 hover:border-primary-200 hover:text-primary-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300 dark:hover:text-white'
                }`}
              >
                {role === 'all' ? 'All' : ROLE_LABELS[role]}
                <span className="ml-1 text-xs opacity-75">
                  {role === 'all'
                    ? users.length
                    : users.filter((user) => user.role === role).length}
                </span>
              </button>
            ))}
          </div>

          <label className="relative block w-full xl:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" strokeWidth={1.8} />
            <input
              className="h-11 w-full rounded-2xl border border-slate-200 bg-white pl-9 pr-3 text-sm font-semibold text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 dark:border-white/10 dark:bg-slate-950 dark:text-white dark:focus:ring-primary-500/20"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name or phone"
            />
          </label>
        </div>
      </section>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700 dark:border-rose-400/20 dark:bg-rose-500/10 dark:text-rose-100">
          {error}
        </div>
      ) : null}

      {loading ? <LoadingRows rows={6} /> : null}

      {!loading && !error ? (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-black uppercase text-slate-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-400">
                <tr>
                  <th className="px-5 py-4 text-left">Account</th>
                  <th className="px-5 py-4 text-left">Role</th>
                  <th className="px-5 py-4 text-left">Status</th>
                  <th className="px-5 py-4 text-left">Created</th>
                  <th className="px-5 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/10">
                {filteredUsers.map((user) => (
                  <tr
                    key={user.id}
                    className={!user.isActive ? 'bg-slate-50/70 opacity-75 dark:bg-white/[0.02]' : ''}
                  >
                    <td className="px-5 py-4">
                      <p className="font-black text-slate-950 dark:text-white">
                        {user.fullName || 'Unnamed account'}
                      </p>
                      <p className="mt-1 font-mono text-xs font-semibold text-slate-500 dark:text-slate-400">
                        {user.phone}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <RoleBadge role={user.role} />
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge
                        label={user.isActive ? 'Active' : 'Inactive'}
                        tone={user.isActive ? 'green' : 'red'}
                      />
                    </td>
                    <td className="px-5 py-4 font-semibold text-slate-500 dark:text-slate-400">
                      {formatDate(user.createdAt)}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleEdit(user)}
                          className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 transition hover:border-primary-200 hover:text-primary-700 dark:border-white/10 dark:text-slate-200 dark:hover:text-white"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleActive(user)}
                          className={`rounded-xl px-3 py-2 text-xs font-black transition ${
                            user.isActive
                              ? 'bg-rose-50 text-rose-700 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-100'
                              : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-100'
                          }`}
                        >
                          {user.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredUsers.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="No accounts match this view"
                description="Adjust the role filter or search term to find the account you need."
              />
            </div>
          ) : null}
        </section>
      ) : null}

      {showModal ? (
        <UserModal
          user={editingUser}
          onClose={handleModalClose}
          onSave={handleModalSave}
          toasts={toasts}
        />
      ) : null}

      <ToastContainer toasts={toasts.toasts} onDismiss={toasts.dismiss} />
    </div>
  )
}

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

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
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
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-white/10">
          <div>
            <h3 className="text-lg font-black text-slate-950 dark:text-white">
              {isEdit ? 'Edit account' : 'Create account'}
            </h3>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
              {isEdit ? 'Update role, name, or password.' : 'Add a new PBMS account.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-xl leading-none text-slate-400 transition hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-white/10 dark:hover:text-white"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          <div>
            <label className="mb-1 block text-sm font-bold text-slate-700 dark:text-slate-200">
              Phone
            </label>
            <input
              className="input dark:border-white/10 dark:bg-slate-950 dark:text-white"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              disabled={isEdit}
              placeholder="0901234567"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-bold text-slate-700 dark:text-slate-200">
              Full name
            </label>
            <input
              className="input dark:border-white/10 dark:bg-slate-950 dark:text-white"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Full name"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-bold text-slate-700 dark:text-slate-200">
              Role
            </label>
            <select
              className="input dark:border-white/10 dark:bg-slate-950 dark:text-white"
              value={role}
              onChange={(event) => setRole(event.target.value as Role)}
            >
              <option value="driver">Driver</option>
              <option value="staff">Staff</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-bold text-slate-700 dark:text-slate-200">
              {isEdit ? 'New password' : 'Password'}
            </label>
            <input
              className="input dark:border-white/10 dark:bg-slate-950 dark:text-white"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={isEdit ? 'Leave blank to keep current' : 'At least 6 characters'}
            />
          </div>

          {error ? (
            <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700 dark:border-rose-400/20 dark:bg-rose-500/10 dark:text-rose-100">
              {error}
            </p>
          ) : null}

          <div className="grid grid-cols-2 gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary rounded-xl" disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn-primary rounded-xl" disabled={saving}>
              {saving ? 'Saving...' : isEdit ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('vi-VN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value))
}
