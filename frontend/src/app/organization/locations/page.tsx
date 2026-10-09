'use client';

import { useEffect, useState } from 'react';
import { 
  Building2, Plus, Search, Edit, Trash2, MapPin,
  Phone, Mail, Clock, CheckCircle, AlertCircle,
  Shield, Settings, Download, RefreshCw
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { DataTable } from '@/components/ui/DataTable';
import { api } from '@/lib/api';
import { formatDate, formatTime, formatCurrency } from '@/lib/utils';

interface Location {
  id: string;
  code: string;
  name: string;
  locationType: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  phone: string;
  email: string;
  whatsapp: string;
  managerEmployeeId: string;
  managerName: string;
  hrContactEmployeeId: string;
  hrContactName: string;
  openingTime: string;
  closingTime: string;
  standardHours: number;
  weeklyOff: number;
  graceMinutes: number;
  lateThresholdMinutes: number;
  lunchQuotaMinutes: number;
  teaQuotaMinutes: number;
  maxContinuousHours: number;
  minRestIntervalMinutes: number;
  floorCoverageTarget: number;
  payrollState: string;
  ptSlabEnabled: boolean;
  pfEnabled: boolean;
  esicEnabled: boolean;
  status: string;
  createdAt: string;
  updatedAt: string;
  _count: {
    employees: number;
    floors: number;
    departments: number;
  };
}

const LOCATION_TYPES = ['store', 'mill', 'warehouse', 'office', 'mixed'];
const WEEK_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function LocationsPage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form states
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState('store');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('Karnataka');
  const [pincode, setPincode] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [openingTime, setOpeningTime] = useState('09:30');
  const [closingTime, setClosingTime] = useState('18:30');
  const [weeklyOff, setWeeklyOff] = useState('0');

  const fetchLocations = async () => {
    setLoading(true);
    try {
      const res = await api.get<{ locations: Location[] }>('/locations');
      setLocations(res.data.locations);
    } catch (err) {
      console.error('Failed to fetch locations:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLocations();
  }, []);

  const handleCreateLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await api.post('/locations', {
        code: code.trim().toUpperCase(),
        name: name.trim(),
        location_type: type,
        address_line1: address,
        city: city.trim(),
        state: state.trim(),
        pincode: pincode.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        opening_time: openingTime,
        closing_time: closingTime,
        weekly_off: Number(weeklyOff),
      });
      alert(`Location ${name} (${code}) created successfully!`);
      setShowAddModal(false);
      resetForm();
      fetchLocations();
    } catch (err: any) {
      alert(`Failed to create location: ${err.response?.data?.error || err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await api.put(`/locations/${editingLocation!.id}`, {
        name: name.trim(),
        location_type: type,
        address_line1: address,
        city: city.trim(),
        state: state.trim(),
        pincode: pincode.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        opening_time: openingTime,
        closing_time: closingTime,
        weekly_off: Number(weeklyOff),
      });
      alert(`Location ${name} updated successfully!`);
      setEditingLocation(null);
      resetForm();
      fetchLocations();
    } catch (err: any) {
      alert(`Failed to update location: ${err.response?.data?.error || err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (loc: Location) => {
    const newStatus = loc.status === 'active' ? 'inactive' : 'active';
    try {
      await api.patch(`/locations/${loc.id}/status`, { status: newStatus });
      fetchLocations();
    } catch (err: any) {
      alert(`Failed to update status: ${err.response?.data?.error || err.message}`);
    }
  };

  const handleEdit = (loc: Location) => {
    setEditingLocation(loc);
    setCode(loc.code);
    setName(loc.name);
    setType(loc.locationType);
    setAddress(loc.addressLine1 || '');
    setCity(loc.city || '');
    setState(loc.state || '');
    setPincode(loc.pincode || '');
    setPhone(loc.phone || '');
    setEmail(loc.email || '');
    setOpeningTime(loc.openingTime ? loc.openingTime.slice(0, 5) : '09:30');
    setClosingTime(loc.closingTime ? loc.closingTime.slice(0, 5) : '18:30');
    setWeeklyOff(String(loc.weeklyOff));
    setShowAddModal(true);
  };

  const resetForm = () => {
    setCode('');
    setName('');
    setType('store');
    setAddress('');
    setCity('');
    setState('Karnataka');
    setPincode('');
    setPhone('');
    setEmail('');
    setOpeningTime('09:30');
    setClosingTime('18:30');
    setWeeklyOff('0');
    setEditingLocation(null);
  };

  const handleDelete = async (loc: Location) => {
    if (!confirm(`Are you sure you want to delete ${loc.name} (${loc.code})?`)) return;
    try {
      await api.delete(`/locations/${loc.id}`);
      fetchLocations();
    } catch (err: any) {
      alert(`Failed to delete location: ${err.response?.data?.error || err.message}`);
    }
  };

  const columns = [
    { key: 'code', header: 'Code', render: (row: Location) => <span className="font-mono text-sm font-bold px-2 py-0.5 bg-blue-50 text-blue-700 rounded border border-blue-200">{row.code}</span> },
    { key: 'name', header: 'Name', render: (row: Location) => <span className="font-medium text-gray-900">{row.name}</span> },
    { key: 'type', header: 'Type', render: (row: Location) => <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{row.locationType}</span> },
    { key: 'city', header: 'City', render: (row: Location) => <div className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-blue-600" /> {row.city}, {row.state}</div> },
    { key: 'phone', header: 'Phone', render: (row: Location) => <span className="text-sm">{row.phone || '—'}</span> },
    { key: 'email', header: 'Email', render: (row: Location) => <span className="text-sm">{row.email || '—'}</span> },
    { key: 'hours', header: 'Hours', render: (row: Location) => <span className="text-sm font-medium">{row.openingTime?.slice(0,5)} - {row.closingTime?.slice(0,5)}</span> },
    { key: 'weeklyOff', header: 'Weekly Off', render: (row: Location) => <span className="text-sm">{WEEK_DAYS[row.weeklyOff] || '—'}</span> },
    { key: 'status', header: 'Status', render: (row: Location) => <Badge variant={row.status === 'active' ? 'success' : row.status === 'inactive' ? 'neutral' : 'danger'} dot>{row.status}</Badge> },
    { key: 'actions', header: 'Actions', render: (row: Location) => (
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={() => handleEdit(row)}><Edit className="w-4 h-4" /></Button>
        <Button variant="ghost" size="sm" onClick={() => handleToggleStatus(row)} className={row.status === 'active' ? 'text-amber-700' : 'text-emerald-700'}>{row.status === 'active' ? 'Deactivate' : 'Activate'}</Button>
        <Button variant="ghost" size="sm" onClick={() => handleDelete(row)} className="text-red-600 hover:text-red-800"><Trash2 className="w-4 h-4" /></Button>
      </div>
    )},
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Location & Hub Management</h1>
            <p className="text-gray-600 mt-1">Dynamic multi-location configuration for BSC Textiles retail showrooms, textile mills, warehouses, and regional offices.</p>
          </div>
          <Button className="gap-1.5" onClick={() => { resetForm(); setShowAddModal(true); }}>
            <Plus className="w-4 h-4" /> Add Location
          </Button>
        </div>

        {/* Grid of Locations */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {locations.map((loc) => (
            <Card key={loc.id} className="p-5 bg-white border border-slate-200 rounded-xl space-y-4 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold px-2 py-0.5 bg-blue-50 text-blue-700 rounded border border-blue-200">
                      {loc.code}
                    </span>
                    <Badge variant={loc.status === 'active' ? 'success' : 'neutral'}>
                      {loc.status === 'active' ? 'Active' : 'Inactive'}
                    </Badge>
                    <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                      {loc.locationType}
                    </span>
                  </div>
                  <h3 className="font-bold text-slate-900 text-base mt-1.5">{loc.name}</h3>
                  <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                    <MapPin className="w-3.5 h-3.5 text-blue-600" /> {loc.city}, {loc.state}
                  </p>
                </div>

                <div className="text-xs space-y-1.5 bg-slate-50 p-3 rounded-lg border border-slate-100 text-slate-600">
                  <p className="truncate"><strong className="text-slate-800">Address:</strong> {loc.addressLine1 || 'Main Market Road'}</p>
                  <p><strong className="text-slate-800">Phone:</strong> {loc.phone || '+91 831 240 0100'}</p>
                  <p><strong className="text-slate-800">Email:</strong> {loc.email || `${loc.code.toLowerCase()}@bsctextiles.in`}</p>
                  <div className="flex justify-between pt-1 border-t border-slate-200 text-slate-700 font-medium">
                    <span>Hours: {loc.openingTime?.slice(0,5)} - {loc.closingTime?.slice(0,5)}</span>
                    <span>Weekly Off: {WEEK_DAYS[loc.weeklyOff] || 'Sunday'}</span>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-slate-100 text-xs">
                  <Button
                    size="xs"
                    variant="outline"
                    className={loc.status === 'active' ? 'text-amber-700' : 'text-emerald-700'}
                    onClick={() => handleToggleStatus(loc)}
                  >
                    {loc.status === 'active' ? 'Deactivate' : 'Activate'}
                  </Button>
                  <Button size="xs" variant="outline" className="gap-1" onClick={() => handleEdit(loc)}>
                    <Settings className="w-3.5 h-3.5" /> Configure Rules
                  </Button>
                </div>
              </div>
              </Card>
          ))}
        </div>

        {/* Add/Edit Location Modal */}
        {(showAddModal || editingLocation) && (
          <Modal open={showAddModal || !!editingLocation} onClose={() => { setShowAddModal(false); setEditingLocation(null); resetForm(); }} title={editingLocation ? `Edit Location: ${editingLocation.name}` : 'Add New BSC Textiles Location Hub'}>
            <form onSubmit={editingLocation ? handleUpdateLocation : handleCreateLocation} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Location Code (e.g. BEL)"
                  placeholder="BEL"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  disabled={!!editingLocation}
                />
                <Input
                  label="Location Name"
                  placeholder="e.g. Belagavi Flagship Store"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Select
                  label="Location Type"
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  options={[
                    { value: 'store', label: 'Retail Store / Flagship' },
                    { value: 'mill', label: 'Textile Mill / Factory' },
                    { value: 'warehouse', label: 'Warehouse / Logistics' },
                    { value: 'office', label: 'Corporate Office' },
                    { value: 'mixed', label: 'Mixed (Store + Atelier)' },
                  ]}
                />
                <Input
                  label="City"
                  placeholder="e.g. Belagavi"
                  required
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                />
              </div>

              <Input
                label="Address Line"
                placeholder="e.g. Station Road, Near Central Bus Stand"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />

              <div className="grid grid-cols-3 gap-3">
                <Input label="State" value={state} onChange={(e) => setState(e.target.value)} />
                <Input label="PIN Code" placeholder="580020" value={pincode} onChange={(e) => setPincode(e.target.value)} />
                <Input label="Phone Number" placeholder="+91 836 240 0500" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <Input label="Opening Time" type="time" value={openingTime} onChange={(e) => setOpeningTime(e.target.value)} />
                <Input label="Closing Time" type="time" value={closingTime} onChange={(e) => setClosingTime(e.target.value)} />
                <Select
                  label="Weekly Off"
                  value={weeklyOff}
                  onChange={(e) => setWeeklyOff(e.target.value)}
                  options={WEEK_DAYS.map((day, i) => ({ value: String(i), label: day }))}
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <Button type="button" variant="outline" onClick={() => { setShowAddModal(false); setEditingLocation(null); resetForm(); }}>Cancel</Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Saving...' : editingLocation ? 'Update Location' : 'Create Location'}
                </Button>
              </div>
            </form>
          </Modal>
        )}
      </div>
    </DashboardLayout>
  );
}