'use client';

import { ReactNode } from 'react';
import { 
  CheckCircle, AlertCircle, Clock, Coffee, Utensils, 
  Shield, QrCode, MessageSquare, Video, DollarSign,
  AlertTriangle, Star, Flag
} from 'lucide-react';
import { Badge } from './Badge';
import { formatDateTime, getStatusColor } from '@/lib/utils';
import { Card } from './Card';

interface Activity {
  id: string;
  type: 'attendance' | 'break' | 'face_verification' | 'qr_scan' | 'observation' | 'live_stream' | 'incentive' | 'penalty';
  title: string;
  description: string;
  timestamp: string;
  status?: 'success' | 'warning' | 'danger' | 'info';
  employee?: { name: string; code: string };
  location?: string;
}

const mockActivities: Activity[] = [
  {
    id: '1',
    type: 'attendance',
    title: 'Employee Check-in',
    description: 'Rajesh Kumar (BEL-001) checked in at Belagavi Ground Floor',
    timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    status: 'success',
    employee: { name: 'Rajesh Kumar', code: 'BEL-001' },
    location: 'Belagavi',
  },
  {
    id: '2',
    type: 'face_verification',
    title: 'Face Verification',
    description: 'Priya Sharma (BEL-002) verified - 97.4% match',
    timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    status: 'success',
    employee: { name: 'Priya Sharma', code: 'BEL-002' },
    location: 'Belagavi',
  },
  {
    id: '3',
    type: 'qr_scan',
    title: 'QR Scan - Tea Break',
    description: 'Amit Patel (BEL-003) started tea break at Silk Counter A',
    timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    status: 'success',
    employee: { name: 'Amit Patel', code: 'BEL-003' },
    location: 'Belagavi',
  },
  {
    id: '4',
    type: 'observation',
    title: 'Positive Observation',
    description: 'Excellent customer service by Vikram Singh (SHI-001)',
    timestamp: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    status: 'info',
    employee: { name: 'Vikram Singh', code: 'SHI-001' },
    location: 'Shivamogga',
  },
  {
    id: '5',
    type: 'face_verification',
    title: 'Face Verification Failed',
    description: 'Suresh Reddy (DAV-001) - 71.2% match (threshold: 85%)',
    timestamp: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    status: 'danger',
    employee: { name: 'Suresh Reddy', code: 'DAV-001' },
    location: 'Davanagere',
  },
  {
    id: '6',
    type: 'break',
    title: 'Lunch Break Ended',
    description: 'Lakshmi Devi (DAV-002) completed lunch break (45 min)',
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    status: 'success',
    employee: { name: 'Lakshmi Devi', code: 'DAV-002' },
    location: 'Davanagere',
  },
  {
    id: '7',
    type: 'incentive',
    title: 'Incentive Calculated',
    description: 'Early login incentive ₹600 for Rajesh Kumar (BEL-001)',
    timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    status: 'success',
    employee: { name: 'Rajesh Kumar', code: 'BEL-001' },
    location: 'Belagavi',
  },
  {
    id: '8',
    type: 'live_stream',
    title: 'Live Stream Started',
    description: 'Floor Manager started live stream at Shivamogga Ground Floor',
    timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    status: 'info',
    location: 'Shivamogga',
  },
];

function ActivityIcon({ type, status }: { type: Activity['type']; status?: Activity['status'] }) {
  const icons: Record<string, React.ComponentType<{ className?: string }>> = {
    attendance: CheckCircle,
    break: Coffee,
    face_verification: Shield,
    qr_scan: QrCode,
    observation: MessageSquare,
    live_stream: Video,
    incentive: DollarSign,
    penalty: AlertTriangle,
  };

  const Icon = icons[type] || AlertCircle;
  
  const colors: Record<string, string> = {
    success: 'text-emerald-500 bg-emerald-100',
    warning: 'text-amber-500 bg-amber-100',
    danger: 'text-red-500 bg-red-100',
    info: 'text-blue-500 bg-blue-100',
  };

  return (
    <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', colors[status || 'info'])}>
      <Icon className="w-4 h-4 text-white" />
    </div>
  );
}

export function RecentActivity() {
  return (
    <div className="space-y-3">
      {mockActivities.map((activity) => (
        <div key={activity.id} className="flex items-start gap-3 p-3 hover:bg-gray-50 rounded-lg transition-colors">
          <ActivityIcon type={activity.type} status={activity.status} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-gray-900">{activity.title}</p>
              <span className="text-xs text-gray-400 whitespace-nowrap">
                {new Date(activity.timestamp).toLocaleTimeString()}
              </span>
            </div>
            <p className="text-sm text-gray-600 mt-0.5">{activity.description}</p>
            <div className="flex items-center gap-2 mt-1">
              {activity.employee && (
                <span className="text-xs text-gray-500 flex items-center gap-1">
                  <User className="w-3 h-3" />
                  {activity.employee.name} ({activity.employee.code})
                </span>
              )}
              {activity.location && (
                <span className="text-xs text-gray-500 flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {activity.location}
                </span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

import { User, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';