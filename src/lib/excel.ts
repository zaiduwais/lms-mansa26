/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as XLSX from 'xlsx';

export const MAX_IMPORT_FILE_SIZE = 2 * 1024 * 1024; // 2 MB
export const MAX_IMPORT_ROWS = 500;

/**
 * Sanitasi cell value untuk mencegah Formula Injection (CSV/Excel Injection)
 * Jika nilai diawali dengan =, +, -, @, sisipkan tanda kutip tunggal di awal
 */
export function sanitizeCellValue(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (/^[=+\-@]/.test(trimmed)) {
    return `'${trimmed}`;
  }
  return value;
}

/**
 * Sanitasi seluruh baris objek sebelum diekspor
 */
export function sanitizeRowData<T extends Record<string, unknown>>(row: T): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(row)) {
    clean[key] = sanitizeCellValue(val);
  }
  return clean;
}

/**
 * Buat dan unduh template Excel resmi
 */
export function downloadTemplate(entity: 'siswa' | 'guru' | 'mapel') {
  const wb = XLSX.utils.book_new();

  if (entity === 'siswa') {
    const headers = ['nisn', 'nama', 'jenisKelamin', 'nomorHp', 'rombel'];
    const sample = [
      headers,
      ['0081234567', 'Ahmad Farhan', 'L', '081234567890', 'X-1'],
      ['0089876543', 'Siti Fatimah', 'P', '081298765432', 'X-1'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(sample);
    // Lebar kolom
    ws['!cols'] = [{ wch: 16 }, { wch: 25 }, { wch: 14 }, { wch: 18 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Template Siswa');
    XLSX.writeFile(wb, 'template_impor_siswa.xlsx');
  } else if (entity === 'guru') {
    const headers = ['tipeIdentitas', 'identifier', 'nama', 'jenisKelamin', 'nomorHp', 'mapelPengampu'];
    const sample = [
      headers,
      ['NIP', '198005122005011002', 'H. Ahmad Fauzi, M.Pd.', 'L', '081234567890', 'Fikih, Ushul Fikih'],
      ['NPK', '987654321', 'Ustadzah Maryam, S.Pd.I.', 'P', '081298765432', "Al-Qur'an Hadis"],
    ];
    const ws = XLSX.utils.aoa_to_sheet(sample);
    ws['!cols'] = [{ wch: 14 }, { wch: 22 }, { wch: 28 }, { wch: 14 }, { wch: 18 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Template Guru');
    XLSX.writeFile(wb, 'template_impor_guru.xlsx');
  } else if (entity === 'mapel') {
    const headers = ['kode', 'nama', 'namaArab', 'kelompok', 'urutan'];
    const sample = [
      headers,
      ['QH-MA', "Al-Qur'an Hadis", 'القرآن والحديث', 'Pendidikan Agama Islam', 1],
      ['AA-MA', 'Akidah Akhlak', 'العقيدة والأخلاق', 'Pendidikan Agama Islam', 2],
      ['FIQ-MA', 'Fikih', 'الفقه', 'Pendidikan Agama Islam', 3],
      ['SKI-MA', 'Sejarah Kebudayaan Islam', 'تاريخ الحضارة الإسلامية', 'Pendidikan Agama Islam', 4],
      ['BA-MA', 'Bahasa Arab', 'اللغة العربية', 'Bahasa Arab', 5],
      ['MTK-MA', 'Matematika Umum', '', 'Umum', 6],
      ['BS-MA', 'Bahasa Sunda', '', 'Muatan Lokal', 7],
    ];
    const ws = XLSX.utils.aoa_to_sheet(sample);
    ws['!cols'] = [{ wch: 12 }, { wch: 26 }, { wch: 25 }, { wch: 25 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Template Mapel');
    XLSX.writeFile(wb, 'template_impor_mapel.xlsx');
  }
}

/**
 * Parsing file Excel / CSV dari browser
 */
export async function parseImportFile<T extends Record<string, unknown>>(
  file: File
): Promise<{ success: boolean; data?: T[]; error?: string }> {
  // 1. Validasi ukuran file
  if (file.size > MAX_IMPORT_FILE_SIZE) {
    return {
      success: false,
      error: `Ukuran file melebihi batas maksimal 2 MB (ukuran file: ${(file.size / 1024 / 1024).toFixed(2)} MB).`,
    };
  }

  // 2. Tolak file berbahaya / makro
  const nameLower = file.name.toLowerCase();
  if (nameLower.endsWith('.xlsm') || nameLower.endsWith('.xltm')) {
    return {
      success: false,
      error: 'File dengan makro Excel (.xlsm/.xltm) dilarang demi keamanan sistem.',
    };
  }

  try {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array' });

    if (wb.SheetNames.length === 0) {
      return { success: false, error: 'File Excel tidak memiliki lembar kerja (sheet).' };
    }

    const firstSheet = wb.Sheets[wb.SheetNames[0]];
    const rawData = XLSX.utils.sheet_to_json<T>(firstSheet, { defval: '' });

    if (rawData.length === 0) {
      return { success: false, error: 'File tidak memuat baris data apapun.' };
    }

    if (rawData.length > MAX_IMPORT_ROWS) {
      return {
        success: false,
        error: `Jumlah baris data (${rawData.length}) melebihi batas maksimal ${MAX_IMPORT_ROWS} baris per berkas impor.`,
      };
    }

    return { success: true, data: rawData };
  } catch (err: unknown) {
    console.error('Gagal membaca file impor:', err);
    return {
      success: false,
      error: 'Format file tidak didukung atau berkas rusak. Pastikan berkas berformat .xlsx, .xls, atau .csv.',
    };
  }
}

/**
 * Ekspor koleksi data ke berkas Excel (.xlsx) dengan proteksi Formula Injection
 */
export function exportToExcel(
  filename: string,
  sheets: { name: string; data: Record<string, unknown>[] }[]
) {
  const wb = XLSX.utils.book_new();

  for (const sheet of sheets) {
    const cleanData = sheet.data.map((row) => sanitizeRowData(row));
    const ws = XLSX.utils.json_to_sheet(cleanData);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31)); // Max 31 karakter untuk nama sheet
  }

  const cleanFilename = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  XLSX.writeFile(wb, cleanFilename);
}

/**
 * Ekspor data kredensial satu kali unduh (one-time credentials download)
 */
export function exportCredentialsFile(
  credentials: { identifier: string; nama: string; roles: string; passwordAwal: string }[]
) {
  const cleanData = credentials.map((c) => sanitizeRowData(c));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(cleanData);
  ws['!cols'] = [{ wch: 22 }, { wch: 30 }, { wch: 18 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Kredensial Akun Baru');
  XLSX.writeFile(wb, `kredensial_akun_madrasah_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
