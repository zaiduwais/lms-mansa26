/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type TipeIdentitas = 'NISN' | 'NIP' | 'NPK';

export interface IdentifierRule {
  tipe: TipeIdentitas;
  label: string;
  panjangMin: number;
  panjangMax: number;
  regex: RegExp;
  contoh: string;
  pesanError: string;
  peranDefault: 'siswa' | 'guru';
}

export const IDENTIFIER_RULES: Record<TipeIdentitas, IdentifierRule> = {
  NISN: {
    tipe: 'NISN',
    label: 'NISN (Nomor Induk Siswa Nasional)',
    panjangMin: 10,
    panjangMax: 10,
    regex: /^[0-9]{10}$/,
    contoh: '0081234567',
    pesanError: 'NISN harus terdiri dari tepat 10 digit angka.',
    peranDefault: 'siswa',
  },
  NIP: {
    tipe: 'NIP',
    label: 'NIP (Nomor Induk Pegawai Kemenag/PNS)',
    panjangMin: 18,
    panjangMax: 18,
    regex: /^[0-9]{18}$/,
    contoh: '198005122005011002',
    pesanError: 'NIP harus terdiri dari tepat 18 digit angka.',
    peranDefault: 'guru',
  },
  NPK: {
    tipe: 'NPK',
    label: 'NPK (Nomor Pendidik Kemenag / Guru Non-PNS)',
    panjangMin: 4,
    panjangMax: 20,
    regex: /^[0-9]{4,20}$/,
    contoh: '987654321',
    pesanError: 'NPK sementara harus terdiri dari angka saja (4-20 digit).',
    peranDefault: 'guru',
  },
};

/**
 * Deteksi tipe identitas secara otomatis berdasarkan panjang dan format
 */
export function detectIdentifierType(identifier: string): TipeIdentitas | null {
  const clean = identifier.trim();
  if (IDENTIFIER_RULES.NISN.regex.test(clean)) return 'NISN';
  if (IDENTIFIER_RULES.NIP.regex.test(clean)) return 'NIP';
  if (IDENTIFIER_RULES.NPK.regex.test(clean)) return 'NPK';
  return null;
}

/**
 * Validasi identifier secara umum maupun spesifik tipe
 */
export function validateIdentifierFormat(
  identifier: string,
  tipe?: TipeIdentitas
): { isValid: boolean; tipe?: TipeIdentitas; error?: string } {
  const clean = identifier.trim();
  if (!clean) {
    return { isValid: false, error: 'Nomor identitas (NISN / NIP / NPK) wajib diisi.' };
  }

  if (tipe) {
    const rule = IDENTIFIER_RULES[tipe];
    if (!rule.regex.test(clean)) {
      return { isValid: false, tipe, error: rule.pesanError };
    }
    return { isValid: true, tipe };
  }

  // Jika tipe tidak ditentukan, cek apakah cocok dengan salah satu aturan
  const detected = detectIdentifierType(clean);
  if (!detected) {
    return {
      isValid: false,
      error: 'Format identitas tidak sesuai (NISN 10 digit, NIP 18 digit, atau NPK 4-20 digit angka).',
    };
  }

  return { isValid: true, tipe: detected };
}
