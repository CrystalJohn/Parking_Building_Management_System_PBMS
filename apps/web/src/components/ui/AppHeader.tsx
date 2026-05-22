import { useNavigate } from 'react-router-dom'
import { clearAuth, getUser } from '../../lib/auth'

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  manager: 'Quản lý',
  staff: 'Nhân viên',
  driver: 'Tài xế',
}

/**
 * Shared top header bar with user info and logout button.
 * Drop this into any authenticated page layout.
 */
export default function AppHeader() {
  const navigate = useNavigate()
  const user = getUser()

  const handleLogout = () => {
    clearAuth()
    navigate('/login', { replace: true })
  }

  return (
    <header className="flex items-center justify-between bg-white border-b border-gray-200 px-6 py-3">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-gray-700">
          {user?.fullName ?? 'User'}
        </span>
        {user?.role && (
          <span className="badge-blue text-xs">
            {ROLE_LABELS[user.role] ?? user.role}
          </span>
        )}
      </div>
      <button
        onClick={handleLogout}
        className="btn-secondary text-sm px-3 py-1.5"
      >
        Đăng xuất
      </button>
    </header>
  )
}
