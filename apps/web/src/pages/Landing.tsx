import { useRef, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useTheme } from '../lib/ThemeContext'
import { getToken, getUser } from '../lib/auth'
import type { AuthUser } from '../lib/auth'
import api from '../lib/api'
import parkingHero from '../assets/parking-hero.jpg'

gsap.registerPlugin(ScrollTrigger)

/* ──────────────────────────────────────────────────────────
   PBMS Landing — Glassmorphism + Accurate README data
   
   Tòa nhà 3 tầng · 90 slots · Zone A (ô tô) + Zone B (xe máy)
   Smart Slot Allocation · QR Flow · Reservation · Auto Pricing
   ────────────────────────────────────────────────────────── */

// Feature data used inline in JSX below

// Role data used inline in JSX below

// Flow steps used inline in JSX below

function homeForRole(role: AuthUser['role']): string {
  switch (role) {
    case 'admin':
      return '/admin/users'
    case 'manager':
      return '/manager/dashboard'
    case 'staff':
      return '/staff/gate'
    case 'driver':
      return '/driver/home'
  }
}

function getStartedPath(): string {
  const user = getUser()
  return getToken() && user ? homeForRole(user.role) : '/login'
}

function toDatetimeLocal(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export default function Landing() {
  const { theme, toggle } = useTheme()
  const minReservationTime = useMemo(() => toDatetimeLocal(new Date()), [])
  const [vehicleType, setVehicleType] = useState<'car' | 'motorbike'>('car')
  const [reservationTime, setReservationTime] = useState(minReservationTime)
  const startPath = getStartedPath()

  // Fetch real-time building occupancy (public endpoint)
  const [summary, setSummary] = useState({ total: 90, occupied: 0, available: 90, percent: 0, zoneA: { total: 30, available: 30 }, zoneB: { total: 60, available: 60 } })
  const [displaySummary, setDisplaySummary] = useState(summary)
  useEffect(() => {
    api.get('/slots/summary').then((res) => setSummary(res.data)).catch(() => {})
  }, [])

  useEffect(() => {
    const counter = {
      percent: displaySummary.percent,
      available: displaySummary.available,
      zoneAAvailable: displaySummary.zoneA.available,
      zoneBAvailable: displaySummary.zoneB.available,
    }

    const tween = gsap.to(counter, {
      percent: summary.percent,
      available: summary.available,
      zoneAAvailable: summary.zoneA.available,
      zoneBAvailable: summary.zoneB.available,
      duration: 1.2,
      ease: 'power2.out',
      onUpdate: () => {
        setDisplaySummary({
          ...summary,
          percent: Math.round(counter.percent),
          available: Math.round(counter.available),
          zoneA: {
            ...summary.zoneA,
            available: Math.round(counter.zoneAAvailable),
          },
          zoneB: {
            ...summary.zoneB,
            available: Math.round(counter.zoneBAvailable),
          },
        })
      },
    })

    return () => {
      tween.kill()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary])

  const heroRef = useRef<HTMLDivElement>(null)
  const featuresRef = useRef<HTMLDivElement>(null)


  const ctaRef = useRef<HTMLDivElement>(null)
  const resvRef = useRef<HTMLDivElement>(null)

  /* ── Hero ── */
  useEffect(() => {
    if (!heroRef.current) return
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } })
      tl.from('.hero-badge', { y: 20, opacity: 0, duration: 0.5 })
        .from('.hero-title', { y: 50, opacity: 0, duration: 0.8 }, '-=0.2')
        .from('.hero-desc', { y: 30, opacity: 0, duration: 0.5 }, '-=0.3')
        .from('.hero-buttons', { y: 20, opacity: 0, duration: 0.4 }, '-=0.2')
        .from('.hero-mockup', { y: 40, opacity: 0, scale: 0.96, duration: 0.9 }, '-=0.4')
    }, heroRef)
    return () => ctx.revert()
  }, [])

  /* ── Reservation Card ── */
  useEffect(() => {
    if (!resvRef.current) return
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        scrollTrigger: { trigger: resvRef.current, start: 'top 90%' },
      })

      tl.from('.resv-card', {
        y: 60,
        opacity: 0,
        duration: 0.8,
        ease: 'power3.out',
        immediateRender: false,
      })
        .from(
          '.resv-status, .resv-control, .resv-action',
          {
            y: 24,
            opacity: 0,
            duration: 0.5,
            ease: 'power2.out',
            stagger: 0.08,
          },
          '-=0.35',
        )
    }, resvRef)
    return () => ctx.revert()
  }, [])

  /* ── Features ── */
  useEffect(() => {
    if (!featuresRef.current) return
    const ctx = gsap.context(() => {
      gsap.from('.feature-card', {
        y: 50,
        opacity: 0,
        duration: 0.6,
        stagger: 0.1,
        ease: 'power3.out',
        immediateRender: false,
        scrollTrigger: { trigger: featuresRef.current, start: 'top 80%' },
      })
    }, featuresRef)
    return () => ctx.revert()
  }, [])

  /* ── CTA ── */
  useEffect(() => {
    if (!ctaRef.current) return
    const ctx = gsap.context(() => {
      gsap.from('.cta-inner', {
        scale: 0.95,
        opacity: 0,
        duration: 0.7,
        ease: 'power3.out',
        immediateRender: false,
        scrollTrigger: { trigger: ctaRef.current, start: 'top 80%' },
      })
    }, ctaRef)
    return () => ctx.revert()
  }, [])

  return (
    <div className="min-h-screen text-[#171717] dark:text-[#ededed] transition-colors duration-300">
      {/* ═══ Mesh gradient background (global) ═══ */}
      <div className="fixed inset-0 -z-10 bg-white dark:bg-[#0a0a0a] transition-colors duration-300" />
      <div
        className="fixed inset-0 -z-10 opacity-30 dark:opacity-20 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at 20% 20%, rgba(59,130,246,0.15) 0%, transparent 50%), ' +
            'radial-gradient(ellipse at 80% 80%, rgba(168,85,247,0.12) 0%, transparent 50%), ' +
            'radial-gradient(ellipse at 50% 50%, rgba(16,185,129,0.08) 0%, transparent 50%)',
          filter: 'blur(80px)',
        }}
      />

      {/* ══════════ Navbar — glass ══════════ */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/60 dark:bg-[#0a0a0a]/60 backdrop-blur-2xl border-b border-white/20 dark:border-white/10 transition-colors duration-300">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="h-9 w-9 overflow-hidden rounded-xl bg-white shadow-lg shadow-blue-600/20 ring-1 ring-black/5 dark:bg-white/10 dark:ring-white/10">
              <img
                src="/logo.png"
                alt="PBMS logo"
                className="h-full w-full object-cover"
              />
            </span>
            <span className="text-[15px] font-semibold tracking-tight max-[360px]:hidden">PBMS</span>
          </Link>
          <div className="hidden md:flex items-center gap-1">
            {[
              { label: 'Tính năng', href: '#features' },
            ].map((t) => (
              <a
                key={t.label}
                href={t.href}
                className="px-3 py-1.5 text-sm text-[#4d4d4d] dark:text-[#888] hover:text-[#171717] dark:hover:text-[#ededed] rounded-full transition-colors"
              >
                {t.label}
              </a>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggle}
              className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/50 dark:bg-white/10 border border-white/30 dark:border-white/10 hover:bg-white/80 dark:hover:bg-white/20 backdrop-blur-sm transition-all"
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? (
                <svg className="w-4 h-4 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
                </svg>
              ) : (
                <svg className="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
                </svg>
              )}
            </button>
            <Link
              to="/login"
              className="h-8 px-3 sm:px-4 flex items-center text-[13px] font-medium bg-white/50 dark:bg-white/10 border border-white/30 dark:border-white/10 rounded-xl hover:bg-white/80 dark:hover:bg-white/20 backdrop-blur-sm transition-all"
            >
              Đăng nhập
            </Link>
            <Link
              to="/register"
              className="h-8 px-3 sm:px-4 max-[420px]:hidden flex items-center text-[13px] font-medium text-white bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl shadow-lg shadow-blue-600/25 hover:shadow-blue-600/40 transition-all"
            >
              Đăng ký
            </Link>
          </div>
        </div>
      </nav>

      {/* ══════════ Hero — U-Verge style: oversized type + scroll indicator + stats card ══════════ */}
      <section ref={heroRef} className="relative min-h-[100svh] flex items-end overflow-hidden">
        {/* Background image */}
        <div className="absolute inset-0 -z-10">
          <img
            src={parkingHero}
            alt=""
            className="w-full h-full object-cover"
          />
          {/* Warm tint overlay — U-Verge sunset vibe */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/40 to-black/70 dark:from-black/70 dark:via-black/60 dark:to-black/85" />
          {/* Warm color wash */}
          <div className="absolute inset-0 bg-gradient-to-tr from-amber-900/20 via-transparent to-orange-900/10 mix-blend-overlay" />
        </div>

        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 relative w-full pb-14 sm:pb-28 pt-28 sm:pt-48">
          {/* ── Left: Main content ── */}
          <div className="grid lg:grid-cols-[1fr,380px] gap-12 items-end">

            {/* ── Oversized Typography ── */}
            <div>
              {/* Eyebrow — monospace label */}
              <div className="hero-badge max-w-[260px] sm:max-w-none font-mono text-[10px] sm:text-[11px] leading-5 tracking-[0.16em] sm:tracking-[0.2em] uppercase text-white/50 mb-4 sm:mb-6">
                Parking Building Management System — Since 2024
              </div>

              {/* Giant title */}
              <h1 className="hero-title leading-[0.92] tracking-[-2px] sm:tracking-[-6px] mb-4">
                <span className="block text-[54px] min-[390px]:text-[64px] sm:text-[96px] lg:text-[120px] font-bold text-white/95">
                  PARKING
                </span>
                <span className="block text-[34px] min-[390px]:text-[42px] sm:text-[64px] lg:text-[80px] font-bold bg-gradient-to-r from-amber-400 via-orange-400 to-rose-400 bg-clip-text text-transparent">
                  management
                </span>
              </h1>

              {/* Brand description — full width paragraph */}
              <p className="hero-desc text-[14px] sm:text-[17px] leading-[24px] sm:leading-[28px] text-white/65 max-w-lg mb-7 sm:mb-10">
                Hệ thống quản lý tòa nhà đỗ xe đa tầng — tự động phân bổ slot, tính phí theo giờ,
                QR check-in/out, đặt chỗ trước. Thiết kế cho 3 tầng, 2 zone, 90 slot.
              </p>

              {/* Buttons */}
              <div className="hero-buttons flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
                <Link
                  to={startPath}
                  className="inline-flex items-center justify-center gap-2 h-12 px-7 bg-white text-[#171717] text-[14px] font-semibold rounded-full shadow-lg shadow-black/20 hover:shadow-xl hover:bg-white/90 transition-all"
                >
                  Bắt đầu miễn phí
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </Link>
                <a
                  href="#specs"
                  className="inline-flex items-center justify-center gap-2 h-12 px-7 bg-white/10 backdrop-blur-xl text-[14px] font-medium rounded-full border border-white/20 text-white hover:bg-white/20 transition-all"
                >
                  + Xem thông số
                </a>
              </div>
            </div>

            {/* ── Right: Semi-transparent stats card (U-Verge featured card) ── */}
            <div className="hero-mockup hidden lg:block">
              <div className="bg-white/[0.08] backdrop-blur-3xl rounded-[1.5rem] p-6 border border-white/[0.12] shadow-[0_8px_60px_rgba(0,0,0,0.3)] ring-1 ring-white/[0.05]">
                {/* Card header */}
                <div className="flex items-center gap-2 mb-5">
                  <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                  <span className="text-[11px] font-mono text-white/50 uppercase tracking-wider">Live Dashboard</span>
                </div>

                {/* Big stats */}
                <div className="grid grid-cols-2 gap-4 mb-5">
                  {[
                    { num: '90', label: '[SLOTS]', sub: '3 floors × 30' },
                    { num: '55%', label: '[OCCUPIED]', sub: '50/90 hiện tại' },
                    { num: '4.2M', label: '[DOANH THU]', sub: 'VNĐ hôm nay' },
                    { num: '142', label: '[XE RA/VÀO]', sub: 'Hôm nay' },
                  ].map((s) => (
                    <div key={s.label} className="stat-item">
                      <div className="text-[28px] font-bold text-white leading-none">{s.num}</div>
                      <div className="text-[10px] font-mono text-white/40 mt-1">{s.label}</div>
                      <div className="text-[11px] text-white/30 mt-0.5">{s.sub}</div>
                    </div>
                  ))}
                </div>

                {/* Floor occupancy bars */}
                <div className="space-y-3 mb-5">
                  {[
                    { floor: 'Tầng 1', pct: 77, color: 'from-amber-400 to-orange-500' },
                    { floor: 'Tầng 2', pct: 57, color: 'from-blue-400 to-indigo-500' },
                    { floor: 'Tầng 3', pct: 33, color: 'from-emerald-400 to-cyan-500' },
                  ].map((f) => (
                    <div key={f.floor}>
                      <div className="flex justify-between text-[11px] text-white/50 mb-1">
                        <span>{f.floor}</span>
                        <span className="font-mono">{f.pct}%</span>
                      </div>
                      <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full bg-gradient-to-r ${f.color}`}
                          style={{ width: `${f.pct}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Read more */}
                <a
                  href="#features"
                  className="inline-flex items-center gap-1.5 text-[12px] font-medium text-white/60 hover:text-white/90 transition-colors"
                >
                  + READ MORE
                </a>
              </div>
            </div>
          </div>

          {/* ── Circular scroll indicator — U-Verge style ── */}
          <div className="absolute bottom-8 right-6 sm:right-12 hidden lg:flex flex-col items-center gap-3">
            <div className="hero-scroll relative w-20 h-20 flex items-center justify-center">
              {/* SVG circle with curved text */}
              <svg className="absolute inset-0 w-full h-full animate-[spin_12s_linear_infinite]" viewBox="0 0 80 80">
                <defs>
                  <path id="scrollCircle" d="M40,40 m-30,0 a30,30 0 1,1 60,0 a30,30 0 1,1 -60,0" fill="none" />
                </defs>
                <text className="fill-white/40 text-[8px] uppercase tracking-[3px]" style={{ letterSpacing: '3px' }}>
                  <textPath href="#scrollCircle">SCROLL DOWN TO DISCOVER • SCROLL DOWN •</textPath>
                </text>
              </svg>
              {/* Center icon */}
              <div className="relative z-10 w-8 h-8 rounded-full border border-white/20 flex items-center justify-center">
                <svg className="w-3.5 h-3.5 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m0 0l-6.75-6.75M12 19.5l6.75-6.75" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Gradient fade at bottom — seamless transition */}
        <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-white dark:from-[#0a0a0a] to-transparent pointer-events-none" />
      </section>

      {/* ══════════ Reservation Card — glassmorphism floating ══════════ */}
      <section ref={resvRef} className="relative z-10 -mt-8 sm:-mt-20 mb-8">
        <div className="max-w-[900px] mx-auto px-4 sm:px-6">
          <div className="resv-card bg-white/60 dark:bg-white/[0.04] backdrop-blur-3xl rounded-[1.5rem] sm:rounded-[2rem] border border-white/60 dark:border-white/[0.08] shadow-[0_8px_60px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_60px_rgba(0,0,0,0.5)] p-5 sm:p-9 ring-1 ring-black/[0.03] dark:ring-white/[0.03]">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/25">
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-[16px] font-semibold text-[#171717] dark:text-[#ededed]">Đặt chỗ trước</h3>
                  <p className="text-[12px] text-[#888] font-mono">Tòa nhà đỗ xe đa tầng — 90 slot</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1 bg-green-500/10 rounded-full">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                <span className="text-[11px] font-medium text-green-600 dark:text-green-400">Đang mở</span>
              </div>
            </div>

            {/* Current building availability */}
            <div className="resv-status mb-6 rounded-[1.5rem] border border-emerald-500/20 bg-emerald-500/[0.07] p-4 sm:p-5 backdrop-blur-sm dark:bg-emerald-500/[0.08]">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="mb-1 flex items-center gap-2">
                    <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-500" />
                    <span className="text-[11px] font-mono uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                      {displaySummary.available > 0 ? 'Vẫn còn nhận xe' : 'Hết chỗ'}
                    </span>
                  </div>
                  <h4 className="text-[18px] font-semibold tracking-[-0.3px] text-[#171717] dark:text-[#ededed]">
                    Parking building hiện đang sử dụng {displaySummary.percent}% / 100%
                  </h4>
                  <p className="mt-1 text-[13px] leading-5 text-[#666] dark:text-[#aaa]">
                    Còn khoảng {displaySummary.available}/{displaySummary.total} slot trống. Bạn có thể đến đỗ hoặc đặt chỗ trước ngay bây giờ.
                  </p>
                </div>
                <div className="min-w-[140px] rounded-2xl border border-white/50 bg-white/50 px-4 py-3 text-center dark:border-white/[0.08] dark:bg-white/[0.05]">
                  <div className="text-[32px] font-bold leading-none text-emerald-600 dark:text-emerald-300">{displaySummary.available}</div>
                  <div className="mt-1 text-[11px] font-mono uppercase tracking-wider text-[#777] dark:text-[#aaa]">slot còn trống</div>
                </div>
              </div>
              <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/50 dark:bg-white/[0.08]">
                <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500" style={{ width: `${displaySummary.percent}%` }} />
              </div>
            </div>

            {/* Reservation controls */}
            <div className="resv-control grid sm:grid-cols-2 gap-6 mb-6">
              {/* Loại xe */}
              <div>
                <label className="block text-[11px] font-mono text-[#888] uppercase tracking-wider mb-3">Loại xe</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setVehicleType('car')}
                    className={`flex items-center gap-3 p-4 rounded-2xl border backdrop-blur-sm transition-all ${
                      vehicleType === 'car'
                        ? 'bg-gradient-to-br from-blue-500/10 to-indigo-500/10 border-blue-500/30 dark:border-blue-500/20 shadow-sm'
                        : 'bg-white/40 dark:bg-white/[0.04] border-white/50 dark:border-white/[0.08] hover:border-blue-500/20 hover:bg-blue-500/5'
                    }`}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/70 ring-1 ring-blue-500/10 dark:bg-white/10">
                      <img
                        src="/car-suv.svg"
                        alt=""
                        className="h-8 w-8 object-contain"
                      />
                    </span>
                    <div className="text-left">
                      <div className="text-[14px] font-semibold text-[#171717] dark:text-[#ededed]">Ô tô</div>
                      <div className="text-[11px] font-mono text-blue-600 dark:text-blue-400">Zone A · còn {displaySummary.zoneA.available}</div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setVehicleType('motorbike')}
                    className={`flex items-center gap-3 p-4 rounded-2xl border backdrop-blur-sm transition-all ${
                      vehicleType === 'motorbike'
                        ? 'bg-gradient-to-br from-emerald-500/10 to-cyan-500/10 border-emerald-500/30 dark:border-emerald-500/20 shadow-sm'
                        : 'bg-white/40 dark:bg-white/[0.04] border-white/50 dark:border-white/[0.08] hover:border-emerald-500/20 hover:bg-emerald-500/5'
                    }`}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/70 ring-1 ring-emerald-500/10 dark:bg-white/10">
                      <img
                        src="/motorbike.svg"
                        alt=""
                        className="h-8 w-8 object-contain"
                      />
                    </span>
                    <div className="text-left">
                      <div className="text-[14px] font-semibold text-[#171717] dark:text-[#ededed]">Xe máy</div>
                      <div className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400">Zone B · còn {displaySummary.zoneB.available}</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Ngày giờ */}
              <div>
                <label className="block text-[11px] font-mono text-[#888] uppercase tracking-wider mb-3">Thời gian đặt</label>
                <input
                  type="datetime-local"
                  min={minReservationTime}
                  value={reservationTime}
                  onChange={(event) => setReservationTime(event.target.value < minReservationTime ? minReservationTime : event.target.value)}
                  className="h-[52px] w-full px-4 bg-white/40 dark:bg-white/[0.04] border border-white/50 dark:border-white/[0.08] rounded-2xl text-[13px] text-[#171717] dark:text-[#ededed] outline-none focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/10 backdrop-blur-sm transition-all"
                />
                <p className="mt-2 text-[11px] leading-4 text-[#888]">
                  Chỉ có thể chọn thời gian hiện tại hoặc tương lai. Không cho phép đặt về quá khứ.
                </p>
              </div>
            </div>

            {/* Nút đặt */}
            <div className="resv-action flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Link
                to={`${startPath}${startPath.includes('/driver/') ? '' : `?redirect=${encodeURIComponent(`/driver/reservations?vehicleType=${vehicleType}&time=${reservationTime}`)}`}`}
                className="inline-flex items-center justify-center gap-2 h-12 px-8 bg-gradient-to-r from-amber-500 to-orange-600 text-white text-[14px] font-semibold rounded-full shadow-lg shadow-amber-500/25 hover:shadow-xl hover:shadow-amber-500/35 transition-all shrink-0"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
                </svg>
                Tiến hành reservation
              </Link>
              <p className="text-[12px] leading-5 text-[#777] dark:text-[#aaa] sm:max-w-[320px]">
                Sau khi xác nhận, hệ thống sẽ tự động phân bổ slot phù hợp theo loại xe và tình trạng bãi hiện tại.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════ Features — asymmetric grid + UI mockups ══════════ */}
      <section id="features" ref={featuresRef} className="py-16 sm:py-28">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
          <div className="text-center max-w-xl mx-auto mb-14">
            <span className="inline-block text-[12px] font-mono text-[#888] uppercase tracking-[0.05em] mb-3">
              Tính năng
            </span>
            <h2 className="text-[32px] sm:text-[40px] font-semibold leading-[1.15] tracking-[-1.28px] mb-3">
              Giải quyết bài toán bãi đỗ xe.
            </h2>
          </div>

          {/* ── Top row: 2 large cards ── */}
          <div className="grid md:grid-cols-2 gap-4 mb-4">
            {/* Card 1: Check-in / Check-out */}
            <div className="feature-card group bg-white/50 dark:bg-white/[0.04] backdrop-blur-2xl rounded-[1.5rem] p-6 border border-white/50 dark:border-white/[0.08] shadow-[0_4px_30px_rgba(0,0,0,0.06)] dark:shadow-[0_4px_30px_rgba(0,0,0,0.3)] hover:bg-white/70 dark:hover:bg-white/[0.08] hover:-translate-y-1 ring-1 ring-black/[0.02] dark:ring-white/[0.02] transition-all duration-300 overflow-hidden">
              <div className="mb-4">
                <h3 className="text-[18px] font-semibold leading-[24px] tracking-[-0.28px] mb-2">
                  Check-in / Check-out
                </h3>
                <p className="text-[14px] leading-[20px] text-[#4d4d4d] dark:text-[#999] max-w-sm">
                  Staff thao tác tại cổng qua web. Tự động phân bổ slot khi xe vào, giải phóng slot khi xe ra.
                </p>
              </div>
              {/* UI Mockup — Check-in terminal */}
              <div className="bg-black/80 dark:bg-black/60 backdrop-blur-xl rounded-xl p-4 font-mono text-[11px] leading-[18px] border border-white/10">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                  <span className="text-green-400">Hệ thống sẵn sàng</span>
                </div>
                <div className="text-[#666]">{'>'} pbms checkin --plate 29A-12345 --type car</div>
                <div className="text-emerald-400">✓ Phân bổ tầng 2 — Zone A, slot 7</div>
                <div className="text-[#666]">{'>'} pbms checkin --plate 59B1-67890 --type motor</div>
                <div className="text-emerald-400">✓ Phân bổ tầng 1 — Zone B, slot 14</div>
                <div className="text-[#666] mt-2">{'>'} pbms status</div>
                <div className="text-blue-400">█ Occupied: 50/90 (55.6%)</div>
              </div>
            </div>

            {/* Card 2: Smart Slot Allocation */}
            <div className="feature-card group bg-white/50 dark:bg-white/[0.04] backdrop-blur-2xl rounded-[1.5rem] p-6 border border-white/50 dark:border-white/[0.08] shadow-[0_4px_30px_rgba(0,0,0,0.06)] dark:shadow-[0_4px_30px_rgba(0,0,0,0.3)] hover:bg-white/70 dark:hover:bg-white/[0.08] hover:-translate-y-1 ring-1 ring-black/[0.02] dark:ring-white/[0.02] transition-all duration-300 overflow-hidden">
              <div className="mb-4">
                <h3 className="text-[18px] font-semibold leading-[24px] tracking-[-0.28px] mb-2">
                  Smart Slot Allocation
                </h3>
                <p className="text-[14px] leading-[20px] text-[#4d4d4d] dark:text-[#999] max-w-sm">
                  Thuật toán phân bổ slot cân bằng tải giữa 3 tầng — tránh tình trạng tầng đầy tầng trống.
                </p>
              </div>
              {/* UI Mockup — Floor occupancy bars */}
              <div className="bg-white/60 dark:bg-white/[0.06] backdrop-blur-xl rounded-xl p-4 border border-white/40 dark:border-white/[0.08]">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[12px] font-semibold text-[#171717] dark:text-[#ededed]">Occupancy Map</span>
                  <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400">Balanced ✓</span>
                </div>
                {[
                  { floor: 'Tầng 1', pct: 60, color: 'from-blue-500 to-indigo-500' },
                  { floor: 'Tầng 2', pct: 53, color: 'from-amber-500 to-orange-500' },
                  { floor: 'Tầng 3', pct: 47, color: 'from-emerald-500 to-cyan-500' },
                ].map((f) => (
                  <div key={f.floor} className="mb-2 last:mb-0">
                    <div className="flex justify-between text-[11px] text-[#666] dark:text-[#888] mb-1">
                      <span>{f.floor}</span>
                      <span className="font-mono">{f.pct}%</span>
                    </div>
                    <div className="h-2 bg-black/5 dark:bg-white/10 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full bg-gradient-to-r ${f.color}`} style={{ width: `${f.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Bottom row: 3 cards ── */}
          <div className="grid md:grid-cols-3 gap-4">
            {/* Card 3: Tính phí tự động */}
            <div className="feature-card group bg-white/50 dark:bg-white/[0.04] backdrop-blur-2xl rounded-[1.5rem] p-6 border border-white/50 dark:border-white/[0.08] shadow-[0_4px_30px_rgba(0,0,0,0.06)] dark:shadow-[0_4px_30px_rgba(0,0,0,0.3)] hover:bg-white/70 dark:hover:bg-white/[0.08] hover:-translate-y-1 ring-1 ring-black/[0.02] dark:ring-white/[0.02] transition-all duration-300 overflow-hidden">
              <h3 className="text-[18px] font-semibold leading-[24px] tracking-[-0.28px] mb-2">
                Tính phí tự động
              </h3>
              <p className="text-[14px] leading-[20px] text-[#4d4d4d] dark:text-[#999] mb-4">
                Làm tròn theo giờ, phụ thu overtime, tính phí mất vé.
              </p>
              {/* UI Mockup — Pricing table */}
              <div className="bg-white/60 dark:bg-white/[0.06] backdrop-blur-xl rounded-xl p-3 border border-white/40 dark:border-white/[0.08]">
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="font-mono text-[#888]">Giờ đầu</div>
                  <div className="font-semibold text-right text-[#171717] dark:text-[#ededed]">5,000đ</div>
                  <div className="font-mono text-[#888]">Giờ 2-4</div>
                  <div className="font-semibold text-right text-[#171717] dark:text-[#ededed]">3,000đ/h</div>
                  <div className="font-mono text-[#888]">Overtime</div>
                  <div className="font-semibold text-right text-amber-600 dark:text-amber-400">+50%</div>
                  <div className="font-mono text-[#888]">Mất vé</div>
                  <div className="font-semibold text-right text-red-500">100,000đ</div>
                </div>
              </div>
            </div>

            {/* Card 4: QR Code Flow */}
            <div className="feature-card group bg-white/50 dark:bg-white/[0.04] backdrop-blur-2xl rounded-[1.5rem] p-6 border border-white/50 dark:border-white/[0.08] shadow-[0_4px_30px_rgba(0,0,0,0.06)] dark:shadow-[0_4px_30px_rgba(0,0,0,0.3)] hover:bg-white/70 dark:hover:bg-white/[0.08] hover:-translate-y-1 ring-1 ring-black/[0.02] dark:ring-white/[0.02] transition-all duration-300 overflow-hidden">
              <h3 className="text-[18px] font-semibold leading-[24px] tracking-[-0.28px] mb-2">
                QR Code Flow
              </h3>
              <p className="text-[14px] leading-[20px] text-[#4d4d4d] dark:text-[#999] mb-4">
                Driver nhận QR khi check-in. Staff scan QR khi check-out.
              </p>
              {/* UI Mockup — QR flow diagram */}
              <div className="flex items-center justify-center gap-3 py-4">
                <div className="flex flex-col items-center gap-1.5">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/25">
                    <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5z" />
                    </svg>
                  </div>
                  <span className="text-[10px] font-mono text-[#888]">Check-in</span>
                </div>
                <svg className="w-5 h-5 text-[#888] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
                <div className="flex flex-col items-center gap-1.5">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/25">
                    <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 16.75h.75v.75h-.75v-.75z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5z" />
                    </svg>
                  </div>
                  <span className="text-[10px] font-mono text-[#888]">QR</span>
                </div>
                <svg className="w-5 h-5 text-[#888] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
                <div className="flex flex-col items-center gap-1.5">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-emerald-500/25">
                    <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <span className="text-[10px] font-mono text-[#888]">Check-out</span>
                </div>
              </div>
            </div>

            {/* Card 5: Báo cáo vận hành */}
            <div className="feature-card group bg-white/50 dark:bg-white/[0.04] backdrop-blur-2xl rounded-[1.5rem] p-6 border border-white/50 dark:border-white/[0.08] shadow-[0_4px_30px_rgba(0,0,0,0.06)] dark:shadow-[0_4px_30px_rgba(0,0,0,0.3)] hover:bg-white/70 dark:hover:bg-white/[0.08] hover:-translate-y-1 ring-1 ring-black/[0.02] dark:ring-white/[0.02] transition-all duration-300 overflow-hidden">
              <h3 className="text-[18px] font-semibold leading-[24px] tracking-[-0.28px] mb-2">
                Báo cáo vận hành
              </h3>
              <p className="text-[14px] leading-[20px] text-[#4d4d4d] dark:text-[#999] mb-4">
                Doanh thu, lưu lượng, tỷ lệ occupancy theo ngày/tuần/tháng.
              </p>
              {/* UI Mockup — Bar chart */}
              <div className="bg-white/60 dark:bg-white/[0.06] backdrop-blur-xl rounded-xl p-4 border border-white/40 dark:border-white/[0.08]">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[12px] font-semibold text-[#171717] dark:text-[#ededed]">Revenue</span>
                  <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400">+12% ↑</span>
                </div>
                <div className="flex items-end gap-2 h-16">
                  {[40, 65, 55, 80, 70, 90, 75].map((h, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <div
                        className={`w-full rounded-t-md ${i === 5 ? 'bg-gradient-to-t from-blue-600 to-indigo-500' : 'bg-blue-500/20 dark:bg-blue-500/15'}`}
                        style={{ height: `${h}%` }}
                      />
                      <span className="text-[8px] font-mono text-[#888]">{['T2','T3','T4','T5','T6','T7','CN'][i]}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════ CTA — glass ══════════ */}
      <section ref={ctaRef} className="py-16 sm:py-28">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
          <div className="cta-inner text-center py-12 sm:py-20 px-5 sm:px-6 bg-gradient-to-br from-blue-600/90 via-indigo-600/90 to-purple-600/90 backdrop-blur-2xl rounded-[1.5rem] sm:rounded-[2rem] border border-white/20 shadow-[0_8px_60px_rgba(59,130,246,0.25)] relative overflow-hidden">
            <div
              className="absolute inset-0 opacity-20 pointer-events-none"
              style={{
                background:
                  'radial-gradient(ellipse at 30% 50%, #fff 0%, transparent 50%), ' +
                  'radial-gradient(ellipse at 70% 50%, rgba(168,85,247,0.5) 0%, transparent 50%)',
              }}
            />
            <div className="relative">
              <h2 className="text-[27px] sm:text-[40px] font-semibold leading-[1.15] tracking-[-1px] sm:tracking-[-1.28px] text-white mb-3">
                Sẵn sàng quản lý tòa nhà đỗ xe?
              </h2>
              <p className="text-[16px] leading-[24px] text-blue-100 mb-8 max-w-md mx-auto">
                90 slot · 3 tầng · Tự động phân bổ & tính phí. Miễn phí.
              </p>
              <div className="flex flex-col sm:flex-row sm:flex-wrap justify-center gap-3">
                <Link
                  to={startPath}
                  className="inline-flex items-center justify-center gap-2 h-11 px-6 bg-white text-blue-700 text-[15px] font-semibold rounded-full shadow-lg hover:shadow-xl hover:bg-blue-50 transition-all"
                >
                  Đăng ký miễn phí
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </Link>
                <Link
                  to="/login"
                  className="inline-flex items-center justify-center h-11 px-6 text-white text-[15px] font-medium rounded-full border border-white/30 hover:bg-white/10 transition-all"
                >
                  Đăng nhập
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════ Footer — glass ══════════ */}
      <footer className="py-12">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
          <div className="bg-white/40 dark:bg-white/5 backdrop-blur-2xl rounded-2xl p-6 border border-white/30 dark:border-white/10 shadow-lg shadow-black/5 dark:shadow-black/20">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center">
                  <span className="text-white text-xs font-bold">P</span>
                </div>
                <span className="text-[14px] font-medium text-[#4d4d4d] dark:text-[#888]">PBMS</span>
              </div>
              <div className="flex items-center gap-5">
                {['Tính năng'].map((t) => (
                  <a
                    key={t}
                    href="#features"
                    className="text-[13px] text-[#888] hover:text-[#171717] dark:hover:text-[#ededed] transition-colors"
                  >
                    {t}
                  </a>
                ))}
              </div>
              <p className="text-[12px] text-[#888]">© {new Date().getFullYear()} PBMS. MIT License.</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
