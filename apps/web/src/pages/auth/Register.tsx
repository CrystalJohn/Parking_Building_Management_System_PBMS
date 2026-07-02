import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { isAxiosError } from 'axios'
import { ArrowLeft } from 'lucide-react'
import api from '../../lib/api'
import { getToken, getUser, saveAuth, type AuthUser } from '../../lib/auth'
import { useToasts } from '../../lib/use-toasts'

interface RegisterResponse {
  access_token: string
  user: AuthUser
}

function isValidPhone(value: string): boolean {
  return /^0\d{9}$/.test(value.trim())
}

/**
 * Register page with a centered auth card.
 *
 * - Background: plain app surface
 * - Center: large outer card
 *   - Left: branding sub-card with illustration
 *   - Right: form sub-card with full name, phone, password
 * - Auto login after registration → redirect /driver/home
 */
export default function Register() {
  const navigate = useNavigate()
  const toasts = useToasts()

  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
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
      errors.fullName = 'Please enter your full name'
    }
    if (!phone.trim()) {
      errors.phone = 'Please enter your phone number'
    } else if (!isValidPhone(phone)) {
      errors.phone = 'Invalid phone number (10 digits, starting with 0)'
    }
    if (!password) {
      errors.password = 'Please enter your password'
    } else if (password.length < 6) {
      errors.password = 'Password must be at least 6 characters'
    }
    if (password !== confirmPassword) {
      errors.confirmPassword = 'Passwords do not match'
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
      toasts.showSuccess('Registration successful!')
      navigate('/driver/home', { replace: true })
    } catch (err) {
      if (isAxiosError(err)) {
        const status = err.response?.status
        const msg = err.response?.data?.message

        if (status === 409) {
          setFieldErrors({ phone: 'Phone number is already registered' })
        } else {
          const text = typeof msg === 'string'
            ? msg
            : Array.isArray(msg)
              ? msg.join(', ')
              : 'Registration failed'
          toasts.showError(text)
        }
      } else {
        toasts.showError('Unknown error')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center bg-slate-100 p-4 text-slate-950 dark:bg-slate-950 dark:text-slate-100 sm:p-6">
      <Link
        to="/"
        className="fixed left-4 top-4 z-20 inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500/30 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 sm:left-6 sm:top-6"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={1.8} />
        Back to PBMS
      </Link>
      {/* ── Outer card (card-in-card) ── */}
      <div className="w-full max-w-[1000px] overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-xl shadow-slate-200/70 ring-1 ring-slate-100 dark:border-white/10 dark:bg-slate-900 dark:shadow-none dark:ring-white/5 sm:rounded-[2rem]">
        <div className="grid lg:grid-cols-2 lg:min-h-[560px]">

          {/* ── Left: Branding sub-card ── */}
          <div className="hidden lg:flex relative min-h-[560px] items-center justify-center overflow-hidden bg-slate-50 dark:bg-white/[0.03]">
            <img
              src="/image_login.png"
              alt="Parking building illustration"
              className="max-h-full max-w-full object-contain drop-shadow-2xl"
            />
          </div>

          {/* ── Right: Form sub-card ── */}
          <div className="flex items-center justify-center p-3 sm:p-8">
            <div className="w-full max-w-sm">
              {/* Inner card for form */}
              <div className="overflow-hidden rounded-[1.25rem] border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-950 sm:rounded-[1.5rem] sm:p-8">
                {/* Mobile-only image */}
                <div className="bg-slate-50 dark:bg-white/[0.03] lg:hidden">
                  <img
                    src="/image_login.png"
                    alt="Parking building illustration"
                    className="h-36 w-full object-contain p-3"
                  />
                </div>

                <div className="p-5 sm:p-0">

                {/* Header */}
                <div className="mb-6">
                  <h1 className="text-xl sm:text-2xl font-bold text-[#171717] dark:text-[#ededed] tracking-tight">
                    Create account
                  </h1>
                  <p className="text-[#888] text-[13px] mt-1">
                    Create a driver account to reserve slots and receive check-out QR codes
                  </p>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} noValidate className="space-y-4">
                  {/* Full Name */}
                  <div>
                    <label className="block text-[12px] font-medium text-[#666] dark:text-[#888] mb-1.5">
                      Full name <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                        <svg className="w-4 h-4 text-[#888]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                        </svg>
                      </div>
                      <input
                        className={`block w-full rounded-xl border pl-9 pr-4 py-2.5 text-[13px] placeholder-[#888] transition-all focus:outline-none focus:ring-2 backdrop-blur-sm ${
                          fieldErrors.fullName
                            ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20'
                            : 'border-black/8 dark:border-white/10 focus:border-blue-500/50 focus:ring-blue-500/10 bg-white/50 dark:bg-white/[0.04]'
                        }`}
                        placeholder="e.g. Nguyen Van A"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        autoFocus
                      />
                    </div>
                    {fieldErrors.fullName && (
                      <p className="text-[11px] text-red-600 mt-1.5 flex items-center gap-1">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
                        </svg>
                        {fieldErrors.fullName}
                      </p>
                    )}
                  </div>

                  {/* Phone */}
                  <div>
                    <label className="block text-[12px] font-medium text-[#666] dark:text-[#888] mb-1.5">
                      Phone number <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                        <svg className="w-4 h-4 text-[#888]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
                        </svg>
                      </div>
                      <input
                        type="tel"
                        className={`block w-full rounded-xl border pl-9 pr-4 py-2.5 text-[13px] placeholder-[#888] transition-all focus:outline-none focus:ring-2 backdrop-blur-sm ${
                          fieldErrors.phone
                            ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20'
                            : 'border-black/8 dark:border-white/10 focus:border-blue-500/50 focus:ring-blue-500/10 bg-white/50 dark:bg-white/[0.04]'
                        }`}
                        placeholder="e.g. 0901234567"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                      />
                    </div>
                    {fieldErrors.phone && (
                      <p className="text-[11px] text-red-600 mt-1.5 flex items-center gap-1">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
                        </svg>
                        {fieldErrors.phone}
                      </p>
                    )}
                  </div>

                  {/* Password */}
                  <div>
                    <label className="block text-[12px] font-medium text-[#666] dark:text-[#888] mb-1.5">
                      Password <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                        <svg className="w-4 h-4 text-[#888]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                        </svg>
                      </div>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        className={`block w-full rounded-xl border pl-9 pr-10 py-2.5 text-[13px] placeholder-[#888] transition-all focus:outline-none focus:ring-2 backdrop-blur-sm ${
                          fieldErrors.password
                            ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20'
                            : 'border-black/8 dark:border-white/10 focus:border-blue-500/50 focus:ring-blue-500/10 bg-white/50 dark:bg-white/[0.04]'
                        }`}
                        placeholder="Minimum 6 characters"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 flex items-center pr-3 text-[#888] hover:text-[#666] transition-colors"
                        tabIndex={-1}
                      >
                        {showPassword ? (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        )}
                      </button>
                    </div>
                    {fieldErrors.password && (
                      <p className="text-[11px] text-red-600 mt-1.5 flex items-center gap-1">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
                        </svg>
                        {fieldErrors.password}
                      </p>
                    )}
                  </div>

                  {/* Confirm Password */}
                  <div>
                    <label className="block text-[12px] font-medium text-[#666] dark:text-[#888] mb-1.5">
                      Confirm password <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                        <svg className="w-4 h-4 text-[#888]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                        </svg>
                      </div>
                      <input
                        type="password"
                        className={`block w-full rounded-xl border pl-9 pr-4 py-2.5 text-[13px] placeholder-[#888] transition-all focus:outline-none focus:ring-2 backdrop-blur-sm ${
                          fieldErrors.confirmPassword
                            ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20'
                            : 'border-black/8 dark:border-white/10 focus:border-blue-500/50 focus:ring-blue-500/10 bg-white/50 dark:bg-white/[0.04]'
                        }`}
                        placeholder="Re-enter password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                      />
                    </div>
                    {fieldErrors.confirmPassword && (
                      <p className="text-[11px] text-red-600 mt-1.5 flex items-center gap-1">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
                        </svg>
                        {fieldErrors.confirmPassword}
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
                        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Creating account...
                      </>
                    ) : (
                      'Create account'
                    )}
                  </button>
                </form>

                {/* Divider */}
                <div className="relative my-5">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-black/5 dark:border-white/10" />
                  </div>
                  <div className="relative flex justify-center text-[11px]">
                    <span className="bg-white px-3 text-[#888] dark:bg-slate-950">or</span>
                  </div>
                </div>

                {/* Login link */}
                <p className="text-center text-[13px] text-[#888]">
                  Already have an account?{' '}
                  <Link
                    to="/login"
                    className="font-semibold text-blue-600 hover:text-blue-700 transition-colors"
                  >
                    Sign in
                  </Link>
                </p>

                {/* Footer */}
                <p className="text-center text-[10px] text-[#888] mt-6">
                  © {new Date().getFullYear()} PBMS — Parking Building Management System
                </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
