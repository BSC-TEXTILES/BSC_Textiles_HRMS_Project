'use client';

import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { 
  Wallet, 
  Search, 
  RefreshCw, 
  DollarSign, 
  Building2, 
  Edit3, 
  CheckCircle2, 
  AlertCircle,
  FileSpreadsheet
} from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';

export default function EmployeeSalaryDetailsPage() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('ALL');
  const [locations, setLocations] = useState<any[]>([]);
  const [editingEmp, setEditingEmp] = useState<any | null>(null);
  const [fixedGross, setFixedGross] = useState('');
  const [basicSalary, setBasicSalary] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchEmployees = async () => {
    setLoading(true);
    try {
      const res = await api.get('/employees?limit=100');
      const list = res.data?.employees || (Array.isArray(res.data) ? res.data : []);
      setEmployees(list);
    } catch (err: any) {
      console.warn('Failed to load employee salary details:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
    api.get('/locations/all').then((res) => {
      const list = Array.isArray(res.data) ? res.data : res.data?.locations || [];
      setLocations(list);
    }).catch(() => {});
  }, []);

  const handleGrossChange = (val: string) => {
    setFixedGross(val);
    const num = Number(val) || 0;
    setBasicSalary(String(Math.round(num * 0.75)));
  };

  const handleSaveSalary = async () => {
    if (!editingEmp) return;
    setSaving(true);
    try {
      const grossNum = Number(fixedGross) || 0;
      const basicNum = Number(basicSalary) || 0;
      const dailyNum = Math.round((grossNum / 30.0) * 100) / 100;

      await api.patch(`/employees/${editingEmp.id}`, {
        fixedGrossSalary: grossNum,
        basicSalary: basicNum,
        dailyRate: dailyNum,
      });

      toast.success(`Salary structure updated for ${editingEmp.fullName}`);
      setEditingEmp(null);
      fetchEmployees();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update salary');
    } finally {
      setSaving(false);
    }
  };

  const filteredEmployees = employees.filter((e) => {
    const matchesSearch =
      e.fullName?.toLowerCase().includes(search.toLowerCase()) ||
      e.employeeCode?.includes(search) ||
      e.designation?.toLowerCase().includes(search.toLowerCase());
    const matchesLoc =
      selectedLocation === 'ALL' || e.locationId === selectedLocation || e.location?.code === selectedLocation;
    return matchesSearch && matchesLoc;
  });

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
              <Wallet className="w-7 h-7 text-emerald-600" />
              Employee Salary Details & Structure
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Configure baseline CTC, fixed gross wages, basic pay, and daily payable rates across all BSC showrooms.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <select
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              className="px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
            >
              <option value="ALL">All Hubs & Locations</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name} ({loc.code})
                </option>
              ))}
            </select>

            <button
              onClick={fetchEmployees}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 text-xs font-semibold text-slate-700 dark:text-slate-300"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-6 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Search employee by name, code or designation..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3.5 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
          />
        </div>

        {/* Table */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 text-xs uppercase font-semibold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-5 py-3.5">Employee</th>
                  <th className="px-5 py-3.5">Showroom</th>
                  <th className="px-5 py-3.5">Designation</th>
                  <th className="px-5 py-3.5">Fixed Gross Salary</th>
                  <th className="px-5 py-3.5">Basic Pay (75%)</th>
                  <th className="px-5 py-3.5">Daily Rate</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredEmployees.map((emp) => {
                  const gross = Number(emp.fixedGrossSalary || 16000);
                  const basic = Number(emp.basicSalary || Math.round(gross * 0.75));
                  const daily = Number(emp.perDaySalary || (gross / 30.0));
                  return (
                    <tr key={emp.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-slate-900 dark:text-white">{emp.fullName}</div>
                        <div className="text-xs text-slate-500 font-mono">{emp.employeeCode}</div>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-slate-600 dark:text-slate-300">
                        {emp.location?.name || emp.location?.code || 'BSC'}
                      </td>
                      <td className="px-5 py-3.5 text-xs text-slate-600 dark:text-slate-300">
                        {emp.designation || 'Staff'}
                      </td>
                      <td className="px-5 py-3.5 font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                        ₹{gross.toLocaleString('en-IN')}
                      </td>
                      <td className="px-5 py-3.5 font-mono text-slate-700 dark:text-slate-300">
                        ₹{basic.toLocaleString('en-IN')}
                      </td>
                      <td className="px-5 py-3.5 font-mono text-slate-500">
                        ₹{daily.toFixed(2)}/day
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <button
                          onClick={() => {
                            setEditingEmp(emp);
                            setFixedGross(String(gross));
                            setBasicSalary(String(basic));
                          }}
                          className="px-3 py-1 text-xs font-semibold rounded-lg bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 inline-flex items-center gap-1.5"
                        >
                          <Edit3 className="w-3.5 h-3.5" /> Edit
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Edit Modal */}
        {editingEmp && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-xl">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">
                Edit Salary: {editingEmp.fullName}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">
                Update fixed gross wages and baseline compensation rates.
              </p>

              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Fixed Monthly Gross (₹)
                  </label>
                  <input
                    type="number"
                    value={fixedGross}
                    onChange={(e) => handleGrossChange(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-bold text-emerald-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Basic Salary (₹)
                  </label>
                  <input
                    type="number"
                    value={basicSalary}
                    onChange={(e) => setBasicSalary(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setEditingEmp(null)}
                  className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveSalary}
                  disabled={saving}
                  className="px-5 py-2 text-xs font-semibold rounded-lg bg-[#092B69] hover:bg-[#07204f] text-white"
                >
                  {saving ? 'Saving...' : 'Save Structure'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
