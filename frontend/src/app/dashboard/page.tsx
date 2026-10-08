'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { 
  Users, Clock, CheckCircle, AlertCircle, Coffee, Utensils,
  TrendingUp, TrendingDown, Activity, Video, MessageSquare,
  Target, Shield, BarChart2, DollarSign, CreditCard,
  Stethoscope, FileBarChart, RefreshCw, ChevronRight,
  Calendar, QrCode, Radio, MapPin, Calculator
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import api from '@/lib/api';
import { formatCurrency, getStatusColor, cn } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { StatCard } from '@/components/ui/StatCard';
import { ChartCard } from '@/components/ui/ChartCard';
import { RecentActivity } from '@/components/ui/RecentActivity';

interface DashboardStats {
  totalEmployees: number;
  present: number;
  absent: number;
  late: number;
  onLunch: number;
  onTeaBreak: number;
  weeklyOff: number;
  overtime: number;
  faceVerified: number;
  faceFailed: number;
  avgFaceMatch: number;
  qrScans: number;
  failedQrScans: number;
  incentiveToday: number;
  penaltyToday: number;
  openObservations: number;
  criticalObservations: number;
  liveStreams: number;
  activeSellingPoints: number;
}

interface QuickStat {
  title: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  trend?: { value: string; positive: boolean };
  badge?: string;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDashboardStats();
  }, []);

  const fetchDashboardStats = async () => {
    try {
      setLoading(true);
      const response = await api.get('/reports/dashboard-summary');
      setStats(response.data);
    } catch (err) {
      setError('Failed to load dashboard stats');
      console.error('Dashboard stats error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-600 border-t-transparent"></div>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <p className="text-red-600">{error}</p>
          <button onClick={fetchDashboardStats} className="btn-primary mt-4">Retry</button>
        </div>
      </DashboardLayout>
    );
  }

  const quickStats: QuickStat[] = [
    { title: 'Total Employees', value: stats?.totalEmployees || 0, icon: Users, color: 'bg-blue-500', badge: 'Active workforce' },
    { title: 'Present Today', value: stats?.present || 0, icon: CheckCircle, color: 'bg-emerald-500', badge: 'On floor' },
    { title: 'Late Arrivals', value: stats?.late || 0, icon: Clock, color: 'bg-amber-500', badge: 'Need attention' },
    { title: 'On Lunch', value: stats?.onLunch || 0, icon: Utensils, color: 'bg-blue-400', badge: 'Break active' },
    { title: 'Tea Break', value: stats?.onTeaBreak || 0, icon: Coffee, color: 'bg-orange-400', badge: 'Break active' },
    { title: 'Weekly Off', value: stats?.weeklyOff || 0, icon: Calendar, color: 'bg-slate-400', badge: 'Scheduled off' },
    { title: 'Absent', value: stats?.absent || 0, icon: AlertCircle, color: 'bg-red-500', badge: 'Not present' },
    { title: 'Overtime', value: stats?.overtime || 0, icon: TrendingUp, color: 'bg-green-400', badge: 'Extra hours' },
    { title: 'Face Verified', value: stats?.faceVerified || 0, icon: Shield, color: 'bg-emerald-500', badge: 'Verified' },
    { title: 'Face Failed', value: stats?.faceFailed || 0, icon: AlertCircle, color: 'bg-red-500', badge: 'Failed' },
    { title: 'Avg Face Match', value: `${stats?.avgFaceMatch || 0}%`, icon: Target, color: 'bg-blue-500', badge: 'Accuracy' },
    { title: 'QR Scans', value: stats?.qrScans || 0, icon: QrCode, color: 'bg-purple-500', badge: 'Today' },
    { title: 'Failed Scans', value: stats?.failedQrScans || 0, icon: AlertCircle, color: 'bg-red-500', badge: 'Issues' },
    { title: 'Incentives Today', value: formatCurrency(stats?.incentiveToday || 0), icon: DollarSign, color: 'bg-emerald-500', badge: 'Earned' },
    { title: 'Penalties Today', value: formatCurrency(stats?.penaltyToday || 0), icon: Shield, color: 'bg-red-500', badge: 'Applied' },
    { title: 'Open Observations', value: stats?.openObservations || 0, icon: MessageSquare, color: 'bg-blue-500', badge: 'Pending' },
    { title: 'Critical Obs.', value: stats?.criticalObservations || 0, icon: AlertCircle, color: 'bg-red-500', badge: 'Urgent' },
    { title: 'Live Streams', value: stats?.liveStreams || 0, icon: Video, color: 'bg-pink-500', badge: 'Active' },
    { title: 'Active Selling Points', value: stats?.activeSellingPoints || 0, icon: MapPin, color: 'bg-indigo-500', badge: 'Operational' },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Executive Dashboard</h1>
            <p className="text-gray-600 mt-1">Real-time overview of BSC Textiles workforce operations</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={fetchDashboardStats} disabled={loading} className="btn-secondary">
              <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
              Refresh
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {quickStats.map((stat, index) => (
            <StatCard
              key={index}
              title={stat.title}
              value={stat.value}
              icon={stat.icon}
              color={stat.color}
              badge={stat.badge}
            />
          ))}
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartCard title="Attendance Overview" subtitle="Last 30 days">
            <AttendanceChart />
          </ChartCard>
          <ChartCard title="Incentive Distribution" subtitle="By type this month">
            <IncentiveChart />
          </ChartCard>
        </div>

        {/* Second Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartCard title="Break Analysis" subtitle="Lunch vs Tea breaks">
            <BreakChart />
          </ChartCard>
          <ChartCard title="Face Verification" subtitle="Success rate trend">
            <FaceVerificationChart />
          </ChartCard>
        </div>

        {/* Quick Actions & Recent Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="col-span-1 lg:col-span-2">
            <div className="p-4 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">Quick Actions</h3>
            </div>
            <div className="p-4 space-y-3">
              <QuickActionButton 
                title="Scan QR Code" 
                description="Record attendance or break" 
                icon={QrCode} 
                color="bg-blue-500"
                href="/operations/qr-scanner"
              />
              <QuickActionButton 
                title="Face Verification" 
                description="Verify employee identity" 
                icon={Shield} 
                color="bg-emerald-500"
                href="/operations/face-verification"
              />
              <QuickActionButton 
                title="Live Attendance" 
                description="Monitor real-time floor status" 
                icon={Radio} 
                color="bg-purple-500"
                href="/operations/live-attendance"
              />
              <QuickActionButton 
                title="Create Observation" 
                description="Record employee observation" 
                icon={MessageSquare} 
                color="bg-orange-500"
                href="/operations/observations/new"
              />
              <QuickActionButton 
                title="Start Live Stream" 
                description="Broadcast floor operations" 
                icon={Video} 
                color="bg-pink-500"
                href="/operations/live-streams/new"
              />
              <QuickActionButton 
                title="Calculate Incentives" 
                description="Process monthly incentives" 
                icon={DollarSign} 
                color="bg-green-500"
                href="/incentives/calculation"
              />
            </div>
          </Card>
          
          <Card>
            <div className="p-4 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">Recent Activity</h3>
            </div>
            <RecentActivity />
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}

// Chart Components (simplified)
function AttendanceChart() {
  return (
    <div className="h-64 flex items-end justify-center gap-4 px-4">
      {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, i) => (
        <div key={day} className="flex flex-col items-center gap-1 flex-1">
          <div className="w-full flex items-end justify-center h-40 gap-1">
            <div 
              className="bg-emerald-500 rounded-t transition-all hover:bg-emerald-600"
              style={{ height: `${30 + Math.random() * 50}%` }}
            />
            <div 
              className="bg-amber-500 rounded-t transition-all hover:bg-amber-600"
              style={{ height: `${10 + Math.random() * 20}%` }}
            />
            <div 
              className="bg-red-500 rounded-t transition-all hover:bg-red-600"
              style={{ height: `${5 + Math.random() * 15}%` }}
            />
          </div>
          <span className="text-xs text-gray-500">{day}</span>
        </div>
      ))}
      <div className="flex gap-4 mt-4 justify-center text-xs">
        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-emerald-500 rounded" /> Present</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-amber-500 rounded" /> Late</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-500 rounded" /> Absent</span>
      </div>
    </div>
  );
}

function IncentiveChart() {
  return (
    <div className="h-64 flex items-end justify-center gap-4 px-4">
      {['Early Login', 'Sales Target', 'Attendance', 'Performance', 'Overtime'].map((type, i) => (
        <div key={type} className="flex flex-col items-center gap-1 flex-1">
          <div className="w-full flex items-end justify-center h-40">
            <div 
              className="w-12 bg-gradient-to-t from-primary-500 to-primary-300 rounded-t transition-all hover:from-primary-600"
              style={{ height: `${30 + i * 10 + Math.random() * 20}%` }}
            />
          </div>
          <span className="text-xs text-gray-500 text-center">{type}</span>
        </div>
      ))}
    </div>
  );
}

function BreakChart() {
  return (
    <div className="h-64 flex items-center justify-center">
      <div className="flex gap-8 items-center">
        <div className="flex flex-col items-center gap-2">
          <div className="w-32 h-32 rounded-full border-4 border-blue-500 flex items-center justify-center">
            <div className="w-24 h-24 rounded-full border-4 border-blue-200 flex items-center justify-center">
              <span className="text-2xl font-bold text-blue-600">65%</span>
            </div>
          </div>
          <span className="text-sm font-medium text-gray-700">Lunch Breaks</span>
        </div>
        <div className="flex flex-col items-center gap-2">
          <div className="w-32 h-32 rounded-full border-4 border-orange-500 flex items-center justify-center">
            <div className="w-24 h-24 rounded-full border-4 border-orange-200 flex items-center justify-center">
              <span className="text-2xl font-bold text-orange-600">82%</span>
            </div>
          </div>
          <span className="text-sm font-medium text-gray-700">Tea Breaks</span>
        </div>
        <div className="flex flex-col items-center gap-2">
          <div className="w-32 h-32 rounded-full border-4 border-red-500 flex items-center justify-center">
            <div className="w-24 h-24 rounded-full border-4 border-red-200 flex items-center justify-center">
              <span className="text-2xl font-bold text-red-600">12%</span>
            </div>
          </div>
          <span className="text-sm font-medium text-gray-700">Exceeded</span>
        </div>
      </div>
    </div>
  );
}

function FaceVerificationChart() {
  return (
    <div className="h-64 flex items-end justify-center gap-4 px-4">
      {['Week 1', 'Week 2', 'Week 3', 'Week 4'].map((week, i) => (
        <div key={week} className="flex flex-col items-center gap-1 flex-1">
          <div className="w-full flex items-end justify-center h-40 gap-1">
            <div 
              className="bg-emerald-500 rounded-t transition-all hover:bg-emerald-600"
              style={{ height: `${85 + Math.random() * 10}%` }}
            />
            <div 
              className="bg-red-500 rounded-t transition-all hover:bg-red-600"
              style={{ height: `${5 + Math.random() * 5}%` }}
            />
          </div>
          <span className="text-xs text-gray-500">{week}</span>
        </div>
      ))}
      <div className="flex gap-4 mt-4 justify-center text-xs">
        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-emerald-500 rounded" /> Verified</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-500 rounded" /> Failed</span>
      </div>
    </div>
  );
}

function QuickActionButton({ title, description, icon: Icon, color, href }: { title: string; description: string; icon: React.ComponentType<{ className?: string }>; color: string; href: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors group">
      <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', color)}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900">{title}</p>
        <p className="text-xs text-gray-500 truncate">{description}</p>
      </div>
      <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors" />
    </Link>
  );
}