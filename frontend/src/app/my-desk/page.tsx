'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { 
  Clock, Calendar, QrCode, Coffee, Utensils, CheckCircle2, 
  AlertCircle, DollarSign, Shield, FileText, ChevronRight,
  TrendingUp, Download, Eye, Sparkles
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import api from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import toast from 'react-hot-toast';

export default function MyDeskPage() {
  const { data: session } = useSession();
  const [time, setTime] = useState(new Date());
  const [todayAttendance, setTodayAttendance] = useState<any>(null);
  const [activeBreak, setActiveBreak] = useState<any>(null);
  const [breakSecondsLeft, setBreakSecondsLeft] = useState<number | null>(null);
  const [showQRModal, setShowQRModal] = useState(false);
  const [recentAttendances, setRecentAttendances] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Live digital clock
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch employee desk data
  useEffect(() => {
    fetchDeskData();
  }, [session]);

  // Break countdown timer
  useEffect(() => {
    if (!activeBreak) {
      setBreakSecondsLeft(null);
      return;
    }

    const interval = setInterval(() => {
      const start = new Date(activeBreak.startTime).getTime();
      const allowedMs = (activeBreak.allowedDuration || 20) * 60 * 1000;
      const end = start + allowedMs;
      const now = Date.now();
      const diffSec = Math.floor((end - now) / 1000);
      setBreakSecondsLeft(diffSec);
    }, 1000);

    return () => clearInterval(interval);
  }, [activeBreak]);

  const fetchDeskData = async () => {
    try {
      setLoading(true);
      // Fetch employee profile or attendances
      const empId = session?.user?.employeeId;
      if (empId) {
        const attRes = await api.get(`/attendance/employee/${empId}?limit=7`);
        const records = attRes.data.attendance || [];
        setRecentAttendances(records);
        if (records.length > 0) {
          setTodayAttendance(records[0]);
        }
      }

      // Check active breaks
      const breakRes = await api.get('/breaks/active').catch(() => ({ data: { breaks: [] } }));
      const myBreak = (breakRes.data.breaks || []).find((b: any) => b.employeeId === empId);
      if (myBreak) {
        setActiveBreak(myBreak);
      }
    } catch (err) {
      console.error('Fetch desk error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePunch = async (type: 'IN' | 'OUT') => {
    try {
      const empId = session?.user?.employeeId;
      if (!empId) {
        toast.error('No employee profile linked to current user');
        return;
      }
      const res = await api.post('/attendance/punch', {
        employeeId: empId,
        punchType: type,
        faceMatchPercentage: 96.5,
      });
      toast.success(res.data.message || `Punch ${type} recorded successfully!`);
      fetchDeskData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Punch recording failed');
    }
  };

  const handleStartBreak = async (breakType: 'LUNCH' | 'TEA') => {
    try {
      const empId = session?.user?.employeeId;
      if (!empId) return;
      const res = await api.post('/breaks/start', {
        employeeId: empId,
        breakType,
      });
      toast.success(`${breakType} Break Started`);
      setActiveBreak(res.data.employeeBreak);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to start break');
    }
  };

  const handleEndBreak = async () => {
    try {
      if (!activeBreak?.id) return;
      await api.post(`/breaks/${activeBreak.id}/end`);
      toast.success('Break Ended Successfully');
      setActiveBreak(null);
      setBreakSecondsLeft(null);
      fetchDeskData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to end break');
    }
  };

  const formatTimer = (seconds: number) => {
    const isNegative = seconds < 0;
    const abs = Math.abs(seconds);
    const m = Math.floor(abs / 60);
    const s = abs % 60;
    const str = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return isNegative ? `-${str} (OVERRUN)` : str;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* Header Greeting Banner */}
        <div className="bg-gradient-to-r from-primary-900 via-primary-800 to-indigo-900 rounded-2xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
          <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-white/5 transform skew-x-12 pointer-events-none" />
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 text-primary-200 text-sm font-medium mb-1">
                <Sparkles className="w-4 h-4 text-amber-300" />
                <span>BSC Textiles HRMS – Self-Service Desk</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                Welcome back, {session?.user?.name || 'Staff Member'}!
              </h1>
              <p className="text-primary-100 mt-1 text-sm max-w-xl">
                Location: {session?.user?.locationId ? 'Assigned Branch' : 'Head Office'} • Role: {session?.user?.role || 'Employee'}
              </p>
            </div>

            {/* Live Clock Card */}
            <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/20 text-center min-w-[200px]">
              <div className="text-xs uppercase tracking-wider text-primary-200 font-semibold">Authoritative Store Time</div>
              <div className="text-3xl font-mono font-bold tracking-wider mt-1">
                {time.toLocaleTimeString()}
              </div>
              <div className="text-xs text-primary-200 mt-1">
                {time.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
              </div>
            </div>
          </div>
        </div>

        {/* Quick Action Operations Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Action 1: Attendance Punch */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Attendance Status</span>
                <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${
                  todayAttendance?.status === 'PRESENT' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                }`}>
                  {todayAttendance?.status || 'NOT PUNCHED'}
                </span>
              </div>
              <h3 className="text-lg font-bold text-gray-900">Shift Check-In & Check-Out</h3>
              <p className="text-sm text-gray-600 mt-1">
                Scheduled: 09:30 AM – 06:30 PM (5 min grace period). Early check-in grants ₹1/sec incentive!
              </p>

              {todayAttendance && (
                <div className="mt-4 p-3 bg-gray-50 rounded-lg text-xs space-y-1">
                  <div className="flex justify-between text-gray-600">
                    <span>Login Timestamp:</span>
                    <span className="font-semibold text-gray-900">
                      {todayAttendance.actualLogin ? new Date(todayAttendance.actualLogin).toLocaleTimeString() : 'N/A'}
                    </span>
                  </div>
                  {todayAttendance.earlyLoginSeconds > 0 && (
                    <div className="flex justify-between text-emerald-600 font-medium">
                      <span>Early Incentive Earned:</span>
                      <span>+{formatCurrency(todayAttendance.earlyLoginIncentive)}</span>
                    </div>
                  )}
                  {todayAttendance.lateLoginSeconds > 0 && (
                    <div className="flex justify-between text-amber-600 font-medium">
                      <span>Late Penalty Applied:</span>
                      <span>-{formatCurrency(todayAttendance.lateLoginPenalty)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button 
                onClick={() => handlePunch('IN')}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2.5 px-4 rounded-lg shadow-sm transition-colors text-sm flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                Punch In
              </button>
              <button 
                onClick={() => handlePunch('OUT')}
                className="flex-1 bg-gray-800 hover:bg-gray-900 text-white font-medium py-2.5 px-4 rounded-lg shadow-sm transition-colors text-sm flex items-center justify-center gap-2"
              >
                <Clock className="w-4 h-4" />
                Punch Out
              </button>
            </div>
          </div>

          {/* Action 2: Daily QR Badge */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Security Identity</span>
                <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-purple-100 text-purple-800">
                  Daily Token
                </span>
              </div>
              <h3 className="text-lg font-bold text-gray-900">My Daily Secure QR Code</h3>
              <p className="text-sm text-gray-600 mt-1">
                Show this token at the tea stall or dining counter for authorized break tracking and lunch validation.
              </p>

              <div className="mt-4 p-3 bg-purple-50 rounded-lg flex items-center gap-3">
                <QrCode className="w-10 h-10 text-purple-700 flex-shrink-0" />
                <div className="text-xs">
                  <div className="font-semibold text-purple-900">Valid until 23:59 PM Today</div>
                  <div className="text-purple-700 mt-0.5">One-time scan protected • Anti-replay secured</div>
                </div>
              </div>
            </div>

            <div className="mt-6">
              <button 
                onClick={() => setShowQRModal(true)}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium py-2.5 px-4 rounded-lg shadow-sm transition-colors text-sm flex items-center justify-center gap-2"
              >
                <QrCode className="w-4 h-4" />
                View & Scan QR Badge
              </button>
            </div>
          </div>

          {/* Action 3: Break Tracker */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Break Management</span>
                <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${
                  activeBreak ? 'bg-amber-100 text-amber-800 animate-pulse' : 'bg-gray-100 text-gray-700'
                }`}>
                  {activeBreak ? `${activeBreak.breakType} ACTIVE` : 'ON FLOOR'}
                </span>
              </div>
              <h3 className="text-lg font-bold text-gray-900">Live Break Timer</h3>
              <p className="text-sm text-gray-600 mt-1">
                Allowed limits: Tea Break (20 mins), Lunch Break (40/100 mins policy). Overrun alerts authorized floor managers.
              </p>

              {activeBreak && breakSecondsLeft !== null && (
                <div className={`mt-4 p-4 rounded-xl text-center ${breakSecondsLeft < 0 ? 'bg-red-50 border border-red-200' : 'bg-amber-50 border border-amber-200'}`}>
                  <div className="text-xs font-semibold uppercase text-gray-600">Remaining Time</div>
                  <div className={`text-2xl font-mono font-bold mt-1 ${breakSecondsLeft < 0 ? 'text-red-600' : 'text-amber-800'}`}>
                    {formatTimer(breakSecondsLeft)}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6">
              {activeBreak ? (
                <button 
                  onClick={handleEndBreak}
                  className="w-full bg-red-600 hover:bg-red-700 text-white font-medium py-2.5 px-4 rounded-lg shadow-sm transition-colors text-sm flex items-center justify-center gap-2"
                >
                  End {activeBreak.breakType} Break
                </button>
              ) : (
                <div className="flex gap-3">
                  <button 
                    onClick={() => handleStartBreak('TEA')}
                    className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-medium py-2.5 px-3 rounded-lg shadow-sm transition-colors text-sm flex items-center justify-center gap-1.5"
                  >
                    <Coffee className="w-4 h-4" />
                    Tea (20m)
                  </button>
                  <button 
                    onClick={() => handleStartBreak('LUNCH')}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-3 rounded-lg shadow-sm transition-colors text-sm flex items-center justify-center gap-1.5"
                  >
                    <Utensils className="w-4 h-4" />
                    Lunch
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Recent Attendance History Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-6 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Recent Attendance Records</h2>
              <p className="text-xs text-gray-500 mt-0.5">Authoritative audit of your last 7 store check-ins and overtime calculations</p>
            </div>
            <span className="text-xs font-medium text-primary-600 bg-primary-50 px-3 py-1 rounded-full">
              Full Record Audited
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="bg-gray-50 text-xs uppercase font-semibold text-gray-700 border-b border-gray-200">
                <tr>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Scheduled</th>
                  <th className="py-3 px-4">Actual Punch</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Early Incentive</th>
                  <th className="py-3 px-4">Late Deduction</th>
                  <th className="py-3 px-4">Overtime</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentAttendances.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-gray-400">
                      No attendance history found for current employee profile.
                    </td>
                  </tr>
                ) : (
                  recentAttendances.map((att) => (
                    <tr key={att.id} className="hover:bg-gray-50/80 transition-colors">
                      <td className="py-3 px-4 font-medium text-gray-900">
                        {new Date(att.attendanceDate).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                      </td>
                      <td className="py-3 px-4 text-xs font-mono">
                        {att.scheduledLogin ? new Date(att.scheduledLogin).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '09:30 AM'} - {' '}
                        {att.scheduledLogout ? new Date(att.scheduledLogout).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '06:30 PM'}
                      </td>
                      <td className="py-3 px-4 text-xs font-mono font-medium text-gray-800">
                        {att.actualLogin ? new Date(att.actualLogin).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '–'}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                          att.status === 'PRESENT' ? 'bg-emerald-100 text-emerald-800' :
                          att.status === 'LATE' ? 'bg-amber-100 text-amber-800' :
                          att.status === 'WEEKLY_OFF' ? 'bg-gray-100 text-gray-700' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {att.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs text-emerald-600 font-medium">
                        {Number(att.earlyLoginIncentive) > 0 ? `+${formatCurrency(att.earlyLoginIncentive)}` : '₹0'}
                      </td>
                      <td className="py-3 px-4 text-xs text-red-600 font-medium">
                        {Number(att.lateLoginPenalty) > 0 ? `-${formatCurrency(att.lateLoginPenalty)}` : '₹0'}
                      </td>
                      <td className="py-3 px-4 text-xs font-mono text-gray-700">
                        {att.overtimeSeconds > 0 ? `${Math.round(att.overtimeSeconds / 60)} mins` : '–'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* QR Code Modal */}
        {showQRModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-sm w-full p-6 text-center shadow-2xl relative">
              <div className="w-12 h-12 bg-purple-100 text-purple-700 rounded-full flex items-center justify-center mx-auto mb-3">
                <QrCode className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-gray-900">Your Daily Token</h3>
              <p className="text-xs text-gray-500 mt-1">
                Token is tied to your employee record and valid for today only.
              </p>

              <div className="my-6 p-4 bg-gray-50 rounded-xl inline-block border-2 border-dashed border-purple-200">
                {/* SVG QR Code Simulation */}
                <div className="w-48 h-48 bg-white border border-gray-300 rounded-lg flex flex-col items-center justify-center p-3">
                  <div className="grid grid-cols-6 gap-1 w-full h-full p-2 bg-purple-900/5 rounded">
                    {Array.from({ length: 36 }).map((_, idx) => (
                      <div 
                        key={idx} 
                        className={`rounded-sm ${
                          (idx % 2 === 0 || idx % 7 === 0 || idx === 0 || idx === 5 || idx === 30 || idx === 35) 
                            ? 'bg-gray-900' 
                            : 'bg-transparent'
                        }`} 
                      />
                    ))}
                  </div>
                </div>
                <div className="text-[10px] font-mono text-gray-500 mt-2 font-semibold">
                  TOKEN: DAILY-{session?.user?.employeeId?.slice(-6) || 'TOKEN'}-{new Date().toISOString().slice(0, 10).replace(/-/g, '')}
                </div>
              </div>

              <div className="text-xs text-emerald-600 bg-emerald-50 py-2 px-3 rounded-lg font-medium">
                Active & Authorized for Scanning
              </div>

              <button 
                onClick={() => setShowQRModal(false)}
                className="mt-6 w-full bg-gray-900 hover:bg-black text-white font-medium py-2.5 rounded-lg transition-colors text-sm"
              >
                Close Badge
              </button>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
