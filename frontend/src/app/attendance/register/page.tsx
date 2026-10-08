'use client';

import { useState, useEffect } from 'react';
import { 
  Activity, Calendar, MapPin, Download, Filter, 
  ChevronLeft, ChevronRight, CheckCircle, RefreshCw 
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import api from '@/lib/api';

export default function AttendanceRegisterPage() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [loading, setLoading] = useState(true);

  // 30 days matrix
  const days = Array.from({ length: 30 }, (_, i) => i + 1);

  useEffect(() => {
    fetchLocations();
  }, []);

  useEffect(() => {
    fetchRegister();
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

  const fetchRegister = async () => {
    try {
      setLoading(true);
      const url = selectedLocation ? `/employees?locationId=${selectedLocation}&limit=35` : '/employees?limit=35';
      const res = await api.get(url);
      setEmployees(res.data?.employees || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Determine synthetic day status based on index and day
  const getDayStatus = (empIndex: number, day: number) => {
    if (day % 7 === 0) return { code: 'WO', bg: 'bg-gray-100 text-gray-600' };
    if ((empIndex + day) % 9 === 0) return { code: 'L', bg: 'bg-amber-100 text-amber-800' };
    if ((empIndex + day) % 17 === 0) return { code: 'A', bg: 'bg-red-100 text-red-800' };
    return { code: 'P', bg: 'bg-emerald-100 text-emerald-800' };
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Attendance Register & Muster Roll</h1>
            <p className="text-sm text-gray-500 mt-1">
              Monthly workforce attendance matrix grid across retail branches
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

        {/* Legend */}
        <div className="flex items-center gap-4 text-xs font-medium text-gray-600 bg-white p-3.5 rounded-xl border border-gray-200">
          <span className="text-gray-400">Legend:</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-emerald-500" /> P = Present (On-Time / Early)</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-amber-500" /> L = Late Arrival</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-gray-400" /> WO = Weekly Off</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-red-500" /> A = Absent</span>
        </div>

        {/* Matrix Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto max-h-[600px]">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-gray-50 text-[11px] uppercase font-semibold text-gray-700 sticky top-0 z-10 border-b border-gray-200">
                <tr>
                  <th className="py-3 px-3 min-w-[180px] bg-gray-50 sticky left-0 z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                    Employee
                  </th>
                  {days.map((d) => (
                    <th key={d} className="py-3 px-1.5 text-center min-w-[32px]">
                      {d}
                    </th>
                  ))}
                  <th className="py-3 px-2 text-center font-bold text-gray-900 bg-gray-100">Pres</th>
                  <th className="py-3 px-2 text-center font-bold text-amber-700 bg-amber-50">Late</th>
                  <th className="py-3 px-2 text-center font-bold text-gray-700 bg-gray-50">WO</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {employees.map((emp, empIdx) => {
                  let presentCount = 0;
                  let lateCount = 0;
                  let offCount = 0;

                  return (
                    <tr key={emp.id} className="hover:bg-gray-50/70 transition-colors">
                      <td className="py-2.5 px-3 font-medium text-gray-900 bg-white sticky left-0 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                        <div className="font-semibold truncate max-w-[160px]">{emp.fullName}</div>
                        <div className="text-[10px] text-gray-400 font-mono">{emp.employeeCode}</div>
                      </td>
                      {days.map((d) => {
                        const status = getDayStatus(empIdx, d);
                        if (status.code === 'P') presentCount++;
                        if (status.code === 'L') { presentCount++; lateCount++; }
                        if (status.code === 'WO') offCount++;

                        return (
                          <td key={d} className="py-2 px-1 text-center">
                            <span className={`inline-block w-6 h-6 leading-6 rounded text-[10px] font-bold ${status.bg}`}>
                              {status.code}
                            </span>
                          </td>
                        );
                      })}
                      <td className="py-2 px-2 text-center font-bold text-emerald-700 bg-emerald-50/30">
                        {presentCount}
                      </td>
                      <td className="py-2 px-2 text-center font-bold text-amber-700 bg-amber-50/30">
                        {lateCount}
                      </td>
                      <td className="py-2 px-2 text-center font-bold text-gray-700 bg-gray-50/30">
                        {offCount}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
