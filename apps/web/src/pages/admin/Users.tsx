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
  manager: 'Quản lý',
  staff: 'Nhân viên',
  driver: 'Tài xế',
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
      toasts.showError('Không thể tải danh sách người dùng')
    } finally {
      setLoading(false)
    }
  }

  const handleToggleActive = async (user: User) => {
    const action = user.isActive ? 'khóa' : 'mở khóa'
    if (!confirm(`Bạn có chắc muốn ${action} tài khoản ${user.phone}?`)) return

    try {
      if (user.isActive) {
        await api.delete(`/users/${user.id}`)
      } else {
        await api.patch(`/users/${user.id}`, { isActive: true })
      }
      toasts.showSuccess(`Đã ${action} tài khoản ${user.phone}`)
      await loadUsers()
    } catch (err) {
      if (isAxiosError(err)) {
        const msg = err.response?.data?.message
        toasts.showError(typeof msg === 'string' ? msg : `Lỗi ${action}`)
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
            <h1 className="text-2xl font-bold">Quản lý người dùng</h1>
            <p className="text-sm text-gray-500">{users.length} tài khoản</p>
          </div>
          <button onClick={handleCreate} className="btn-primary">
            + Tạo tài khoản
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
              {role === 'all' ? 'Tất cả' : ROLE_LABELS[role]}
              {role !== 'all' && (
                <span className="ml-1 text-xs opacity-70">
                  ({users.filter((u) => u.role === role).length})
                </span>
              )}
            </button>
          ))}
        </div>

        {loading && <p className="text-gray-500">Đang tải...</p>}

        {!loading && (
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-2 text-left">SĐT</th>
                  <th className="px-4 py-2 text-left">Họ tên</th>
                  <th className="px-4 py-2 text-left">Vai trò</th>
                  <th className="px-4 py-2 text-center">Trạng thái</th>
                  <th className="px-4 py-2 text-right">Thao tác</th>
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
                        <span className="text-xs text-green-700">Hoạt động</span>
                      ) : (
                        <span className="text-xs text-red-600">Đã khóa</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right space-x-2">
                      <button
                        onClick={() => handleEdit(user)}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Sửa
                      </button>
                      <button
                        onClick={() => handleToggleActive(user)}
                        className={`text-xs ${user.isActive ? 'text-red-600' : 'text-green-600'} hover:underline`}
                      >
                        {user.isActive ? 'Khóa' : 'Mở khóa'}
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                      Không có người dùng nào.
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
        toasts.showSuccess('Đã cập nhật tài khoản')
      } else {
        if (!password || password.length < 6) {
          setError('Mật khẩu tối thiểu 6 ký tự')
          setSaving(false)
          return
        }
        await api.post('/users', { phone, password, fullName, role })
        toasts.showSuccess('Đã tạo tài khoản mới')
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
              : 'Lỗi lưu dữ liệu',
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
            {isEdit ? 'Chỉnh sửa tài khoản' : 'Tạo tài khoản mới'}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
            aria-label="Đóng"
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Số điện thoại
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
              Họ tên
            </label>
            <input
              className="input"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Nguyễn Văn A"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Vai trò
            </label>
            <select
              className="input"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
            >
              <option value="driver">Tài xế</option>
              <option value="staff">Nhân viên</option>
              <option value="manager">Quản lý</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {isEdit ? 'Mật khẩu mới (để trống nếu không đổi)' : 'Mật khẩu'}
            </label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isEdit ? '••••••' : 'Tối thiểu 6 ký tự'}
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-2">
              {error}
            </p>
          )}

          <div className="flex gap-2 pt-2">
            <button type="submit" className="btn-primary flex-1" disabled={saving}>
              {saving ? 'Đang lưu...' : isEdit ? 'Cập nhật' : 'Tạo'}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary flex-1" disabled={saving}>
              Hủy
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
