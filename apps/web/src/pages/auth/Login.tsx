import { useEffect, useState } from 'react'
import { useLocation, useNavigate, Link } from 'react-router-dom'
import { isAxiosError } from 'axios'
import api from '../../lib/api'
import { getToken, getUser, saveAuth, type AuthUser } from '../../lib/auth'
import { ToastContainer } from '../../components/ui/Toast'
import { useToasts } from '../../lib/use-toasts'
import parkingHero from '../../assets/parking-hero.jpg'

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
 * Login page — Glassmorphism card-in-card on parking hero background
 *
 * - Background: parking hero image + dark overlay
 * - Center: large glassmorphism outer card
 *   - Left: branding sub-card with illustration
 *   - Right: form sub-card with phone + password
 * - Calls POST /auth/login, persists JWT + user via saveAuth.
 */
export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const toasts = useToasts()

  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
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

      // Honor the original destination if RequireAuth bounced the user here,
      // or if a ?redirect= query param was passed (e.g. from landing page).
      const state = location.state as LocationState | null
      const from = state?.from?.pathname
      const searchParams = new URLSearchParams(location.search)
      const redirectParam = searchParams.get('redirect')
      const target =
        redirectParam ?? (from && from !== '/login' ? from : defaultHomeForRole(data.user.role))
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
    <div className="min-h-[100svh] relative flex items-center justify-center p-3 sm:p-6">
      {/* ── Background: parking hero image ── */}
      <div className="fixed inset-0 -z-10">
        <img
          src={parkingHero}
          alt=""
          className="w-full h-full object-cover"
        />
        {/* Dark overlay */}
        <div className="absolute inset-0 bg-black/60 dark:bg-black/75" />
        {/* Warm tint */}
        <div className="absolute inset-0 bg-gradient-to-tr from-amber-900/20 via-transparent to-orange-900/10 mix-blend-overlay" />
      </div>

      {/* ── Outer glassmorphism card (card-in-card) ── */}
      <div className="w-full max-w-[1000px] bg-white/10 dark:bg-white/[0.06] backdrop-blur-3xl rounded-[1.5rem] sm:rounded-[2rem] border border-white/20 dark:border-white/[0.1] shadow-[0_8px_80px_rgba(0,0,0,0.3)] ring-1 ring-white/[0.05] overflow-hidden">
        <div className="grid lg:grid-cols-2 lg:min-h-[560px]">

          {/* ── Left: Branding sub-card ── */}
          <div className="hidden lg:flex relative min-h-[560px] items-center justify-center overflow-hidden bg-white/10">
            <img
              src="/image_login.png"
              alt="Parking building illustration"
              className="max-h-full max-w-full object-contain drop-shadow-2xl"
            />
          </div>

          {/* ── Right: Form sub-card ── */}
          <div className="flex items-center justify-center p-3 sm:p-8">
            <div className="w-full max-w-sm">
              {/* Inner glass card for form */}
              <div className="overflow-hidden bg-white/80 dark:bg-white/[0.06] backdrop-blur-2xl rounded-[1.25rem] sm:rounded-[1.5rem] border border-white/40 dark:border-white/[0.08] shadow-[0_4px_40px_rgba(0,0,0,0.1)] sm:p-8">
                {/* Mobile-only image */}
                <div className="lg:hidden bg-white/40 dark:bg-white/[0.05]">
                  <img
                    src="/image_login.png"
                    alt="Parking building illustration"
                    className="h-36 w-full object-contain p-3"
                  />
                </div>

                <div className="p-5 sm:p-0">

                {/* Header */}
                <div className="mb-5 sm:mb-6">
                  <h1 className="text-xl sm:text-2xl font-bold text-[#171717] dark:text-[#ededed] tracking-tight">
                    Đăng nhập
                  </h1>
                  <p className="text-[#888] text-[13px] mt-1">
                    Chào mừng trở lại! Vui lòng nhập thông tin.
                  </p>
                </div>

                {/* Error banner */}
                {errorMessage && (
                  <div
                    role="alert"
                    className="mb-5 flex items-start gap-3 rounded-xl border border-red-200/50 bg-red-50/80 backdrop-blur-sm px-4 py-3 text-[13px] text-red-700"
                  >
                    <svg
                      className="w-4 h-4 mt-0.5 flex-shrink-0 text-red-500"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                      />
                    </svg>
                    <span>{errorMessage}</span>
                  </div>
                )}

                {/* Form */}
                <form onSubmit={handleSubmit} noValidate className="space-y-4">
                  {/* Phone */}
                  <div>
                    <label
                      htmlFor="phone"
                      className="block text-[12px] font-medium text-[#666] dark:text-[#888] mb-1.5"
                    >
                      Số điện thoại <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                        <svg
                          className="w-4 h-4 text-[#888]"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={1.5}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3"
                          />
                        </svg>
                      </div>
                      <input
                        id="phone"
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        autoFocus
                        className={`block w-full rounded-xl border pl-9 pr-4 py-2.5 text-[13px] placeholder-[#888] transition-all focus:outline-none focus:ring-2 backdrop-blur-sm ${
                          fieldErrors.phone
                            ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20'
                            : 'border-black/8 dark:border-white/10 focus:border-blue-500/50 focus:ring-blue-500/10 bg-white/50 dark:bg-white/[0.04]'
                        }`}
                        placeholder="VD: 0901234567"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        aria-invalid={!!fieldErrors.phone}
                        aria-describedby={
                          fieldErrors.phone ? 'phone-error' : undefined
                        }
                        disabled={submitting}
                      />
                    </div>
                    {fieldErrors.phone && (
                      <p
                        id="phone-error"
                        className="text-[11px] text-red-600 mt-1.5 flex items-center gap-1"
                      >
                        <svg
                          className="w-3 h-3"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
                            clipRule="evenodd"
                          />
                        </svg>
                        {fieldErrors.phone}
                      </p>
                    )}
                  </div>

                  {/* Password */}
                  <div>
                    <label
                      htmlFor="password"
                      className="block text-[12px] font-medium text-[#666] dark:text-[#888] mb-1.5"
                    >
                      Mật khẩu <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                        <svg
                          className="w-4 h-4 text-[#888]"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={1.5}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
                          />
                        </svg>
                      </div>
                      <input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        className={`block w-full rounded-xl border pl-9 pr-10 py-2.5 text-[13px] placeholder-[#888] transition-all focus:outline-none focus:ring-2 backdrop-blur-sm ${
                          fieldErrors.password
                            ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20'
                            : 'border-black/8 dark:border-white/10 focus:border-blue-500/50 focus:ring-blue-500/10 bg-white/50 dark:bg-white/[0.04]'
                        }`}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        aria-invalid={!!fieldErrors.password}
                        aria-describedby={
                          fieldErrors.password ? 'password-error' : undefined
                        }
                        disabled={submitting}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 flex items-center pr-3 text-[#888] hover:text-[#666] transition-colors"
                        tabIndex={-1}
                        aria-label={
                          showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'
                        }
                      >
                        {showPassword ? (
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={1.5}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"
                            />
                          </svg>
                        ) : (
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={1.5}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                          </svg>
                        )}
                      </button>
                    </div>
                    {fieldErrors.password && (
                      <p
                        id="password-error"
                        className="text-[11px] text-red-600 mt-1.5 flex items-center gap-1"
                      >
                        <svg
                          className="w-3 h-3"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
                            clipRule="evenodd"
                          />
                        </svg>
                        {fieldErrors.password}
                      </p>
                    )}
                  </div>

                  {/* Submit */}
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2.5 text-[13px] font-semibold text-white shadow-lg shadow-blue-600/25 hover:shadow-blue-600/35 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    {submitting ? (
                      <>
                        <svg
                          className="animate-spin w-4 h-4"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                          />
                        </svg>
                        Đang đăng nhập...
                      </>
                    ) : (
                      'Đăng nhập'
                    )}
                  </button>
                </form>

                {/* Divider */}
                <div className="relative my-5">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-black/5 dark:border-white/10" />
                  </div>
                  <div className="relative flex justify-center text-[11px]">
                    <span className="bg-white/80 dark:bg-white/[0.06] px-3 text-[#888]">hoặc</span>
                  </div>
                </div>

                {/* Register link */}
                <p className="text-center text-[13px] text-[#888]">
                  Chưa có tài khoản?{' '}
                  <Link
                    to="/register"
                    className="font-semibold text-blue-600 hover:text-blue-700 transition-colors"
                  >
                    Đăng ký ngay
                  </Link>
                </p>

                {/* Footer */}
                <p className="text-center text-[10px] text-[#888] mt-6">
                  © {new Date().getFullYear()} PBMS — Hệ thống quản lý bãi đỗ xe
                </p>
                </div>
              </div>
            </div>
          </div>
        </div>
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
