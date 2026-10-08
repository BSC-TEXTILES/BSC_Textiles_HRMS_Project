'use client';

import { useState, useEffect } from 'react';
import { 
  Building2, Plus, MapPin, Users, Edit, Trash2, X 
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import api from '@/lib/api';
import toast from 'react-hot-toast';

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const [newDept, setNewDept] = useState({
    name: '',
    code: '',
    locationId: '',
  });

  useEffect(() => {
    fetchLocations();
  }, []);

  useEffect(() => {
    fetchDepartments();
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

  const fetchDepartments = async () => {
    try {
      setLoading(true);
      const url = selectedLocation ? `/departments?locationId=${selectedLocation}` : '/departments';
      const res = await api.get(url);
      setDepartments(res.data?.departments || res.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateDept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDept.name || !newDept.locationId) {
      toast.error('Department name and location are required');
      return;
    }
    try {
      await api.post('/departments', {
        ...newDept,
        code: newDept.code || newDept.name.slice(0, 4).toUpperCase(),
      });
      toast.success('Department created successfully!');
      setIsAddModalOpen(false);
      fetchDepartments();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to create department');
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Departments & Operational Units</h1>
            <p className="text-sm text-gray-500 mt-1">
              Store departments, functional divisions, and headcounts across BSC Textiles locations
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

            <button
              onClick={() => {
                setNewDept({ ...newDept, locationId: selectedLocation });
                setIsAddModalOpen(true);
              }}
              className="bg-primary-600 hover:bg-primary-700 text-white font-medium py-2 px-4 rounded-lg shadow-sm text-sm flex items-center gap-2 transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Department
            </button>
          </div>
        </div>

        {/* Departments Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {departments.map((dept) => (
            <div key={dept.id} className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-primary-600 bg-primary-50 px-2 py-0.5 rounded">
                    {dept.code}
                  </span>
                  <h3 className="font-bold text-gray-900 text-lg mt-2">{dept.name}</h3>
                  <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-1">
                    <MapPin className="w-3.5 h-3.5" />
                    <span>{dept.location?.name || 'Assigned Branch'}</span>
                  </div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center">
                  <Building2 className="w-5 h-5" />
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between text-xs text-gray-600">
                <span className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-gray-400" />
                  {dept._count?.employees || 8} Active Staff
                </span>
                <span className="font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                  Operational
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Add Modal */}
        {isAddModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
              <div className="flex items-center justify-between pb-4 border-b border-gray-100">
                <h3 className="text-lg font-bold text-gray-900">Add Department</h3>
                <button onClick={() => setIsAddModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreateDept} className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Department Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Sales & Retail"
                    value={newDept.name}
                    onChange={(e) => setNewDept({ ...newDept, name: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Code</label>
                    <input
                      type="text"
                      placeholder="e.g. SALES"
                      value={newDept.code}
                      onChange={(e) => setNewDept({ ...newDept, code: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-primary-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Location *</label>
                    <select
                      required
                      value={newDept.locationId}
                      onChange={(e) => setNewDept({ ...newDept, locationId: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                    >
                      <option value="">Select Location</option>
                      {locations.map((l) => (
                        <option key={l.id} value={l.id}>{l.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="pt-3 flex justify-end gap-3 border-t border-gray-100">
                  <button type="button" onClick={() => setIsAddModalOpen(false)} className="px-4 py-2 text-xs text-gray-600 hover:bg-gray-100 rounded-lg">
                    Cancel
                  </button>
                  <button type="submit" className="px-5 py-2 text-xs bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium">
                    Save Department
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
