import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { ProtectedRoute } from '@/components/shared/ProtectedRoute'
import { SidebarProvider } from '@/components/ui/sidebar'

// Auth pages
import { LoginPage } from '@/pages/auth/LoginPage'
import { RegisterPage } from '@/pages/auth/RegisterPage'
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage'
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage'
import { VerifyEmailPage } from '@/pages/auth/VerifyEmailPage'

// App pages
import { DashboardPage } from '@/pages/DashboardPage'
import { ProfilePage } from '@/pages/profile/ProfilePage'
import { UsersPage } from '@/pages/users/UsersPage'
import { RolesPage } from '@/pages/roles/RolesPage'
import { PermissionsPage } from '@/pages/permissions/PermissionsPage'
import { CompaniesPage } from '@/pages/companies/CompaniesPage'
import { InvoicesPage } from '@/pages/invoices/InvoicesPage'
import { InvoiceListPage } from '@/pages/invoices/InvoiceListPage'

// Error pages
import { ForbiddenPage } from '@/pages/errors/ForbiddenPage'
import { NotFoundPage } from '@/pages/errors/NotFoundPage'

function ProtectedRoutes() {
  const { isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route
          path="/dashboard"
          element={<ProtectedRoute><DashboardPage /></ProtectedRoute>}
        />
        <Route
          path="/profile"
          element={<ProtectedRoute><ProfilePage /></ProtectedRoute>}
        />
        <Route
          path="/users"
          element={
            <ProtectedRoute permission="user:read">
              <UsersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/roles"
          element={
            <ProtectedRoute permission="role:read">
              <RolesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/permissions"
          element={
            <ProtectedRoute permission="permission:read">
              <PermissionsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/companies"
          element={
            <ProtectedRoute permission="company:read">
              <CompaniesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/invoices"
          element={
            <ProtectedRoute permission="invoice:read">
              <InvoicesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/invoices/list"
          element={
            <ProtectedRoute permission="invoice:read">
              <InvoiceListPage />
            </ProtectedRoute>
          }
        />
      </Routes>
    </SidebarProvider>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />

          {/* Error pages */}
          <Route path="/403" element={<ForbiddenPage />} />
          <Route path="/404" element={<NotFoundPage />} />

          {/* Protected routes with sidebar */}
          <Route path="/*" element={<ProtectedRoutes />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
