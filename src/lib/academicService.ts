/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  writeBatch,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { memoryCache, fetchWithCache } from './cache';
import {
  AcademicYear,
  Semester,
  ClassRoom,
  StudentEnrollment,
  SubjectGroup,
  Subject,
  CurriculumSubject,
  TeachingAssignment,
  TimeSlot,
  ScheduleItem,
  TingkatKelas,
} from '../types/academic';

function getNowIso(): string {
  return new Date().toISOString();
}

function getCurrentUid(): string {
  return auth.currentUser?.uid || 'admin';
}

export const academicService = {
  // ===========================================================================
  // 1. TAHUN AJARAN (academicYears)
  // ===========================================================================
  async getAcademicYears(): Promise<AcademicYear[]> {
    return fetchWithCache('academicYears_list', async () => {
      const q = query(collection(db, 'academicYears'), orderBy('nama', 'desc'));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AcademicYear, 'id'>) }));
    });
  },

  async getActiveAcademicYear(): Promise<AcademicYear | null> {
    const years = await this.getAcademicYears();
    return years.find((y) => y.aktif) || years[0] || null;
  },

  async createAcademicYear(data: { nama: string; tanggalMulai: string; tanggalSelesai: string; aktif?: boolean }): Promise<AcademicYear> {
    const id = data.nama.replace('/', '-').trim();
    const docRef = doc(db, 'academicYears', id);

    const now = getNowIso();
    const newYear: AcademicYear = {
      id,
      nama: data.nama.trim(),
      tanggalMulai: data.tanggalMulai,
      tanggalSelesai: data.tanggalSelesai,
      aktif: Boolean(data.aktif),
      createdAt: now,
      updatedAt: now,
      updatedBy: getCurrentUid(),
    };

    if (data.aktif) {
      // Nonaktifkan tahun ajaran lainnya
      const allYears = await this.getAcademicYears();
      const batch = writeBatch(db);
      for (const y of allYears) {
        if (y.id !== id && y.aktif) {
          batch.update(doc(db, 'academicYears', y.id), { aktif: false, updatedAt: now });
        }
      }
      batch.set(docRef, newYear);
      await batch.commit();
    } else {
      await setDoc(docRef, newYear);
    }

    memoryCache.invalidatePrefix('academicYears');
    return newYear;
  },

  async setActiveAcademicYear(id: string): Promise<void> {
    const allYears = await this.getAcademicYears();
    const now = getNowIso();
    const batch = writeBatch(db);

    for (const y of allYears) {
      batch.update(doc(db, 'academicYears', y.id), {
        aktif: y.id === id,
        updatedAt: now,
        updatedBy: getCurrentUid(),
      });
    }

    await batch.commit();
    memoryCache.invalidatePrefix('academicYears');
  },

  async archiveAcademicYear(id: string, diarsipkan: boolean): Promise<void> {
    await updateDoc(doc(db, 'academicYears', id), {
      diarsipkan,
      updatedAt: getNowIso(),
      updatedBy: getCurrentUid(),
    });
    memoryCache.invalidatePrefix('academicYears');
  },

  // ===========================================================================
  // 2. SEMESTER (semesters)
  // ===========================================================================
  async getSemesters(tahunAjaranId?: string): Promise<Semester[]> {
    const cacheKey = tahunAjaranId ? `semesters_${tahunAjaranId}` : 'semesters_all';
    return fetchWithCache(cacheKey, async () => {
      let q = query(collection(db, 'semesters'));
      if (tahunAjaranId) {
        q = query(collection(db, 'semesters'), where('tahunAjaranId', '==', tahunAjaranId));
      }
      const snap = await getDocs(q);
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Semester, 'id'>) }));
      return list.sort((a, b) => (b.tanggalMulai || '').localeCompare(a.tanggalMulai || ''));
    });
  },

  async getActiveSemester(): Promise<Semester | null> {
    const semesters = await this.getSemesters();
    return semesters.find((s) => s.aktif) || null;
  },

  async createSemester(data: {
    tahunAjaranId: string;
    jenis: 'Gasal' | 'Genap';
    nama: string;
    tanggalMulai: string;
    tanggalSelesai: string;
    aktif?: boolean;
  }): Promise<Semester> {
    const docRef = doc(collection(db, 'semesters'));
    const now = getNowIso();
    const newSem: Semester = {
      id: docRef.id,
      tahunAjaranId: data.tahunAjaranId,
      jenis: data.jenis,
      nama: data.nama,
      tanggalMulai: data.tanggalMulai,
      tanggalSelesai: data.tanggalSelesai,
      aktif: Boolean(data.aktif),
      createdAt: now,
      updatedAt: now,
      updatedBy: getCurrentUid(),
    };

    if (data.aktif) {
      const allSemesters = await this.getSemesters();
      const batch = writeBatch(db);
      for (const s of allSemesters) {
        if (s.aktif) {
          batch.update(doc(db, 'semesters', s.id), { aktif: false, updatedAt: now });
        }
      }
      batch.set(docRef, newSem);
      await batch.commit();
    } else {
      await setDoc(docRef, newSem);
    }

    memoryCache.invalidatePrefix('semesters');
    return newSem;
  },

  async setActiveSemester(id: string): Promise<void> {
    const allSemesters = await this.getSemesters();
    const now = getNowIso();
    const batch = writeBatch(db);

    for (const s of allSemesters) {
      batch.update(doc(db, 'semesters', s.id), {
        aktif: s.id === id,
        updatedAt: now,
        updatedBy: getCurrentUid(),
      });
    }

    await batch.commit();
    memoryCache.invalidatePrefix('semesters');
  },

  // ===========================================================================
  // 3. ROMBONGAN BELAJAR (classes)
  // ===========================================================================
  async getClasses(tahunAjaranId: string): Promise<ClassRoom[]> {
    return fetchWithCache(`classes_${tahunAjaranId}`, async () => {
      const q = query(collection(db, 'classes'), where('tahunAjaranId', '==', tahunAjaranId));
      const snap = await getDocs(q);
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ClassRoom, 'id'>) }));
      return list.sort((a, b) => a.nama.localeCompare(b.nama));
    });
  },

  async createClass(data: {
    tahunAjaranId: string;
    tingkat: TingkatKelas;
    nama: string;
    kapasitas?: number;
    waliKelasUid?: string;
    waliKelasNama?: string;
    waliKelasNip?: string;
  }): Promise<ClassRoom> {
    const docRef = doc(collection(db, 'classes'));
    const now = getNowIso();

    const newClass: ClassRoom = {
      id: docRef.id,
      tahunAjaranId: data.tahunAjaranId,
      tingkat: data.tingkat,
      nama: data.nama.trim(),
      kapasitas: data.kapasitas || 36,
      waliKelasUid: data.waliKelasUid || '',
      waliKelasNama: data.waliKelasNama || '',
      waliKelasNip: data.waliKelasNip || '',
      jumlahSiswa: 0,
      createdAt: now,
      updatedAt: now,
      updatedBy: getCurrentUid(),
    };

    const batch = writeBatch(db);
    batch.set(docRef, newClass);

    // Update wali kelas status pada guru bersangkutan
    if (data.waliKelasUid) {
      batch.update(doc(db, 'users', data.waliKelasUid), {
        isWaliKelas: true,
        kelasWali: data.nama.trim(),
      });
    }

    await batch.commit();
    memoryCache.invalidatePrefix('classes');
    return newClass;
  },

  async updateClass(
    classId: string,
    data: Partial<ClassRoom>,
    oldWaliKelasUid?: string
  ): Promise<void> {
    const now = getNowIso();
    const batch = writeBatch(db);

    batch.update(doc(db, 'classes', classId), {
      ...data,
      updatedAt: now,
      updatedBy: getCurrentUid(),
    });

    // Jika wali kelas berubah, cabut status pada wali kelas lama
    if (oldWaliKelasUid && oldWaliKelasUid !== data.waliKelasUid) {
      batch.update(doc(db, 'users', oldWaliKelasUid), {
        isWaliKelas: false,
        kelasWali: '',
      });
    }

    // Pasang status wali kelas baru
    if (data.waliKelasUid) {
      batch.update(doc(db, 'users', data.waliKelasUid), {
        isWaliKelas: true,
        kelasWali: data.nama || '',
      });
    }

    await batch.commit();
    memoryCache.invalidatePrefix('classes');
  },

  async deleteClass(classId: string, waliKelasUid?: string): Promise<void> {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'classes', classId));

    if (waliKelasUid) {
      batch.update(doc(db, 'users', waliKelasUid), {
        isWaliKelas: false,
        kelasWali: '',
      });
    }

    await batch.commit();
    memoryCache.invalidatePrefix('classes');
  },

  // ===========================================================================
  // 4. PENEMPATAN SISWA (studentEnrollments)
  // ID Deterministik: {tahunAjaranId}_{siswaUid}
  // ===========================================================================
  async getEnrollments(tahunAjaranId: string, rombelId?: string): Promise<StudentEnrollment[]> {
    const cacheKey = rombelId ? `enrollments_${tahunAjaranId}_${rombelId}` : `enrollments_${tahunAjaranId}`;
    return fetchWithCache(cacheKey, async () => {
      let q = query(collection(db, 'studentEnrollments'), where('tahunAjaranId', '==', tahunAjaranId));
      if (rombelId) {
        q = query(
          collection(db, 'studentEnrollments'),
          where('tahunAjaranId', '==', tahunAjaranId),
          where('rombelId', '==', rombelId)
        );
      }
      const snap = await getDocs(q);
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<StudentEnrollment, 'id'>) }));
      return list.sort((a, b) => a.siswaNama.localeCompare(b.siswaNama));
    });
  },

  async getMyEnrollment(siswaUid: string, tahunAjaranId: string): Promise<StudentEnrollment | null> {
    const docId = `${tahunAjaranId}_${siswaUid}`;
    const snap = await getDoc(doc(db, 'studentEnrollments', docId));
    if (!snap.exists()) return null;
    return { id: snap.id, ...(snap.data() as Omit<StudentEnrollment, 'id'>) };
  },

  async enrollStudent(data: {
    tahunAjaranId: string;
    siswaUid: string;
    siswaNama: string;
    siswaIdentifier: string;
    rombelId: string;
    rombelNama: string;
    tingkat: TingkatKelas;
  }): Promise<void> {
    const docId = `${data.tahunAjaranId}_${data.siswaUid}`;
    const now = getNowIso();
    const payload: StudentEnrollment = {
      id: docId,
      ...data,
      createdAt: now,
      updatedAt: now,
      updatedBy: getCurrentUid(),
    };
    await setDoc(doc(db, 'studentEnrollments', docId), payload);
    memoryCache.invalidatePrefix('enrollments');
  },

  async bulkMoveStudents(
    enrollments: {
      tahunAjaranId: string;
      siswaUid: string;
      siswaNama: string;
      siswaIdentifier: string;
      rombelId: string;
      rombelNama: string;
      tingkat: TingkatKelas;
    }[]
  ): Promise<void> {
    const now = getNowIso();
    const BATCH_SIZE = 400; // Firestore limit 500 per commit

    for (let i = 0; i < enrollments.length; i += BATCH_SIZE) {
      const chunk = enrollments.slice(i, i + BATCH_SIZE);
      const batch = writeBatch(db);

      for (const item of chunk) {
        const docId = `${item.tahunAjaranId}_${item.siswaUid}`;
        const payload: StudentEnrollment = {
          id: docId,
          ...item,
          createdAt: now,
          updatedAt: now,
          updatedBy: getCurrentUid(),
        };
        batch.set(doc(db, 'studentEnrollments', docId), payload);
      }

      await batch.commit();
    }

    memoryCache.invalidatePrefix('enrollments');
  },

  // ===========================================================================
  // 5. KELOMPOK MAPEL (subjectGroups)
  // ===========================================================================
  async getSubjectGroups(): Promise<SubjectGroup[]> {
    return fetchWithCache('subjectGroups', async () => {
      const q = query(collection(db, 'subjectGroups'), orderBy('urutan', 'asc'));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SubjectGroup, 'id'>) }));
    });
  },

  async seedDefaultSubjectGroups(): Promise<void> {
    const defaults = [
      { nama: 'Pendidikan Agama Islam (PAI)', urutan: 1 },
      { nama: 'Bahasa Arab', urutan: 2 },
      { nama: 'Mata Pelajaran Umum', urutan: 3 },
      { nama: 'Muatan Lokal (Mulok)', urutan: 4 },
      { nama: 'Pengembangan Diri / Ekstrakurikuler', urutan: 5 },
    ];

    const now = getNowIso();
    const batch = writeBatch(db);

    for (const d of defaults) {
      const ref = doc(collection(db, 'subjectGroups'));
      batch.set(ref, {
        nama: d.nama,
        urutan: d.urutan,
        aktif: true,
        createdAt: now,
        updatedAt: now,
        updatedBy: getCurrentUid(),
      });
    }

    await batch.commit();
    memoryCache.invalidatePrefix('subjectGroups');
  },

  // ===========================================================================
  // 6. MATA PELAJARAN (subjects)
  // ===========================================================================
  async getSubjects(): Promise<Subject[]> {
    return fetchWithCache('subjects_all', async () => {
      const q = query(collection(db, 'subjects'), orderBy('urutan', 'asc'));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Subject, 'id'>) }));
    });
  },

  async createSubject(data: Omit<Subject, 'id' | 'createdAt' | 'updatedAt' | 'updatedBy'>): Promise<Subject> {
    const docRef = doc(collection(db, 'subjects'));
    const now = getNowIso();
    const newSubj: Subject = {
      id: docRef.id,
      ...data,
      createdAt: now,
      updatedAt: now,
      updatedBy: getCurrentUid(),
    };
    await setDoc(docRef, newSubj);
    memoryCache.invalidatePrefix('subjects');
    return newSubj;
  },

  async updateSubject(id: string, data: Partial<Subject>): Promise<void> {
    await updateDoc(doc(db, 'subjects', id), {
      ...data,
      updatedAt: getNowIso(),
      updatedBy: getCurrentUid(),
    });
    memoryCache.invalidatePrefix('subjects');
  },

  async seedDefaultSubjects(groups: SubjectGroup[]): Promise<void> {
    const paiGroup = groups.find((g) => g.nama.includes('Agama')) || groups[0];
    const arabGroup = groups.find((g) => g.nama.includes('Arab')) || groups[0];
    const umumGroup = groups.find((g) => g.nama.includes('Umum')) || groups[0];
    const mulokGroup = groups.find((g) => g.nama.includes('Muatan')) || groups[0];

    const defaultList: Omit<Subject, 'id' | 'createdAt' | 'updatedAt' | 'updatedBy'>[] = [
      {
        kode: 'QH-MA',
        nama: "Al-Qur'an Hadis",
        namaArab: 'القرآن والحديث',
        kelompokId: paiGroup?.id || 'pai',
        kelompokNama: paiGroup?.nama || 'Pendidikan Agama Islam',
        urutan: 1,
        aktif: true,
      },
      {
        kode: 'AA-MA',
        nama: 'Akidah Akhlak',
        namaArab: 'العقيدة والأخلاق',
        kelompokId: paiGroup?.id || 'pai',
        kelompokNama: paiGroup?.nama || 'Pendidikan Agama Islam',
        urutan: 2,
        aktif: true,
      },
      {
        kode: 'FIQ-MA',
        nama: 'Fikih',
        namaArab: 'الفقه',
        kelompokId: paiGroup?.id || 'pai',
        kelompokNama: paiGroup?.nama || 'Pendidikan Agama Islam',
        urutan: 3,
        aktif: true,
      },
      {
        kode: 'SKI-MA',
        nama: 'Sejarah Kebudayaan Islam',
        namaArab: 'تاريخ الحضارة الإسلامية',
        kelompokId: paiGroup?.id || 'pai',
        kelompokNama: paiGroup?.nama || 'Pendidikan Agama Islam',
        urutan: 4,
        aktif: true,
      },
      {
        kode: 'BA-MA',
        nama: 'Bahasa Arab',
        namaArab: 'اللغة العربية',
        kelompokId: arabGroup?.id || 'arab',
        kelompokNama: arabGroup?.nama || 'Bahasa Arab',
        urutan: 5,
        aktif: true,
      },
      {
        kode: 'MTK-MA',
        nama: 'Matematika',
        kelompokId: umumGroup?.id || 'umum',
        kelompokNama: umumGroup?.nama || 'Umum',
        urutan: 6,
        aktif: true,
      },
      {
        kode: 'BIN-MA',
        nama: 'Bahasa Indonesia',
        kelompokId: umumGroup?.id || 'umum',
        kelompokNama: umumGroup?.nama || 'Umum',
        urutan: 7,
        aktif: true,
      },
      {
        kode: 'BIG-MA',
        nama: 'Bahasa Inggris',
        kelompokId: umumGroup?.id || 'umum',
        kelompokNama: umumGroup?.nama || 'Umum',
        urutan: 8,
        aktif: true,
      },
      {
        kode: 'BS-MA',
        nama: 'Bahasa Sunda',
        kelompokId: mulokGroup?.id || 'mulok',
        kelompokNama: mulokGroup?.nama || 'Muatan Lokal',
        urutan: 9,
        aktif: true,
      },
    ];

    const now = getNowIso();
    const batch = writeBatch(db);

    for (const s of defaultList) {
      const ref = doc(collection(db, 'subjects'));
      batch.set(ref, {
        ...s,
        createdAt: now,
        updatedAt: now,
        updatedBy: getCurrentUid(),
      });
    }

    await batch.commit();
    memoryCache.invalidatePrefix('subjects');
  },

  // ===========================================================================
  // 7. KURIKULUM PER TINGKAT (curriculumSubjects)
  // ===========================================================================
  async getCurriculumSubjects(tahunAjaranId: string, tingkat?: TingkatKelas): Promise<CurriculumSubject[]> {
    const cacheKey = tingkat ? `curriculum_${tahunAjaranId}_${tingkat}` : `curriculum_${tahunAjaranId}`;
    return fetchWithCache(cacheKey, async () => {
      let q = query(collection(db, 'curriculumSubjects'), where('tahunAjaranId', '==', tahunAjaranId));
      if (tingkat) {
        q = query(
          collection(db, 'curriculumSubjects'),
          where('tahunAjaranId', '==', tahunAjaranId),
          where('tingkat', '==', tingkat)
        );
      }
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CurriculumSubject, 'id'>) }));
    });
  },

  async setCurriculumSubject(data: {
    tahunAjaranId: string;
    tingkat: TingkatKelas;
    mapel: Subject;
    jamPerPekan: number;
  }): Promise<void> {
    const docId = `${data.tahunAjaranId}_${data.tingkat}_${data.mapel.id}`;
    const now = getNowIso();

    const payload: CurriculumSubject = {
      id: docId,
      tahunAjaranId: data.tahunAjaranId,
      tingkat: data.tingkat,
      mapelId: data.mapel.id,
      mapelKode: data.mapel.kode,
      mapelNama: data.mapel.nama,
      mapelNamaArab: data.mapel.namaArab,
      kelompokNama: data.mapel.kelompokNama,
      jamPerPekan: data.jamPerPekan,
      createdAt: now,
      updatedAt: now,
      updatedBy: getCurrentUid(),
    };

    await setDoc(doc(db, 'curriculumSubjects', docId), payload);
    memoryCache.invalidatePrefix('curriculum');
  },

  async removeCurriculumSubject(id: string): Promise<void> {
    await deleteDoc(doc(db, 'curriculumSubjects', id));
    memoryCache.invalidatePrefix('curriculum');
  },

  async copyCurriculumFromYear(sourceYearId: string, targetYearId: string): Promise<number> {
    const sources = await this.getCurriculumSubjects(sourceYearId);
    if (sources.length === 0) return 0;

    const now = getNowIso();
    const batch = writeBatch(db);

    for (const s of sources) {
      const docId = `${targetYearId}_${s.tingkat}_${s.mapelId}`;
      const payload: CurriculumSubject = {
        ...s,
        id: docId,
        tahunAjaranId: targetYearId,
        createdAt: now,
        updatedAt: now,
        updatedBy: getCurrentUid(),
      };
      batch.set(doc(db, 'curriculumSubjects', docId), payload);
    }

    await batch.commit();
    memoryCache.invalidatePrefix('curriculum');
    return sources.length;
  },

  // ===========================================================================
  // 8. PLOT GURU PENGAMPU (teachingAssignments)
  // ID Deterministik: {semesterId}_{rombelId}_{mapelId}
  // ===========================================================================
  async getTeachingAssignments(semesterId: string, rombelId?: string): Promise<TeachingAssignment[]> {
    const cacheKey = rombelId ? `assignments_${semesterId}_${rombelId}` : `assignments_${semesterId}`;
    return fetchWithCache(cacheKey, async () => {
      let q = query(collection(db, 'teachingAssignments'), where('semesterId', '==', semesterId));
      if (rombelId) {
        q = query(
          collection(db, 'teachingAssignments'),
          where('semesterId', '==', semesterId),
          where('rombelId', '==', rombelId)
        );
      }
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<TeachingAssignment, 'id'>) }));
    });
  },

  async setTeachingAssignment(data: {
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
  }): Promise<TeachingAssignment> {
    const docId = `${data.semesterId}_${data.rombelId}_${data.mapelId}`;
    const now = getNowIso();

    const payload: TeachingAssignment = {
      id: docId,
      ...data,
      createdAt: now,
      updatedAt: now,
      updatedBy: getCurrentUid(),
    };

    await setDoc(doc(db, 'teachingAssignments', docId), payload);
    memoryCache.invalidatePrefix('assignments');
    return payload;
  },

  async deleteTeachingAssignment(id: string): Promise<void> {
    await deleteDoc(doc(db, 'teachingAssignments', id));
    memoryCache.invalidatePrefix('assignments');
  },

  async copyAssignmentsFromSemester(sourceSemesterId: string, targetSemesterId: string): Promise<number> {
    const sources = await this.getTeachingAssignments(sourceSemesterId);
    if (sources.length === 0) return 0;

    const now = getNowIso();
    const batch = writeBatch(db);

    for (const item of sources) {
      const docId = `${targetSemesterId}_${item.rombelId}_${item.mapelId}`;
      const payload: TeachingAssignment = {
        ...item,
        id: docId,
        semesterId: targetSemesterId,
        createdAt: now,
        updatedAt: now,
        updatedBy: getCurrentUid(),
      };
      batch.set(doc(db, 'teachingAssignments', docId), payload);
    }

    await batch.commit();
    memoryCache.invalidatePrefix('assignments');
    return sources.length;
  },

  // ===========================================================================
  // 9. SLOT WAKTU (timeSlots)
  // ===========================================================================
  async getTimeSlots(): Promise<TimeSlot[]> {
    return fetchWithCache('timeSlots_all', async () => {
      const q = query(collection(db, 'timeSlots'), orderBy('hari', 'asc'), orderBy('urutan', 'asc'));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<TimeSlot, 'id'>) }));
    });
  },

  async saveTimeSlot(data: Omit<TimeSlot, 'id' | 'createdAt' | 'updatedAt' | 'updatedBy'>, slotId?: string): Promise<TimeSlot> {
    const docRef = slotId ? doc(db, 'timeSlots', slotId) : doc(collection(db, 'timeSlots'));
    const now = getNowIso();
    const payload: TimeSlot = {
      id: docRef.id,
      ...data,
      createdAt: now,
      updatedAt: now,
      updatedBy: getCurrentUid(),
    };
    await setDoc(docRef, payload);
    memoryCache.invalidatePrefix('timeSlots');
    return payload;
  },

  async deleteTimeSlot(id: string): Promise<void> {
    await deleteDoc(doc(db, 'timeSlots', id));
    memoryCache.invalidatePrefix('timeSlots');
  },

  async seedDefaultTimeSlots(): Promise<void> {
    const now = getNowIso();
    const batch = writeBatch(db);

    // Pola Senin - Kamis: 8 slot jam
    const hariReguler = [1, 2, 3, 4]; // Senin s.d. Kamis
    const templateHari: { urutan: number; nama: string; mulai: string; selesai: string; jenis: TimeSlot['jenis'] }[] = [
      { urutan: 1, nama: 'Jam Ke-1', mulai: '07:00', selesai: '07:45', jenis: 'pelajaran' },
      { urutan: 2, nama: 'Jam Ke-2', mulai: '07:45', selesai: '08:30', jenis: 'pelajaran' },
      { urutan: 3, nama: 'Jam Ke-3', mulai: '08:30', selesai: '09:15', jenis: 'pelajaran' },
      { urutan: 4, nama: 'Istirahat & Dhuha', mulai: '09:15', selesai: '09:45', jenis: 'ibadah' },
      { urutan: 5, nama: 'Jam Ke-4', mulai: '09:45', selesai: '10:30', jenis: 'pelajaran' },
      { urutan: 6, nama: 'Jam Ke-5', mulai: '10:30', selesai: '11:15', jenis: 'pelajaran' },
      { urutan: 7, nama: 'Jam Ke-6', mulai: '11:15', selesai: '12:00', jenis: 'pelajaran' },
      { urutan: 8, nama: 'Ishoma Dhuhur', mulai: '12:00', selesai: '13:00', jenis: 'ibadah' },
      { urutan: 9, nama: 'Jam Ke-7', mulai: '13:00', selesai: '13:45', jenis: 'pelajaran' },
      { urutan: 10, nama: 'Jam Ke-8', mulai: '13:45', selesai: '14:30', jenis: 'pelajaran' },
    ];

    for (const h of hariReguler) {
      for (const t of templateHari) {
        const ref = doc(collection(db, 'timeSlots'));
        batch.set(ref, {
          hari: h,
          urutan: t.urutan,
          nama: t.nama,
          mulai: t.mulai,
          selesai: t.selesai,
          jenis: t.jenis,
          createdAt: now,
          updatedAt: now,
          updatedBy: getCurrentUid(),
        });
      }
    }

    // Hari Jumat: lebih pendek
    const templateJumat: typeof templateHari = [
      { urutan: 1, nama: 'Jam Ke-1', mulai: '07:00', selesai: '07:40', jenis: 'pelajaran' },
      { urutan: 2, nama: 'Jam Ke-2', mulai: '07:40', selesai: '08:20', jenis: 'pelajaran' },
      { urutan: 3, nama: 'Istirahat & Dhuha', mulai: '08:20', selesai: '08:45', jenis: 'ibadah' },
      { urutan: 4, nama: 'Jam Ke-3', mulai: '08:45', selesai: '09:25', jenis: 'pelajaran' },
      { urutan: 5, nama: 'Jam Ke-4', mulai: '09:25', selesai: '10:05', jenis: 'pelajaran' },
      { urutan: 6, nama: 'Persiapan Shalat Jumat', mulai: '10:05', selesai: '11:15', jenis: 'ibadah' },
    ];

    for (const t of templateJumat) {
      const ref = doc(collection(db, 'timeSlots'));
      batch.set(ref, {
        hari: 5, // Jumat
        urutan: t.urutan,
        nama: t.nama,
        mulai: t.mulai,
        selesai: t.selesai,
        jenis: t.jenis,
        createdAt: now,
        updatedAt: now,
        updatedBy: getCurrentUid(),
      });
    }

    await batch.commit();
    memoryCache.invalidatePrefix('timeSlots');
  },

  // ===========================================================================
  // 10. JADWAL PELAJARAN (schedules) & BENTROK LOCKS (scheduleLocks)
  // Pencegahan Bentrok Atomik Nyata via Firestore Transactions
  // ===========================================================================
  async getSchedules(semesterId: string, rombelId?: string, guruUid?: string): Promise<ScheduleItem[]> {
    const cacheKey = rombelId
      ? `schedules_${semesterId}_rombel_${rombelId}`
      : guruUid
      ? `schedules_${semesterId}_guru_${guruUid}`
      : `schedules_${semesterId}`;

    return fetchWithCache(cacheKey, async () => {
      let q = query(collection(db, 'schedules'), where('semesterId', '==', semesterId));
      if (rombelId) {
        q = query(collection(db, 'schedules'), where('semesterId', '==', semesterId), where('rombelId', '==', rombelId));
      } else if (guruUid) {
        q = query(collection(db, 'schedules'), where('semesterId', '==', semesterId), where('guruUid', '==', guruUid));
      }
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ScheduleItem, 'id'>) }));
    });
  },

  /**
   * Simpan slot jadwal dengan proteksi bentrok ganda:
   * 1. Kunci Guru: {semesterId}_guru_{guruUid}_{hari}_{timeSlotId}
   * 2. Kunci Rombel: {semesterId}_rombel_{rombelId}_{hari}_{timeSlotId}
   * Dilakukan dalam RUN TRANSACTION sehingga dua admin yang menyimpan bersamaan akan tertolak aman.
   */
  async assignScheduleSlot(params: {
    semesterId: string;
    rombelId: string;
    rombelNama: string;
    hari: number;
    timeSlotId: string;
    teachingAssignment: TeachingAssignment;
    ruang?: string;
  }): Promise<{ success: boolean; scheduleId?: string; error?: string }> {
    const { semesterId, rombelId, rombelNama, hari, timeSlotId, teachingAssignment, ruang } = params;

    const guruLockId = `${semesterId}_guru_${teachingAssignment.guruUid}_${hari}_${timeSlotId}`;
    const rombelLockId = `${semesterId}_rombel_${rombelId}_${hari}_${timeSlotId}`;
    const scheduleDocRef = doc(collection(db, 'schedules'));
    const now = getNowIso();

    try {
      await runTransaction(db, async (tx) => {
        // 1. Baca Kunci Guru
        const guruLockRef = doc(db, 'scheduleLocks', guruLockId);
        const guruLockSnap = await tx.get(guruLockRef);
        if (guruLockSnap.exists()) {
          throw new Error(
            `Bentrok Guru: ${teachingAssignment.guruNama} sudah memiliki jadwal mengajar di rombel lain pada hari dan slot jam yang sama!`
          );
        }

        // 2. Baca Kunci Rombel
        const rombelLockRef = doc(db, 'scheduleLocks', rombelLockId);
        const rombelLockSnap = await tx.get(rombelLockRef);
        if (rombelLockSnap.exists()) {
          throw new Error(
            `Bentrok Rombel: Rombel ${rombelNama} sudah memiliki jadwal mata pelajaran lain pada hari dan slot jam ini!`
          );
        }

        // 3. Tulis Dokumen Jadwal
        const scheduleItem: ScheduleItem = {
          id: scheduleDocRef.id,
          semesterId,
          rombelId,
          rombelNama,
          hari,
          timeSlotId,
          teachingAssignmentId: teachingAssignment.id,
          mapelId: teachingAssignment.mapelId,
          mapelNama: teachingAssignment.mapelNama,
          guruUid: teachingAssignment.guruUid,
          guruNama: teachingAssignment.guruNama,
          ruang: ruang || '',
          createdAt: now,
          updatedAt: now,
          updatedBy: getCurrentUid(),
        };
        tx.set(scheduleDocRef, scheduleItem);

        // 4. Kunci Slot Guru & Slot Rombel
        tx.set(guruLockRef, {
          tipe: 'guru',
          targetId: teachingAssignment.guruUid,
          semesterId,
          hari,
          timeSlotId,
          scheduleId: scheduleDocRef.id,
          createdAt: now,
        });

        tx.set(rombelLockRef, {
          tipe: 'rombel',
          targetId: rombelId,
          semesterId,
          hari,
          timeSlotId,
          scheduleId: scheduleDocRef.id,
          createdAt: now,
        });
      });

      memoryCache.invalidatePrefix('schedules');
      return { success: true, scheduleId: scheduleDocRef.id };
    } catch (err: unknown) {
      console.warn('Penetapan jadwal ditolak:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Terjadi bentrok jadwal saat menyimpan ke database.',
      };
    }
  },

  /**
   * Hapus jadwal beserta kedua kunci bentroknya
   */
  async deleteScheduleSlot(schedule: ScheduleItem): Promise<void> {
    const guruLockId = `${schedule.semesterId}_guru_${schedule.guruUid}_${schedule.hari}_${schedule.timeSlotId}`;
    const rombelLockId = `${schedule.semesterId}_rombel_${schedule.rombelId}_${schedule.hari}_${schedule.timeSlotId}`;

    const batch = writeBatch(db);
    batch.delete(doc(db, 'schedules', schedule.id));
    batch.delete(doc(db, 'scheduleLocks', guruLockId));
    batch.delete(doc(db, 'scheduleLocks', rombelLockId));

    await batch.commit();
    memoryCache.invalidatePrefix('schedules');
  },

  // ===========================================================================
  // 11. CHECKLIST PANDUAN PENYIAPAN AKADEMIK (LIVE DATA COUNTS)
  // Menghitung status tiap langkah dari data nyata, bukan statis.
  // ===========================================================================
  async getSetupChecklist(): Promise<{
    tahunAjaranCount: number;
    hasActiveYear: boolean;
    hasActiveSemester: boolean;
    classCount: number;
    subjectCount: number;
    curriculumCount: number;
    teacherCount: number;
    studentCount: number;
    teachingPlotCount: number;
    timeSlotCount: number;
    scheduleCount: number;
    allComplete: boolean;
  }> {
    return fetchWithCache('setup_checklist', async () => {
      // 1. Tahun Ajaran
      const years = await this.getAcademicYears();
      const hasActiveYear = years.some((y) => y.aktif);
      const activeYear = years.find((y) => y.aktif) || years[0];

      // 2. Semester
      const semesters = await this.getSemesters();
      const hasActiveSemester = semesters.some((s) => s.aktif);
      const activeSem = semesters.find((s) => s.aktif) || semesters[0];

      // 3. Rombel
      const classes = activeYear ? await this.getClasses(activeYear.id) : [];

      // 4. Mapel
      const subjects = await this.getSubjects();

      // 5. Kurikulum
      const curriculum = activeYear ? await this.getCurriculumSubjects(activeYear.id) : [];

      // 6. Guru & Siswa dari Users
      let teacherCount = 0;
      let studentCount = 0;
      try {
        const uSnap = await getDocs(query(collection(db, 'users'), limit(500)));
        uSnap.forEach((d) => {
          const roles = d.data().roles || [];
          if (roles.includes('guru')) teacherCount++;
          if (roles.includes('siswa')) studentCount++;
        });
      } catch {}

      // 7. Plot Guru
      const plots = activeSem ? await this.getTeachingAssignments(activeSem.id) : [];

      // 8. Time Slots
      const slots = await this.getTimeSlots();

      // 9. Schedules
      const scheds = activeSem ? await this.getSchedules(activeSem.id) : [];

      const allComplete =
        hasActiveYear &&
        hasActiveSemester &&
        classes.length > 0 &&
        subjects.length > 0 &&
        curriculum.length > 0 &&
        teacherCount > 0 &&
        studentCount > 0 &&
        plots.length > 0 &&
        slots.length > 0 &&
        scheds.length > 0;

      return {
        tahunAjaranCount: years.length,
        hasActiveYear,
        hasActiveSemester,
        classCount: classes.length,
        subjectCount: subjects.length,
        curriculumCount: curriculum.length,
        teacherCount,
        studentCount,
        teachingPlotCount: plots.length,
        timeSlotCount: slots.length,
        scheduleCount: scheds.length,
        allComplete,
      };
    }, 60000); // 1 menit cache
  },
};
