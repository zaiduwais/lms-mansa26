/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  User,
  KeyRound,
  Shield,
  Calendar,
  Sparkles,
  BookOpen,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { PageHeader } from '../../components/layout/PageHeader';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button, Input, Badge } from '../../components/ui';
import { Avatar } from '../../components/ui/Avatar';
import { useToast } from '../../components/ui/Toast';

export function ProfilePage() {
  const { user, currentRole, changePassword } = useAuth();
  const { addToast } = useToast();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (newPassword.length < 8) {
      setErrorMessage('Kata sandi baru minimal 8 karakter.');
      return;
    }
    if (user?.identifier && newPassword.toLowerCase() === user.identifier.toLowerCase()) {
      setErrorMessage('Kata sandi tidak boleh sama dengan nomor identitas.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage('Konfirmasi kata sandi tidak cocok.');
      return;
    }

    setIsSubmitting(true);
    const res = await changePassword(newPassword);
    setIsSubmitting(false);

    if (res.success) {
      setNewPassword('');
      setConfirmPassword('');
      addToast({
        title: 'Berhasil',
        description: 'Kata sandi akun Anda telah diperbarui.',
        type: 'success',
      });
    } else {
      setErrorMessage(res.error || 'Gagal memperbarui kata sandi.');
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        kicker="Akun Pengguna"
        title="Profil & Keamanan Akun"
        subtitle="Kelola identitas personal, informasi akademik, dan kredensial akses LMS."
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Kolom Kiri: Ringkasan Akun */}
        <div className="md:col-span-1 space-y-4">
          <Card variant="default" className="text-center p-6">
            <Avatar
              name={user?.nama || 'Pengguna'}
              role={currentRole}
              size="lg"
              className="mx-auto w-20 h-20 text-xl mb-4 shadow-sm"
            />
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">{user?.nama}</h3>
            <p className="text-xs text-slate-500 font-mono mt-0.5">{user?.identifier}</p>

            <div className="flex flex-wrap justify-center gap-1.5 mt-3">
              {user?.roles.map((r) => (
                <Badge
                  key={r}
                  variant={r === 'admin' ? 'slate' : r === 'guru' ? 'emerald' : 'gold'}
                  size="sm"
                >
                  {r.toUpperCase()}
                </Badge>
              ))}
            </div>

            <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 text-left text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">Status Akun:</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Aktif
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Peran Aktif:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200 uppercase">
                  {currentRole}
                </span>
              </div>
              {user?.isWaliKelas && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Wali Kelas:</span>
                  <span className="font-semibold text-amber-700 dark:text-amber-400">
                    {user.kelasWali || 'Aktif'}
                  </span>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Kolom Kanan: Rincian Data & Form Ganti Sandi */}
        <div className="md:col-span-2 space-y-6">
          {/* Data Akademik */}
          <Card variant="default">
            <CardHeader>
              <CardTitle>Informasi Akademik</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-slate-500 block mb-1">Nama Lengkap</label>
                  <p className="font-semibold text-slate-800 dark:text-slate-200">{user?.nama}</p>
                </div>
                <div>
                  <label className="text-slate-500 block mb-1">Nomor Identitas (NISN/NIP)</label>
                  <p className="font-mono font-semibold text-slate-800 dark:text-slate-200">{user?.identifier}</p>
                </div>
                {user?.mapelPengampu && user.mapelPengampu.length > 0 && (
                  <div className="sm:col-span-2">
                    <label className="text-slate-500 block mb-1">Mata Pelajaran yang Diampu</label>
                    <div className="flex flex-wrap gap-1.5">
                      {user.mapelPengampu.map((m) => (
                        <Badge key={m} variant="emerald" size="sm">
                          {m}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Form Ganti Kata Sandi */}
          <Card variant="default">
            <CardHeader>
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-emerald-600" />
                <CardTitle>Perbarui Kata Sandi Akun</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {errorMessage && (
                <div className="p-3 mb-4 rounded-lg border border-rose-200 bg-rose-50 dark:bg-rose-950/40 dark:border-rose-800 text-rose-800 dark:text-rose-300 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                <Input
                  label="Kata Sandi Baru"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Minimal 8 karakter"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  rightIcon={
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                      aria-label="Toggle password"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  }
                />

                <Input
                  label="Konfirmasi Kata Sandi Baru"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Ketik ulang kata sandi baru"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />

                <div className="flex justify-end pt-2">
                  <Button
                    type="submit"
                    variant="primary"
                    size="md"
                    isLoading={isSubmitting}
                    leftIcon={<Shield className="w-4 h-4" />}
                  >
                    Simpan Kata Sandi
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
