import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { isAxiosError } from 'axios'
import {
  ArrowLeft,
  Eye,
  EyeOff,
  LockKeyhole,
  Phone,
} from 'lucide-react'
import api from '../../lib/api'
import { getToken, getUser, saveAuth, type AuthUser } from '../../lib/auth'
import { useToasts } from '../../lib/use-toasts'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

interface LoginResponse {
  access_token: string
  user: AuthUser
}

interface LocationState {
  from?: { pathname?: string }
}

function defaultHomeForRole(role: AuthUser['role']): string {
  switch (role) {
    case 'admin':
      return '/admin/dashboard'
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

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const toasts = useToasts()

  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<{
    identifier?: string
    password?: string
  }>({})

  useEffect(() => {
    const token = getToken()
    const user = getUser()
    if (token && user) {
      navigate(defaultHomeForRole(user.role), { replace: true })
    }
  }, [navigate])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrorMessage(null)

    const errors: { identifier?: string; password?: string } = {}
    if (!identifier.trim()) {
      errors.identifier = 'Please enter your phone number or username'
    }
    if (!password) {
      errors.password = 'Please enter your password'
    }

    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    setSubmitting(true)
    try {
      const { data } = await api.post<LoginResponse>('/auth/login', {
        identifier: identifier.trim(),
        password,
      })
      saveAuth(data.access_token, data.user)
      toasts.showSuccess(`Welcome, ${data.user.fullName || data.user.username || data.user.phone}`)

      const state = location.state as LocationState | null
      const from = state?.from?.pathname
      const searchParams = new URLSearchParams(location.search)
      const redirectParam = searchParams.get('redirect')
      const target =
        redirectParam ?? (from && from !== '/login' ? from : defaultHomeForRole(data.user.role))
      navigate(target, { replace: true })
    } catch (err) {
      setErrorMessage(extractErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative flex min-h-[100svh] items-center justify-center bg-slate-100 p-3 text-slate-950 dark:bg-slate-950 dark:text-slate-100 sm:p-6">
      <Link
        to="/"
        className="fixed left-4 top-4 z-20 inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500/30 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 sm:left-6 sm:top-6"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={1.8} />
        Back to PBMS
      </Link>

      <div className="w-full max-w-[1000px] overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-xl shadow-slate-200/70 ring-1 ring-slate-100 dark:border-white/10 dark:bg-slate-900 dark:shadow-none dark:ring-white/5 sm:rounded-[2rem]">
        <div className="grid lg:min-h-[560px] lg:grid-cols-2">
          <div className="hidden min-h-[560px] items-center justify-center overflow-hidden bg-slate-50 dark:bg-white/[0.03] lg:flex">
            <img
              src="/image_login.png"
              alt="Parking building illustration"
              className="max-h-full max-w-full object-contain drop-shadow-2xl"
            />
          </div>

          <div className="flex items-center justify-center p-3 sm:p-8">
            <div className="w-full max-w-sm">
              <div className="overflow-hidden rounded-[1.25rem] border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-950 sm:rounded-[1.5rem]">
                <div className="bg-slate-50 dark:bg-white/[0.03] lg:hidden">
                  <img
                    src="/image_login.png"
                    alt="Parking building illustration"
                    className="h-36 w-full object-contain p-3"
                  />
                </div>

                <div className="space-y-5 p-5 sm:p-8">
                  <div>
                    <h1 className="text-xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-2xl">
                      Sign in
                    </h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Use your phone number, or a staff username for faster access.
                    </p>
                  </div>

                  {errorMessage ? (
                    <Alert variant="destructive">
                      <AlertDescription>{errorMessage}</AlertDescription>
                    </Alert>
                  ) : null}

                  <form onSubmit={handleSubmit} noValidate className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="identifier">
                        Phone or username
                        <RequiredMark />
                      </Label>
                      <div className="relative">
                        <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" strokeWidth={1.8} />
                        <Input
                          id="identifier"
                          type="text"
                          inputMode="text"
                          autoComplete="username"
                          autoFocus
                          className={cn(
                            'h-11 pl-9',
                            fieldErrors.identifier && 'border-destructive focus-visible:ring-destructive/20',
                          )}
                          placeholder="0901234567 or admin"
                          value={identifier}
                          onChange={(event) => setIdentifier(event.target.value)}
                          aria-invalid={!!fieldErrors.identifier}
                          aria-describedby={fieldErrors.identifier ? 'identifier-error' : undefined}
                          disabled={submitting}
                        />
                      </div>
                      {fieldErrors.identifier ? (
                        <p id="identifier-error" className="text-xs text-destructive">
                          {fieldErrors.identifier}
                        </p>
                      ) : null}

                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="password">
                        Password
                        <RequiredMark />
                      </Label>
                      <div className="relative">
                        <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" strokeWidth={1.8} />
                        <Input
                          id="password"
                          type={showPassword ? 'text' : 'password'}
                          autoComplete="current-password"
                          className={cn(
                            'h-11 pl-9 pr-10',
                            fieldErrors.password && 'border-destructive focus-visible:ring-destructive/20',
                          )}
                          placeholder="Password"
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                          aria-invalid={!!fieldErrors.password}
                          aria-describedby={fieldErrors.password ? 'password-error' : undefined}
                          disabled={submitting}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((value) => !value)}
                          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground transition hover:text-foreground"
                          tabIndex={-1}
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                        >
                          {showPassword ? (
                            <EyeOff className="h-4 w-4" strokeWidth={1.8} />
                          ) : (
                            <Eye className="h-4 w-4" strokeWidth={1.8} />
                          )}
                        </button>
                      </div>
                      {fieldErrors.password ? (
                        <p id="password-error" className="text-xs text-destructive">
                          {fieldErrors.password}
                        </p>
                      ) : null}
                    </div>

                    <Button type="submit" disabled={submitting} className="h-11 w-full">
                      {submitting ? 'Signing in...' : 'Sign in'}
                    </Button>
                  </form>

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-border" />
                    </div>
                    <div className="relative flex justify-center text-xs">
                      <span className="bg-white px-3 text-muted-foreground dark:bg-slate-950">
                        or
                      </span>
                    </div>
                  </div>

                  <p className="text-center text-sm text-muted-foreground">
                    Don't have an account?{' '}
                    <Link
                      to="/register"
                      className="font-semibold text-primary-600 transition hover:text-primary-700 dark:text-primary-400"
                    >
                      Sign up
                    </Link>
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

function RequiredMark() {
  return (
    <>
      <span className="text-destructive" aria-hidden="true">
        *
      </span>
      <span className="sr-only"> required</span>
    </>
  )
}

function extractErrorMessage(err: unknown): string {
  if (isAxiosError(err)) {
    const status = err.response?.status
    const data = err.response?.data as { message?: string | string[] } | undefined
    const raw = data?.message
    const text = Array.isArray(raw) ? raw.join(', ') : raw

    if (!err.response || status === 502 || status === 503 || status === 504) {
      return 'Không thể kết nối đến máy chủ'
    }

    if (status === 401) {
      if (text && /deactivat/i.test(text)) {
        return 'Account is deactivated. Contact an administrator.'
      }
      return 'Incorrect phone number, username, or password'
    }
    if (status === 400) {
      return text ?? 'Invalid data'
    }
    return text ?? `Error (${status})`
  }
  return 'An unexpected error occurred'
}
