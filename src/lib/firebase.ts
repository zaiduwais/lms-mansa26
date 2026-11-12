/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  browserLocalPersistence,
  setPersistence,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDocFromServer,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Inisialisasi Firebase App
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Inisialisasi Firestore dengan Database ID khusus AI Studio
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Inisialisasi Firebase Auth dengan local persistence
export const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.warn('Gagal menyetel persistensi auth:', err);
});

// Domain email sintetis internal untuk NISN/NIP
export const LMS_AUTH_DOMAIN = 'lms.madrasah.id';

export function identifierToEmail(identifier: string): string {
  const cleanId = identifier.trim().toLowerCase();
  return `${cleanId}@${LMS_AUTH_DOMAIN}`;
}

export function emailToIdentifier(email: string): string {
  if (!email) return '';
  return email.split('@')[0];
}

// Format validator identifier
export function validateIdentifier(id: string): { isValid: boolean; message?: string } {
  const clean = id.trim();
  if (!clean) {
    return { isValid: false, message: 'NISN / NIP wajib diisi.' };
  }
  if (!/^[0-9a-zA-Z_\-]+$/.test(clean)) {
    return { isValid: false, message: 'Hanya boleh berisi angka, huruf, underscore, atau minus.' };
  }
  if (clean.length < 4 || clean.length > 32) {
    return { isValid: false, message: 'Panjang nomor identitas harus antara 4 sampai 32 karakter.' };
  }
  return { isValid: true };
}

// Error Handler sesuai panduan Zero-Trust Firestore Security
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path,
  };
  console.error('Firestore Security Error Context:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Uji koneksi ke server Firestore
export async function testFirestoreConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'madrasahSettings', 'public'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firestore offline:', error.message);
      return false;
    }
    return true;
  }
}
testFirestoreConnection();
