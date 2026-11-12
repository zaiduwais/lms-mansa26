/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Search,
  Filter,
  Calendar,
  User,
  Activity,
  AlertTriangle,
  CheckCircle,
  KeyRound,
  Settings,
  UserPlus,
  RefreshCw,
} from 'lucide-react';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { AuditLogItem, TableColumn, AuditActionType } from '../../types';
import { PageHeader } from '../../components/layout/PageHeader';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button, DataTable, Badge, Select } from '../../components/ui';
import { formatDateIndo, formatTimeIndo } from '../../lib/utils';
import { useToast } from '../../components/ui/Toast';

export function AdminAuditLogPage() {
  const { addToast } = useToast();
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Dengarkan live update koleksi auditLogs dari Firestore
  useEffect(() => {
    setIsLoading(true);
    const q = query(collection(db, 'auditLogs'), limit(150));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const logList: AuditLogItem[] = [];
        snapshot.forEach((docSnap) => {
          const d = docSnap.data();
          logList.push({
            id: docSnap.id,
            aksi: d.aksi,
            aktorUid: d.aktorUid || '',
            aktorNama: d.aktorNama || 'Sistem',
            targetId: d.targetId || '',
            targetTipe: d.targetTipe || 'auth',
            ringkasan: d.ringkasan || '',
            waktu: d.waktu || '',
            userAgent: d.userAgent || '',
          });
        });

        // Urutkan waktu terbaru di atas
        logList.sort((a, b) => {
          const timeA = typeof a.waktu === 'string' ? a.waktu : '';
          const timeB = typeof b.waktu === 'string' ? b.waktu : '';
          return timeB.localeCompare(timeA);
        });

        setLogs(logList);
        setIsLoading(false);
      },
      (error) => {
        console.error('Gagal memuat log audit Firestore:', error);
        setIsLoading(false);
        addToast({
          title: 'Kendala Memuat Audit Log',
          description: 'Hanya Administrator yang memiliki hak baca koleksi auditLogs.',
          type: 'danger',
        });
      }
    );

    return () => unsubscribe();
  }, [addToast]);

  // Filter logs berdasarkan aksi dan teks pencarian
  const filteredLogs = logs.filter((log) => {
    if (actionFilter !== 'all' && log.aksi !== actionFilter) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        log.ringkasan.toLowerCase().includes(q) ||
        log.aktorNama.toLowerCase().includes(q) ||
        log.targetId.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const getActionBadge = (aksi: AuditActionType) => {
    switch (aksi) {
      case 'login_success':
        return (
          <Badge variant="emerald" size="sm">
            <CheckCircle className="w-3 h-3 text-emerald-600" />
            Login Berhasil
          </Badge>
        );
      case 'login_failed':
        return (
          <Badge variant="danger" size="sm">
            <AlertTriangle className="w-3 h-3 text-rose-600" />
            Login Gagal
          </Badge>
        );
      case 'create_user':
        return (
          <Badge variant="emerald" size="sm">
            <UserPlus className="w-3 h-3" />
            Buat Akun
          </Badge>
        );
      case 'reset_password':
      case 'change_password':
        return (
          <Badge variant="gold" size="sm">
            <KeyRound className="w-3 h-3 text-amber-600" />
            Sandi Akun
          </Badge>
        );
      case 'toggle_user_status':
        return (
          <Badge variant="slate" size="sm">
            <Activity className="w-3 h-3" />
            Status Akun
          </Badge>
        );
      case 'update_settings':
        return (
          <Badge variant="info" size="sm">
            <Settings className="w-3 h-3" />
            Pengaturan
          </Badge>
        );
      default:
        return (
          <Badge variant="slate" size="sm">
            {aksi}
          </Badge>
        );
    }
  };

  const formatTimestamp = (waktu: unknown) => {
    if (!waktu) return '-';
    let dateObj: Date;
    if (typeof waktu === 'string') {
      dateObj = new Date(waktu);
    } else if (typeof waktu === 'object' && waktu !== null && 'seconds' in waktu) {
      dateObj = new Date((waktu as { seconds: number }).seconds * 1000);
    } else {
      return '-';
    }

    if (isNaN(dateObj.getTime())) return '-';
    return `${formatDateIndo(dateObj)}, ${formatTimeIndo(dateObj)} WIB`;
  };

  const columns: TableColumn<AuditLogItem>[] = [
    {
      key: 'waktu',
      header: 'Waktu Kejadian',
      width: '180px',
      render: (item) => (
        <span className="text-[11px] font-mono text-slate-600 dark:text-slate-400">
          {formatTimestamp(item.waktu)}
        </span>
      ),
    },
    {
      key: 'aksi',
      header: 'Aktivitas',
      width: '140px',
      render: (item) => getActionBadge(item.aksi),
    },
    {
      key: 'ringkasan',
      header: 'Uraian Catatan Aktivitas',
      render: (item) => (
        <div>
          <p className="font-medium text-slate-800 dark:text-slate-200">{item.ringkasan}</p>
          <p className="text-[10px] text-slate-400 font-mono mt-0.5">Target: {item.targetId}</p>
        </div>
      ),
    },
    {
      key: 'aktorNama',
      header: 'Pelaku (Aktor)',
      width: '160px',
      render: (item) => (
        <div className="flex items-center gap-1.5">
          <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span className="truncate text-xs font-medium text-slate-700 dark:text-slate-300">
            {item.aktorNama}
          </span>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Keamanan & Kepatuhan"
        title="Log Audit Aktivitas Sistem"
        subtitle="Rekam jejak seluruh transaksi otentikasi, pembuatan akun, pergantian sandi, dan perubahan pengaturan lembaga (Append-Only)."
      />

      {/* Filter Toolbar */}
      <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shadow-2xs">
        <div className="flex-1 max-w-sm relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari uraian, aktor, atau target..."
            className="w-full h-9 pl-9 pr-3 text-xs bg-slate-50 dark:bg-slate-800/80 rounded-lg border border-slate-200 dark:border-slate-700 focus:outline-none focus:border-emerald-600"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 shrink-0">Filter Aksi:</span>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="h-9 px-3 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-emerald-600 cursor-pointer"
          >
            <option value="all">Semua Aktivitas</option>
            <option value="login_success">Login Berhasil</option>
            <option value="login_failed">Login Gagal</option>
            <option value="create_user">Pembuatan Akun</option>
            <option value="reset_password">Reset Sandi</option>
            <option value="change_password">Ganti Sandi</option>
            <option value="toggle_user_status">Perubahan Status Akun</option>
            <option value="update_settings">Pembaruan Pengaturan</option>
          </select>
        </div>
      </div>

      {/* Tabel Data Audit Log */}
      <DataTable
        columns={columns}
        data={filteredLogs}
        keyExtractor={(item) => item.id || Math.random().toString()}
        isLoading={isLoading}
        searchable={false}
        itemsPerPage={15}
        emptyTitle="Belum Ada Log Tercatat"
        emptyDescription="Aktivitas seperti login, pembuatan akun, dan reset sandi akan otomatis terekam secara permanen di sini."
      />

      <div className="p-3 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 flex items-center justify-between">
        <span>* Koleksi <code>auditLogs</code> dilindungi oleh Firestore Security Rules dan bersifat tidak dapat diubah (immutable/append-only).</span>
        <span className="font-mono text-emerald-700 dark:text-emerald-400">Total: {filteredLogs.length} catatan</span>
      </div>
    </div>
  );
}
