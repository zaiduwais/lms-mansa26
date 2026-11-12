/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './components/ui/Toast';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { ProtectedRoute } from './components/common/ProtectedRoute';
import { AppShell } from './components/layout/AppShell';

// Pages
import { LoginPage } from './pages/auth/LoginPage';
import { ChangePasswordPage } from './pages/auth/ChangePasswordPage';
import { ProfilePage } from './pages/profile/ProfilePage';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { AdminPenggunaPage } from './pages/admin/AdminPenggunaPage';
import { AdminPengaturanPage } from './pages/admin/AdminPengaturanPage';
import { AdminAuditLogPage } from './pages/admin/AdminAuditLogPage';
import { GuruDashboard } from './pages/guru/GuruDashboard';
import { SiswaDashboard } from './pages/siswa/SiswaDashboard';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { AccessDeniedPage } from './pages/AccessDeniedPage';

function RootRedirect() {
  const { currentRole, isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="w-8 h-8 rounded-full border-2 border-emerald-600 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  if (user.mustChangePassword) {
    return <Navigate to="/ganti-sandi" replace />;
  }

  return <Navigate to={`/${currentRole}`} replace />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <ToastProvider>
          <BrowserRouter>
            <Routes>
              {/* Public Auth Routes */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/akses-ditolak" element={<AccessDeniedPage />} />

              {/* Rute Wajib Ganti Sandi (Login Pertama) */}
              <Route
                path="/ganti-sandi"
                element={
                  <ProtectedRoute>
                    <ChangePasswordPage />
                  </ProtectedRoute>
                }
              />

              {/* Rute Profil Pengguna (Dapat Diakses Seluruh Peran) */}
              <Route
                element={
                  <ProtectedRoute>
                    <AppShell />
                  </ProtectedRoute>
                }
              >
                <Route path="/profil" element={<ProfilePage />} />
              </Route>

              {/* Protected App Shell for Admin */}
              <Route
                element={
                  <ProtectedRoute allowedRoles={['admin']}>
                    <AppShell />
                  </ProtectedRoute>
                }
              >
                <Route path="/admin" element={<AdminDashboard />} />
                <Route path="/admin/pengguna" element={<AdminPenggunaPage />} />
                <Route path="/admin/pengaturan" element={<AdminPengaturanPage />} />
                <Route path="/admin/pengaturan-madrasah" element={<AdminPengaturanPage />} />
                <Route path="/admin/log-audit" element={<AdminAuditLogPage />} />
                <Route path="/admin/tahun-ajaran" element={<PlaceholderPage />} />
                <Route path="/admin/kelas-rombel" element={<PlaceholderPage />} />
                <Route path="/admin/mata-pelajaran" element={<PlaceholderPage />} />
                <Route path="/admin/plot-jadwal" element={<PlaceholderPage />} />
                <Route path="/admin/ujian-terpusat" element={<PlaceholderPage />} />
                <Route path="/admin/absensi" element={<PlaceholderPage />} />
                <Route path="/admin/pengumuman" element={<PlaceholderPage />} />
                <Route path="/admin/laporan" element={<PlaceholderPage />} />
              </Route>

              {/* Protected App Shell for Guru */}
              <Route
                element={
                  <ProtectedRoute allowedRoles={['guru']}>
                    <AppShell />
                  </ProtectedRoute>
                }
              >
                <Route path="/guru" element={<GuruDashboard />} />
                <Route path="/guru/kelas-saya" element={<PlaceholderPage />} />
                <Route path="/guru/materi" element={<PlaceholderPage />} />
                <Route path="/guru/tugas" element={<PlaceholderPage />} />
                <Route path="/guru/bank-soal" element={<PlaceholderPage />} />
                <Route path="/guru/kuis-ujian" element={<PlaceholderPage />} />
                <Route path="/guru/absensi" element={<PlaceholderPage />} />
                <Route path="/guru/buku-nilai" element={<PlaceholderPage />} />
                <Route path="/guru/perangkat-ajar" element={<PlaceholderPage />} />
                <Route path="/guru/forum" element={<PlaceholderPage />} />
                <Route path="/guru/pesan" element={<PlaceholderPage />} />
                <Route path="/guru/laporan" element={<PlaceholderPage />} />
                {/* Wali Kelas Subroutes */}
                <Route path="/guru/wali-kelas/catatan" element={<PlaceholderPage />} />
                <Route path="/guru/wali-kelas/kehadiran" element={<PlaceholderPage />} />
                <Route path="/guru/wali-kelas/rapor" element={<PlaceholderPage />} />
              </Route>

              {/* Protected App Shell for Siswa */}
              <Route
                element={
                  <ProtectedRoute allowedRoles={['siswa']}>
                    <AppShell />
                  </ProtectedRoute>
                }
              >
                <Route path="/siswa" element={<SiswaDashboard />} />
                <Route path="/siswa/mapel-saya" element={<PlaceholderPage />} />
                <Route path="/siswa/materi" element={<PlaceholderPage />} />
                <Route path="/siswa/tugas" element={<PlaceholderPage />} />
                <Route path="/siswa/ujian" element={<PlaceholderPage />} />
                <Route path="/siswa/nilai" element={<PlaceholderPage />} />
                <Route path="/siswa/kehadiran" element={<PlaceholderPage />} />
                <Route path="/siswa/forum" element={<PlaceholderPage />} />
                <Route path="/siswa/pesan" element={<PlaceholderPage />} />
                <Route path="/siswa/profil" element={<ProfilePage />} />
              </Route>

              {/* Root and Fallback */}
              <Route path="/" element={<RootRedirect />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
