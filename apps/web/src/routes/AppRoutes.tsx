import { Navigate, Routes, Route } from 'react-router-dom'
import RequireAuth from '../components/auth/RequireAuth'
import AdminLayout from '../layouts/AdminLayout'

// Landing
import Landing from '../pages/Landing'

// Auth
import Login from '../pages/auth/Login'
import Register from '../pages/auth/Register'

// Staff
import Gate from '../pages/staff/Gate'
import LostTicket from '../pages/staff/LostTicket'

// Manager
import Dashboard from '../pages/manager/Dashboard'
import Reports from '../pages/manager/Reports'
import Config from '../pages/manager/Config'

// Admin
import Users from '../pages/admin/Users'
import AdminDashboard from '../pages/admin/AdminDashboard'
import AdminReservations from '../pages/admin/AdminReservations'
import AdminReportsFlags from '../pages/admin/AdminReportsFlags'

// Driver
import DriverHome from '../pages/driver/Home'
import Reservations from '../pages/driver/Reservations'
import History from '../pages/driver/History'
import MySession from '../pages/driver/MySession'
import Profile from '../pages/driver/Profile'

/**
 * Central route configuration for the Parking Building Management System.
 *
 * Route protection is handled by <RequireAuth> which:
 *  - Redirects unauthenticated users to /login
 *  - Redirects authenticated users with the wrong role to their default home
 *
 * Role hierarchy:
 *  admin   → /admin/*
 *  manager → /manager/*
 *  staff   → /staff/*
 *  driver  → /driver/*
 */
export default function AppRoutes() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      {/* Staff routes */}
      <Route
        path="/staff/gate"
        element={
          <RequireAuth allowedRoles={['staff']} hideAppHeader>
            <Gate />
          </RequireAuth>
        }
      />
      <Route
        path="/staff/lost-ticket"
        element={
          <RequireAuth allowedRoles={['staff']} hideAppHeader>
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

      {/* Admin routes */}
      <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
      <Route
        path="/admin/dashboard"
        element={
          <RequireAuth allowedRoles={['admin']} hideAppHeader>
            <AdminLayout>
              <AdminDashboard />
            </AdminLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/admin/users"
        element={
          <RequireAuth allowedRoles={['admin']} hideAppHeader>
            <AdminLayout>
              <Users />
            </AdminLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/admin/reservations"
        element={
          <RequireAuth allowedRoles={['admin']} hideAppHeader>
            <AdminLayout>
              <AdminReservations />
            </AdminLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/admin/reports"
        element={
          <RequireAuth allowedRoles={['admin']} hideAppHeader>
            <AdminLayout>
              <AdminReportsFlags />
            </AdminLayout>
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
        path="/driver/profile"
        element={
          <RequireAuth allowedRoles={['driver']}>
            <Profile />
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
  )
}
