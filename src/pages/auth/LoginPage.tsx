/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookMarked,
  Eye,
  EyeOff,
  LogIn,
  HeartHandshake,
  Sparkles,
  HelpCircle,
  AlertCircle,
  ShieldCheck,
  Copy,
  Check,
  ExternalLink,
  RotateCcw,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Button, Input, Modal } from '../../components/ui';
import { api } from '../../lib/api';

export function LoginPage() {
  const { login, loginWithGoogle, madrasahSettings, user, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [nomorInduk, setNomorInduk] = useState('');
  const [kataSandi, setKataSandi] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);

  // Bootstrap status: 'loading' | 'needed' | 'ready' | 'error'
  const [bootstrapState, setBootstrapState] = useState<'loading' | 'needed' | 'ready' | 'error'>('loading');
  const [isCheckingBootstrap, setIsCheckingBootstrap] = useState(false);
  const [isBootstrapModalOpen, setIsBootstrapModalOpen] = useState(false);
  const [bootstrapLoading, setBootstrapLoading] = useState(false);
  const [bootstrapResult, setBootstrapResult] = useState<{
    identifier: string;
    temporaryPassword?: string;
    nama: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // Periksa apakah sistem membutuhkan inisialisasi administrator awal
  const loadBootstrapStatus = async () => {
    setIsCheckingBootstrap(true);
    try {
      const res = await api.getBootstrapStatus();
      if (res.success && res.data) {
        if (res.data.needsBootstrap === true) {
          setBootstrapState('needed');
        } else {
          setBootstrapState('ready');
        }
      } else {
        setBootstrapState('error');
      }
    } catch {
      setBootstrapState('error');
    } finally {
      setIsCheckingBootstrap(false);
    }
  };

  useEffect(() => {
    loadBootstrapStatus();
  }, []);

  // Jika sudah terotentikasi, alihkan ke dashboard peran aktif
  useEffect(() => {
    if (isAuthenticated && user) {
      if (user.mustChangePassword) {
        navigate('/ganti-sandi');
      } else {
        const defaultRole = user.roles[0] || 'siswa';
        navigate(`/${defaultRole}`);
      }
    }
  }, [isAuthenticated, user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanId = nomorInduk.trim();
    if (!cleanId) {
      setErrorMessage('Nomor NISN / NIP wajib diisi.');
      return;
    }
    if (!kataSandi) {
      setErrorMessage('Kata sandi akun wajib diisi.');
      return;
    }

    setIsSubmitting(true);
    const res = await login(cleanId, kataSandi);
    setIsSubmitting(false);

    if (!res.success) {
      setErrorMessage(res.error || 'NISN/NIP atau kata sandi salah.');
    }
  };

  const handleGoogleLogin = async () => {
    setErrorMessage(null);
    setIsGoogleSubmitting(true);
    const res = await loginWithGoogle();
    setIsGoogleSubmitting(false);

    if (!res.success) {
      setErrorMessage(res.error || 'Gagal masuk dengan akun Google.');
    }
  };

  const handleRunBootstrap = async () => {
    setBootstrapLoading(true);
    const res = await api.bootstrapAdmin();
    setBootstrapLoading(false);

    if (res.success && res.data) {
      setBootstrapResult(res.data);
      setBootstrapState('ready');
      setNomorInduk(res.data.identifier);
      if (res.data.temporaryPassword) {
        setKataSandi(res.data.temporaryPassword);
      }
    } else {
      setIsBootstrapModalOpen(false);
      setErrorMessage(
        res.error ||
          'Inisialisasi admin server memerlukan Service Account. Sebagai pemilik proyek, Anda dapat langsung menekan tombol "Masuk dengan Akun Google (Pemilik / Super Admin)" untuk inisialisasi administrator instan.'
      );
    }
  };

  const handleCopyCredentials = () => {
    if (!bootstrapResult) return;
    const text = `Kredensial Administrator LMS Madrasah:\nNIP/ID: ${bootstrapResult.identifier}\nSandi: ${bootstrapResult.temporaryPassword || ''}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const namaMadrasah = madrasahSettings.namaResmi || 'Madrasah Aliyah Negeri Insan Berilmu';
  const namaSingkat = madrasahSettings.namaSingkat || 'MAN In-Ilmu';
  const logoUrl = madrasahSettings.logoDataUrl;

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-slate-50 dark:bg-slate-950">
      {/* Kolom Kiri: Panel Identitas Madrasah (KBC) */}
      <div className="lg:w-1/2 bg-gradient-to-br from-emerald-900 via-teal-950 to-slate-900 text-white p-8 sm:p-12 lg:p-16 flex flex-col justify-between relative overflow-hidden">
        <div className="absolute inset-0 opacity-5 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />

        {/* Header Madrasah */}
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-white/10 backdrop-blur-xs border border-white/20 flex items-center justify-center text-emerald-300 shadow-inner overflow-hidden">
              {logoUrl ? (
                <img src={logoUrl} alt={namaSingkat} className="w-full h-full object-cover" />
              ) : (
                <BookMarked className="w-6 h-6" />
              )}
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-wide uppercase text-emerald-300">
                LMS Madrasah Aliyah
              </h2>
              <p className="text-xs text-slate-300 font-medium">{namaMadrasah}</p>
            </div>
          </div>
        </div>

        {/* Nilai Inti & Slogan KBC */}
        <div className="relative z-10 my-10 sm:my-16 space-y-6 max-w-lg">
          <div className="space-y-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30">
              <Sparkles className="w-3.5 h-3.5" />
              Kurikulum Berbasis Cinta (KBC)
            </span>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white leading-tight">
              Mendidik dengan Hati, Menumbuhkan Pembelajaran Mendalam.
            </h1>
          </div>

          {/* Ayat Al-Qur'an dengan Noto Naskh Arabic */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-5 backdrop-blur-xs">
            <p className="arabic-text text-amber-200/90 mb-2">
              يَرْفَعِ اللَّهُ الَّذِينَ آمَنُوا مِنكُمْ وَالَّذِينَ أُوتُوا الْعِلْمَ دَرَجَاتٍ
            </p>
            <p className="text-[11px] text-slate-300 italic">
              &quot;...niscaya Allah akan meninggikan orang-orang yang beriman di antaramu dan orang-orang yang diberi ilmu pengetahuan beberapa derajat.&quot; (QS. Al-Mujadilah: 11)
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="flex items-start gap-2 text-slate-300">
              <HeartHandshake className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>Mahabbah (Cinta Ilmu & Sesama)</span>
            </div>
            <div className="flex items-start gap-2 text-slate-300">
              <HeartHandshake className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>Ta&apos;aruf & Pembelajaran Mendalam</span>
            </div>
            <div className="flex items-start gap-2 text-slate-300">
              <HeartHandshake className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>Tasamuh & Tawadhu (Adab Santri)</span>
            </div>
            <div className="flex items-start gap-2 text-slate-300">
              <HeartHandshake className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>Itqan (Kualitas & Kesungguhan)</span>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="relative z-10 text-xs text-slate-400 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-t border-white/10 pt-4">
          <span>{madrasahSettings.alamat || 'Nusantara, Indonesia'}</span>
          <span>Tahun Ajaran 2026/2027</span>
        </div>
      </div>

      {/* Kolom Kanan: Form Login */}
      <div className="lg:w-1/2 flex items-center justify-center p-6 sm:p-12 lg:p-16">
        <div className="w-full max-w-md space-y-6">
          {/* Logo Madrasah */}
          <div className="space-y-2">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-700 dark:text-emerald-400 mb-3 shadow-xs overflow-hidden">
              {logoUrl ? (
                <img src={logoUrl} alt={namaSingkat} className="w-full h-full object-cover" />
              ) : (
                <BookMarked className="w-7 h-7" />
              )}
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Masuk ke Portal LMS
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Masukkan NISN (Siswa) atau NIP (Guru/Admin) resmi madrasah.
            </p>
          </div>

          {/* Banner Notifikasi Bootstrap Awal: Hanya tampil jika needsBootstrap === true */}
          {bootstrapState === 'needed' && (
            <div className="p-4 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 space-y-2">
              <div className="flex items-center gap-2 font-semibold">
                <ShieldCheck className="w-4 h-4 text-amber-600" />
                <span>Inisialisasi Sistem Pertama Kali</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                Belum ada akun Administrator terdaftar di database. Silakan lakukan inisialisasi akun admin pertama untuk mulai mengelola madrasah.
              </p>
              <Button
                size="sm"
                variant="gold"
                onClick={() => setIsBootstrapModalOpen(true)}
                className="w-full mt-1"
              >
                Inisialisasi Admin Awal
              </Button>
            </div>
          )}

          {/* Banner Jika Status Sistem Gagal Dimuat */}
          {bootstrapState === 'error' && (
            <div className="p-3.5 rounded-xl border border-slate-300 bg-slate-100 dark:bg-slate-900 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 font-medium">
                  <AlertCircle className="w-4 h-4 text-slate-500 shrink-0" />
                  <span>Tidak dapat memeriksa status sistem</span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={loadBootstrapStatus}
                  isLoading={isCheckingBootstrap}
                  leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
                  className="h-7 text-xs shrink-0"
                >
                  Coba lagi
                </Button>
              </div>
            </div>
          )}

          {/* Pesan Kesalahan Terpadu */}
          {errorMessage && (
            <div className="space-y-3">
              <div className="p-3.5 rounded-lg border border-rose-200 bg-rose-50 dark:bg-rose-950/40 dark:border-rose-800 text-rose-800 dark:text-rose-300 text-xs flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                <div className="flex-1 leading-relaxed">{errorMessage}</div>
              </div>

              {(errorMessage.includes('Firebase Console') || errorMessage.includes('Email/Sandi')) && (
                <div className="p-3.5 rounded-xl border border-amber-300 bg-amber-50/90 dark:bg-amber-950/50 dark:border-amber-800 text-xs text-amber-950 dark:text-amber-200 space-y-2.5">
                  <div className="flex items-center gap-1.5 font-semibold text-amber-900 dark:text-amber-200">
                    <Sparkles className="w-4 h-4 text-amber-600" />
                    <span>Aktifkan Login Email/Password di Firebase Console:</span>
                  </div>
                  <ol className="list-decimal pl-4 space-y-1 text-[11px] leading-relaxed text-amber-900/90 dark:text-amber-300/90">
                    <li>Buka halaman Sign-in Provider Firebase Console proyek Anda</li>
                    <li>Pilih menu <strong>Email/Password</strong></li>
                    <li>Aktifkan toggle <strong>Enable</strong> lalu klik <strong>Save</strong></li>
                  </ol>
                  <a
                    href="https://console.firebase.google.com/project/copper-streamer-ql37k/authentication/providers"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-medium text-xs transition-colors shadow-xs"
                  >
                    <span>Buka Firebase Console Providers</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <p className="text-[10px] text-amber-800/80 dark:text-amber-400 italic">
                    Tips: Anda juga dapat langsung masuk menggunakan tombol Akun Google Pemilik di bawah ini tanpa konfigurasi awal.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Form Login */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="NISN / NIP"
              placeholder="Masukkan NISN (10 digit) atau NIP (18 digit)"
              value={nomorInduk}
              onChange={(e) => setNomorInduk(e.target.value)}
              required
              autoComplete="username"
            />

            <div>
              <Input
                label="Kata Sandi"
                type={showPassword ? 'text' : 'password'}
                placeholder="Masukkan kata sandi akun"
                value={kataSandi}
                onChange={(e) => setKataSandi(e.target.value)}
                required
                autoComplete="current-password"
                rightIcon={
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer p-1"
                    aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                }
              />
              <div className="flex justify-end mt-1.5">
                <button
                  type="button"
                  onClick={() => setIsHelpModalOpen(true)}
                  className="text-xs font-medium text-emerald-700 hover:text-emerald-800 dark:text-emerald-400 cursor-pointer"
                >
                  Lupa sandi? Hubungi admin
                </button>
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full"
              isLoading={isSubmitting}
              leftIcon={<LogIn className="w-4 h-4" />}
            >
              Masuk ke Aplikasi
            </Button>
          </form>

          {/* Pemisah Atau */}
          <div className="relative flex py-1 items-center">
            <div className="flex-grow border-t border-slate-200 dark:border-slate-800"></div>
            <span className="shrink mx-3 text-[11px] font-medium text-slate-400">Atau masuk langsung</span>
            <div className="flex-grow border-t border-slate-200 dark:border-slate-800"></div>
          </div>

          {/* Tombol Masuk dengan Google */}
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-200"
            isLoading={isGoogleSubmitting}
            onClick={handleGoogleLogin}
            leftIcon={
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
            }
          >
            Masuk dengan Akun Google (Pemilik / Super Admin)
          </Button>

          {/* Keterangan Kebijakan Keamanan */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 space-y-1">
            <p className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Otorisasi aman berbasis peran (RBAC) & Cloud Firestore.</span>
            </p>
            <p className="text-slate-400">
              * Akun baru wajib mengganti kata sandi sementara pada login pertama.
            </p>
          </div>
        </div>
      </div>

      {/* Modal Bantuan Lupa Sandi */}
      <Modal
        isOpen={isHelpModalOpen}
        onClose={() => setIsHelpModalOpen(false)}
        title="Bantuan Akun & Reset Kata Sandi"
        description="Layanan terpusat administrasi madrasah"
        footer={
          <Button variant="secondary" size="sm" onClick={() => setIsHelpModalOpen(false)}>
            Tutup
          </Button>
        }
      >
        <div className="space-y-4 text-xs text-slate-600 dark:text-slate-300">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <HelpCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-slate-800 dark:text-slate-200 mb-1">
                Prosedur Reset Kata Sandi
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Reset kata sandi dilakukan secara terverifikasi melalui Operator Madrasah. Setelah reset oleh admin, Anda akan diberikan sandi acak sementara dan wajib menggantinya saat masuk.
              </p>
            </div>
          </div>
          <div className="space-y-1">
            <p className="font-semibold text-slate-800 dark:text-slate-200">Kontak Resmi Admin:</p>
            <p className="font-mono text-emerald-800 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 p-2.5 rounded-lg border border-emerald-200 dark:border-emerald-800">
              admin@madrasah.sch.id / 0812-3456-7890
            </p>
          </div>
        </div>
      </Modal>

      {/* Modal Bootstrap Admin Awal */}
      <Modal
        isOpen={isBootstrapModalOpen}
        onClose={() => !bootstrapLoading && setIsBootstrapModalOpen(false)}
        title="Inisialisasi Administrator Awal"
        description="Membuat akun Administrator pertama madrasah"
        footer={
          bootstrapResult ? (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsBootstrapModalOpen(false)}
            >
              Lanjutkan Masuk
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsBootstrapModalOpen(false)}
                disabled={bootstrapLoading}
              >
                Batal
              </Button>
              <Button
                variant="gold"
                size="sm"
                onClick={handleRunBootstrap}
                isLoading={bootstrapLoading}
              >
                Jalankan Bootstrap
              </Button>
            </div>
          )
        }
      >
        <div className="space-y-4 text-xs text-slate-600 dark:text-slate-300">
          {!bootstrapResult ? (
            <div className="space-y-3">
              <p className="leading-relaxed">
                Jalur bootstrap ini membaca kredensial awal dari environment variables (atau default terkonfigurasi):
              </p>
              <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 font-mono text-[11px] space-y-1">
                <p>NIP/ID: 198005122005011002</p>
                <p>Nama: H. Ahmad Fauzi, M.Pd.</p>
                <p>Peran: Administrator Madrasah</p>
              </div>
              <p className="text-[11px] text-amber-700 dark:text-amber-400 font-medium">
                * Begitu admin pertama dibuat, endpoint bootstrap server akan otomatis mengunci dan menolak permintaan selanjutnya secara permanen.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/50 rounded-lg border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200">
                <p className="font-semibold mb-1">Inisialisasi Admin Berhasil!</p>
                <p className="text-[11px]">
                  Akun administrator telah siap. Simpan kredensial ini baik-baik:
                </p>
              </div>
              <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-lg space-y-1.5 font-mono text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">NIP/ID:</span>
                  <span className="font-bold text-slate-900 dark:text-slate-100">{bootstrapResult.identifier}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Kata Sandi:</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">{bootstrapResult.temporaryPassword}</span>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyCredentials}
                leftIcon={copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                className="w-full"
              >
                {copied ? 'Tersalin ke Clipboard' : 'Salin Kredensial Admin'}
              </Button>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
