/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type TingkatKelas = 'X' | 'XI' | 'XII';
export type JenisSemester = 'Gasal' | 'Genap';
export type JenisSlot = 'pelajaran' | 'istirahat' | 'ibadah' | 'lainnya';

/**
 * 1. Tahun Ajaran (academicYears)
 * Menyimpan data periode kalender akademik. Hanya satu tahun ajaran aktif pada satu waktu.
 */
export interface AcademicYear {
  id: string; // Misal auto-id atau slug '2026-2027'
  nama: string; // Contoh "2026/2027"
  tanggalMulai: string; // YYYY-MM-DD
  tanggalSelesai: string; // YYYY-MM-DD
  aktif: boolean;
  diarsipkan?: boolean;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
}

/**
 * 2. Semester (semesters)
 * Gasal atau Genap per tahun ajaran. Hanya satu semester aktif pada satu waktu.
 */
export interface Semester {
  id: string; // Misal auto-id
  tahunAjaranId: string;
  jenis: JenisSemester;
  nama: string; // Contoh "2026/2027 Gasal"
  tanggalMulai: string; // YYYY-MM-DD
  tanggalSelesai: string; // YYYY-MM-DD
  aktif: boolean;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
}

/**
 * 3. Rombongan Belajar (classes)
 * Rombel per tahun ajaran (tingkat X, XI, XII tanpa jurusan).
 */
export interface ClassRoom {
  id: string;
  tahunAjaranId: string;
  tingkat: TingkatKelas;
  nama: string; // Contoh "X-1", "XI-3"
  kapasitas?: number;
  waliKelasUid?: string;
  waliKelasNama?: string;
  waliKelasNip?: string;
  jumlahSiswa?: number;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
}

/**
 * 4. Penempatan Siswa (studentEnrollments)
 * ID Dokumen Deterministik: {tahunAjaranId}_{siswaUid}
 * Mencegah siswa ditempatkan di 2 rombel pada tahun ajaran yang sama.
 */
export interface StudentEnrollment {
  id: string; // {tahunAjaranId}_{siswaUid}
  tahunAjaranId: string;
  siswaUid: string;
  siswaNama: string;
  siswaIdentifier: string; // NISN
  rombelId: string;
  rombelNama: string;
  tingkat: TingkatKelas;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
}

/**
 * 5. Kelompok Mata Pelajaran (subjectGroups)
 * Dikelola dinamis oleh Admin (Umum, PAI, Bahasa Arab, Mulok, dll).
 */
export interface SubjectGroup {
  id: string;
  nama: string;
  urutan: number;
  aktif: boolean;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
}

/**
 * 6. Mata Pelajaran (subjects)
 * Kode unik, nama, namaArab opsional untuk teks Arab Al-Qur'an/Hadis.
 */
export interface Subject {
  id: string;
  kode: string; // Unik, contoh: "QH-MA", "FIQ-MA"
  nama: string; // "Al-Qur'an Hadis"
  namaArab?: string; // "القرآن والحديث"
  kelompokId: string;
  kelompokNama: string;
  urutan: number;
  aktif: boolean;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
}

/**
 * 7. Kurikulum per Tingkat (curriculumSubjects)
 * Mapel yang diajarkan pada tahun ajaran dan tingkat tertentu beserta beban jam per pekan.
 */
export interface CurriculumSubject {
  id: string;
  tahunAjaranId: string;
  tingkat: TingkatKelas;
  mapelId: string;
  mapelKode: string;
  mapelNama: string;
  mapelNamaArab?: string;
  kelompokNama?: string;
  jamPerPekan: number;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
}

/**
 * 8. Plot Guru Pengampu (teachingAssignments)
 * ID Dokumen Deterministik: {semesterId}_{rombelId}_{mapelId}
 * Menjamin satu rombel-mapel-semester hanya diampu satu guru.
 */
export interface TeachingAssignment {
  id: string; // {semesterId}_{rombelId}_{mapelId}
  semesterId: string;
  rombelId: string;
  rombelNama: string;
  tingkat: TingkatKelas;
  mapelId: string;
  mapelKode: string;
  mapelNama: string;
  guruUid: string;
  guruNama: string;
  guruIdentifier: string;
  jamPerPekan: number;
  jamTerjadwal?: number; // dihitung dari slot jadwal yang aktif
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
}

/**
 * 9. Slot Waktu Pembelajaran (timeSlots)
 * Definisi jam pelajaran per hari (1: Senin, ..., 7: Minggu).
 */
export interface TimeSlot {
  id: string;
  hari: number; // 1: Senin, 2: Selasa, 3: Rabu, 4: Kamis, 5: Jumat, 6: Sabtu, 7: Ahad
  urutan: number; // Jam ke-1, Jam ke-2, dst.
  nama: string; // "Jam Ke-1", "Istirahat Dhuha", dsb.
  mulai: string; // "07:00"
  selesai: string; // "07:45"
  jenis: JenisSlot;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
}

/**
 * 10. Jadwal Pelajaran (schedules)
 * Penempatan plot guru-mapel pada slot waktu rombel.
 */
export interface ScheduleItem {
  id: string;
  semesterId: string;
  rombelId: string;
  rombelNama: string;
  hari: number;
  timeSlotId: string;
  teachingAssignmentId: string;
  mapelId: string;
  mapelNama: string;
  guruUid: string;
  guruNama: string;
  ruang?: string;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
}

/**
 * 11. Kunci Bentrok Jadwal (scheduleLocks)
 * Digunakan dalam transaksi untuk pencegahan bentrok nyata:
 * - Kunci Guru: {semesterId}_guru_{guruUid}_{hari}_{timeSlotId}
 * - Kunci Rombel: {semesterId}_rombel_{rombelId}_{hari}_{timeSlotId}
 */
export interface ScheduleLock {
  id: string;
  tipe: 'guru' | 'rombel';
  targetId: string; // guruUid atau rombelId
  semesterId: string;
  hari: number;
  timeSlotId: string;
  scheduleId: string;
  createdAt: string;
}
