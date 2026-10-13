'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  User,
  Building2,
  MapPin,
  Clock,
  Phone,
  Mail,
  Calendar,
  ShieldCheck,
  QrCode,
  ScanFace,
  FileText,
  ExternalLink,
  Copy,
  Check,
  Briefcase,
  Layers,
  Award,
  Hash,
} from 'lucide-react';
import { EmployeeDrawerWrapper } from './EmployeeDrawerWrapper';
import toast from 'react-hot-toast';

interface EmployeeQuickDetailsDrawerProps {
  open: boolean;
  onClose: () => void;
  employee: any | null;
  onOpenQrPass?: (employee: any) => void;
  triggerRef?: React.RefObject<HTMLElement | null>;
}

export function EmployeeQuickDetailsDrawer({
  open,
  onClose,
  employee,
  onOpenQrPass,
  triggerRef,
}: EmployeeQuickDetailsDrawerProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  if (!employee) return null;

  const handleCopy = (text: string, label: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(label);
    toast.success(`Copied ${label} to clipboard`);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const fullName =
    employee.fullName ||
    [employee.firstName, employee.lastName].filter(Boolean).join(' ') ||
    'Staff Member';

  const initials = fullName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w: string) => w[0].toUpperCase())
    .join('');

  const locationName =
    employee.location?.name || employee.locationName || 'Unassigned Hub';
  const locationCode =
    employee.location?.code || employee.locationCode || 'HUB';
  const departmentName =
    employee.department?.name || employee.departmentName || 'General Staff';
  const floorName =
    employee.floor?.name ||
    (employee.floor?.floorNumber !== undefined
      ? `Floor ${employee.floor.floorNumber}`
      : 'Main Floor');
  const sectionName = employee.section?.name || 'Store Wide';

  const shiftName =
    employee.shift?.name || employee.shiftName || 'Standard Roster';
  const shiftTimes =
    employee.shift?.startTime && employee.shift?.endTime
      ? `${new Date(employee.shift.startTime).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        })} - ${new Date(employee.shift.endTime).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        })}`
      : employee.batch || 'Regular Schedule';

  const joiningFormatted = employee.joiningDate
    ? new Date(employee.joiningDate).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : 'Not Specified';

  const hasFaceProfile = Boolean(
    employee.faceProfileId || employee.faceProfile || employee.faceVerified
  );
  const hasQrPass = Boolean(
    employee.qrCodeId || employee.qrCode || employee.dailyQRCodeId
  );

  return (
    <EmployeeDrawerWrapper
      open={open}
      onClose={onClose}
      title="Staff Member Profile Details"
      subtitle={`Quick record inspection for ${fullName} (${employee.employeeCode || '—'})`}
      filterSummary={`${locationName} • ${departmentName}`}
      triggerRef={triggerRef}
      footerAction={
        <div className="flex items-center justify-between w-full gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 active:bg-slate-300 rounded-xl border border-slate-200/80 dark:border-slate-700 transition-all cursor-pointer"
          >
            Close
          </button>
          <Link
            href={`/employees/profile/${employee.id}`}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#1346a1] hover:bg-[#0e3882] active:bg-[#0b2b63] rounded-xl shadow-xs transition-all cursor-pointer"
          >
            <span>Open Full 360° Dossier</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>
      }
    >
      <div className="space-y-6 pb-6">
        {/* HERO CARD */}
        <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-[#1346a1]/80 text-white shadow-sm border border-slate-700/50">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-[#1346a1] to-blue-400 text-white flex items-center justify-center font-bold text-xl shadow-md border-2 border-white/20 shrink-0">
              {initials || <User className="w-8 h-8" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-lg font-bold truncate text-white">
                  {fullName}
                </h3>
                <span
                  className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full tracking-wider ${
                    employee.status === 'ACTIVE'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  }`}
                >
                  {employee.status || 'ACTIVE'}
                </span>
              </div>
              <div className="text-xs text-slate-300 font-mono mt-0.5 flex items-center gap-2">
                <span>Code: #{employee.employeeCode || '—'}</span>
                <span>•</span>
                <span className="text-blue-200 font-sans">
                  {employee.designation || 'Staff Associate'}
                </span>
              </div>
              <div className="mt-2 text-xs text-slate-300 flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-white/10 text-slate-200 font-semibold text-[11px]">
                  {employee.role?.replace(/_/g, ' ') || 'EMPLOYEE'}
                </span>
                <span className="text-slate-400">•</span>
                <span className="text-slate-300 text-[11px]">
                  Joined {joiningFormatted}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ORGANIZATIONAL ASSIGNMENT */}
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-[#1346a1] dark:text-blue-400" />
              Store & Operational Assignment
            </h4>
            <span className="text-[10px] font-mono px-1.5 py-0.5 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-300/60 dark:border-slate-700 rounded font-bold">
              {locationCode}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-2.5 rounded-lg bg-white dark:bg-slate-800/70 border border-slate-200/60 dark:border-slate-700/60">
              <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-400 uppercase block">
                Store Hub
              </span>
              <span className="font-bold text-slate-800 dark:text-white mt-0.5 block truncate">
                {locationName}
              </span>
            </div>

            <div className="p-2.5 rounded-lg bg-white dark:bg-slate-800/70 border border-slate-200/60 dark:border-slate-700/60">
              <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-400 uppercase block">
                Department
              </span>
              <span className="font-bold text-slate-800 dark:text-white mt-0.5 block truncate">
                {departmentName}
              </span>
            </div>

            <div className="p-2.5 rounded-lg bg-white dark:bg-slate-800/70 border border-slate-200/60 dark:border-slate-700/60">
              <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-400 uppercase block">
                Floor & Section
              </span>
              <span className="font-bold text-slate-800 dark:text-white mt-0.5 block truncate">
                {floorName} • {sectionName}
              </span>
            </div>

            <div className="p-2.5 rounded-lg bg-white dark:bg-slate-800/70 border border-slate-200/60 dark:border-slate-700/60">
              <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-400 uppercase block">
                Shift Schedule
              </span>
              <span className="font-bold text-slate-800 dark:text-white mt-0.5 block truncate">
                {shiftName}
              </span>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 block truncate font-mono">
                {shiftTimes}
              </span>
            </div>
          </div>
        </div>

        {/* BIOMETRIC & PASS STATUS */}
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 space-y-3">
          <h4 className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            Biometric Enrolment & Digital Passes
          </h4>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-lg bg-white dark:bg-slate-800/70 border border-slate-200/60 dark:border-slate-700/60 flex items-center gap-2.5">
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                  hasFaceProfile
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400'
                    : 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400'
                }`}
              >
                <ScanFace className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] text-slate-400 dark:text-slate-400 uppercase font-semibold block">
                  Face Biometric
                </span>
                <span
                  className={`text-xs font-bold ${
                    hasFaceProfile ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'
                  }`}
                >
                  {hasFaceProfile ? 'Verified & Enrolled' : 'Pending Enrollment'}
                </span>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-white dark:bg-slate-800/70 border border-slate-200/60 dark:border-slate-700/60 flex items-center gap-2.5">
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                  hasQrPass
                    ? 'bg-blue-50 dark:bg-blue-950/40 text-[#1346a1] dark:text-blue-400'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                }`}
              >
                <QrCode className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[10px] text-slate-400 dark:text-slate-400 uppercase font-semibold block">
                  Digital QR Pass
                </span>
                <span className="text-xs font-bold text-slate-800 dark:text-white">
                  {hasQrPass ? 'Active Pass' : 'Not Generated'}
                </span>
              </div>
            </div>
          </div>

          {onOpenQrPass && (
            <button
              type="button"
              onClick={() => onOpenQrPass(employee)}
              className="w-full mt-1 inline-flex items-center justify-center gap-2 py-2 px-3 bg-[#eff4ff] dark:bg-blue-950/40 hover:bg-[#dce9ff] dark:hover:bg-blue-900/50 text-[#1346a1] dark:text-blue-300 text-xs font-bold rounded-lg border border-[#dce9ff] dark:border-blue-800/60 transition-all cursor-pointer shadow-2xs active:scale-98"
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>Launch One-Time QR Pass Scanner</span>
            </button>
          )}
        </div>

        {/* COMMUNICATION & CONTACT */}
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 space-y-3">
          <h4 className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
            <Phone className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            Contact & Channels
          </h4>

          <div className="space-y-2 text-xs">
            <div className="p-2.5 rounded-lg bg-white dark:bg-slate-800/70 border border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Phone className="w-3.5 h-3.5 text-slate-400 dark:text-slate-400 shrink-0" />
                <span className="font-mono text-slate-800 dark:text-white font-semibold truncate">
                  {employee.phone || 'Phone not registered'}
                </span>
              </div>
              {employee.phone && (
                <button
                  type="button"
                  onClick={() => handleCopy(employee.phone, 'Phone')}
                  className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-500 dark:text-slate-400 transition-colors cursor-pointer"
                  title="Copy Phone"
                >
                  {copiedField === 'Phone' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              )}
            </div>

            <div className="p-2.5 rounded-lg bg-white dark:bg-slate-800/70 border border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Mail className="w-3.5 h-3.5 text-slate-400 dark:text-slate-400 shrink-0" />
                <span className="text-slate-800 dark:text-white font-medium truncate">
                  {employee.email || 'Email not registered'}
                </span>
              </div>
              {employee.email && (
                <button
                  type="button"
                  onClick={() => handleCopy(employee.email, 'Email')}
                  className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-500 dark:text-slate-400 transition-colors cursor-pointer"
                  title="Copy Email"
                >
                  {copiedField === 'Email' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* STATUTORY & PAYROLL IDENTIFIERS */}
        {(employee.pfNo || employee.esiNo || employee.uanNo || employee.salesmanNo) && (
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 space-y-3">
            <h4 className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <Hash className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              Statutory & Salesman Identifiers
            </h4>

            <div className="grid grid-cols-2 gap-2 text-xs">
              {employee.pfNo && (
                <div className="p-2 bg-white dark:bg-slate-800/70 rounded-lg border border-slate-200/60 dark:border-slate-700/60">
                  <span className="text-[10px] text-slate-400 dark:text-slate-400 font-semibold block">
                    PF Account
                  </span>
                  <span className="font-mono font-bold text-slate-800 dark:text-white">
                    {employee.pfNo}
                  </span>
                </div>
              )}
              {employee.esiNo && (
                <div className="p-2 bg-white dark:bg-slate-800/70 rounded-lg border border-slate-200/60 dark:border-slate-700/60">
                  <span className="text-[10px] text-slate-400 dark:text-slate-400 font-semibold block">
                    ESI Number
                  </span>
                  <span className="font-mono font-bold text-slate-800 dark:text-white">
                    {employee.esiNo}
                  </span>
                </div>
              )}
              {employee.uanNo && (
                <div className="p-2 bg-white dark:bg-slate-800/70 rounded-lg border border-slate-200/60 dark:border-slate-700/60">
                  <span className="text-[10px] text-slate-400 dark:text-slate-400 font-semibold block">
                    UAN Number
                  </span>
                  <span className="font-mono font-bold text-slate-800 dark:text-white">
                    {employee.uanNo}
                  </span>
                </div>
              )}
              {employee.salesmanNo && (
                <div className="p-2 bg-white dark:bg-slate-800/70 rounded-lg border border-slate-200/60 dark:border-slate-700/60">
                  <span className="text-[10px] text-slate-400 dark:text-slate-400 font-semibold block">
                    Salesman #
                  </span>
                  <span className="font-mono font-bold text-slate-800 dark:text-white">
                    {employee.salesmanNo}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* NAVIGATION SHORTCUTS */}
        <div className="pt-2 flex items-center justify-between text-xs gap-3">
          <Link
            href={`/employees/documents?employeeId=${employee.id}`}
            className="flex-1 text-center py-2 px-3 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold transition-colors border border-slate-200/70 dark:border-slate-700"
          >
            Inspect Documents
          </Link>
          <Link
            href={`/payroll/payslips?employeeCode=${employee.employeeCode}`}
            className="flex-1 text-center py-2 px-3 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold transition-colors border border-slate-200/70 dark:border-slate-700"
          >
            Payroll Payslips
          </Link>
        </div>
      </div>
    </EmployeeDrawerWrapper>
  );
}
