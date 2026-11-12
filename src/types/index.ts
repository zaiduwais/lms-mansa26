/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { LucideIcon } from 'lucide-react';

import { TipeIdentitas } from '../config/identifier';

export * from './academic';
export * from '../config/identifier';

export type Role = 'admin' | 'guru' | 'siswa';

/**
 * Struktur Dokumen Pengguna di Firestore: users/{uid}
 * Satu pengguna dapat memiliki lebih dari satu peran (misal: guru merangkap admin).
 */
export interface UserProfile {
  id: string; // Firestore UID / Firebase Auth UID
  identifier: string; // NISN (siswa 10 digit), NIP (guru 18 digit), NPK, atau ID Admin
  tipeIdentitas?: TipeIdentitas;
  nama: string;
  roles: Role[];
  isWaliKelas?: boolean;
  kelasWali?: string; // misal: "X-1", "XI-B"
  mapelPengampu?: string[]; // misal: ["Al-Qur'an Hadis", "Fikih"]
  jenisKelamin?: 'L' | 'P';
  nomorHp?: string;
  aktif: boolean;
  mustChangePassword: boolean; // Wajib ganti sandi pada login pertama
  createdAt: string;
  createdBy: string;
  lastLoginAt?: string;
  email?: string; // Email sintetis: {identifier}@lms.madrasah.id (hanya di memori klien)
}

/**
 * Pengaturan Identitas Madrasah di Firestore: madrasahSettings/public
 * Dapat dibaca publik tanpa autentikasi (untuk login), hanya ditulis oleh Admin.
 */
export interface MadrasahSettings {
  namaResmi: string;
  namaSingkat: string;
  alamat: string;
  logoDataUrl?: string; // Data URL terkompresi target <= 150KB
  updatedAt?: string;
  updatedBy?: string;
}

/**
 * Tipe Aksi Catatan Audit Log
 */
export type AuditActionType =
  | 'login_success'
  | 'login_failed'
  | 'logout'
  | 'create_user'
  | 'update_user'
  | 'toggle_user_status'
  | 'reset_password'
  | 'change_password'
  | 'update_settings';

/**
 * Struktur Dokumen Log Audit di Firestore: auditLogs/{logId} (Append-Only)
 */
export interface AuditLogItem {
  id?: string;
  aksi: AuditActionType;
  aktorUid: string;
  aktorNama: string;
  targetId: string;
  targetTipe: 'user' | 'settings' | 'auth';
  ringkasan: string;
  waktu: string | { seconds: number; nanoseconds: number };
  userAgent?: string;
}

export interface NavItem {
  id: string;
  title: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
  faseRilis?: 2 | 3 | 4;
  kategori?: 'utama' | 'akademik' | 'wali_kelas' | 'pengaturan';
}

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface TableColumn<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
  width?: string;
}

export interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  type: 'success' | 'warning' | 'danger' | 'info';
  duration?: number;
}
