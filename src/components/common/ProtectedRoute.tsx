/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Role } from '../../types';
import { Skeleton } from '../ui/Skeleton';

interface ProtectedRouteProps {
  allowedRoles?: Role[];
  children: React.ReactNode;
}

export function ProtectedRoute({ allowedRoles, children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user, currentRole } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
        <div className="max-w-md w-full space-y-4 text-center">
          <div className="w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-950 animate-pulse mx-auto" />
          <Skeleton className="h-6 w-48 mx-auto" />
          <Skeleton className="h-4 w-64 mx-auto" />
          <p className="text-xs text-slate-400">Memverifikasi otorisasi akun madrasah...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Jika akun dinonaktifkan
  if (!user.aktif) {
    return <Navigate to="/login" state={{ error: 'Akun Anda dinonaktifkan.' }} replace />;
  }

  // Jika wajib ganti sandi pada login pertama
  if (user.mustChangePassword && location.pathname !== '/ganti-sandi') {
    return <Navigate to="/ganti-sandi" replace />;
  }

  // Pemeriksaan otorisasi peran (RBAC)
  if (allowedRoles && !allowedRoles.includes(currentRole)) {
    return <Navigate to="/akses-ditolak" replace />;
  }

  return <>{children}</>;
}
