import { Suspense, lazy } from 'react'
import { Navigate, Routes, Route } from 'react-router-dom'
import RequireAuth from '../components/auth/RequireAuth'

// Landing
const Landing = lazy(() => import('../pages/Landing'))

// Auth
const Login = lazy(() => import('../pages/auth/Login'))
const Register = lazy(() => import('../pages/auth/Register'))

// Staff
const Gate = lazy(() => import('../pages/staff/Gate'))
const LostTicket = lazy(() => import('../pages/staff/LostTicket'))

// Manager
const Dashboard = lazy(() => import('../pages/manager/Dashboard'))
const Operations = lazy(() => import('../pages/manager/Operations'))
const Payments = lazy(() => import('../pages/manager/Payments'))
const ManagerReservations = lazy(() => import('../pages/manager/Reservations'))
const Reports = lazy(() => import('../pages/manager/Reports'))
const Config = lazy(() => import('../pages/manager/Config'))
const GateLanes = lazy(() => import('../pages/manager/GateLanes'))
const Vehicles = lazy(() => import('../pages/manager/Vehicles'))

// Admin
const Users = lazy(() => import('../pages/admin/Users'))
const AdminDashboard = lazy(() => import('../pages/admin/AdminDashboard'))
const AdminReservations = lazy(() => import('../pages/admin/AdminReservations'))
const AdminSessions = lazy(() => import('../pages/admin/AdminSessions'))
const AdminReportsFlags = lazy(() => import('../pages/admin/AdminReportsFlags'))

// Driver
const DriverHome = lazy(() => import('../pages/driver/Home'))
const Reservations = lazy(() => import('../pages/driver/Reservations'))
const History = lazy(() => import('../pages/driver/History'))
const MySession = lazy(() => import('../pages/driver/MySession'))
const Profile = lazy(() => import('../pages/driver/Profile'))
const Subscriptions = lazy(() => import('../pages/driver/Subscriptions'))

/**
 * Central route configuration for the Parking Building Management System.
 */
export default function AppRoutes() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-cyan-600 dark:border-slate-800 dark:border-t-cyan-500"></div>
          <p className="mt-4 text-sm font-semibold text-muted-foreground animate-pulse">Loading module...</p>
        </div>
      }
    >
      <Routes>
      {/* Public */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      {/* Staff routes */}
      <Route
        path="/staff/gate"
        element={
          <RequireAuth allowedRoles={['staff']}>
            <Gate />
          </RequireAuth>
        }
      />
      <Route
        path="/staff/lost-ticket"
        element={
          <RequireAuth allowedRoles={['staff']}>
            <LostTicket />
          </RequireAuth>
        }
      />

      {/* Manager routes */}
      <Route
        path="/manager/dashboard"
        element={
          <RequireAuth allowedRoles={['manager']}>
            <Dashboard />
          </RequireAuth>
        }
      />
      <Route
        path="/manager/operations"
        element={
          <RequireAuth allowedRoles={['manager']}>
            <Operations />
          </RequireAuth>
        }
      />
      <Route
        path="/manager/payments"
        element={
          <RequireAuth allowedRoles={['manager']}>
            <Payments />
          </RequireAuth>
        }
      />
      <Route
        path="/manager/reservations"
        element={
          <RequireAuth allowedRoles={['manager']}>
            <ManagerReservations />
          </RequireAuth>
        }
      />
      <Route
        path="/manager/sessions"
        element={
          <RequireAuth allowedRoles={['manager']}>
            <AdminSessions />
          </RequireAuth>
        }
      />
      <Route
        path="/manager/reports"
        element={
          <RequireAuth allowedRoles={['manager']}>
            <Reports />
          </RequireAuth>
        }
      />
      <Route
        path="/manager/config"
        element={
          <RequireAuth allowedRoles={['manager']}>
            <Config />
          </RequireAuth>
        }
      />
      <Route
        path="/manager/lanes"
        element={
          <RequireAuth allowedRoles={['manager']}>
            <GateLanes />
          </RequireAuth>
        }
      />
      <Route
        path="/manager/vehicles"
        element={
          <RequireAuth allowedRoles={['manager']}>
            <Vehicles />
          </RequireAuth>
        }
      />

      {/* Admin routes */}
      <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
      <Route
        path="/admin/dashboard"
        element={
          <RequireAuth allowedRoles={['admin']}>
            <AdminDashboard />
          </RequireAuth>
        }
      />
      <Route
        path="/admin/users"
        element={
          <RequireAuth allowedRoles={['admin']}>
            <Users />
          </RequireAuth>
        }
      />
      <Route
        path="/admin/reservations"
        element={
          <RequireAuth allowedRoles={['admin']}>
            <AdminReservations />
          </RequireAuth>
        }
      />
      <Route
        path="/admin/sessions"
        element={
          <RequireAuth allowedRoles={['admin']}>
            <AdminSessions />
          </RequireAuth>
        }
      />
      <Route
        path="/admin/reports"
        element={
          <RequireAuth allowedRoles={['admin']}>
            <AdminReportsFlags />
          </RequireAuth>
        }
      />

      {/* Driver routes */}
      <Route
        path="/driver/home"
        element={
          <RequireAuth allowedRoles={['driver']}>
            <DriverHome />
          </RequireAuth>
        }
      />
      <Route
        path="/driver/reservations"
        element={
          <RequireAuth allowedRoles={['driver']}>
            <Reservations />
          </RequireAuth>
        }
      />
      <Route
        path="/driver/history"
        element={
          <RequireAuth allowedRoles={['driver']}>
            <History />
          </RequireAuth>
        }
      />
      <Route
        path="/driver/my-session"
        element={
          <RequireAuth allowedRoles={['driver']}>
            <MySession />
          </RequireAuth>
        }
      />
      <Route
        path="/driver/my-qr"
        element={
          <RequireAuth allowedRoles={['driver']}>
            <MySession />
          </RequireAuth>
        }
      />
      <Route
        path="/driver/profile"
        element={
          <RequireAuth allowedRoles={['driver']}>
            <Profile />
          </RequireAuth>
        }
      />
      <Route
        path="/driver/subscriptions"
        element={
          <RequireAuth allowedRoles={['driver']}>
            <Subscriptions />
          </RequireAuth>
        }
      />

      {/* Fallback — landing page at root */}
      <Route path="/" element={<Landing />} />

      {/* 404 catch-all */}
      <Route
        path="*"
        element={
          <div className="min-h-screen flex items-center justify-center">
            <p className="text-gray-500">404 — Page not found</p>
          </div>
        }
      />
      </Routes>
    </Suspense>
  )
}
