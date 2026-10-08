'use client';

import { useState, useEffect } from 'react';
import { 
  Users, MapPin, Building2, Phone, Mail, Shield, CheckCircle 
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import api from '@/lib/api';

export default function FloorManagersPage() {
  const [managers, setManagers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchManagers();
  }, []);

  const fetchManagers = async () => {
    try {
      setLoading(true);
      const res = await api.get('/employees?role=FLOOR_MANAGER');
      setManagers(res.data?.employees || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Floor Managers Directory</h1>
          <p className="text-sm text-gray-500 mt-1">
            Supervisory personnel authorized for floor attendance oversight, break scanning, and instant observations
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {managers.map((m) => (
            <div key={m.id} className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-primary-100 text-primary-700 font-bold flex items-center justify-center text-lg">
                  {m.firstName?.[0]}{m.lastName?.[0]}
                </div>
                <div>
                  <h3 className="font-bold text-gray-900">{m.fullName}</h3>
                  <div className="text-xs font-mono text-gray-500">{m.employeeCode}</div>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-gray-100 space-y-2 text-xs text-gray-600">
                <div className="flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5 text-gray-400" />
                  <span>{m.location?.name || 'Retail Store Branch'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Building2 className="w-3.5 h-3.5 text-gray-400" />
                  <span>{m.floor?.name || 'Ground Floor'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5 text-gray-400" />
                  <span>{m.email}</span>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
                <span className="bg-primary-50 text-primary-700 px-2.5 py-0.5 rounded font-semibold">
                  Floor Supervisory Authority
                </span>
                <span className="text-emerald-600 font-medium flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5" /> Active
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
