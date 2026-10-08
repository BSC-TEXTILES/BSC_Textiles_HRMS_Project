'use client';

import { useState, useEffect } from 'react';
import { 
  MapPin, Plus, Search, Building2, Users, 
  Target, TrendingUp, CheckCircle, X, Edit, Shield 
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import api from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import toast from 'react-hot-toast';

export default function SellingPointsPage() {
  const [sellingPoints, setSellingPoints] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [floors, setFloors] = useState<any[]>([]);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const [newSP, setNewSP] = useState({
    name: '',
    code: '',
    locationId: '',
    floorId: '',
    category: 'Sales',
    targetAmount: 1000000,
  });

  useEffect(() => {
    fetchLocations();
  }, []);

  useEffect(() => {
    fetchSellingPoints();
  }, [selectedLocation]);

  const fetchLocations = async () => {
    try {
      const res = await api.get('/locations/all');
      const locs = res.data || [];
      setLocations(locs);
      if (locs.length > 0) {
        setSelectedLocation(locs[0].id);
        fetchFloors(locs[0].id);
      }
    } catch (e) {
      console.error('Fetch locations error:', e);
    }
  };

  const fetchFloors = async (locId: string) => {
    try {
      const res = await api.get(`/floors?locationId=${locId}`);
      setFloors(res.data?.floors || []);
    } catch (e) {
      console.error('Fetch floors error:', e);
    }
  };

  const fetchSellingPoints = async () => {
    try {
      setLoading(true);
      const url = selectedLocation ? `/selling-points?locationId=${selectedLocation}` : '/selling-points';
      const res = await api.get(url);
      setSellingPoints(res.data?.sellingPoints || []);
    } catch (e) {
      console.error('Fetch SP error:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSP = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!newSP.name || !newSP.locationId) {
        toast.error('Please enter selling point name and location');
        return;
      }
      await api.post('/selling-points', {
        ...newSP,
        code: newSP.code || `SP-${Date.now().toString().slice(-4)}`,
      });
      toast.success('Selling point created successfully!');
      setIsAddModalOpen(false);
      fetchSellingPoints();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to create selling point');
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Selling Points & Counters</h1>
            <p className="text-sm text-gray-500 mt-1">
              Floor sections, specialized retail counters, sales targets, and staff assignments
            </p>
          </div>

          <div className="flex items-center gap-3">
            <select
              value={selectedLocation}
              onChange={(e) => {
                setSelectedLocation(e.target.value);
                fetchFloors(e.target.value);
              }}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-primary-500 bg-white font-medium"
            >
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>{loc.name} ({loc.code})</option>
              ))}
            </select>

            <button 
              onClick={() => {
                setNewSP({ ...newSP, locationId: selectedLocation });
                setIsAddModalOpen(true);
              }}
              className="bg-primary-600 hover:bg-primary-700 text-white font-medium py-2 px-4 rounded-lg shadow-sm text-sm flex items-center gap-2 transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Counter
            </button>
          </div>
        </div>

        {/* Counters Grid */}
        {loading ? (
          <div className="py-12 text-center text-gray-400">Loading selling points...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {sellingPoints.map((sp) => (
              <div key={sp.id} className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-primary-600 bg-primary-50 px-2 py-0.5 rounded">
                      {sp.code}
                    </span>
                    <h3 className="font-bold text-gray-900 text-base mt-2">{sp.name}</h3>
                    <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-1">
                      <MapPin className="w-3.5 h-3.5" />
                      <span>{sp.floor?.name || 'Main Floor'} • {sp.location?.name}</span>
                    </div>
                  </div>
                  <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${
                    sp.category === 'Billing' ? 'bg-purple-100 text-purple-800' : 'bg-emerald-100 text-emerald-800'
                  }`}>
                    {sp.category || 'Sales'}
                  </span>
                </div>

                <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-gray-500 block">Monthly Target:</span>
                    <span className="font-bold text-gray-900 text-sm mt-0.5 block">
                      {formatCurrency(sp.targetAmount || 1000000)}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 block">Staff Assigned:</span>
                    <span className="font-bold text-gray-900 text-sm mt-0.5 flex items-center gap-1">
                      <Users className="w-3.5 h-3.5 text-gray-400" />
                      {sp._count?.employees || 3} Consultants
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add Modal */}
        {isAddModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
              <div className="flex items-center justify-between pb-4 border-b border-gray-100">
                <h3 className="text-lg font-bold text-gray-900">Add Selling Point Counter</h3>
                <button onClick={() => setIsAddModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreateSP} className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Counter Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Wedding Silk Saree Counter C"
                    value={newSP.name}
                    onChange={(e) => setNewSP({ ...newSP, name: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Code</label>
                    <input
                      type="text"
                      placeholder="e.g. BEL-SP-10"
                      value={newSP.code}
                      onChange={(e) => setNewSP({ ...newSP, code: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-primary-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Category</label>
                    <select
                      value={newSP.category}
                      onChange={(e) => setNewSP({ ...newSP, category: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                    >
                      <option value="Sales">Sales Floor</option>
                      <option value="Billing">Billing & Cash</option>
                      <option value="Customer Service">Customer Service</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Floor</label>
                  <select
                    value={newSP.floorId}
                    onChange={(e) => setNewSP({ ...newSP, floorId: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                  >
                    <option value="">Select Floor</option>
                    {floors.map((f) => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Target Sales (₹)</label>
                  <input
                    type="number"
                    value={newSP.targetAmount}
                    onChange={(e) => setNewSP({ ...newSP, targetAmount: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                <div className="pt-4 flex justify-end gap-3 border-t border-gray-100">
                  <button type="button" onClick={() => setIsAddModalOpen(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
                    Cancel
                  </button>
                  <button type="submit" className="px-5 py-2 text-sm bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium">
                    Save Counter
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
