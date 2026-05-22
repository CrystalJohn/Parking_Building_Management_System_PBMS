import { useEffect, useState } from 'react'
import { useLocation, useNavigate, Link } from 'react-router-dom'
import { isAxiosError } from 'axios'
import api from '../../lib/api'
import { getToken, getUser, saveAuth, type AuthUser } from '../../lib/auth'
import { ToastContainer } from '../../components/ui/Toast'
import { useToasts } from '../../lib/use-toasts'

interface LoginResponse {
  access_token: string
  user: AuthUser
}

/** Default landing page for each role (mirrors RequireAuth.defaultHomeForRole). */
function defaultHomeForRole(role: AuthUser['role']): string {
  switch (role) {
    case 'admin':
      return '/admin/users'
    case 'manager':
      return '/manager/dashboard'
    case 'staff':
      return '/staff/gate'
    case 'driver':
      return '/driver/home'
    default:
      return '/login'
  }
}

/** Basic Vietnamese phone number validation (9–11 digits, optional leading +). */
function isValidPhone(value: string): boolean {
  return /^\+?\d{9,11}$/.test(value.trim())
}

interface LocationState {
  from?: { pathname?: string }
}

/**
 * Login page — Req 9.3
 *
 * - Phone + password form with client-side validation.
 * - Calls POST /auth/login, persists JWT + user via saveAuth.
 * - Redirects to the original destination (if any) or to the role's default home.
 * - Surfaces credential errors via inline message + toast.
 */
export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const toasts = useToasts()

  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<{
    phone?: string
    password?: string
  }>({})

  // If already authenticated, skip the login screen.
  useEffect(() => {
    const token = getToken()
    const user = getUser()
    if (token && user) {
      navigate(defaultHomeForRole(user.role), { replace: true })
    }
  }, [navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)

    // Client-side validation
    const errors: { phone?: string; password?: string } = {}
    if (!phone.trim()) {
      errors.phone = 'Vui lòng nhập số điện thoại'
    } else if (!isValidPhone(phone)) {
      errors.phone = 'Số điện thoại không hợp lệ (9–11 chữ số)'
    }
    if (!password) {
      errors.password = 'Vui lòng nhập mật khẩu'
    }
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    setSubmitting(true)
    try {
      const { data } = await api.post<LoginResponse>('/auth/login', {
        phone: phone.trim(),
        password,
      })
      saveAuth(data.access_token, data.user)
      toasts.showSuccess(`Xin chào, ${data.user.fullName}`)

      // Honor the original destination if RequireAuth bounced the user here.
      const state = location.state as LocationState | null
      const from = state?.from?.pathname
      const target =
        from && from !== '/login' ? from : defaultHomeForRole(data.user.role)
      navigate(target, { replace: true })
    } catch (err) {
      const message = extractErrorMessage(err)
      setErrorMessage(message)
      toasts.showError(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="card w-full max-w-sm">
        <header className="mb-6 text-center">
          <h1 className="text-2xl font-bold">Đăng nhập</h1>
          <p className="text-sm text-gray-500 mt-1">
            Hệ thống quản lý bãi đỗ xe
          </p>
        </header>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div>
            <label
              htmlFor="phone"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Số điện thoại <span className="text-red-500">*</span>
            </label>
            <input
              id="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              autoFocus
              className="input"
              placeholder="VD: 0901234567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              aria-invalid={!!fieldErrors.phone}
              aria-describedby={fieldErrors.phone ? 'phone-error' : undefined}
              disabled={submitting}
            />
            {fieldErrors.phone && (
              <p id="phone-error" className="text-xs text-red-600 mt-1">
                {fieldErrors.phone}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Mật khẩu <span className="text-red-500">*</span>
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              className="input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={!!fieldErrors.password}
              aria-describedby={
                fieldErrors.password ? 'password-error' : undefined
              }
              disabled={submitting}
            />
            {fieldErrors.password && (
              <p id="password-error" className="text-xs text-red-600 mt-1">
                {fieldErrors.password}
              </p>
            )}
          </div>

          {errorMessage && (
            <div
              role="alert"
              className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {errorMessage}
            </div>
          )}

          <button
            type="submit"
            className="btn-primary w-full"
            disabled={submitting}
          >
            {submitting ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500">
          Chưa có tài khoản?{' '}
          <Link to="/register" className="text-primary-600 hover:underline font-medium">
            Đăng ký
          </Link>
        </p>
      </div>

      <ToastContainer toasts={toasts.toasts} onDismiss={toasts.dismiss} />
    </div>
  )
}

/**
 * Extracts a user-friendly error message from a login failure.
 * - 401 → "Sai số điện thoại hoặc mật khẩu" (or backend message if it's a deactivation notice)
 * - Network / other → generic message
 */
function extractErrorMessage(err: unknown): string {
  if (isAxiosError(err)) {
    const status = err.response?.status
    const data = err.response?.data as { message?: string | string[] } | undefined
    const raw = data?.message
    const text = Array.isArray(raw) ? raw.join(', ') : raw

    if (status === 401) {
      // Backend differentiates between invalid creds and deactivated account.
      if (text && /deactivat/i.test(text)) {
        return 'Tài khoản đã bị khóa. Liên hệ quản trị viên.'
      }
      return 'Sai số điện thoại hoặc mật khẩu'
    }
    if (status === 400) {
      return text ?? 'Dữ liệu không hợp lệ'
    }
    if (!err.response) {
      return 'Không kết nối được máy chủ. Vui lòng thử lại.'
    }
    return text ?? `Lỗi (${status})`
  }
  return 'Đã xảy ra lỗi không xác định'
}
