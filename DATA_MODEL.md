# DATA MODEL AKADEMIK (FASE 3) - LMS MADRASAH ALIYAH

Kurikulum: Kurikulum Berbasis Cinta (KBC) dengan Pendekatan Pembelajaran Mendalam.  
Target: ±1200 Siswa, ±100 Guru. Tanpa Jurusan (Tingkat X, XI, XII).  
Database: Google Cloud Firestore (Spark Tier - Hemat Kuota & Berindeks).

---

## 1. Koleksi Pengguna (`users`)
- Dokumen ID: Firebase Auth `uid`
- Fields:
  - `identifier` (string, unik): NISN (10 digit), NIP (18 digit), atau NPK (4-20 digit)
  - `tipeIdentitas` (string enum): `'NISN'` | `'NIP'` | `'NPK'`
  - `nama` (string): Nama lengkap pengguna
  - `roles` (array string): `['admin']` | `['guru']` | `['siswa']`
  - `isWaliKelas` (boolean): `true` jika merangkap wali kelas aktif
  - `kelasWali` (string opsional): Nama rombel binaan
  - `mapelPengampu` (array string opsional): Daftar nama mapel
  - `jenisKelamin` (string enum opsional): `'L'` | `'P'`
  - `nomorHp` (string opsional): Kontak (hanya admin & pemilik)
  - `aktif` (boolean): Status keaktifan akun
  - `mustChangePassword` (boolean): Wajib ganti sandi pada login pertama
  - `createdAt`, `createdBy`, `lastLoginAt`

---

## 2. Tahun Ajaran (`academicYears`)
- Dokumen ID: Auto-id atau slug (contoh `2026-2027`)
- Fields:
  - `nama` (string): Contoh `"2026/2027"`
  - `tanggalMulai` (string): Format ISO YYYY-MM-DD
  - `tanggalSelesai` (string): Format ISO YYYY-MM-DD (selesai > mulai)
  - `aktif` (boolean): Hanya 1 tahun ajaran yang bernilai `true`
  - `diarsipkan` (boolean opsional): Jika data turunan sudah ada
  - `createdAt`, `updatedAt`, `updatedBy`

---

## 3. Semester (`semesters`)
- Dokumen ID: Auto-id
- Fields:
  - `tahunAjaranId` (string ref)
  - `jenis` (string enum): `'Gasal'` | `'Genap'`
  - `nama` (string): Contoh `"2026/2027 Gasal"`
  - `tanggalMulai` (string): YYYY-MM-DD
  - `tanggalSelesai` (string): YYYY-MM-DD
  - `aktif` (boolean): Hanya 1 semester aktif di seluruh sistem
  - `createdAt`, `updatedAt`, `updatedBy`

---

## 4. Rombongan Belajar (`classes`)
- Dokumen ID: Auto-id
- Fields:
  - `tahunAjaranId` (string ref)
  - `tingkat` (string enum): `'X'` | `'XI'` | `'XII'`
  - `nama` (string): Contoh `"X-1"`, `"XI-3"`
  - `kapasitas` (number opsional): Standar 36 siswa
  - `waliKelasUid` (string opsional): Ref ke `users/{uid}`
  - `waliKelasNama` (string opsional)
  - `waliKelasNip` (string opsional)
  - `jumlahSiswa` (number opsional, cache hitungan)
  - `createdAt`, `updatedAt`, `updatedBy`

---

## 5. Penempatan Siswa (`studentEnrollments`)
- Dokumen ID Deterministik: `{tahunAjaranId}_{siswaUid}`
  *Mencegah seorang siswa terdaftar pada 2 rombel berbeda di tahun ajaran yang sama.*
- Fields:
  - `tahunAjaranId` (string ref)
  - `siswaUid` (string ref ke `users`)
  - `siswaNama` (string)
  - `siswaIdentifier` (string): NISN siswa
  - `rombelId` (string ref ke `classes`)
  - `rombelNama` (string)
  - `tingkat` (string enum): `'X'` | `'XI'` | `'XII'`
  - `createdAt`, `updatedAt`, `updatedBy`

---

## 6. Kelompok Mata Pelajaran (`subjectGroups`)
- Dokumen ID: Auto-id
- Seed Awal Dinamis: Umum, Pendidikan Agama Islam, Bahasa Arab, Muatan Lokal, Lainnya
- Fields:
  - `nama` (string)
  - `urutan` (number)
  - `aktif` (boolean)
  - `createdAt`, `updatedAt`, `updatedBy`

---

## 7. Mata Pelajaran (`subjects`)
- Dokumen ID: Auto-id
- Fields:
  - `kode` (string, unik): Contoh `"QH-MA"`, `"FIQ-MA"`, `"BA-MA"`
  - `nama` (string): Contoh `"Al-Qur'an Hadis"`, `"Fikih"`
  - `namaArab` (string opsional): Teks Arab dengan tipografi Noto Naskh Arabic
  - `kelompokId` (string ref)
  - `kelompokNama` (string)
  - `urutan` (number)
  - `aktif` (boolean)
  - `createdAt`, `updatedAt`, `updatedBy`

---

## 8. Kurikulum per Tingkat (`curriculumSubjects`)
- Dokumen ID: Auto-id atau `{tahunAjaranId}_{tingkat}_{mapelId}`
- Fields:
  - `tahunAjaranId` (string ref)
  - `tingkat` (string enum): `'X'` | `'XI'` | `'XII'`
  - `mapelId` (string ref ke `subjects`)
  - `mapelKode`, `mapelNama`, `mapelNamaArab`, `kelompokNama`
  - `jamPerPekan` (number): Jumlah alokasi jam/minggu (misal 2 atau 4 jam)
  - `createdAt`, `updatedAt`, `updatedBy`

---

## 9. Plot Guru Pengampu (`teachingAssignments`)
- Dokumen ID Deterministik: `{semesterId}_{rombelId}_{mapelId}`
  *Menjamin satu rombel-mapel-semester hanya diampu tepat oleh satu guru.*
- Fields:
  - `semesterId` (string ref)
  - `rombelId` (string ref ke `classes`)
  - `rombelNama` (string)
  - `tingkat` (string enum)
  - `mapelId` (string ref ke `subjects`)
  - `mapelKode`, `mapelNama`
  - `guruUid` (string ref ke `users`)
  - `guruNama`, `guruIdentifier`
  - `jamPerPekan` (number)
  - `createdAt`, `updatedAt`, `updatedBy`

---

## 10. Slot Waktu Pembelajaran (`timeSlots`)
- Dokumen ID: Auto-id
- Fields:
  - `hari` (number): 1 (Senin) s.d. 7 (Ahad)
  - `urutan` (number): Urutan jam (Jam ke-1, Jam ke-2, dst.)
  - `nama` (string): Label jam
  - `mulai` (string): Format HH:MM (contoh `"07:00"`)
  - `selesai` (string): Format HH:MM (contoh `"07:45"`)
  - `jenis` (string enum): `'pelajaran'` | `'istirahat'` | `'ibadah'` | `'lainnya'`
  - `createdAt`, `updatedAt`, `updatedBy`

---

## 11. Jadwal Pelajaran (`schedules`)
- Dokumen ID: Auto-id
- Fields:
  - `semesterId` (string ref)
  - `rombelId` (string ref)
  - `rombelNama` (string)
  - `hari` (number): 1-7
  - `timeSlotId` (string ref)
  - `teachingAssignmentId` (string ref)
  - `mapelId`, `mapelNama`
  - `guruUid`, `guruNama`
  - `ruang` (string opsional)
  - `createdAt`, `updatedAt`, `updatedBy`

---

## 12. Kunci Pencegahan Bentrok Jadwal (`scheduleLocks`)
- Dokumen ID Deterministik:
  1. Kunci Guru: `{semesterId}_guru_{guruUid}_{hari}_{timeSlotId}`
  2. Kunci Rombel: `{semesterId}_rombel_{rombelId}_{hari}_{timeSlotId}`
- Fields:
  - `tipe`: `'guru'` | `'rombel'`
  - `targetId`: `guruUid` atau `rombelId`
  - `semesterId`, `hari`, `timeSlotId`, `scheduleId`
  - `createdAt`
