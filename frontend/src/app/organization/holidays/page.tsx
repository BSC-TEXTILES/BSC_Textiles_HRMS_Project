'use client';

import { useState, useEffect } from 'react';
import { 
  CalendarRange, Plus, MapPin, CheckCircle, 
  Trash2, X, RefreshCw 
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import api from '@/lib/api';
import toast from 'react-hot-toast';

export default function HolidaysPage() {
  const [holidays, setHolidays] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newHoli, setNewHoli] = useState({
    name: '',
    date: '',
    description: '',
  });

  useEffect(() => {
    fetchHolidays();
  }, []);

  const fetchHolidays = async () => {
    try {
      setLoading(true);
      const res = await api.get('/holidays');
      setHolidays(res.data?.holidays || res.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleAddHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHoli.name || !newHoli.date) {
      toast.error('Holiday name and date are required');
      return;
    }
    try {
      await api.post('/holidays', newHoli);
      toast.success('Holiday added successfully!');
      setIsAddModalOpen(false);
      fetchHolidays();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to add holiday');
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Annual Holiday Calendar</h1>
            <p className="text-sm text-gray-500 mt-1">
              Public, regional, and company holidays for BSC Textiles stores
            </p>
          </div>

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="bg-primary-600 hover:bg-primary-700 text-white font-medium py-2 px-4 rounded-lg shadow-sm text-sm flex items-center gap-2 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Holiday
          </button>
        </div>

        {/* Holidays List */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="divide-y divide-gray-100">
            {holidays.map((h, i) => (
              <div key={h.id || i} className="p-4 flex items-center justify-between hover:bg-gray-50/80 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-primary-50 text-primary-700 flex flex-col items-center justify-center font-bold">
                    <span className="text-[10px] uppercase">{new Date(h.date).toLocaleDateString(undefined, { month: 'short' })}</span>
                    <span className="text-base">{new Date(h.date).getDate()}</span>
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 text-sm">{h.name}</h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {new Date(h.date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric' })} • {h.location?.name || 'All Locations'}
                    </p>
                  </div>
                </div>

                <span className="text-xs bg-emerald-50 text-emerald-700 font-semibold px-2.5 py-1 rounded-full">
                  Declared Holiday
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Add Modal */}
        {isAddModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
              <div className="flex items-center justify-between pb-4 border-b border-gray-100">
                <h3 className="text-lg font-bold text-gray-900">Add Holiday</h3>
                <button onClick={() => setIsAddModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleAddHoliday} className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Holiday Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Karnataka Rajyotsava"
                    value={newHoli.name}
                    onChange={(e) => setNewHoli({ ...newHoli, name: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Date *</label>
                  <input
                    type="date"
                    required
                    value={newHoli.date}
                    onChange={(e) => setNewHoli({ ...newHoli, date: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                <div className="pt-3 flex justify-end gap-3 border-t border-gray-100">
                  <button type="button" onClick={() => setIsAddModalOpen(false)} className="px-4 py-2 text-xs text-gray-600 hover:bg-gray-100 rounded-lg">
                    Cancel
                  </button>
                  <button type="submit" className="px-5 py-2 text-xs bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium">
                    Save Holiday
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
