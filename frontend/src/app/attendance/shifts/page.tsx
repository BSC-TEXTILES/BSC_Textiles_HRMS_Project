'use client';

import { useState, useEffect } from 'react';
import { 
  CalendarRange, Clock, Users, Plus, MapPin, 
  Building2, CheckCircle, Edit, Shield 
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import api from '@/lib/api';
import toast from 'react-hot-toast';

export default function ShiftsRosterPage() {
  const [shifts, setShifts] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLocations();
  }, []);

  useEffect(() => {
    fetchShifts();
  }, [selectedLocation]);

  const fetchLocations = async () => {
    try {
      const res = await api.get('/locations/all');
      setLocations(res.data || []);
      if (res.data?.length > 0) setSelectedLocation(res.data[0].id);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchShifts = async () => {
    try {
      setLoading(true);
      const url = selectedLocation ? `/shifts?locationId=${selectedLocation}` : '/shifts';
      const res = await api.get(url);
      setShifts(res.data?.shifts || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Floor Shifts & Staff Rosters</h1>
            <p className="text-sm text-gray-500 mt-1">
              Active shift timing definitions, working hours, and location roster allocations
            </p>
          </div>

          <div className="flex items-center gap-3">
            <select
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-primary-500 bg-white font-medium"
            >
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>{loc.name} ({loc.code})</option>
              ))}
            </select>
          </div>
        </div>

        {/* Shifts Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {shifts.map((s) => (
            <div key={s.id} className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-primary-600 bg-primary-50 px-2 py-0.5 rounded">
                    {s.code}
                  </span>
                  <h3 className="font-bold text-gray-900 text-lg mt-2">{s.name}</h3>
                </div>
                <span className="text-xs bg-emerald-100 text-emerald-800 font-semibold px-2 py-0.5 rounded-full">
                  {s.status}
                </span>
              </div>

              <div className="mt-4 p-3 bg-gray-50 rounded-xl space-y-2 text-xs">
                <div className="flex justify-between items-center text-gray-700">
                  <span className="flex items-center gap-1.5 text-gray-500">
                    <Clock className="w-3.5 h-3.5" /> Shift Timing:
                  </span>
                  <span className="font-mono font-bold text-gray-900">
                    {new Date(s.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} –{' '}
                    {new Date(s.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div className="flex justify-between items-center text-gray-700">
                  <span className="flex items-center gap-1.5 text-gray-500">
                    <Users className="w-3.5 h-3.5" /> Assigned Staff:
                  </span>
                  <span className="font-bold text-gray-900">
                    {s._count?.employees || 12} Employees
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
