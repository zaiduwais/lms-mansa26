/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  KeyRound,
  ShieldCheck,
  Eye,
  EyeOff,
  Check,
  X,
  AlertCircle,
  LogOut,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Button, Input } from '../../components/ui';

export function ChangePasswordPage() {
  const { user, changePassword, logout, currentRole } = useAuth();
  const navigate = useNavigate();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Evaluasi kekuatan kata sandi
  const hasMinLength = newPassword.length >= 8;
  const hasUpperCase = /[A-Z]/.test(newPassword);
  const hasLowerCase = /[a-z]/.test(newPassword);
  const hasNumber = /[0-9]/.test(newPassword);
  const hasSpecial = /[^A-Za-z0-9]/.test(newPassword);
  const isNotIdentifier = user?.identifier
    ? newPassword.toLowerCase() !== user.identifier.toLowerCase()
    : true;

  const passedCriteriaCount = [
    hasMinLength,
    hasUpperCase,
    hasLowerCase,
    hasNumber || hasSpecial,
    isNotIdentifier,
  ].filter(Boolean).length;

  const getStrengthLabel = () => {
    if (newPassword.length === 0) return { label: '', color: 'bg-slate-200' };
    if (passedCriteriaCount <= 2) return { label: 'Lemah', color: 'bg-rose-500' };
    if (passedCriteriaCount <= 4) return { label: 'Sedang', color: 'bg-amber-500' };
    return { label: 'Kuat', color: 'bg-emerald-600' };
  };
  const strength = getStrengthLabel();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!hasMinLength) {
      setErrorMessage('Kata sandi baru minimal 8 karakter.');
      return;
    }
    if (!isNotIdentifier) {
      setErrorMessage('Kata sandi tidak boleh sama dengan nomor identitas (NISN/NIP) Anda.');
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
      navigate(`/${currentRole}`);
    } else {
      setErrorMessage(res.error || 'Gagal memperbarui kata sandi.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4 sm:p-6">
      <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xl space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 flex items-center justify-center mx-auto mb-2">
            <KeyRound className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Perbarui Kata Sandi
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-sm mx-auto">
            {user?.mustChangePassword
              ? 'Akun Anda menggunakan kata sandi sementara. Demi keamanan, Anda wajib membuat kata sandi baru sebelum dapat melanjutkan.'
              : 'Ganti kata sandi akun Anda secara berkala untuk menjaga kerahasiaan data akademik.'}
          </p>
        </div>

        {/* Informasi Akun */}
        <div className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs">
          <div>
            <p className="font-semibold text-slate-800 dark:text-slate-200">{user?.nama}</p>
            <p className="text-[11px] text-slate-500">Nomor Induk: {user?.identifier}</p>
          </div>
          <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            {currentRole}
          </span>
        </div>

        {/* Pesan Kesalahan */}
        {errorMessage && (
          <div className="p-3 rounded-lg border border-rose-200 bg-rose-50 dark:bg-rose-950/40 dark:border-rose-800 text-rose-800 dark:text-rose-300 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
            <span className="leading-relaxed">{errorMessage}</span>
          </div>
        )}

        {/* Form Ganti Sandi */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Input
              label="Kata Sandi Baru"
              type={showPassword ? 'text' : 'password'}
              placeholder="Minimal 8 karakter unik"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              rightIcon={
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
                  aria-label={showPassword ? 'Sembunyikan sandi' : 'Tampilkan sandi'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              }
            />

            {/* Indikator Kekuatan Sandi */}
            {newPassword.length > 0 && (
              <div className="mt-2 space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-500">Kekuatan Sandi:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{strength.label}</span>
                </div>
                <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${strength.color}`}
                    style={{ width: `${(passedCriteriaCount / 5) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          <Input
            label="Konfirmasi Kata Sandi Baru"
            type={showPassword ? 'text' : 'password'}
            placeholder="Ketik ulang kata sandi baru"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />

          {/* Checklist Kebijakan Sandi */}
          <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg text-xs space-y-1.5 text-slate-600 dark:text-slate-400">
            <p className="font-semibold text-slate-700 dark:text-slate-300 text-[11px]">Syarat Kata Sandi:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[11px]">
              <div className="flex items-center gap-1.5">
                {hasMinLength ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <X className="w-3.5 h-3.5 text-slate-400" />}
                <span>Minimal 8 karakter</span>
              </div>
              <div className="flex items-center gap-1.5">
                {hasUpperCase ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <X className="w-3.5 h-3.5 text-slate-400" />}
                <span>Huruf besar (A-Z)</span>
              </div>
              <div className="flex items-center gap-1.5">
                {hasLowerCase ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <X className="w-3.5 h-3.5 text-slate-400" />}
                <span>Huruf kecil (a-z)</span>
              </div>
              <div className="flex items-center gap-1.5">
                {isNotIdentifier ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <X className="w-3.5 h-3.5 text-rose-500" />}
                <span>Bukan NISN/NIP</span>
              </div>
            </div>
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full"
            isLoading={isSubmitting}
            leftIcon={<ShieldCheck className="w-4 h-4" />}
          >
            Simpan Kata Sandi Baru
          </Button>
        </form>

        <div className="pt-2 text-center">
          <button
            type="button"
            onClick={async () => {
              await logout();
              navigate('/login');
            }}
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Batalkan dan Keluar</span>
          </button>
        </div>
      </div>
    </div>
  );
}
