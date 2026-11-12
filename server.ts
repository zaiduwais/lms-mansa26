/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express, { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { initializeApp, getApps, getApp, App, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Baca konfigurasi Firebase applet
let firebaseConfig: Record<string, string> = {};
try {
  const configPath = path.resolve(__dirname, 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
} catch (e) {
  console.warn('Gagal membaca firebase-applet-config.json di server:', e);
}

// Helper validator Service Account JSON
function parseServiceAccount(keyStr?: string): Record<string, unknown> | null {
  if (!keyStr || typeof keyStr !== 'string') return null;
  const trimmed = keyStr.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (
      parsed &&
      typeof parsed === 'object' &&
      parsed.type === 'service_account' &&
      parsed.private_key &&
      parsed.client_email
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

const serviceAccountObj = parseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
const hasAdminCredentials = Boolean(serviceAccountObj);

// Inisialisasi Firebase Admin SDK
let adminApp: App;
try {
  const existingApps = getApps();
  if (existingApps.length > 0) {
    adminApp = existingApps[0]!;
  } else if (serviceAccountObj) {
    adminApp = initializeApp({
      credential: cert(serviceAccountObj),
      projectId: firebaseConfig.projectId,
    });
  } else {
    adminApp = initializeApp({
      projectId: firebaseConfig.projectId,
    });
  }
} catch (error) {
  console.warn('Inisialisasi Firebase Admin SDK fallback default:', error);
  adminApp = getApps()[0] || initializeApp({ projectId: firebaseConfig.projectId });
}

const firestoreDbId = firebaseConfig.firestoreDatabaseId || '(default)';
const adminDb = getFirestore(adminApp, firestoreDbId);
const adminAuth = getAuth(adminApp);

const LMS_AUTH_DOMAIN = process.env.LMS_AUTH_DOMAIN || 'lms.madrasah.id';

// Helper pembuat sandi acak yang kuat
function generateSecurePassword(length = 10): string {
  const letters = 'abcdefghjkmnpqrstuvwxyz';
  const uppers = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const numbers = '23456789';
  const symbols = '!@#$%^&*';

  let pass = '';
  pass += uppers[crypto.randomInt(0, uppers.length)];
  pass += letters[crypto.randomInt(0, letters.length)];
  pass += numbers[crypto.randomInt(0, numbers.length)];
  pass += symbols[crypto.randomInt(0, symbols.length)];

  const all = letters + uppers + numbers + symbols;
  for (let i = 4; i < length; i++) {
    pass += all[crypto.randomInt(0, all.length)];
  }
  // Acak urutan karakter
  return pass.split('').sort(() => 0.5 - Math.random()).join('');
}

// Rate Limiter Sederhana In-Memory
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
function rateLimit(maxRequests = 30, windowMs = 60000) {
  return (req: Request, res: Response, next: NextFunction) => {
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${clientIp}_${req.path}`;
    const now = Date.now();

    const record = rateLimitMap.get(key);
    if (!record || now > record.resetTime) {
      rateLimitMap.set(key, { count: 1, resetTime: now + windowMs });
      return next();
    }

    if (record.count >= maxRequests) {
      return res.status(429).json({
        success: false,
        error: 'Terlalu banyak permintaan. Silakan tunggu beberapa saat.',
      });
    }

    record.count++;
    next();
  };
}

// Middleware Verifikasi Admin Token
interface AuthenticatedRequest extends Request {
  user?: {
    uid: string;
    email?: string;
    identifier?: string;
    nama?: string;
    roles?: string[];
  };
}

async function verifyAdminToken(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  if (!hasAdminCredentials) {
    return res.status(400).json({
      success: false,
      needsClientFallback: true,
      error: 'Server belum dikonfigurasi dengan FIREBASE_SERVICE_ACCOUNT_KEY. Silakan gunakan operasi client SDK.',
    });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Akses ditolak: Token otentikasi tidak ditemukan.' });
  }

  const idToken = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const userDocRef = adminDb.collection('users').doc(decodedToken.uid);
    const userDocSnap = await userDocRef.get();

    if (!userDocSnap.exists) {
      return res.status(401).json({ success: false, error: 'Dokumen pengguna tidak ditemukan di database.' });
    }

    const userData = userDocSnap.data();
    if (!userData || !userData.aktif) {
      return res.status(401).json({ success: false, error: 'Akun Anda telah dinonaktifkan oleh administrator.' });
    }

    if (!userData.roles || !userData.roles.includes('admin')) {
      return res.status(401).json({ success: false, error: 'Hak akses tidak memadai: Diperlukan peran Administrator.' });
    }

    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      identifier: userData.identifier,
      nama: userData.nama,
      roles: userData.roles,
    };

    next();
  } catch (error) {
    console.error('Kesalahan verifikasi token:', error);
    return res.status(401).json({ success: false, error: 'Sesi login tidak sah atau telah kedaluwarsa.' });
  }
}

// Inisialisasi Express App
const app = express();
app.set('trust proxy', true);

// Header Keamanan Dasar
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

app.use(express.json({ limit: '5mb' }));

// =============================================================================
// API ROUTES
// =============================================================================

// 0. Endpoint Verifikasi Kesehatan API
app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

// 1. Status Bootstrap
app.get('/api/bootstrap-status', async (_req, res) => {
  if (!hasAdminCredentials) {
    return res.json({
      success: true,
      needsBootstrap: false,
      adminExists: false,
      hasServiceAccount: false,
      message: 'Server beroperasi tanpa Service Account. Inisialisasi admin menggunakan akun Google pemilik.',
    });
  }

  try {
    const snapshot = await adminDb
      .collection('users')
      .where('roles', 'array-contains', 'admin')
      .limit(1)
      .get();

    const adminExists = !snapshot.empty;
    return res.json({
      success: true,
      needsBootstrap: !adminExists,
      adminExists,
      hasServiceAccount: true,
    });
  } catch (error: unknown) {
    return res.status(400).json({
      success: false,
      needsBootstrap: false,
      error: 'Tidak dapat memeriksa status sistem di database.',
    });
  }
});

// 2. Bootstrap Admin Awal
app.post('/api/bootstrap-admin', rateLimit(5, 60000), async (req, res) => {
  if (!hasAdminCredentials) {
    return res.status(400).json({
      success: false,
      needsServiceAccount: true,
      error:
        'Firebase Admin SDK pada server memerlukan FIREBASE_SERVICE_ACCOUNT_KEY di Secrets. Anda dapat langsung masuk menggunakan Akun Google Pemilik (zaid.uwais.alq@gmail.com) untuk inisialisasi administrator otomatis.',
    });
  }

  try {
    // Periksa apakah sudah ada admin
    const snapshot = await adminDb
      .collection('users')
      .where('roles', 'array-contains', 'admin')
      .limit(1)
      .get();

    if (!snapshot.empty) {
      return res.status(400).json({
        success: false,
        error: 'Jalur bootstrap telah ditutup. Administrator madrasah sudah terdaftar.',
      });
    }

    const adminId = (req.body.adminId || process.env.BOOTSTRAP_ADMIN_ID || '198005122005011002').trim();
    const adminPassword = (req.body.password || process.env.BOOTSTRAP_ADMIN_PASSWORD || 'MadrasahCinta#2026').trim();
    const adminNama = (req.body.nama || process.env.BOOTSTRAP_ADMIN_NAMA || 'H. Ahmad Fauzi, M.Pd.').trim();

    if (!adminId || adminId.length < 4) {
      return res.status(400).json({ success: false, error: 'Nomor identitas NIP/ID admin minimal 4 karakter.' });
    }
    if (!adminPassword || adminPassword.length < 8) {
      return res.status(400).json({ success: false, error: 'Kata sandi awal minimal 8 karakter.' });
    }

    const email = `${adminId.toLowerCase()}@${LMS_AUTH_DOMAIN}`;

    // Buat akun di Firebase Auth
    let userRecord;
    try {
      userRecord = await adminAuth.getUserByEmail(email);
      // Jika akun sudah ada di Auth tapi belum terdata di Firestore
      await adminAuth.updateUser(userRecord.uid, { password: adminPassword, displayName: adminNama });
    } catch {
      userRecord = await adminAuth.createUser({
        email,
        password: adminPassword,
        displayName: adminNama,
        emailVerified: true,
      });
    }

    const nowIso = new Date().toISOString();

    // Buat profil users/{uid}
    await adminDb.collection('users').doc(userRecord.uid).set({
      identifier: adminId,
      nama: adminNama,
      roles: ['admin'],
      isWaliKelas: false,
      aktif: true,
      mustChangePassword: true,
      createdAt: nowIso,
      createdBy: 'system_bootstrap',
      lastLoginAt: nowIso,
    });

    // Inisialisasi default madrasahSettings/public jika belum ada
    const settingsRef = adminDb.collection('madrasahSettings').doc('public');
    const settingsSnap = await settingsRef.get();
    if (!settingsSnap.exists) {
      await settingsRef.set({
        namaResmi: 'Madrasah Aliyah Negeri Insan Berilmu',
        namaSingkat: 'MAN In-Ilmu',
        alamat: 'Jl. Pesantren Luhur No. 7, Nusantara, Indonesia',
        updatedAt: nowIso,
        updatedBy: userRecord.uid,
      });
    }

    // Catat ke Audit Log
    await adminDb.collection('auditLogs').add({
      aksi: 'create_user',
      aktorUid: 'system_bootstrap',
      aktorNama: 'Inisialisasi Sistem',
      targetId: adminId,
      targetTipe: 'user',
      ringkasan: `Inisialisasi akun Administrator Pertama: ${adminNama} (${adminId})`,
      waktu: nowIso,
      userAgent: req.headers['user-agent']?.slice(0, 150) || 'Bootstrap System',
    });

    res.json({
      success: true,
      message: 'Akun Administrator pertama berhasil dibuat. Jalur bootstrap kini telah ditutup.',
      data: {
        identifier: adminId,
        nama: adminNama,
        temporaryPassword: adminPassword,
      },
    });
  } catch (error: unknown) {
    console.error('Gagal melakukan bootstrap admin:', error);
    const errObj = error as { code?: number | string; message?: string };
    const isPermissionDenied = errObj.code === 7 || (errObj.message && errObj.message.includes('PERMISSION_DENIED'));

    return res.status(400).json({
      success: false,
      error: isPermissionDenied
        ? 'Firebase Admin SDK pada server memerlukan kredensial Service Account (FIREBASE_SERVICE_ACCOUNT_KEY di Secrets) untuk membuat akun di project cloud.'
        : error instanceof Error ? error.message : 'Gagal melakukan inisialisasi akun administrator.',
    });
  }
});

// 3. Pembuatan Akun Baru (Admin Only)
app.post('/api/admin/create-user', verifyAdminToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { identifier, nama, roles, isWaliKelas, kelasWali, mapelPengampu } = req.body;

    if (!identifier || typeof identifier !== 'string') {
      return res.status(400).json({ success: false, error: 'Nomor identitas (NISN / NIP) wajib diisi.' });
    }
    const cleanId = identifier.trim();
    if (!/^[0-9a-zA-Z_\-]+$/.test(cleanId) || cleanId.length < 4 || cleanId.length > 32) {
      return res.status(400).json({ success: false, error: 'Format nomor identitas tidak valid (4-32 karakter alfanumerik).' });
    }

    if (!nama || typeof nama !== 'string' || nama.trim().length < 2) {
      return res.status(400).json({ success: false, error: 'Nama lengkap wajib diisi (minimal 2 karakter).' });
    }

    if (!roles || !Array.isArray(roles) || roles.length === 0) {
      return res.status(400).json({ success: false, error: 'Minimal satu peran harus dipilih (admin, guru, siswa).' });
    }

    // Cek apakah identifier sudah terdaftar di Firestore
    const existingSnap = await adminDb
      .collection('users')
      .where('identifier', '==', cleanId)
      .limit(1)
      .get();

    if (!existingSnap.empty) {
      return res.status(400).json({
        success: false,
        error: `Pengguna dengan nomor identitas ${cleanId} sudah terdaftar.`,
      });
    }

    // Buat sandi acak dan kuat satu kali pakai
    const temporaryPassword = generateSecurePassword(10);
    const email = `${cleanId.toLowerCase()}@${LMS_AUTH_DOMAIN}`;

    // Buat user di Firebase Auth
    let userRecord;
    try {
      userRecord = await adminAuth.createUser({
        email,
        password: temporaryPassword,
        displayName: nama.trim(),
        emailVerified: true,
      });
    } catch (authErr: unknown) {
      const msg = authErr instanceof Error ? authErr.message : String(authErr);
      if (msg.includes('email-already-exists')) {
        return res.status(400).json({ success: false, error: 'Email identitas ini telah digunakan di sistem autentikasi.' });
      }
      throw authErr;
    }

    const nowIso = new Date().toISOString();

    // Simpan dokumen pengguna di Firestore: users/{uid}
    await adminDb.collection('users').doc(userRecord.uid).set({
      identifier: cleanId,
      nama: nama.trim(),
      roles,
      isWaliKelas: Boolean(isWaliKelas),
      kelasWali: kelasWali ? String(kelasWali).trim() : '',
      mapelPengampu: Array.isArray(mapelPengampu) ? mapelPengampu : [],
      aktif: true,
      mustChangePassword: true,
      createdAt: nowIso,
      createdBy: req.user?.uid || 'admin',
    });

    // Catat log audit
    await adminDb.collection('auditLogs').add({
      aksi: 'create_user',
      aktorUid: req.user?.uid || 'admin',
      aktorNama: req.user?.nama || 'Administrator',
      targetId: cleanId,
      targetTipe: 'user',
      ringkasan: `Membuat akun ${nama.trim()} (${cleanId}) dengan peran: ${roles.join(', ')}`,
      waktu: nowIso,
      userAgent: req.headers['user-agent']?.slice(0, 150) || 'LMS Web Client',
    });

    res.json({
      success: true,
      message: 'Akun berhasil dibuat.',
      data: {
        temporaryPassword,
        user: {
          uid: userRecord.uid,
          identifier: cleanId,
          nama: nama.trim(),
          roles,
        },
      },
    });
  } catch (error: unknown) {
    console.error('Gagal membuat akun pengguna:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Terjadi kegagalan saat membuat akun pengguna.',
    });
  }
});

// 4. Reset Sandi Pengguna (Admin Only)
app.post('/api/admin/reset-password', verifyAdminToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { uid } = req.body;
    if (!uid) {
      return res.status(400).json({ success: false, error: 'UID pengguna wajib disertakan.' });
    }

    const userDocRef = adminDb.collection('users').doc(uid);
    const userSnap = await userDocRef.get();
    if (!userSnap.exists) {
      return res.status(404).json({ success: false, error: 'Pengguna tidak ditemukan.' });
    }

    const userData = userSnap.data()!;
    const temporaryPassword = generateSecurePassword(10);

    // Update password di Firebase Auth
    await adminAuth.updateUser(uid, { password: temporaryPassword });

    // Set mustChangePassword = true di Firestore
    await userDocRef.update({ mustChangePassword: true });

    const nowIso = new Date().toISOString();

    // Catat ke Audit Log
    await adminDb.collection('auditLogs').add({
      aksi: 'reset_password',
      aktorUid: req.user?.uid || 'admin',
      aktorNama: req.user?.nama || 'Administrator',
      targetId: userData.identifier || uid,
      targetTipe: 'user',
      ringkasan: `Reset kata sandi untuk akun: ${userData.nama} (${userData.identifier})`,
      waktu: nowIso,
      userAgent: req.headers['user-agent']?.slice(0, 150) || 'LMS Web Client',
    });

    res.json({
      success: true,
      message: 'Kata sandi berhasil direset.',
      data: {
        temporaryPassword,
        identifier: userData.identifier,
      },
    });
  } catch (error: unknown) {
    console.error('Gagal mereset kata sandi:', error);
    res.status(500).json({ success: false, error: 'Gagal mereset kata sandi pengguna.' });
  }
});

// 5. Nonaktifkan / Aktifkan Akun (Admin Only)
app.post('/api/admin/toggle-user-status', verifyAdminToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { uid, aktif } = req.body;
    if (!uid || typeof aktif !== 'boolean') {
      return res.status(400).json({ success: false, error: 'UID dan status aktif wajib disertakan.' });
    }

    if (uid === req.user?.uid) {
      return res.status(400).json({ success: false, error: 'Anda tidak dapat menonaktifkan akun Anda sendiri.' });
    }

    const userDocRef = adminDb.collection('users').doc(uid);
    const userSnap = await userDocRef.get();
    if (!userSnap.exists) {
      return res.status(404).json({ success: false, error: 'Pengguna tidak ditemukan.' });
    }

    const userData = userSnap.data()!;

    // Update disabled status di Firebase Auth
    await adminAuth.updateUser(uid, { disabled: !aktif });

    // Update status di Firestore
    await userDocRef.update({ aktif });

    const nowIso = new Date().toISOString();

    // Catat ke Audit Log
    await adminDb.collection('auditLogs').add({
      aksi: 'toggle_user_status',
      aktorUid: req.user?.uid || 'admin',
      aktorNama: req.user?.nama || 'Administrator',
      targetId: userData.identifier || uid,
      targetTipe: 'user',
      ringkasan: `${aktif ? 'Mengaktifkan' : 'Menonaktifkan'} akun: ${userData.nama} (${userData.identifier})`,
      waktu: nowIso,
      userAgent: req.headers['user-agent']?.slice(0, 150) || 'LMS Web Client',
    });

    res.json({
      success: true,
      message: `Akun berhasil ${aktif ? 'diaktifkan' : 'dinonaktifkan'}.`,
      data: { aktif },
    });
  } catch (error: unknown) {
    console.error('Gagal mengubah status akun:', error);
    res.status(500).json({ success: false, error: 'Gagal mengubah status keaktifan akun.' });
  }
});

// 6. Pembaruan Data Pengguna oleh Admin
app.post('/api/admin/update-user', verifyAdminToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { uid, nama, roles, isWaliKelas, kelasWali, mapelPengampu } = req.body;
    if (!uid) {
      return res.status(400).json({ success: false, error: 'UID pengguna wajib disertakan.' });
    }

    const userDocRef = adminDb.collection('users').doc(uid);
    const userSnap = await userDocRef.get();
    if (!userSnap.exists) {
      return res.status(404).json({ success: false, error: 'Pengguna tidak ditemukan.' });
    }

    const updateData: Record<string, unknown> = {};
    if (nama && typeof nama === 'string') updateData.nama = nama.trim();
    if (roles && Array.isArray(roles) && roles.length > 0) updateData.roles = roles;
    if (typeof isWaliKelas === 'boolean') updateData.isWaliKelas = isWaliKelas;
    if (typeof kelasWali === 'string') updateData.kelasWali = kelasWali.trim();
    if (Array.isArray(mapelPengampu)) updateData.mapelPengampu = mapelPengampu;

    await userDocRef.update(updateData);

    if (updateData.nama) {
      await adminAuth.updateUser(uid, { displayName: String(updateData.nama) }).catch(() => {});
    }

    const nowIso = new Date().toISOString();
    await adminDb.collection('auditLogs').add({
      aksi: 'update_user',
      aktorUid: req.user?.uid || 'admin',
      aktorNama: req.user?.nama || 'Administrator',
      targetId: userSnap.data()?.identifier || uid,
      targetTipe: 'user',
      ringkasan: `Memperbarui data akun ${userSnap.data()?.nama} (${userSnap.data()?.identifier})`,
      waktu: nowIso,
      userAgent: req.headers['user-agent']?.slice(0, 150) || 'LMS Web Client',
    });

    res.json({ success: true, message: 'Data pengguna berhasil diperbarui.' });
  } catch (error: unknown) {
    console.error('Gagal memperbarui pengguna:', error);
    res.status(500).json({ success: false, error: 'Gagal memperbarui data pengguna.' });
  }
});

// 7. Catat Percobaan Login Gagal (Server-side audit tanpa menyimpan sandi)
app.post('/api/audit/log-failed-login', rateLimit(20, 60000), async (req, res) => {
  if (!hasAdminCredentials) {
    return res.json({ success: true, clientFallback: true });
  }

  try {
    const { identifier, reason } = req.body;
    const cleanId = String(identifier || 'unknown').trim().slice(0, 32);

    await adminDb.collection('auditLogs').add({
      aksi: 'login_failed',
      aktorUid: 'anonymous',
      aktorNama: 'Pengunjung Tidak Dikenal',
      targetId: cleanId,
      targetTipe: 'auth',
      ringkasan: `Percobaan login gagal untuk nomor identitas: ${cleanId}. Alasan: ${String(reason || 'Kredensial tidak valid').slice(0, 100)}`,
      waktu: new Date().toISOString(),
      userAgent: req.headers['user-agent']?.slice(0, 150) || 'Unknown Client',
    });

    res.json({ success: true });
  } catch (_error) {
    res.json({ success: false }); // Tetap return 200 agar tidak memblokir UI
  }
});

// 8. Impor Massal Pengguna (Admin Only, Batch Maksimal 50)
app.post('/api/admin/bulk-import-users', verifyAdminToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { users: rawUsers } = req.body;
    if (!rawUsers || !Array.isArray(rawUsers) || rawUsers.length === 0) {
      return res.status(400).json({ success: false, error: 'Data baris pengguna tidak boleh kosong.' });
    }

    if (rawUsers.length > 50) {
      return res.status(400).json({
        success: false,
        error: 'Maksimal 50 akun per satu pengiriman batch demi stabilitas server dan kuota.',
      });
    }

    const results: Array<{
      identifier: string;
      nama: string;
      roles: string[];
      status: 'created' | 'skipped' | 'error';
      temporaryPassword?: string;
      message?: string;
      uid?: string;
    }> = [];

    let createdCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const nowIso = new Date().toISOString();

    for (const row of rawUsers) {
      const cleanId = String(row.identifier || '').trim();
      const cleanNama = String(row.nama || '').trim();
      const roles = Array.isArray(row.roles) && row.roles.length > 0 ? row.roles : ['siswa'];

      if (!cleanId || cleanId.length < 4) {
        results.push({
          identifier: cleanId || '-',
          nama: cleanNama || '-',
          roles,
          status: 'error',
          message: 'Nomor identitas kosong atau kurang dari 4 karakter.',
        });
        errorCount++;
        continue;
      }

      if (!cleanNama) {
        results.push({
          identifier: cleanId,
          nama: '-',
          roles,
          status: 'error',
          message: 'Nama lengkap wajib diisi.',
        });
        errorCount++;
        continue;
      }

      try {
        // Cek keberadaan di Firestore
        const existingSnap = await adminDb
          .collection('users')
          .where('identifier', '==', cleanId)
          .limit(1)
          .get();

        if (!existingSnap.empty) {
          results.push({
            identifier: cleanId,
            nama: cleanNama,
            roles,
            status: 'skipped',
            message: 'Nomor identitas sudah terdaftar di database.',
          });
          skippedCount++;
          continue;
        }

        const temporaryPassword = generateSecurePassword(10);
        const email = `${cleanId.toLowerCase()}@${LMS_AUTH_DOMAIN}`;

        // Buat user di Firebase Auth
        let userRecord;
        try {
          userRecord = await adminAuth.createUser({
            email,
            password: temporaryPassword,
            displayName: cleanNama,
            emailVerified: true,
          });
        } catch (authErr: unknown) {
          const authMsg = authErr instanceof Error ? authErr.message : String(authErr);
          if (authMsg.includes('email-already-exists')) {
            results.push({
              identifier: cleanId,
              nama: cleanNama,
              roles,
              status: 'skipped',
              message: 'Email identitas sudah ada di Auth.',
            });
            skippedCount++;
            continue;
          }
          throw authErr;
        }

        const uid = userRecord.uid;

        // Dokumen user Firestore
        await adminDb.collection('users').doc(uid).set({
          identifier: cleanId,
          nama: cleanNama,
          roles,
          jenisKelamin: row.jenisKelamin === 'L' || row.jenisKelamin === 'P' ? row.jenisKelamin : undefined,
          nomorHp: row.nomorHp ? String(row.nomorHp).trim() : undefined,
          isWaliKelas: Boolean(row.isWaliKelas),
          kelasWali: row.kelasWali ? String(row.kelasWali).trim() : '',
          mapelPengampu: Array.isArray(row.mapelPengampu) ? row.mapelPengampu : [],
          aktif: true,
          mustChangePassword: true,
          createdAt: nowIso,
          createdBy: req.user?.uid || 'admin_import',
        });

        // Jika siswa dan ada rombelId serta tahunAjaranId, tempatkan langsung ke studentEnrollments
        if (roles.includes('siswa') && row.tahunAjaranId && row.rombelId) {
          const enrollId = `${row.tahunAjaranId}_${uid}`;
          await adminDb.collection('studentEnrollments').doc(enrollId).set({
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
            updatedBy: req.user?.uid || 'admin_import',
          });
        }

        results.push({
          identifier: cleanId,
          nama: cleanNama,
          roles,
          status: 'created',
          temporaryPassword,
          uid,
          message: 'Berhasil didaftarkan.',
        });
        createdCount++;
      } catch (rowErr: unknown) {
        results.push({
          identifier: cleanId,
          nama: cleanNama,
          roles,
          status: 'error',
          message: rowErr instanceof Error ? rowErr.message : 'Gagal memproses baris.',
        });
        errorCount++;
      }
    }

    // Catat ke Audit Log
    await adminDb.collection('auditLogs').add({
      aksi: 'bulk_import_users',
      aktorUid: req.user?.uid || 'admin',
      aktorNama: req.user?.nama || 'Administrator',
      targetId: 'multiple_users',
      targetTipe: 'user',
      ringkasan: `Impor massal: ${createdCount} akun dibuat, ${skippedCount} dilewati, ${errorCount} gagal.`,
      waktu: nowIso,
      userAgent: req.headers['user-agent']?.slice(0, 150) || 'LMS Import Tool',
    });

    res.json({
      success: true,
      message: `Pemrosesan impor selesai. ${createdCount} akun baru terdaftar.`,
      data: {
        summary: { total: rawUsers.length, created: createdCount, skipped: skippedCount, error: errorCount },
        results,
      },
    });
  } catch (error: unknown) {
    console.error('Gagal menjalankan impor massal:', error);
    res.status(500).json({ success: false, error: 'Terjadi kesalahan sistem saat memproses impor massal.' });
  }
});

// 9. Catch-all untuk endpoint /api/* yang tidak terdaftar (mengembalikan JSON 404, BUKAN HTML)
app.all('/api/*', (_req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint API tidak ditemukan.' });
});

// =============================================================================
// DEV SERVER & VITE INTEGRATION
// =============================================================================
async function startServer() {
  const PORT = 3000;

  if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  } else {
    // Mode Development: Mount Vite Middlewares
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`LMS Madrasah Aliyah server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
