/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  updatePassword as updateFirebasePassword,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  onSnapshot,
  updateDoc,
  setDoc,
  addDoc,
  collection,
  serverTimestamp,
} from 'firebase/firestore';
import { auth, db, identifierToEmail } from '../lib/firebase';
import { Role, UserProfile, MadrasahSettings } from '../types';
import { api } from '../lib/api';

interface AuthContextType {
  user: UserProfile | null;
  firebaseUser: FirebaseUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  currentRole: Role;
  setCurrentRole: (role: Role) => void;
  madrasahSettings: MadrasahSettings;
  updateMadrasahSettings: (newSettings: Partial<MadrasahSettings>) => Promise<{ success: boolean; error?: string }>;
  login: (identifier: string, kataSandi: string) => Promise<{ success: boolean; error?: string }>;
  loginWithGoogle: () => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  changePassword: (newPassword: string) => Promise<{ success: boolean; error?: string }>;
  refreshUserProfile: () => Promise<void>;
}

const DEFAULT_MADRASAH_SETTINGS: MadrasahSettings = {
  namaResmi: 'Madrasah Aliyah Negeri Insan Berilmu',
  namaSingkat: 'MAN In-Ilmu',
  alamat: 'Jl. Pesantren Luhur No. 7, Nusantara, Indonesia',
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [currentRole, setCurrentRoleState] = useState<Role>('siswa');
  const [madrasahSettings, setMadrasahSettings] = useState<MadrasahSettings>(DEFAULT_MADRASAH_SETTINGS);

  // 1. Dengarkan pembaruan dokumen madrasahSettings/public secara real-time
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'madrasahSettings', 'public'),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as MadrasahSettings;
          setMadrasahSettings({
            namaResmi: data.namaResmi || DEFAULT_MADRASAH_SETTINGS.namaResmi,
            namaSingkat: data.namaSingkat || DEFAULT_MADRASAH_SETTINGS.namaSingkat,
            alamat: data.alamat || DEFAULT_MADRASAH_SETTINGS.alamat,
            logoDataUrl: data.logoDataUrl,
            updatedAt: data.updatedAt,
            updatedBy: data.updatedBy,
          });

          // Perbarui judul tab browser secara real-time
          if (data.namaSingkat || data.namaResmi) {
            document.title = `${data.namaSingkat || data.namaResmi} - LMS Madrasah Aliyah`;
          }
        }
      },
      (error) => {
        console.warn('Gagal membaca madrasahSettings/public secara real-time:', error);
      }
    );

    return () => unsub();
  }, []);

  // 2. Dengarkan status autentikasi Firebase
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      if (!fbUser) {
        setUser(null);
        setIsLoading(false);
        return;
      }

      try {
        const userDocRef = doc(db, 'users', fbUser.uid);
        const userSnap = await getDoc(userDocRef);

        if (userSnap.exists()) {
          const uData = userSnap.data();
          const profile: UserProfile = {
            id: fbUser.uid,
            identifier: uData.identifier || fbUser.email?.split('@')[0] || '',
            nama: uData.nama || fbUser.displayName || 'Pengguna',
            roles: Array.isArray(uData.roles) && uData.roles.length > 0 ? uData.roles : ['siswa'],
            isWaliKelas: Boolean(uData.isWaliKelas),
            kelasWali: uData.kelasWali || '',
            mapelPengampu: uData.mapelPengampu || [],
            aktif: uData.aktif !== false,
            mustChangePassword: Boolean(uData.mustChangePassword),
            createdAt: uData.createdAt || new Date().toISOString(),
            createdBy: uData.createdBy || '',
            lastLoginAt: uData.lastLoginAt,
            email: fbUser.email || undefined,
          };

          setUser(profile);

          // Tentukan peran aktif awal
          const savedRole = sessionStorage.getItem('lms_active_role') as Role;
          if (savedRole && profile.roles.includes(savedRole)) {
            setCurrentRoleState(savedRole);
          } else {
            setCurrentRoleState(profile.roles[0]);
          }
        } else {
          // Dokumen belum ada di Firestore
          if (fbUser.email === 'zaid.uwais.alq@gmail.com') {
            const ownerProfile: UserProfile = {
              id: fbUser.uid,
              identifier: '198005122005011002',
              nama: fbUser.displayName || 'H. Ahmad Fauzi, M.Pd. (Admin)',
              roles: ['admin'],
              isWaliKelas: false,
              aktif: true,
              mustChangePassword: false,
              createdAt: new Date().toISOString(),
              createdBy: 'system_owner_auto_bootstrap',
              email: fbUser.email,
            };
            await setDoc(userDocRef, ownerProfile);
            setUser(ownerProfile);
            setCurrentRoleState('admin');
          } else {
            setUser(null);
          }
        }
      } catch (err) {
        console.error('Gagal mengambil data profil Firestore:', err);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const setCurrentRole = (role: Role) => {
    if (user && user.roles.includes(role)) {
      setCurrentRoleState(role);
      sessionStorage.setItem('lms_active_role', role);
    }
  };

  const refreshUserProfile = async () => {
    if (!auth.currentUser) return;
    try {
      const userSnap = await getDoc(doc(db, 'users', auth.currentUser.uid));
      if (userSnap.exists()) {
        const uData = userSnap.data();
        setUser((prev) =>
          prev
            ? {
                ...prev,
                ...uData,
                roles: uData.roles || prev.roles,
              }
            : null
        );
      }
    } catch (err) {
      console.error('Gagal memuat ulang profil:', err);
    }
  };

  const login = async (
    identifier: string,
    kataSandi: string
  ): Promise<{ success: boolean; error?: string }> => {
    const cleanId = identifier.trim();
    if (!cleanId || !kataSandi) {
      return { success: false, error: 'NISN/NIP dan kata sandi wajib diisi.' };
    }

    const email = identifierToEmail(cleanId);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, kataSandi);
      const uid = userCredential.user.uid;

      // Ambil dokumen profil dari Firestore
      const userDocRef = doc(db, 'users', uid);
      const userSnap = await getDoc(userDocRef);

      if (!userSnap.exists()) {
        await signOut(auth);
        return { success: false, error: 'Profil akun tidak ditemukan di database madrasah.' };
      }

      const uData = userSnap.data();

      // Periksa status akun aktif
      if (uData.aktif === false) {
        await signOut(auth);
        return {
          success: false,
          error: 'Akun Anda telah dinonaktifkan oleh Administrator. Silakan hubungi operator madrasah.',
        };
      }

      // Catat waktu login terakhir di Firestore
      const nowIso = new Date().toISOString();
      await updateDoc(userDocRef, {
        lastLoginAt: nowIso,
      }).catch((e) => console.warn('Pembaruan lastLoginAt dilewati:', e));

      // Catat audit log login sukses
      try {
        await addDoc(collection(db, 'auditLogs'), {
          aksi: 'login_success',
          aktorUid: uid,
          aktorNama: uData.nama || cleanId,
          targetId: cleanId,
          targetTipe: 'auth',
          ringkasan: `Login berhasil untuk akun ${cleanId}`,
          waktu: serverTimestamp(),
          userAgent: navigator.userAgent.slice(0, 150),
        });
      } catch (logErr) {
        console.warn('Audit log login sukses:', logErr);
      }

      return { success: true };
    } catch (err: unknown) {
      const fbError = err as { code?: string; message?: string };
      console.warn('Percobaan login gagal:', fbError.code);

      // Catat audit log kegagalan langsung ke Firestore (didukung firestore.rules aktorUid: anonymous)
      try {
        await addDoc(collection(db, 'auditLogs'), {
          aksi: 'login_failed',
          aktorUid: 'anonymous',
          aktorNama: 'Pengunjung Tidak Dikenal',
          targetId: cleanId,
          targetTipe: 'auth',
          ringkasan: `Percobaan login gagal untuk nomor identitas: ${cleanId}. Alasan: ${fbError.code || 'Kredensial tidak valid'}`,
          waktu: serverTimestamp(),
          userAgent: navigator.userAgent.slice(0, 150),
        });
      } catch {}

      if (fbError.code === 'auth/operation-not-allowed') {
        return {
          success: false,
          error:
            'Metode login Email/Sandi belum diaktifkan di Firebase Console. Pemilik proyek harus mengaktifkan penyedia "Email/Password" di Firebase Console > Authentication > Sign-in method.',
        };
      }

      if (
        fbError.code === 'auth/wrong-password' ||
        fbError.code === 'auth/user-not-found' ||
        fbError.code === 'auth/invalid-credential' ||
        fbError.code === 'auth/invalid-email'
      ) {
        return { success: false, error: 'NISN/NIP atau kata sandi salah.' };
      }

      if (fbError.code === 'auth/user-disabled') {
        return { success: false, error: 'Akun telah dinonaktifkan oleh administrator.' };
      }

      if (fbError.code === 'auth/too-many-requests') {
        return { success: false, error: 'Terlalu banyak percobaan gagal. Silakan tunggu beberapa saat.' };
      }

      if (fbError.code === 'auth/network-request-failed') {
        return { success: false, error: 'Koneksi jaringan terputus. Periksa sambungan internet Anda.' };
      }

      return { success: false, error: 'NISN/NIP atau kata sandi salah.' };
    }
  };

  const loginWithGoogle = async (): Promise<{ success: boolean; error?: string }> => {
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const fbUser = result.user;

      const userDocRef = doc(db, 'users', fbUser.uid);
      const userSnap = await getDoc(userDocRef);

      if (!userSnap.exists()) {
        if (fbUser.email === 'zaid.uwais.alq@gmail.com') {
          const ownerProfile: UserProfile = {
            id: fbUser.uid,
            identifier: '198005122005011002',
            nama: fbUser.displayName || 'H. Ahmad Fauzi, M.Pd. (Admin)',
            roles: ['admin'],
            isWaliKelas: false,
            aktif: true,
            mustChangePassword: false,
            createdAt: new Date().toISOString(),
            createdBy: 'system_owner_auto_bootstrap',
            email: fbUser.email,
          };
          await setDoc(userDocRef, ownerProfile);
          setUser(ownerProfile);
          setCurrentRoleState('admin');

          // Pastikan madrasahSettings/public ada
          const settingsRef = doc(db, 'madrasahSettings', 'public');
          const settingsSnap = await getDoc(settingsRef);
          if (!settingsSnap.exists()) {
            await setDoc(settingsRef, {
              namaResmi: 'Madrasah Aliyah Negeri Insan Berilmu',
              namaSingkat: 'MAN In-Ilmu',
              alamat: 'Jl. Pesantren Luhur No. 7, Nusantara, Indonesia',
              updatedAt: new Date().toISOString(),
              updatedBy: fbUser.uid,
            });
          }

          // Catat audit log
          try {
            await addDoc(collection(db, 'auditLogs'), {
              aksi: 'create_user',
              aktorUid: fbUser.uid,
              aktorNama: ownerProfile.nama,
              targetId: ownerProfile.identifier,
              targetTipe: 'user',
              ringkasan: `Inisialisasi akun Administrator Pemilik via Google Sign-In`,
              waktu: serverTimestamp(),
              userAgent: navigator.userAgent.slice(0, 150),
            });
          } catch {}
        } else {
          await signOut(auth);
          return {
            success: false,
            error: 'Akun Google ini belum terdaftar di database madrasah. Silakan hubungi Administrator.',
          };
        }
      }

      return { success: true };
    } catch (err: unknown) {
      const fbErr = err as { code?: string; message?: string };
      if (fbErr.code === 'auth/popup-closed-by-user') {
        return { success: false, error: 'Jendela login Google ditutup sebelum selesai.' };
      }
      return {
        success: false,
        error: fbErr.message || 'Gagal masuk dengan akun Google.',
      };
    }
  };

  const logout = async () => {
    const currentUid = auth.currentUser?.uid;
    const currentNama = user?.nama || 'Pengguna';
    const currentId = user?.identifier || '';

    if (currentUid) {
      try {
        await addDoc(collection(db, 'auditLogs'), {
          aksi: 'logout',
          aktorUid: currentUid,
          aktorNama: currentNama,
          targetId: currentId,
          targetTipe: 'auth',
          ringkasan: `Pengguna keluar (logout): ${currentNama} (${currentId})`,
          waktu: serverTimestamp(),
          userAgent: navigator.userAgent.slice(0, 150),
        });
      } catch (err) {
        console.warn('Gagal mencatat audit logout:', err);
      }
    }

    sessionStorage.removeItem('lms_active_role');
    await signOut(auth);
    setUser(null);
    setFirebaseUser(null);
  };

  const changePassword = async (newPassword: string): Promise<{ success: boolean; error?: string }> => {
    if (!auth.currentUser || !user) {
      return { success: false, error: 'Sesi login tidak aktif.' };
    }

    if (!newPassword || newPassword.length < 8) {
      return { success: false, error: 'Kata sandi baru minimal 8 karakter.' };
    }

    if (newPassword.toLowerCase() === user.identifier.toLowerCase()) {
      return { success: false, error: 'Kata sandi tidak boleh sama dengan nomor identitas (NISN/NIP).' };
    }

    try {
      await updateFirebasePassword(auth.currentUser, newPassword);

      // Set mustChangePassword = false di Firestore
      await updateDoc(doc(db, 'users', auth.currentUser.uid), {
        mustChangePassword: false,
      });

      setUser((prev) => (prev ? { ...prev, mustChangePassword: false } : null));

      // Catat audit log ganti sandi
      try {
        await addDoc(collection(db, 'auditLogs'), {
          aksi: 'change_password',
          aktorUid: auth.currentUser.uid,
          aktorNama: user.nama,
          targetId: user.identifier,
          targetTipe: 'user',
          ringkasan: `Pengguna memperbarui kata sandi akunnya`,
          waktu: serverTimestamp(),
          userAgent: navigator.userAgent.slice(0, 150),
        });
      } catch (e) {
        console.warn('Gagal mencatat audit ganti sandi:', e);
      }

      return { success: true };
    } catch (err: unknown) {
      console.error('Gagal mengganti kata sandi:', err);
      const fbErr = err as { code?: string; message?: string };
      if (fbErr.code === 'auth/requires-recent-login') {
        return {
          success: false,
          error: 'Demi alasan keamanan, silakan keluar dan masuk kembali sebelum mengganti kata sandi.',
        };
      }
      return {
        success: false,
        error: fbErr.message || 'Gagal memperbarui kata sandi.',
      };
    }
  };

  const updateMadrasahSettings = async (
    newSettings: Partial<MadrasahSettings>
  ): Promise<{ success: boolean; error?: string }> => {
    if (!user || !user.roles.includes('admin')) {
      return { success: false, error: 'Hanya administrator yang berhak mengubah identitas madrasah.' };
    }

    try {
      const nowIso = new Date().toISOString();
      const payload: Partial<MadrasahSettings> = {
        ...newSettings,
        updatedAt: nowIso,
        updatedBy: user.id,
      };

      await setDoc(doc(db, 'madrasahSettings', 'public'), payload, { merge: true });

      // Catat audit log
      try {
        await addDoc(collection(db, 'auditLogs'), {
          aksi: 'update_settings',
          aktorUid: user.id,
          aktorNama: user.nama,
          targetId: 'madrasahSettings/public',
          targetTipe: 'settings',
          ringkasan: `Memperbarui identitas madrasah: ${newSettings.namaSingkat || newSettings.namaResmi || ''}`,
          waktu: serverTimestamp(),
          userAgent: navigator.userAgent.slice(0, 150),
        });
      } catch (e) {
        console.warn('Gagal mencatat audit pengaturan:', e);
      }

      return { success: true };
    } catch (err: unknown) {
      console.error('Gagal menyimpan pengaturan:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Gagal memperbarui identitas madrasah.',
      };
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        firebaseUser,
        isAuthenticated: Boolean(firebaseUser && user && user.aktif),
        isLoading,
        currentRole,
        setCurrentRole,
        madrasahSettings,
        updateMadrasahSettings,
        login,
        loginWithGoogle,
        logout,
        changePassword,
        refreshUserProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
