import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { isAxiosError } from 'axios'
import api from '../../lib/api'
import { getToken, getUser, saveAuth, type AuthUser } from '../../lib/auth'
import { ToastContainer } from '../../components/ui/Toast'
import { useToasts } from '../../lib/use-toasts'

interface RegisterResponse {
  access_token: string
  user: AuthUser
}

function isValidPhone(value: string): boolean {
  return /^0\d{9}$/.test(value.trim())
}

/**
 * 25: Driver self-registration page.
 * Phone + password + full name → auto login → redirect /driver/home.
 * Req 9.1
 */
export default function Register() {
  const navigate = useNavigate()
  const toasts = useToasts()

  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  // If already authenticated, redirect
  useEffect(() => {
    const token = getToken()
    const user = getUser()
    if (token && user) {
      navigate('/driver/home', { replace: true })
    }
  }, [navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Client-side validation
    const errors: Record<string, string> = {}
    if (!fullName.trim()) {
      errors.fullName = 'Vui lòng nhập họ tên'
    }
    if (!phone.trim()) {
      errors.phone = 'Vui lòng nhập số điện thoại'
    } else if (!isValidPhone(phone)) {
      errors.phone = 'Số điện thoại không hợp lệ (10 chữ số, bắt đầu bằng 0)'
    }
    if (!password) {
      errors.password = 'Vui lòng nhập mật khẩu'
    } else if (password.length < 6) {
      errors.password = 'Mật khẩu tối thiểu 6 ký tự'
    }
    if (password !== confirmPassword) {
      errors.confirmPassword = 'Mật khẩu xác nhận không khớp'
    }

    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    setSubmitting(true)
    try {
      const { data } = await api.post<RegisterResponse>('/auth/register', {
        phone: phone.trim(),
        password,
        fullName: fullName.trim(),
      })

      // Auto login after registration
      saveAuth(data.access_token, data.user)
      toasts.showSuccess('Đăng ký thành công!')
      navigate('/driver/home', { replace: true })
    } catch (err) {
      if (isAxiosError(err)) {
        const status = err.response?.status
        const msg = err.response?.data?.message

        if (status === 409) {
          setFieldErrors({ phone: 'Số điện thoại đã được đăng ký' })
        } else {
          const text = typeof msg === 'string'
            ? msg
            : Array.isArray(msg)
              ? msg.join(', ')
              : 'Đăng ký thất bại'
          toasts.showError(text)
        }
      } else {
        toasts.showError('Lỗi không xác định')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Đăng ký tài khoản</h1>
          <p className="text-sm text-gray-500 mt-1">
            Tạo tài khoản tài xế để đặt chỗ và nhận QR check-out
          </p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Họ và tên
            </label>
            <input
              className={`input ${fieldErrors.fullName ? 'border-red-400' : ''}`}
              placeholder="VD: Nguyễn Văn A"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              autoFocus
            />
            {fieldErrors.fullName && (
              <p className="text-xs text-red-600 mt-1">{fieldErrors.fullName}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Số điện thoại
            </label>
            <input
              className={`input ${fieldErrors.phone ? 'border-red-400' : ''}`}
              placeholder="VD: 0901234567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              type="tel"
            />
            {fieldErrors.phone && (
              <p className="text-xs text-red-600 mt-1">{fieldErrors.phone}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Mật khẩu
            </label>
            <input
              className={`input ${fieldErrors.password ? 'border-red-400' : ''}`}
              placeholder="Tối thiểu 6 ký tự"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
            />
            {fieldErrors.password && (
              <p className="text-xs text-red-600 mt-1">{fieldErrors.password}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Xác nhận mật khẩu
            </label>
            <input
              className={`input ${fieldErrors.confirmPassword ? 'border-red-400' : ''}`}
              placeholder="Nhập lại mật khẩu"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              type="password"
            />
            {fieldErrors.confirmPassword && (
              <p className="text-xs text-red-600 mt-1">{fieldErrors.confirmPassword}</p>
            )}
          </div>

          <button type="submit" className="btn-primary w-full" disabled={submitting}>
            {submitting ? 'Đang đăng ký...' : 'Đăng ký'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500">
          Đã có tài khoản?{' '}
          <Link to="/login" className="text-primary-600 hover:underline font-medium">
            Đăng nhập
          </Link>
        </p>

        <ToastContainer toasts={toasts.toasts} onDismiss={toasts.dismiss} />
      </div>
    </div>
  )
}
