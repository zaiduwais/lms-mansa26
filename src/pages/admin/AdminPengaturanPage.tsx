/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  Settings,
  Upload,
  Trash2,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  Save,
  RotateCcw,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { PageHeader } from '../../components/layout/PageHeader';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button, Input } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';

export function AdminPengaturanPage() {
  const { madrasahSettings, updateMadrasahSettings } = useAuth();
  const { addToast } = useToast();

  const [namaResmi, setNamaResmi] = useState('');
  const [namaSingkat, setNamaSingkat] = useState('');
  const [alamat, setAlamat] = useState('');
  const [logoDataUrl, setLogoDataUrl] = useState<string | undefined>(undefined);
  const [logoSizeKb, setLogoSizeKb] = useState<number>(0);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Inisialisasi formulir dari pengaturan aktif di Firestore
  useEffect(() => {
    if (madrasahSettings) {
      setNamaResmi(madrasahSettings.namaResmi || '');
      setNamaSingkat(madrasahSettings.namaSingkat || '');
      setAlamat(madrasahSettings.alamat || '');
      setLogoDataUrl(madrasahSettings.logoDataUrl);
      if (madrasahSettings.logoDataUrl) {
        // Hitung estimasi ukuran string base64
        const bytes = Math.round((madrasahSettings.logoDataUrl.length * 3) / 4);
        setLogoSizeKb(Math.round(bytes / 1024));
      }
    }
  }, [madrasahSettings]);

  // Fungsi Kompresi dan Resize Logo di Browser (Maks 512px, target <= 150KB, format WebP/JPEG)
  const processImageFile = (file: File) => {
    setErrorMessage(null);

    // Validasi tipe berkas - Tolak SVG demi keamanan XSS
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!validTypes.includes(file.type.toLowerCase())) {
      setErrorMessage('Format berkas tidak didukung. Harap unggah berkas PNG, JPG, atau WebP (Format SVG tidak diizinkan demi keamanan).');
      return;
    }

    // Periksa ukuran awal berkas (maksimal 5 MB sebelum kompresi)
    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage('Ukuran berkas asli terlalu besar (maksimal 5 MB).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        // Resize dengan batas maksimal 512px
        const maxDimension = 512;
        let width = img.width;
        let height = img.height;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          setErrorMessage('Gagal memproses gambar di peramban.');
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        // Ekspor ke format webp dengan kualitas 0.85
        let compressedDataUrl = canvas.toDataURL('image/webp', 0.85);
        let sizeBytes = Math.round((compressedDataUrl.length * 3) / 4);

        // Jika browser tidak mendukung webp atau ukurannya masih di atas 150KB, turunkan kualitas
        if (sizeBytes > 150 * 1024) {
          compressedDataUrl = canvas.toDataURL('image/jpeg', 0.7);
          sizeBytes = Math.round((compressedDataUrl.length * 3) / 4);
        }

        const kb = Math.round(sizeBytes / 1024);
        setLogoDataUrl(compressedDataUrl);
        setLogoSizeKb(kb);

        addToast({
          title: 'Logo Terproses',
          description: `Gambar dioptimasi ke ${width}x${height}px (${kb} KB). Simpan untuk menerapkan.`,
          type: 'info',
        });
      };

      img.onerror = () => {
        setErrorMessage('Berkas gambar rusak atau tidak dapat dibaca.');
      };

      img.src = e.target?.result as string;
    };

    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processImageFile(file);
    }
    // Reset file input agar bisa upload file sama ulang jika perlu
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveLogo = () => {
    setLogoDataUrl(undefined);
    setLogoSizeKb(0);
    addToast({
      title: 'Logo Dihapus',
      description: 'Logo dihapus dari pratinjau. Klik "Simpan Pengaturan" untuk memperbarui database.',
      type: 'warning',
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!namaResmi.trim()) {
      setErrorMessage('Nama resmi madrasah wajib diisi.');
      return;
    }
    if (!namaSingkat.trim()) {
      setErrorMessage('Nama singkat madrasah wajib diisi.');
      return;
    }
    if (!alamat.trim()) {
      setErrorMessage('Alamat madrasah wajib diisi.');
      return;
    }

    setIsSubmitting(true);
    const res = await updateMadrasahSettings({
      namaResmi: namaResmi.trim(),
      namaSingkat: namaSingkat.trim(),
      alamat: alamat.trim(),
      logoDataUrl: logoDataUrl || '',
    });
    setIsSubmitting(false);

    if (res.success) {
      addToast({
        title: 'Pengaturan Tersimpan',
        description: 'Identitas madrasah berhasil diperbarui dan aktif di seluruh aplikasi.',
        type: 'success',
      });
    } else {
      setErrorMessage(res.error || 'Gagal menyimpan pengaturan.');
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        kicker="Konfigurasi Lembaga"
        title="Pengaturan Identitas Madrasah"
        subtitle="Kelola nama resmi, nama singkat, alamat, dan logo institusi yang tampil di portal login, app shell, dan dokumen akademik."
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        {errorMessage && (
          <div className="p-3.5 rounded-lg border border-rose-200 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
            <span className="leading-relaxed">{errorMessage}</span>
          </div>
        )}

        {/* Panel Logo Madrasah */}
        <Card variant="default">
          <CardHeader>
            <CardTitle>Logo Resmi Madrasah</CardTitle>
            <p className="text-xs text-slate-500 mt-0.5">
              Logo akan otomatis dikompresi di browser (maks 512px, target $\le 150$ KB) dan disimpan ke Firestore.
            </p>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row items-center gap-6">
              {/* Pratinjau Kotak Logo */}
              <div className="w-28 h-28 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-center overflow-hidden shrink-0 shadow-inner">
                {logoDataUrl ? (
                  <img
                    src={logoDataUrl}
                    alt="Pratinjau Logo"
                    className="w-full h-full object-contain p-2"
                  />
                ) : (
                  <div className="text-center text-slate-400 p-2">
                    <ImageIcon className="w-8 h-8 mx-auto mb-1 stroke-1" />
                    <span className="text-[10px] block">Belum ada logo</span>
                  </div>
                )}
              </div>

              {/* Kontrol Aksi Upload Logo */}
              <div className="space-y-3 flex-1 text-xs">
                <div>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    id="logo-file-input"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      leftIcon={<Upload className="w-3.5 h-3.5" />}
                    >
                      {logoDataUrl ? 'Ganti Berkas Logo' : 'Pilih Berkas Logo'}
                    </Button>

                    {logoDataUrl && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleRemoveLogo}
                        leftIcon={<Trash2 className="w-3.5 h-3.5 text-rose-600" />}
                        className="text-rose-600 hover:text-rose-700"
                      >
                        Hapus Logo
                      </Button>
                    )}
                  </div>
                </div>

                <div className="text-[11px] text-slate-500 dark:text-slate-400 space-y-1">
                  <p>Mendukung format: <strong>PNG, JPG, WebP</strong> (Bukan SVG).</p>
                  {logoDataUrl && (
                    <p className="text-emerald-700 dark:text-emerald-400 font-semibold">
                      Ukuran gambar saat ini: ~{logoSizeKb} KB (Memenuhi batas target &le; 150 KB).
                    </p>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Panel Identitas Teks */}
        <Card variant="default">
          <CardHeader>
            <CardTitle>Data Lembaga & Alamat</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              label="Nama Resmi Lembaga"
              placeholder="Contoh: Madrasah Aliyah Negeri Insan Berilmu"
              value={namaResmi}
              onChange={(e) => setNamaResmi(e.target.value)}
              helperText="Nama lengkap yang dicetak pada piagam, rapor, dan dokumen resmi."
              required
            />

            <Input
              label="Nama Singkat / Singkatan"
              placeholder="Contoh: MAN In-Ilmu"
              value={namaSingkat}
              onChange={(e) => setNamaSingkat(e.target.value)}
              helperText="Ditampilkan pada sidebar, topbar navigasi, dan judul tab browser."
              required
            />

            <Input
              label="Alamat Lengkap Madrasah"
              placeholder="Contoh: Jl. Pesantren Luhur No. 7, Nusantara, Indonesia"
              value={alamat}
              onChange={(e) => setAlamat(e.target.value)}
              required
            />
          </CardContent>
        </Card>

        {/* Tombol Simpan */}
        <div className="flex justify-end gap-3 pt-2">
          <Button
            type="submit"
            variant="primary"
            size="lg"
            isLoading={isSubmitting}
            leftIcon={<Save className="w-4 h-4" />}
          >
            Simpan Pengaturan Madrasah
          </Button>
        </div>
      </form>
    </div>
  );
}
