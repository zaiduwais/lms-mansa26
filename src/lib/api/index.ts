/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { auth } from '../firebase';
import { Role } from '../../types';

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

async function getAuthHeader(): Promise<HeadersInit> {
  const currentUser = auth.currentUser;
  if (!currentUser) return {};
  try {
    const token = await currentUser.getIdToken();
    return {
      Authorization: `Bearer ${token}`,
    };
  } catch (err) {
    console.error('Gagal mengambil token ID auth:', err);
    return {};
  }
}

export async function requestApi<T>(
  endpoint: string,
  options: RequestInit = {},
  timeoutMs = 15000
): Promise<ApiResponse<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const authHeaders = await getAuthHeader();
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...authHeaders,
      ...(options.headers || {}),
    };

    const response = await fetch(endpoint, {
      ...options,
      headers,
      signal: controller.signal,
    });

    clearTimeout(timer);

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return {
        success: false,
        error: response.status === 404
          ? 'Layanan API tidak ditemukan.'
          : 'Server tidak merespons dengan benar. Hubungi administrator.',
      };
    }

    const data = await response.json();
    if (!response.ok) {
      return {
        success: false,
        error: data.error || data.message || `Permintaan gagal (${response.status})`,
      };
    }

    return data;
  } catch (err: unknown) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === 'AbortError') {
      return { success: false, error: 'Permintaan batas waktu (timeout). Silakan periksa koneksi internet.' };
    }
    return {
      success: false,
      error: 'Tidak dapat terhubung ke server. Periksa koneksi internet atau hubungi administrator.',
    };
  }
}

export const api = {
  // Health Check
  checkHealth: () =>
    requestApi<{ ok: boolean }>('/api/health'),

  // Status dan Bootstrap Awal
  getBootstrapStatus: () =>
    requestApi<{ needsBootstrap: boolean; adminExists?: boolean; hasServiceAccount?: boolean }>('/api/bootstrap-status'),

  bootstrapAdmin: (adminId?: string, password?: string, nama?: string) =>
    requestApi<{ temporaryPassword?: string; identifier: string; nama: string }>('/api/bootstrap-admin', {
      method: 'POST',
      body: JSON.stringify({ adminId, password, nama }),
    }),

  // Operasi Manajemen Pengguna (Khusus Admin)
  createUser: (userData: {
    identifier: string;
    nama: string;
    roles: Role[];
    isWaliKelas?: boolean;
    kelasWali?: string;
    mapelPengampu?: string[];
  }) =>
    requestApi<{
      temporaryPassword: string;
      user: { uid: string; identifier: string; nama: string; roles: Role[] };
    }>('/api/admin/create-user', {
      method: 'POST',
      body: JSON.stringify(userData),
    }),

  resetPassword: (uid: string) =>
    requestApi<{ temporaryPassword: string; identifier: string }>('/api/admin/reset-password', {
      method: 'POST',
      body: JSON.stringify({ uid }),
    }),

  toggleUserStatus: (uid: string, aktif: boolean) =>
    requestApi<{ aktif: boolean }>('/api/admin/toggle-user-status', {
      method: 'POST',
      body: JSON.stringify({ uid, aktif }),
    }),

  updateUser: (uid: string, data: {
    nama?: string;
    roles?: Role[];
    isWaliKelas?: boolean;
    kelasWali?: string;
    mapelPengampu?: string[];
  }) =>
    requestApi<{ success: boolean }>('/api/admin/update-user', {
      method: 'POST',
      body: JSON.stringify({ uid, ...data }),
    }),

  bulkImportUsers: (users: Array<Record<string, unknown>>) =>
    requestApi<{
      summary: { total: number; created: number; skipped: number; error: number };
      results: Array<{
        identifier: string;
        nama: string;
        roles: string[];
        status: 'created' | 'skipped' | 'error';
        temporaryPassword?: string;
        message?: string;
        uid?: string;
      }>;
    }>('/api/admin/bulk-import-users', {
      method: 'POST',
      body: JSON.stringify({ users }),
    }, 45000), // timeout 45s untuk batch

  // Audit Log
  logFailedLogin: (identifier: string, reason?: string) =>
    requestApi<{ success: boolean }>('/api/audit/log-failed-login', {
      method: 'POST',
      body: JSON.stringify({ identifier, reason }),
    }),
};
