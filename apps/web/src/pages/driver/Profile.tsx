import { getUser } from '../../lib/auth'

export default function Profile() {
  const user = getUser()

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <header>
          <h1 className="text-2xl font-bold">Hồ sơ của tôi</h1>
          <p className="text-sm text-gray-500">Thông tin tài khoản tài xế</p>
        </header>

        <section className="card">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-xl font-bold text-white shadow-lg shadow-blue-600/20">
              {getInitials(user?.fullName)}
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold text-gray-900">{user?.fullName ?? 'Chưa có tên'}</h2>
              <p className="text-sm text-gray-500">{user?.role === 'driver' ? 'Tài xế' : user?.role ?? 'User'}</p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="text-xs uppercase tracking-wide text-gray-500">Họ và tên</p>
              <p className="mt-1 font-medium text-gray-900">{user?.fullName ?? 'Chưa có tên'}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="text-xs uppercase tracking-wide text-gray-500">Số điện thoại</p>
              <p className="mt-1 font-medium text-gray-900">{user?.phone ?? 'Chưa có số điện thoại'}</p>
            </div>
          </div>
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
