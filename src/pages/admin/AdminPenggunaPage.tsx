/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Users,
  UserPlus,
  Search,
  KeyRound,
  ShieldCheck,
  UserCheck,
  UserX,
  Copy,
  Check,
  AlertCircle,
  Sparkles,
  Edit,
  RotateCcw,
} from 'lucide-react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { UserProfile, Role, TableColumn } from '../../types';
import { PageHeader } from '../../components/layout/PageHeader';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button, Input, Modal, Badge, DataTable, Tabs, Select } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import { userService } from '../../lib/userService';

export function AdminPenggunaPage() {
  const { user: currentUser } = useAuth();
  const { addToast } = useToast();

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [roleFilter, setRoleFilter] = useState<string>('all');

  // Modal Tambah Pengguna
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [formIdentifier, setFormIdentifier] = useState('');
  const [formNama, setFormNama] = useState('');
  const [formRoles, setFormRoles] = useState<Role[]>(['siswa']);
  const [formIsWaliKelas, setFormIsWaliKelas] = useState(false);
  const [formKelasWali, setFormKelasWali] = useState('');
  const [formMapel, setFormMapel] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modal Kredensial Sekali Tampil (Temporary Password)
  const [credentialModalData, setCredentialModalData] = useState<{
    identifier: string;
    nama: string;
    temporaryPassword: string;
    title: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // Modal Edit Pengguna
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Subscribe real-time ke koleksi users di Firestore
  useEffect(() => {
    setIsLoading(true);
    const q = query(collection(db, 'users'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const userList: UserProfile[] = [];
        snapshot.forEach((docSnap) => {
          const d = docSnap.data();
          userList.push({
            id: docSnap.id,
            identifier: d.identifier || '',
            nama: d.nama || 'Pengguna',
            roles: Array.isArray(d.roles) ? d.roles : ['siswa'],
            isWaliKelas: Boolean(d.isWaliKelas),
            kelasWali: d.kelasWali || '',
            mapelPengampu: Array.isArray(d.mapelPengampu) ? d.mapelPengampu : [],
            aktif: d.aktif !== false,
            mustChangePassword: Boolean(d.mustChangePassword),
            createdAt: d.createdAt || '',
            createdBy: d.createdBy || '',
            lastLoginAt: d.lastLoginAt,
          });
        });

        // Urutkan berdasarkan waktu buat terbaru
        userList.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        setUsers(userList);
        setIsLoading(false);
      },
      (error) => {
        console.error('Gagal mengambil daftar pengguna Firestore:', error);
        setIsLoading(false);
        addToast({
          title: 'Kendala Memuat Pengguna',
          description: 'Pastikan akun Anda memiliki izin Administrator di Firestore Rules.',
          type: 'danger',
        });
      }
    );

    return () => unsubscribe();
  }, [addToast]);

  // Filter Pengguna berdasarkan tab peran
  const filteredUsers = users.filter((u) => {
    if (roleFilter === 'all') return true;
    return u.roles.includes(roleFilter as Role);
  });

  const handleRoleToggle = (role: Role) => {
    setFormRoles((prev) => {
      if (prev.includes(role)) {
        if (prev.length === 1) return prev; // Minimal 1 peran
        return prev.filter((r) => r !== role);
      }
      return [...prev, role];
    });
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanId = formIdentifier.trim();
    if (!cleanId || cleanId.length < 4) {
      setFormError('Nomor identitas (NISN/NIP) minimal 4 karakter.');
      return;
    }
    if (!formNama.trim()) {
      setFormError('Nama lengkap pengguna wajib diisi.');
      return;
    }

    setIsSubmitting(true);
    const mapelList = formMapel
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean);

    const res = await userService.createUser(
      {
        identifier: cleanId,
        nama: formNama.trim(),
        roles: formRoles,
        isWaliKelas: formIsWaliKelas,
        kelasWali: formIsWaliKelas ? formKelasWali.trim() : undefined,
        mapelPengampu: mapelList.length > 0 ? mapelList : undefined,
      },
      currentUser
    );
    setIsSubmitting(false);

    if (res.success && res.user && res.temporaryPassword) {
      setIsAddModalOpen(false);
      // Reset form
      setFormIdentifier('');
      setFormNama('');
      setFormRoles(['siswa']);
      setFormIsWaliKelas(false);
      setFormKelasWali('');
      setFormMapel('');

      // Tampilkan modal kredensial sekali tampil
      setCredentialModalData({
        identifier: res.user.identifier,
        nama: res.user.nama,
        temporaryPassword: res.temporaryPassword,
        title: 'Akun Berhasil Dibuat',
      });

      addToast({
        title: 'Akun Dibuat',
        description: `Akun ${res.user.nama} (${res.user.identifier}) berhasil terdaftar.`,
        type: 'success',
      });
    } else {
      setFormError(res.error || 'Gagal membuat akun.');
    }
  };

  const handleResetPassword = async (targetUser: UserProfile) => {
    if (!confirm(`Reset kata sandi akun ${targetUser.nama} (${targetUser.identifier})?`)) return;

    const res = await userService.resetPassword(targetUser, currentUser);
    if (res.success && res.temporaryPassword) {
      setCredentialModalData({
        identifier: targetUser.identifier,
        nama: targetUser.nama,
        temporaryPassword: res.temporaryPassword,
        title: 'Kata Sandi Berhasil Direset',
      });
      addToast({
        title: 'Kata Sandi Direset',
        description: `Kata sandi sementara baru dibuat untuk ${targetUser.nama}.`,
        type: 'success',
      });
    } else {
      addToast({
        title: 'Gagal Reset Sandi',
        description: res.error || 'Terjadi kesalahan.',
        type: 'danger',
      });
    }
  };

  const handleToggleStatus = async (targetUser: UserProfile) => {
    const nextStatus = !targetUser.aktif;
    const actionText = nextStatus ? 'mengaktifkan' : 'menonaktifkan';
    if (!confirm(`Yakin ingin ${actionText} akun ${targetUser.nama}?`)) return;

    const res = await userService.toggleUserStatus(targetUser, nextStatus, currentUser);
    if (res.success) {
      addToast({
        title: 'Status Diperbarui',
        description: `Akun ${targetUser.nama} telah ${nextStatus ? 'diaktifkan' : 'dinonaktifkan'}.`,
        type: 'info',
      });
    } else {
      addToast({
        title: 'Gagal Mengubah Status',
        description: res.error || 'Terjadi kesalahan.',
        type: 'danger',
      });
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    setIsSubmitting(true);
    const res = await userService.updateUser(
      editingUser.id,
      editingUser.identifier,
      {
        nama: editingUser.nama,
        roles: editingUser.roles,
        isWaliKelas: editingUser.isWaliKelas,
        kelasWali: editingUser.kelasWali,
        mapelPengampu: editingUser.mapelPengampu,
      },
      currentUser
    );
    setIsSubmitting(false);

    if (res.success) {
      setIsEditModalOpen(false);
      setEditingUser(null);
      addToast({
        title: 'Perubahan Disimpan',
        description: 'Data pengguna berhasil diperbarui.',
        type: 'success',
      });
    } else {
      addToast({
        title: 'Gagal Menyimpan',
        description: res.error || 'Terjadi kesalahan.',
        type: 'danger',
      });
    }
  };

  const handleCopyCredentials = () => {
    if (!credentialModalData) return;
    const text = `Kredensial Akun LMS Madrasah:\nNama: ${credentialModalData.nama}\nNISN/NIP: ${credentialModalData.identifier}\nKata Sandi Sementara: ${credentialModalData.temporaryPassword}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const columns: TableColumn<UserProfile>[] = [
    {
      key: 'identifier',
      header: 'NISN / NIP',
      width: '160px',
      sortable: true,
      render: (u) => (
        <span className="font-mono font-medium text-slate-900 dark:text-slate-100">
          {u.identifier}
        </span>
      ),
    },
    {
      key: 'nama',
      header: 'Nama Pengguna',
      sortable: true,
      render: (u) => (
        <div>
          <p className="font-semibold text-slate-800 dark:text-slate-200">{u.nama}</p>
          {u.isWaliKelas && (
            <p className="text-[10px] text-amber-700 dark:text-amber-400 font-medium">
              Wali Kelas: {u.kelasWali || 'Aktif'}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'roles',
      header: 'Peran Akun',
      render: (u) => (
        <div className="flex flex-wrap gap-1">
          {u.roles.map((r) => (
            <Badge
              key={r}
              variant={r === 'admin' ? 'slate' : r === 'guru' ? 'emerald' : 'gold'}
              size="sm"
            >
              {r.toUpperCase()}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      key: 'aktif',
      header: 'Status',
      width: '120px',
      render: (u) => (
        <span
          className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
            u.aktif ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-400'
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              u.aktif ? 'bg-emerald-600' : 'bg-slate-400'
            }`}
          />
          {u.aktif ? 'Aktif' : 'Nonaktif'}
        </span>
      ),
    },
    {
      key: 'mustChangePassword',
      header: 'Sandi Baru',
      width: '120px',
      render: (u) =>
        u.mustChangePassword ? (
          <Badge variant="gold" size="sm">
            Wajib Ganti
          </Badge>
        ) : (
          <span className="text-[11px] text-slate-400">Permanen</span>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Manajemen Kesiswaan & Pendidik"
        title="Daftar Pengguna Madrasah"
        subtitle="Kelola akun santri (NISN), dewan guru (NIP), dan hak akses administrator berbasis peran (RBAC)."
        actions={
          <Button
            variant="primary"
            size="md"
            leftIcon={<UserPlus className="w-4 h-4" />}
            onClick={() => setIsAddModalOpen(true)}
          >
            Tambah Pengguna
          </Button>
        }
      />

      {/* Filter Tabs */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <Tabs
          activeTab={roleFilter}
          onChange={(tab) => setRoleFilter(tab)}
          tabs={[
            { id: 'all', label: 'Semua', count: users.length },
            { id: 'siswa', label: 'Santri / Siswa', count: users.filter((u) => u.roles.includes('siswa')).length },
            { id: 'guru', label: 'Guru & Wali', count: users.filter((u) => u.roles.includes('guru')).length },
            { id: 'admin', label: 'Administrator', count: users.filter((u) => u.roles.includes('admin')).length },
          ]}
        />
      </div>

      {/* Tabel Data Pengguna */}
      <DataTable
        columns={columns}
        data={filteredUsers}
        keyExtractor={(u) => u.id}
        isLoading={isLoading}
        searchable
        searchPlaceholder="Cari berdasarkan nama atau NISN/NIP..."
        searchFields={['nama', 'identifier']}
        itemsPerPage={10}
        emptyTitle="Belum Ada Pengguna"
        emptyDescription="Klik tombol 'Tambah Pengguna' di atas untuk mendaftarkan akun baru ke Firestore."
        rowActions={(rowUser) => (
          <div className="flex items-center justify-end gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEditingUser({ ...rowUser });
                setIsEditModalOpen(true);
              }}
              title="Edit Data Pengguna"
              className="h-8 px-2"
            >
              <Edit className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => handleResetPassword(rowUser)}
              title="Reset Kata Sandi"
              className="h-8 px-2"
            >
              <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
            </Button>

            {rowUser.id !== currentUser?.id && (
              <Button
                variant={rowUser.aktif ? 'ghost' : 'outline'}
                size="sm"
                onClick={() => handleToggleStatus(rowUser)}
                title={rowUser.aktif ? 'Nonaktifkan Akun' : 'Aktifkan Akun'}
                className="h-8 px-2 text-rose-600 hover:text-rose-700"
              >
                {rowUser.aktif ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5 text-emerald-600" />}
              </Button>
            )}
          </div>
        )}
      />

      {/* Modal Tambah Pengguna */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => !isSubmitting && setIsAddModalOpen(false)}
        title="Tambah Akun Pengguna Baru"
        description="Akun akan dibuat di Firebase Auth dan terdaftar pada koleksi users Firestore"
        footer={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsAddModalOpen(false)}
              disabled={isSubmitting}
            >
              Batal
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleCreateUser}
              isLoading={isSubmitting}
            >
              Buat Akun
            </Button>
          </div>
        }
      >
        <form onSubmit={handleCreateUser} className="space-y-4 text-xs">
          {formError && (
            <div className="p-3 rounded-lg border border-rose-200 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <span>{formError}</span>
            </div>
          )}

          <Input
            label="Nomor Identitas (NISN / NIP)"
            placeholder="NISN 10 digit (siswa) atau NIP 18 digit (guru)"
            value={formIdentifier}
            onChange={(e) => setFormIdentifier(e.target.value)}
            required
          />

          <Input
            label="Nama Lengkap"
            placeholder="Contoh: Muhammad Ilham Ramadhan"
            value={formNama}
            onChange={(e) => setFormNama(e.target.value)}
            required
          />

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
              Pilihan Peran (Bisa lebih dari satu)
            </label>
            <div className="flex flex-wrap gap-2">
              {(['siswa', 'guru', 'admin'] as Role[]).map((r) => {
                const isSelected = formRoles.includes(r);
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => handleRoleToggle(r)}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                      isSelected
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                        : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    {r === 'admin' ? 'Administrator' : r === 'guru' ? 'Guru' : 'Siswa / Santri'}
                  </button>
                );
              })}
            </div>
          </div>

          {formRoles.includes('guru') && (
            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-slate-800 dark:text-slate-200">Merangkap Wali Kelas</p>
                  <p className="text-[11px] text-slate-500">Beri akses khusus bimbingan dan rapor rombel</p>
                </div>
                <input
                  type="checkbox"
                  checked={formIsWaliKelas}
                  onChange={(e) => setFormIsWaliKelas(e.target.checked)}
                  className="w-4 h-4 text-emerald-600 rounded border-slate-300 cursor-pointer"
                />
              </div>

              {formIsWaliKelas && (
                <Input
                  label="Nama Rombel Binaan"
                  placeholder="Contoh: X Rombel 1 atau XI-B"
                  value={formKelasWali}
                  onChange={(e) => setFormKelasWali(e.target.value)}
                />
              )}

              <Input
                label="Mata Pelajaran yang Diampu (Pisahkan dengan koma)"
                placeholder="Contoh: Al-Qur'an Hadis, Fikih"
                value={formMapel}
                onChange={(e) => setFormMapel(e.target.value)}
              />
            </div>
          )}

          <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 rounded-lg text-[11px] text-amber-900 dark:text-amber-200 leading-relaxed">
            * Kata sandi awal akan dibuat secara <strong>acak dan kuat</strong> oleh sistem server dan hanya akan ditampilkan <strong>satu kali</strong> kepada Anda. Pengguna wajib menggantinya saat login pertama.
          </div>
        </form>
      </Modal>

      {/* Modal Kredensial Sekali Tampil (Temporary Password) */}
      <Modal
        isOpen={Boolean(credentialModalData)}
        onClose={() => setCredentialModalData(null)}
        title={credentialModalData?.title || 'Kredensial Akun'}
        description="Simpan dan berikan kredensial sementara ini kepada pengguna bersangkutan"
        footer={
          <Button
            variant="primary"
            size="sm"
            onClick={() => setCredentialModalData(null)}
          >
            Selesai
          </Button>
        }
      >
        {credentialModalData && (
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/50 rounded-lg border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200">
              <p className="font-semibold mb-0.5">Pengguna: {credentialModalData.nama}</p>
              <p className="text-[11px]">
                Kredensial berikut hanya ditampilkan satu kali demi keamanan data.
              </p>
            </div>

            <div className="p-3.5 bg-slate-100 dark:bg-slate-800 rounded-lg space-y-2 font-mono text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-sans">NISN / NIP:</span>
                <span className="font-bold text-slate-900 dark:text-slate-100">{credentialModalData.identifier}</span>
              </div>
              <div className="flex justify-between items-center pt-1 border-t border-slate-200 dark:border-slate-700">
                <span className="text-slate-500 font-sans">Kata Sandi Acak:</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400 text-sm tracking-wider">
                  {credentialModalData.temporaryPassword}
                </span>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyCredentials}
              leftIcon={copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              className="w-full"
            >
              {copied ? 'Kredensial Berhasil Disalin!' : 'Salin Kredensial Lengkap'}
            </Button>
          </div>
        )}
      </Modal>

      {/* Modal Edit Pengguna */}
      <Modal
        isOpen={isEditModalOpen && Boolean(editingUser)}
        onClose={() => setIsEditModalOpen(false)}
        title="Ubah Data Pengguna"
        description={`Mengedit akun: ${editingUser?.identifier}`}
        footer={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditModalOpen(false)}
              disabled={isSubmitting}
            >
              Batal
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSaveEdit}
              isLoading={isSubmitting}
            >
              Simpan Perubahan
            </Button>
          </div>
        }
      >
        {editingUser && (
          <form onSubmit={handleSaveEdit} className="space-y-4 text-xs">
            <Input
              label="Nama Lengkap"
              value={editingUser.nama}
              onChange={(e) => setEditingUser({ ...editingUser, nama: e.target.value })}
              required
            />

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                Peran Akun
              </label>
              <div className="flex flex-wrap gap-2">
                {(['siswa', 'guru', 'admin'] as Role[]).map((r) => {
                  const isSelected = editingUser.roles.includes(r);
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() => {
                        const newRoles = isSelected
                          ? editingUser.roles.filter((role) => role !== r)
                          : [...editingUser.roles, r];
                        if (newRoles.length > 0) {
                          setEditingUser({ ...editingUser, roles: newRoles });
                        }
                      }}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                        isSelected
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                          : 'border-slate-300 bg-white text-slate-600'
                      }`}
                    >
                      {r === 'admin' ? 'Administrator' : r === 'guru' ? 'Guru' : 'Siswa'}
                    </button>
                  );
                })}
              </div>
            </div>

            {editingUser.roles.includes('guru') && (
              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800 dark:text-slate-200">Wali Kelas</span>
                  <input
                    type="checkbox"
                    checked={editingUser.isWaliKelas}
                    onChange={(e) =>
                      setEditingUser({ ...editingUser, isWaliKelas: e.target.checked })
                    }
                    className="w-4 h-4 text-emerald-600 rounded cursor-pointer"
                  />
                </div>
                {editingUser.isWaliKelas && (
                  <Input
                    label="Nama Rombel"
                    value={editingUser.kelasWali || ''}
                    onChange={(e) =>
                      setEditingUser({ ...editingUser, kelasWali: e.target.value })
                    }
                  />
                )}
              </div>
            )}
          </form>
        )}
      </Modal>
    </div>
  );
}
