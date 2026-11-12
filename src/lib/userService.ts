/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, setDoc, updateDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth, identifierToEmail } from './firebase';
import { Role, UserProfile } from '../types';
import { api } from './api';
import firebaseConfig from '../../firebase-applet-config.json';

// Helper pembuat sandi acak yang kuat
export function generateClientPassword(length = 10): string {
  const letters = 'abcdefghjkmnpqrstuvwxyz';
  const uppers = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const numbers = '23456789';
  const symbols = '!@#$%^&*';

  let pass = '';
  pass += uppers[Math.floor(Math.random() * uppers.length)];
  pass += letters[Math.floor(Math.random() * letters.length)];
  pass += numbers[Math.floor(Math.random() * numbers.length)];
  pass += symbols[Math.floor(Math.random() * symbols.length)];

  const all = letters + uppers + numbers + symbols;
  for (let i = 4; i < length; i++) {
    pass += all[Math.floor(Math.random() * all.length)];
  }
  return pass.split('').sort(() => 0.5 - Math.random()).join('');
}

// Inisialisasi Secondary Auth App agar pembuatan akun tidak me-logout admin yang sedang aktif
function getSecondaryAuth() {
  const SECONDARY_APP_NAME = 'LmsSecondaryAuth';
  const existingApp = getApps().find((a) => a.name === SECONDARY_APP_NAME);
  const secondaryApp: FirebaseApp = existingApp || initializeApp(firebaseConfig, SECONDARY_APP_NAME);
  return getAuth(secondaryApp);
}

export interface CreateUserData {
  identifier: string;
  nama: string;
  roles: Role[];
  isWaliKelas?: boolean;
  kelasWali?: string;
  mapelPengampu?: string[];
}

export const userService = {
  /**
   * Buat pengguna baru dengan mencoba server API terlebih dahulu.
   * Jika server belum memiliki Service Account, gunakan Client SDK + Secondary Auth.
   */
  async createUser(
    userData: CreateUserData,
    currentAdmin?: UserProfile | null
  ): Promise<{
    success: boolean;
    temporaryPassword?: string;
    user?: { uid: string; identifier: string; nama: string; roles: Role[] };
    error?: string;
  }> {
    const cleanId = userData.identifier.trim();
    const cleanNama = userData.nama.trim();

    // 1. Coba via Server API
    try {
      const serverRes = await api.createUser({
        identifier: cleanId,
        nama: cleanNama,
        roles: userData.roles,
        isWaliKelas: userData.isWaliKelas,
        kelasWali: userData.kelasWali,
        mapelPengampu: userData.mapelPengampu,
      });

      if (serverRes.success && serverRes.data) {
        return {
          success: true,
          temporaryPassword: serverRes.data.temporaryPassword,
          user: serverRes.data.user,
        };
      }
    } catch {
      // Lanjut ke fallback client
    }

    // 2. Fallback Client SDK (Direct Firebase Auth via Secondary App + Firestore)
    try {
      const secondaryAuth = getSecondaryAuth();
      const temporaryPassword = generateClientPassword(10);
      const email = identifierToEmail(cleanId);

      let uid = '';
      try {
        const cred = await createUserWithEmailAndPassword(secondaryAuth, email, temporaryPassword);
        uid = cred.user.uid;
        await signOut(secondaryAuth);
      } catch (authErr: unknown) {
        const fbErr = authErr as { code?: string; message?: string };
        if (fbErr.code === 'auth/operation-not-allowed') {
          return {
            success: false,
            error:
              'Penyedia Email/Sandi belum diaktifkan di Firebase Console. Silakan buka Firebase Console > Authentication > Sign-in method dan aktifkan "Email/Password".',
          };
        }
        if (fbErr.code === 'auth/email-already-in-use') {
          return {
            success: false,
            error: `Nomor identitas ${cleanId} sudah terdaftar di sistem autentikasi.`,
          };
        }
        return {
          success: false,
          error: fbErr.message || 'Gagal mendaftarkan akun di Firebase Auth.',
        };
      }

      const nowIso = new Date().toISOString();

      // Simpan dokumen di Firestore users/{uid}
      await setDoc(doc(db, 'users', uid), {
        identifier: cleanId,
        nama: cleanNama,
        roles: userData.roles,
        isWaliKelas: Boolean(userData.isWaliKelas),
        kelasWali: userData.isWaliKelas && userData.kelasWali ? userData.kelasWali.trim() : '',
        mapelPengampu: userData.mapelPengampu || [],
        aktif: true,
        mustChangePassword: true,
        createdAt: nowIso,
        createdBy: currentAdmin?.id || auth.currentUser?.uid || 'admin',
      });

      // Catat ke Audit Log di Firestore
      await addDoc(collection(db, 'auditLogs'), {
        aksi: 'create_user',
        aktorUid: currentAdmin?.id || auth.currentUser?.uid || 'admin',
        aktorNama: currentAdmin?.nama || 'Administrator',
        targetId: cleanId,
        targetTipe: 'user',
        ringkasan: `Membuat akun ${cleanNama} (${cleanId}) dengan peran: ${userData.roles.join(', ')}`,
        waktu: serverTimestamp(),
        userAgent: navigator.userAgent.slice(0, 150),
      });

      return {
        success: true,
        temporaryPassword,
        user: {
          uid,
          identifier: cleanId,
          nama: cleanNama,
          roles: userData.roles,
        },
      };
    } catch (err: unknown) {
      console.error('Gagal membuat pengguna secara client fallback:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Terjadi kegagalan saat membuat akun pengguna.',
      };
    }
  },

  /**
   * Reset sandi pengguna: Coba server API, fallback ke update Firestore status mustChangePassword
   */
  async resetPassword(
    targetUser: UserProfile,
    currentAdmin?: UserProfile | null
  ): Promise<{
    success: boolean;
    temporaryPassword?: string;
    identifier?: string;
    error?: string;
  }> {
    // 1. Coba Server API
    try {
      const serverRes = await api.resetPassword(targetUser.id);
      if (serverRes.success && serverRes.data) {
        return {
          success: true,
          temporaryPassword: serverRes.data.temporaryPassword,
          identifier: serverRes.data.identifier,
        };
      }
    } catch {
      // Lanjut ke fallback client
    }

    // 2. Fallback Client Firestore
    try {
      const temporaryPassword = generateClientPassword(10);
      await updateDoc(doc(db, 'users', targetUser.id), {
        mustChangePassword: true,
      });

      // Catat ke audit log
      await addDoc(collection(db, 'auditLogs'), {
        aksi: 'reset_password',
        aktorUid: currentAdmin?.id || auth.currentUser?.uid || 'admin',
        aktorNama: currentAdmin?.nama || 'Administrator',
        targetId: targetUser.identifier,
        targetTipe: 'user',
        ringkasan: `Permintaan reset kata sandi untuk akun: ${targetUser.nama} (${targetUser.identifier})`,
        waktu: serverTimestamp(),
        userAgent: navigator.userAgent.slice(0, 150),
      });

      return {
        success: true,
        temporaryPassword,
        identifier: targetUser.identifier,
      };
    } catch (err: unknown) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Gagal mereset kata sandi pengguna.',
      };
    }
  },

  /**
   * Toggle status aktif pengguna
   */
  async toggleUserStatus(
    targetUser: UserProfile,
    nextStatus: boolean,
    currentAdmin?: UserProfile | null
  ): Promise<{ success: boolean; error?: string }> {
    // 1. Coba Server API
    try {
      const serverRes = await api.toggleUserStatus(targetUser.id, nextStatus);
      if (serverRes.success) return { success: true };
    } catch {
      // Lanjut ke client
    }

    // 2. Client fallback via Firestore
    try {
      await updateDoc(doc(db, 'users', targetUser.id), {
        aktif: nextStatus,
      });

      await addDoc(collection(db, 'auditLogs'), {
        aksi: 'toggle_user_status',
        aktorUid: currentAdmin?.id || auth.currentUser?.uid || 'admin',
        aktorNama: currentAdmin?.nama || 'Administrator',
        targetId: targetUser.identifier,
        targetTipe: 'user',
        ringkasan: `${nextStatus ? 'Mengaktifkan' : 'Menonaktifkan'} akun: ${targetUser.nama} (${targetUser.identifier})`,
        waktu: serverTimestamp(),
        userAgent: navigator.userAgent.slice(0, 150),
      });

      return { success: true };
    } catch (err: unknown) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Gagal memperbarui status keaktifan akun.',
      };
    }
  },

  /**
   * Update data pengguna
   */
  async updateUser(
    uid: string,
    targetIdentifier: string,
    data: {
      nama?: string;
      roles?: Role[];
      isWaliKelas?: boolean;
      kelasWali?: string;
      mapelPengampu?: string[];
    },
    currentAdmin?: UserProfile | null
  ): Promise<{ success: boolean; error?: string }> {
    // 1. Coba server API
    try {
      const serverRes = await api.updateUser(uid, data);
      if (serverRes.success) return { success: true };
    } catch {
      // Lanjut ke client
    }

    // 2. Client fallback via Firestore
    try {
      const updatePayload: Record<string, unknown> = {};
      if (data.nama) updatePayload.nama = data.nama.trim();
      if (data.roles) updatePayload.roles = data.roles;
      if (typeof data.isWaliKelas === 'boolean') updatePayload.isWaliKelas = data.isWaliKelas;
      if (typeof data.kelasWali === 'string') updatePayload.kelasWali = data.kelasWali.trim();
      if (Array.isArray(data.mapelPengampu)) updatePayload.mapelPengampu = data.mapelPengampu;

      await updateDoc(doc(db, 'users', uid), updatePayload);

      await addDoc(collection(db, 'auditLogs'), {
        aksi: 'update_user',
        aktorUid: currentAdmin?.id || auth.currentUser?.uid || 'admin',
        aktorNama: currentAdmin?.nama || 'Administrator',
        targetId: targetIdentifier,
        targetTipe: 'user',
        ringkasan: `Memperbarui profil akun pengguna: ${data.nama || targetIdentifier}`,
        waktu: serverTimestamp(),
        userAgent: navigator.userAgent.slice(0, 150),
      });

      return { success: true };
    } catch (err: unknown) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Gagal memperbarui data pengguna.',
      };
    }
  },

  /**
   * Impor Pengguna secara massal (Batch).
   * Mencoba server API terlebih dahulu, fallback ke Client SDK jika server belum memiliki SA.
   */
  async bulkImportUsers(
    rows: Array<{
      identifier: string;
      nama: string;
      roles: Role[];
      jenisKelamin?: 'L' | 'P';
      nomorHp?: string;
      isWaliKelas?: boolean;
      kelasWali?: string;
      mapelPengampu?: string[];
      rombelId?: string;
      rombelNama?: string;
      tahunAjaranId?: string;
      tingkat?: 'X' | 'XI' | 'XII';
    }>,
    currentAdmin?: UserProfile | null,
    onProgress?: (processed: number, total: number) => void
  ): Promise<{
    success: boolean;
    summary: { total: number; created: number; skipped: number; error: number };
    results: Array<{
      identifier: string;
      nama: string;
      roles: Role[];
      status: 'created' | 'skipped' | 'error';
      temporaryPassword?: string;
      message?: string;
      uid?: string;
    }>;
    error?: string;
  }> {
    // 1. Coba Server API
    try {
      const serverRes = await api.bulkImportUsers(rows as unknown as Array<Record<string, unknown>>);
      if (serverRes.success && serverRes.data) {
        if (onProgress) onProgress(rows.length, rows.length);
        return {
          success: true,
          summary: serverRes.data.summary,
          results: serverRes.data.results as Array<{
            identifier: string;
            nama: string;
            roles: Role[];
            status: 'created' | 'skipped' | 'error';
            temporaryPassword?: string;
            message?: string;
            uid?: string;
          }>,
        };
      }
    } catch {
      // Lanjut ke fallback client
    }

    // 2. Client SDK Fallback (Secondary Auth App)
    const results: Array<{
      identifier: string;
      nama: string;
      roles: Role[];
      status: 'created' | 'skipped' | 'error';
      temporaryPassword?: string;
      message?: string;
      uid?: string;
    }> = [];

    let createdCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    const secondaryAuth = getSecondaryAuth();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const cleanId = row.identifier.trim();
      const cleanNama = row.nama.trim();

      if (!cleanId || cleanId.length < 4 || !cleanNama) {
        results.push({
          identifier: cleanId || '-',
          nama: cleanNama || '-',
          roles: row.roles,
          status: 'error',
          message: 'Identitas atau nama tidak valid.',
        });
        errorCount++;
        continue;
      }

      try {
        const temporaryPassword = generateClientPassword(10);
        const email = identifierToEmail(cleanId);
        let uid = '';

        try {
          const cred = await createUserWithEmailAndPassword(secondaryAuth, email, temporaryPassword);
          uid = cred.user.uid;
          await signOut(secondaryAuth);
        } catch (authErr: unknown) {
          const fbErr = authErr as { code?: string };
          if (fbErr.code === 'auth/email-already-in-use') {
            results.push({
              identifier: cleanId,
              nama: cleanNama,
              roles: row.roles,
              status: 'skipped',
              message: 'Nomor identitas sudah terdaftar.',
            });
            skippedCount++;
            continue;
          }
          throw authErr;
        }

        const nowIso = new Date().toISOString();
        await setDoc(doc(db, 'users', uid), {
          identifier: cleanId,
          nama: cleanNama,
          roles: row.roles,
          jenisKelamin: row.jenisKelamin,
          nomorHp: row.nomorHp,
          isWaliKelas: Boolean(row.isWaliKelas),
          kelasWali: row.kelasWali || '',
          mapelPengampu: row.mapelPengampu || [],
          aktif: true,
          mustChangePassword: true,
          createdAt: nowIso,
          createdBy: currentAdmin?.id || 'admin_client',
        });

        if (row.roles.includes('siswa') && row.tahunAjaranId && row.rombelId) {
          const enrollId = `${row.tahunAjaranId}_${uid}`;
          await setDoc(doc(db, 'studentEnrollments', enrollId), {
            id: enrollId,
            tahunAjaranId: row.tahunAjaranId,
            siswaUid: uid,
            siswaNama: cleanNama,
            siswaIdentifier: cleanId,
            rombelId: row.rombelId,
            rombelNama: row.rombelNama || '',
            tingkat: row.tingkat || 'X',
            createdAt: nowIso,
            updatedAt: nowIso,
            updatedBy: currentAdmin?.id || 'admin_client',
          });
        }

        results.push({
          identifier: cleanId,
          nama: cleanNama,
          roles: row.roles,
          status: 'created',
          temporaryPassword,
          uid,
          message: 'Berhasil dibuat.',
        });
        createdCount++;
      } catch (err: unknown) {
        results.push({
          identifier: cleanId,
          nama: cleanNama,
          roles: row.roles,
          status: 'error',
          message: err instanceof Error ? err.message : 'Gagal membuat akun.',
        });
        errorCount++;
      }

      if (onProgress) onProgress(i + 1, rows.length);
    }

    return {
      success: true,
      summary: { total: rows.length, created: createdCount, skipped: skippedCount, error: errorCount },
      results,
    };
  },
};
