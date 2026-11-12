/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  CalendarDays,
  Plus,
  CheckCircle2,
  AlertCircle,
  Archive,
  RefreshCw,
  CalendarCheck,
  Check,
} from 'lucide-react';
import { PageHeader } from '../../components/layout/PageHeader';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button, Input, Modal, Badge, DataTable, Tabs, Select } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import { academicService } from '../../lib/academicService';
import { AcademicYear, Semester, TableColumn } from '../../types';

export function AdminTahunAjaranPage() {
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState<'tahun' | 'semester'>('tahun');

  // State Data
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modal Tambah/Edit Tahun Ajaran
  const [isYearModalOpen, setIsYearModalOpen] = useState(false);
  const [yearForm, setYearForm] = useState({
    nama: '',
    tanggalMulai: '',
    tanggalSelesai: '',
    aktif: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Modal Tambah Semester
  const [isSemModalOpen, setIsSemModalOpen] = useState(false);
  const [semForm, setSemForm] = useState<{
    tahunAjaranId: string;
    jenis: 'Gasal' | 'Genap';
    tanggalMulai: string;
    tanggalSelesai: string;
    aktif: boolean;
  }>({
    tahunAjaranId: '',
    jenis: 'Gasal',
    tanggalMulai: '',
    tanggalSelesai: '',
    aktif: false,
  });

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [yearList, semList] = await Promise.all([
        academicService.getAcademicYears(),
        academicService.getSemesters(),
      ]);
      setYears(yearList);
      setSemesters(semList);
      if (yearList.length > 0 && !semForm.tahunAjaranId) {
        setSemForm((prev) => ({ ...prev, tahunAjaranId: yearList.find((y) => y.aktif)?.id || yearList[0].id }));
      }
    } catch (err: unknown) {
      console.error('Gagal memuat data akademik:', err);
      addToast({
        title: 'Gagal Memuat Data',
        description: 'Terjadi kendala saat membaca data tahun ajaran dari Firestore.',
        type: 'danger',
      });
    } finally {
      setIsLoading(false);
    }
  }, [addToast, semForm.tahunAjaranId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handler Tahun Ajaran
  const handleSaveYear = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!yearForm.nama.trim() || !yearForm.nama.includes('/')) {
      setFormError('Format nama tahun ajaran harus "YYYY/YYYY" (contoh: 2026/2027).');
      return;
    }

    if (!yearForm.tanggalMulai || !yearForm.tanggalSelesai) {
      setFormError('Tanggal mulai dan selesai wajib diisi.');
      return;
    }

    if (new Date(yearForm.tanggalMulai) >= new Date(yearForm.tanggalSelesai)) {
      setFormError('Tanggal mulai harus sebelum tanggal selesai.');
      return;
    }

    setIsSubmitting(true);
    try {
      await academicService.createAcademicYear({
        nama: yearForm.nama.trim(),
        tanggalMulai: yearForm.tanggalMulai,
        tanggalSelesai: yearForm.tanggalSelesai,
        aktif: yearForm.aktif,
      });

      addToast({
        title: 'Tahun Ajaran Disimpan',
        description: `Tahun ajaran ${yearForm.nama} berhasil ditambahkan.`,
        type: 'success',
      });
      setIsYearModalOpen(false);
      setYearForm({ nama: '', tanggalMulai: '', tanggalSelesai: '', aktif: false });
      await loadData();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Gagal menyimpan tahun ajaran.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSetActiveYear = async (id: string, nama: string) => {
    if (!confirm(`Aktifkan tahun ajaran ${nama}? Semua tahun ajaran lain akan otomatis dinonaktifkan.`)) return;

    try {
      await academicService.setActiveAcademicYear(id);
      addToast({
        title: 'Tahun Ajaran Aktif Diperbarui',
        description: `${nama} kini berstatus aktif.`,
        type: 'success',
      });
      await loadData();
    } catch (err: unknown) {
      addToast({
        title: 'Gagal Mengubah Status',
        description: err instanceof Error ? err.message : 'Terjadi kendala.',
        type: 'danger',
      });
    }
  };

  const handleArchiveYear = async (id: string, nama: string, currentStatus?: boolean) => {
    const nextStatus = !currentStatus;
    const action = nextStatus ? 'mengarsipkan' : 'membatalkan arsip';
    if (!confirm(`Yakin ingin ${action} tahun ajaran ${nama}?`)) return;

    try {
      await academicService.archiveAcademicYear(id, nextStatus);
      addToast({
        title: 'Status Arsip Diperbarui',
        description: `Tahun ajaran ${nama} telah ${nextStatus ? 'diarsipkan' : 'diaktifkan kembali'}.`,
        type: 'info',
      });
      await loadData();
    } catch (err: unknown) {
      addToast({
        title: 'Gagal Mengarsipkan',
        description: err instanceof Error ? err.message : 'Terjadi kendala.',
        type: 'danger',
      });
    }
  };

  // Handler Semester
  const handleSaveSemester = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!semForm.tahunAjaranId) {
      setFormError('Pilih tahun ajaran untuk semester ini.');
      return;
    }

    if (!semForm.tanggalMulai || !semForm.tanggalSelesai) {
      setFormError('Tanggal mulai dan selesai semester wajib diisi.');
      return;
    }

    if (new Date(semForm.tanggalMulai) >= new Date(semForm.tanggalSelesai)) {
      setFormError('Tanggal mulai semester harus sebelum tanggal selesai.');
      return;
    }

    const selectedYear = years.find((y) => y.id === semForm.tahunAjaranId);
    const namaSem = `${selectedYear?.nama || semForm.tahunAjaranId} ${semForm.jenis}`;

    setIsSubmitting(true);
    try {
      await academicService.createSemester({
        tahunAjaranId: semForm.tahunAjaranId,
        jenis: semForm.jenis,
        nama: namaSem,
        tanggalMulai: semForm.tanggalMulai,
        tanggalSelesai: semForm.tanggalSelesai,
        aktif: semForm.aktif,
      });

      addToast({
        title: 'Semester Disimpan',
        description: `Semester ${namaSem} berhasil ditambahkan.`,
        type: 'success',
      });
      setIsSemModalOpen(false);
      await loadData();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Gagal menyimpan semester.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSetActiveSemester = async (id: string, nama: string) => {
    if (!confirm(`Aktifkan semester ${nama}? Semester aktif lain akan otomatis dinonaktifkan.`)) return;

    try {
      await academicService.setActiveSemester(id);
      addToast({
        title: 'Semester Aktif Diperbarui',
        description: `${nama} kini menjadi semester berjalan.`,
        type: 'success',
      });
      await loadData();
    } catch (err: unknown) {
      addToast({
        title: 'Gagal Mengubah Status',
        description: err instanceof Error ? err.message : 'Terjadi kendala.',
        type: 'danger',
      });
    }
  };

  const yearColumns: TableColumn<AcademicYear>[] = [
    {
      key: 'nama',
      header: 'Tahun Ajaran',
      sortable: true,
      render: (y) => (
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-emerald-600" />
          <span className="font-semibold text-slate-900 dark:text-slate-100">{y.nama}</span>
        </div>
      ),
    },
    {
      key: 'tanggalMulai',
      header: 'Periode Waktu',
      render: (y) => (
        <span className="text-xs text-slate-600 dark:text-slate-300">
          {y.tanggalMulai} s.d. {y.tanggalSelesai}
        </span>
      ),
    },
    {
      key: 'aktif',
      header: 'Status',
      width: '140px',
      render: (y) =>
        y.aktif ? (
          <Badge variant="emerald" size="sm" className="gap-1">
            <CheckCircle2 className="w-3 h-3" />
            Aktif Berjalan
          </Badge>
        ) : y.diarsipkan ? (
          <Badge variant="slate" size="sm">
            Diarsipkan
          </Badge>
        ) : (
          <span className="text-xs text-slate-400">Tidak Aktif</span>
        ),
    },
  ];

  const semColumns: TableColumn<Semester>[] = [
    {
      key: 'nama',
      header: 'Semester',
      sortable: true,
      render: (s) => (
        <div>
          <p className="font-semibold text-slate-900 dark:text-slate-100">{s.nama}</p>
          <p className="text-[11px] text-slate-500">Jenis: Semester {s.jenis}</p>
        </div>
      ),
    },
    {
      key: 'tanggalMulai',
      header: 'Rentang Tanggal',
      render: (s) => (
        <span className="text-xs text-slate-600 dark:text-slate-300">
          {s.tanggalMulai} s.d. {s.tanggalSelesai}
        </span>
      ),
    },
    {
      key: 'aktif',
      header: 'Status Berjalan',
      width: '140px',
      render: (s) =>
        s.aktif ? (
          <Badge variant="emerald" size="sm" className="gap-1">
            <CheckCircle2 className="w-3 h-3" />
            Semester Aktif
          </Badge>
        ) : (
          <span className="text-xs text-slate-400">Non-Aktif</span>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Master Data Akademik"
        title="Tahun Ajaran & Semester"
        subtitle="Kelola kalender akademik madrasah. Penetapan status aktif otomatis memperbarui konteks pembelajaran."
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
              onClick={loadData}
              disabled={isLoading}
            >
              Segarkan
            </Button>
            {activeTab === 'tahun' ? (
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Plus className="w-4 h-4" />}
                onClick={() => setIsYearModalOpen(true)}
              >
                Tambah Tahun Ajaran
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Plus className="w-4 h-4" />}
                onClick={() => setIsSemModalOpen(true)}
              >
                Tambah Semester
              </Button>
            )}
          </div>
        }
      />

      <Tabs
        activeTab={activeTab}
        onChange={(t) => setActiveTab(t as 'tahun' | 'semester')}
        tabs={[
          { id: 'tahun', label: 'Tahun Ajaran', count: years.length },
          { id: 'semester', label: 'Semester Berjalan', count: semesters.length },
        ]}
      />

      {activeTab === 'tahun' && (
        <Card variant="default">
          <CardHeader>
            <CardTitle>Daftar Kalender Tahun Ajaran</CardTitle>
            <p className="text-xs text-slate-500">
              Hanya satu tahun ajaran yang dapat berstatus aktif pada satu waktu.
            </p>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={yearColumns}
              data={years}
              keyExtractor={(y) => y.id}
              isLoading={isLoading}
              itemsPerPage={10}
              emptyTitle="Belum Ada Tahun Ajaran"
              emptyDescription="Tambahkan tahun ajaran baru seperti 2026/2027 untuk memulai penataan rombel dan jadwal."
              rowActions={(rowYear) => (
                <div className="flex items-center justify-end gap-1.5">
                  {!rowYear.aktif && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSetActiveYear(rowYear.id, rowYear.nama)}
                      title="Jadikan Tahun Ajaran Aktif"
                      className="h-8 px-2 text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                    >
                      <Check className="w-3.5 h-3.5 mr-1" />
                      Aktifkan
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleArchiveYear(rowYear.id, rowYear.nama, rowYear.diarsipkan)}
                    title={rowYear.diarsipkan ? 'Buka Arsip' : 'Arsipkan'}
                    className="h-8 px-2 text-slate-500"
                  >
                    <Archive className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
            />
          </CardContent>
        </Card>
      )}

      {activeTab === 'semester' && (
        <Card variant="default">
          <CardHeader>
            <CardTitle>Daftar Semester</CardTitle>
            <p className="text-xs text-slate-500">
              Semester Gasal dan Genap menentukan plot pengampu guru dan susunan jadwal mingguan.
            </p>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={semColumns}
              data={semesters}
              keyExtractor={(s) => s.id}
              isLoading={isLoading}
              itemsPerPage={10}
              emptyTitle="Belum Ada Semester"
              emptyDescription="Klik tombol 'Tambah Semester' untuk membuat periode Gasal atau Genap."
              rowActions={(rowSem) => (
                <div className="flex items-center justify-end gap-1.5">
                  {!rowSem.aktif && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSetActiveSemester(rowSem.id, rowSem.nama)}
                      className="h-8 px-2 text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                    >
                      <Check className="w-3.5 h-3.5 mr-1" />
                      Aktifkan
                    </Button>
                  )}
                </div>
              )}
            />
          </CardContent>
        </Card>
      )}

      {/* Modal Tambah Tahun Ajaran */}
      <Modal
        isOpen={isYearModalOpen}
        onClose={() => !isSubmitting && setIsYearModalOpen(false)}
        title="Tambah Tahun Ajaran Baru"
        description="Format standar: 2026/2027. Mengaktifkannya akan otomatis menonaktifkan tahun ajaran sebelumnya."
        footer={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setIsYearModalOpen(false)} disabled={isSubmitting}>
              Batal
            </Button>
            <Button variant="primary" size="sm" onClick={handleSaveYear} isLoading={isSubmitting}>
              Simpan
            </Button>
          </div>
        }
      >
        <form onSubmit={handleSaveYear} className="space-y-4 text-xs">
          {formError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <span>{formError}</span>
            </div>
          )}

          <Input
            label="Nama Tahun Ajaran"
            placeholder="Contoh: 2026/2027"
            value={yearForm.nama}
            onChange={(e) => setYearForm({ ...yearForm, nama: e.target.value })}
            required
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Tanggal Mulai"
              type="date"
              value={yearForm.tanggalMulai}
              onChange={(e) => setYearForm({ ...yearForm, tanggalMulai: e.target.value })}
              required
            />
            <Input
              label="Tanggal Selesai"
              type="date"
              value={yearForm.tanggalSelesai}
              onChange={(e) => setYearForm({ ...yearForm, tanggalSelesai: e.target.value })}
              required
            />
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="yearActive"
              checked={yearForm.aktif}
              onChange={(e) => setYearForm({ ...yearForm, aktif: e.target.checked })}
              className="w-4 h-4 text-emerald-600 rounded border-slate-300 cursor-pointer"
            />
            <label htmlFor="yearActive" className="text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
              Jadikan Tahun Ajaran Aktif Sekarang
            </label>
          </div>
        </form>
      </Modal>

      {/* Modal Tambah Semester */}
      <Modal
        isOpen={isSemModalOpen}
        onClose={() => !isSubmitting && setIsSemModalOpen(false)}
        title="Tambah Semester Baru"
        description="Tautkan semester Gasal atau Genap ke tahun ajaran yang sesuai"
        footer={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setIsSemModalOpen(false)} disabled={isSubmitting}>
              Batal
            </Button>
            <Button variant="primary" size="sm" onClick={handleSaveSemester} isLoading={isSubmitting}>
              Simpan Semester
            </Button>
          </div>
        }
      >
        <form onSubmit={handleSaveSemester} className="space-y-4 text-xs">
          {formError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <span>{formError}</span>
            </div>
          )}

          <Select
            label="Tahun Ajaran Terkait"
            value={semForm.tahunAjaranId}
            onChange={(e) => setSemForm({ ...semForm, tahunAjaranId: e.target.value })}
            options={years.map((y) => ({ value: y.id, label: `${y.nama} ${y.aktif ? '(Aktif)' : ''}` }))}
          />

          <Select
            label="Jenis Semester"
            value={semForm.jenis}
            onChange={(e) => setSemForm({ ...semForm, jenis: e.target.value as 'Gasal' | 'Genap' })}
            options={[
              { value: 'Gasal', label: 'Gasal / Ganjil' },
              { value: 'Genap', label: 'Genap' },
            ]}
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Tanggal Mulai"
              type="date"
              value={semForm.tanggalMulai}
              onChange={(e) => setSemForm({ ...semForm, tanggalMulai: e.target.value })}
              required
            />
            <Input
              label="Tanggal Selesai"
              type="date"
              value={semForm.tanggalSelesai}
              onChange={(e) => setSemForm({ ...semForm, tanggalSelesai: e.target.value })}
              required
            />
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="semActive"
              checked={semForm.aktif}
              onChange={(e) => setSemForm({ ...semForm, aktif: e.target.checked })}
              className="w-4 h-4 text-emerald-600 rounded border-slate-300 cursor-pointer"
            />
            <label htmlFor="semActive" className="text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
              Jadikan Semester Aktif Sekarang
            </label>
          </div>
        </form>
      </Modal>
    </div>
  );
}
