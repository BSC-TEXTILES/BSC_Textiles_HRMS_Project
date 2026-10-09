'use client';

import { useEffect, useState, useCallback } from 'react';
import { 
  MessageSquare, Plus, Search, Filter, Eye, Edit, Trash2,
  CheckCircle, AlertCircle, Star, Flag, BookOpen, Video,
  Camera, Mic, Paperclip, Send, Smile, ThumbsUp, Award,
  AlertTriangle, RefreshCw, Download, ChevronDown, ChevronUp,
  X
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { DataTable } from '@/components/ui/DataTable';
import { api } from '@/lib/api';
import { formatDateTime, cn } from '@/lib/utils';

interface Observation {
  id: number;
  code: string;
  employeeId: number;
  employeeCode: string;
  employeeName: string;
  locationId: number;
  locationCode: string;
  locationName: string;
  floorId: number | null;
  floorName: string | null;
  sectionId: number | null;
  sectionName: string | null;
  sellingPointId: number | null;
  sellingPointName: string | null;
  levelId: number;
  levelName: string;
  levelColor: string;
  observationDate: string;
  observationTime: string;
  observationType: string;
  priority: string;
  description: string;
  actionRequired: string | null;
  assignedTo: number | null;
  dueDate: string | null;
  status: string;
  videoUrl: string | null;
  photoUrl: string | null;
  createdBy: number;
  createdByName: string;
  createdAt: string;
  attachments: Array<{ id: number; fileName: string; filePath: string; fileType: string; fileSize: number }>;
  comments: Array<{ id: number; userId: number; userName: string; message: string; createdAt: string }>;
  reactions: Array<{ id: number; userId: number; userName: string; reactionCode: string }>;
}

interface ObservationLevel {
  id: number;
  levelNumber: number;
  name: string;
  ratingLabel: string;
  score: number;
  colorToken: string;
  requiresAction: boolean;
}

const OBS_TYPES = [
  'positive', 'improvement', 'customer_service', 'sales', 'grooming',
  'product_knowledge', 'attendance', 'discipline', 'selling_skill',
  'store_standard', 'safety'
];

const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
const STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];
const LEVELS = ['EXCELLENT', 'VERY_GOOD', 'GOOD', 'NEEDS_IMPROVEMENT', 'CRITICAL'];
const REACTIONS = [
  { code: 'acknowledged', label: 'Acknowledged', icon: CheckCircle },
  { code: 'completed', label: 'Completed', icon: CheckCircle },
  { code: 'excellent', label: 'Excellent', icon: Star },
  { code: 'reviewing', label: 'Reviewing', icon: BookOpen },
  { code: 'attention', label: 'Attention', icon: AlertTriangle },
];

export default function ObservationsPage() {
  const [observations, setObservations] = useState<Observation[]>([]);
  const [levels, setLevels] = useState<ObservationLevel[]>([]);
  const [employees, setEmployees] = useState<Array<{ id: string; fullName: string; employeeCode: string; locationId?: string }>>([]);
  const [locations, setLocations] = useState<Array<{ id: string; code: string; name: string }>>([
    { id: 'cmuzam5fe00014n4pq25hkcww', code: 'BEL', name: 'Belagavi Flagship (BEL-01)' },
    { id: 'cmuzam5fr00024n4p4izbomev', code: 'DAV', name: 'Davanagere Showroom (DAV-02)' },
    { id: 'cmuzam5g400034n4p89o33l8e', code: 'SHI', name: 'Shivamogga Retail Apex (SHI-03)' },
  ]);
  const [loading, setLoading] = useState(true);
  const [locationId, setLocationId] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedObs, setSelectedObs] = useState<Observation | null>(null);
  const [newComment, setNewComment] = useState('');

  // Form state
  const [formData, setFormData] = useState({
    locationId: 'cmuzam5fe00014n4pq25hkcww',
    floorId: '',
    sectionId: '',
    sellingPointId: '',
    employeeId: '',
    level: 'GOOD',
    observationDate: new Date().toISOString().slice(0, 10),
    observationTime: new Date().toTimeString().slice(0, 5),
    observationType: 'sales',
    priority: 'medium',
    description: '',
    actionRequired: '',
    assignedTo: '',
    dueDate: '',
    videoUrl: '',
    photoUrl: '',
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (locationId && locationId !== 'all') params.set('locationId', locationId);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (typeFilter !== 'all') params.set('observationType', typeFilter.toUpperCase().replace(/\s+/g, '_'));
      if (levelFilter !== 'all') params.set('level', levelFilter);

      const [obsRes, levelsRes, empRes, locRes] = await Promise.all([
        api.get<any>(`/observations?${params.toString()}`).catch(() => ({ data: { observations: [] } })),
        api.get<any>('/observations/levels').catch(() => ({ data: { levels: [] } })),
        api.get<any>('/employees?limit=100').catch(() => ({ data: { employees: [] } })),
        api.get<any>('/locations').catch(() => ({ data: { locations: [] } })),
      ]);

      const rawObs = obsRes.data?.observations || obsRes.data?.rows || (Array.isArray(obsRes.data) ? obsRes.data : []);
      const normalizedObs = (Array.isArray(rawObs) ? rawObs : []).map((o: any) => ({
        ...o,
        id: o.id,
        code: o.code || `OBS-${String(o.id).slice(-4).toUpperCase()}`,
        employeeName: o.employeeName || o.employee?.fullName || 'Personnel',
        employeeCode: o.employeeCode || o.employee?.employeeCode || '—',
        levelName: o.levelName || o.level || 'Standard',
        levelColor: o.levelColor || (o.level === 'CRITICAL' ? '#dc2626' : o.level === 'NEEDS_IMPROVEMENT' ? '#d97706' : '#059669'),
        observationDate: o.observationDate ? String(o.observationDate).slice(0, 10) : (o.createdAt ? String(o.createdAt).slice(0, 10) : new Date().toISOString().slice(0, 10)),
        observationTime: o.observationTime || (o.createdAt ? String(o.createdAt).slice(11, 16) : '10:00'),
        priority: o.priority || 'medium',
        status: o.status || 'OPEN',
        observationType: o.observationType || 'positive',
        description: o.description || '',
        createdByName: o.createdByName || o.createdBy?.fullName || 'Supervisor',
      }));
      setObservations(normalizedObs);

      const rawLevels = levelsRes.data?.levels || (Array.isArray(levelsRes.data) ? levelsRes.data : []);
      if (Array.isArray(rawLevels) && rawLevels.length > 0) {
        setLevels(rawLevels);
      }

      const rawEmps = empRes.data?.employees || empRes.data?.rows || (Array.isArray(empRes.data) ? empRes.data : []);
      if (Array.isArray(rawEmps) && rawEmps.length > 0) {
        setEmployees(rawEmps);
      }

      const rawLocs = locRes.data?.locations || (Array.isArray(locRes.data) ? locRes.data : []);
      if (Array.isArray(rawLocs) && rawLocs.length > 0) {
        setLocations(rawLocs);
      }
    } catch (err) {
      console.error('Failed to fetch observations:', err);
    } finally {
      setLoading(false);
    }
  }, [locationId, statusFilter, typeFilter, levelFilter]);

  // Deep-link support: /operations/observations?status=OPEN&level=CRITICAL
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const q = new URLSearchParams(window.location.search);
      const s = q.get('status');
      const l = q.get('level');
      if (s) setStatusFilter(s);
      if (l) setLevelFilter(l);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const levelScoreMap: Record<string, number> = {
        EXCELLENT: 5,
        VERY_GOOD: 4,
        GOOD: 3,
        NEEDS_IMPROVEMENT: 2,
        CRITICAL: 1,
      };
      const selectedLevel = formData.level || 'GOOD';
      const score = levelScoreMap[selectedLevel] || 3;
      const targetEmpId = formData.employeeId || (employees.length > 0 ? employees[0].id : 'cmuzam8lr009i4n4p5336xloi');

      await api.post('/observations', {
        locationId: formData.locationId,
        employeeId: targetEmpId,
        floorId: formData.floorId || undefined,
        sectionId: formData.sectionId || undefined,
        sellingPointId: formData.sellingPointId || undefined,
        observationType: formData.observationType.toUpperCase().replace(/\s+/g, '_'),
        level: selectedLevel,
        score: score,
        description: formData.description.length < 10 ? `${formData.description} (Retail observation record)` : formData.description,
        actionRequired: formData.actionRequired || undefined,
        dueDate: formData.dueDate ? new Date(formData.dueDate).toISOString() : undefined,
        videoUrl: formData.videoUrl || undefined,
        photoUrl: formData.photoUrl || undefined,
      });
      setShowCreateModal(false);
      resetForm();
      fetchData();
    } catch (err) {
      console.error('Failed to create observation:', err);
    }
  };

  const resetForm = () => {
    setFormData({
      locationId: locations[0]?.id || 'cmuzam5fe00014n4pq25hkcww',
      floorId: '',
      sectionId: '',
      sellingPointId: '',
      employeeId: employees[0]?.id || '',
      level: 'GOOD',
      observationDate: new Date().toISOString().slice(0, 10),
      observationTime: new Date().toTimeString().slice(0, 5),
      observationType: 'sales',
      priority: 'medium',
      description: '',
      actionRequired: '',
      assignedTo: '',
      dueDate: '',
      videoUrl: '',
      photoUrl: '',
    });
  };

  const handleAddComment = async (obsId: number) => {
    if (!newComment.trim()) return;
    try {
      await api.post(`/observations/${obsId}/comments`, { message: newComment });
      setNewComment('');
      const res = await api.get<Observation>(`/observations/${obsId}`);
      setSelectedObs(res.data);
    } catch (err) {
      console.error('Failed to add comment:', err);
    }
  };

  const handleReaction = async (obsId: number, reactionCode: string) => {
    try {
      await api.post(`/observations/${obsId}/reactions`, { reactionCode });
      const res = await api.get<Observation>(`/observations/${obsId}`);
      setSelectedObs(res.data);
    } catch (err) {
      console.error('Failed to add reaction:', err);
    }
  };

  const handleStatusChange = async (obsId: number, status: string) => {
    try {
      await api.put(`/observations/${obsId}`, { status });
      fetchData();
      if (selectedObs?.id === obsId) {
        const res = await api.get<Observation>(`/observations/${obsId}`);
        setSelectedObs(res.data);
      }
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  const filteredObservations = observations.filter(obs => {
    if (search) {
      const s = search.toLowerCase();
      return obs.employeeName.toLowerCase().includes(s) ||
             obs.employeeCode.toLowerCase().includes(s) ||
             obs.description.toLowerCase().includes(s) ||
             obs.code.toLowerCase().includes(s);
    }
    return true;
  });

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-red-100 text-red-700';
      case 'high': return 'bg-orange-100 text-orange-700';
      case 'medium': return 'bg-amber-100 text-amber-700';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'new': return 'bg-blue-100 text-blue-700';
      case 'open': return 'bg-indigo-100 text-indigo-700';
      case 'in_review': return 'bg-purple-100 text-purple-700';
      case 'action_required': return 'bg-red-100 text-red-700';
      case 'completed': return 'bg-emerald-100 text-emerald-700';
      case 'closed': return 'bg-slate-100 text-slate-700';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  const columns = [
    { key: 'code', header: 'Code', render: (row: Observation) => <span className="font-mono text-xs">{row.code}</span> },
    { key: 'date', header: 'Date', render: (row: Observation) => <span className="text-sm">{row.observationDate}</span> },
    { key: 'employee', header: 'Employee', render: (row: Observation) => (
      <div>
        <p className="font-medium">{row.employeeName}</p>
        <p className="text-xs text-gray-500 font-mono">{row.employeeCode}</p>
      </div>
    )},
    { key: 'type', header: 'Type', render: (row: Observation) => (
      <Badge variant="neutral" className="text-xs capitalize">{row.observationType.replace('_', ' ')}</Badge>
    )},
    { key: 'level', header: 'Level', render: (row: Observation) => (
      <Badge className="text-xs" style={{ backgroundColor: `${row.levelColor}100`, color: row.levelColor }}>
        {row.levelName}
      </Badge>
    )},
    { key: 'priority', header: 'Priority', render: (row: Observation) => (
      <span className={`px-2 py-0.5 rounded text-xs font-medium ${getPriorityColor(row.priority)}`}>
        {row.priority}
      </span>
    )},
    { key: 'status', header: 'Status', render: (row: Observation) => (
      <Badge variant={getStatusColor(row.status) as any} dot>
        {row.status.replace('_', ' ')}
      </Badge>
    )},
    { key: 'assigned', header: 'Assigned To', render: (row: Observation) => 
      row.assignedTo ? <span className="text-sm">User #{row.assignedTo}</span> : <span className="text-gray-400">—</span>
    },
    { key: 'dueDate', header: 'Due Date', render: (row: Observation) => 
      row.dueDate ? <span className="text-sm">{row.dueDate}</span> : <span className="text-gray-400">—</span>
    },
    { key: 'actions', header: 'Actions', render: (row: Observation) => (
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={() => { api.get<Observation>(`/observations/${row.id}`).then(res => setSelectedObs(res.data)); }}>
          <Eye className="w-4 h-4" />
        </Button>
      </div>
    )},
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Observations</h1>
            <p className="text-gray-600 mt-1">Record and track employee observations across all categories</p>
          </div>
          <Button onClick={() => { resetForm(); setShowCreateModal(true); }}>
            <Plus className="w-4 h-4 mr-2" /> Add Observation
          </Button>
        </div>

        {/* Filters */}
        <Card className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-5 lg:grid-cols-6 gap-3">
            <Select
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              options={[
                { value: 'all', label: 'All Hubs' },
                ...locations.map(loc => ({ value: loc.id, label: loc.name || loc.code }))
              ]}
            />
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              options={[{ value: 'all', label: 'All Status' }, ...STATUSES.map(s => ({ value: s, label: s.replace('_', ' ') }))]}
            />
            <Select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              options={[{ value: 'all', label: 'All Types' }, ...OBS_TYPES.map(t => ({ value: t, label: t.replace('_', ' ') }))]}
            />
            <Select
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value)}
              options={[{ value: 'all', label: 'All Levels' }, ...LEVELS.map(l => ({ value: l, label: l.replace(/_/g, ' ') }))]}
            />
            <Input
              placeholder="Search observations..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Button variant="outline" onClick={fetchData} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </Card>

        {/* Observations Table */}
        <Card>
          <DataTable
            columns={columns}
            data={filteredObservations}
            loading={loading}
            emptyMessage="No observations found"
            rowClick={(row) => {
              api.get<Observation>(`/observations/${row.id}`).then(res => setSelectedObs(res.data));
            }}
            striped
            hoverable
          />
        </Card>

        {/* Create Observation Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">Create Observation</h3>
                <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleCreate} className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Select
                    label="Location *"
                    value={formData.locationId}
                    onChange={(e) => setFormData({ ...formData, locationId: e.target.value })}
                    options={locations.map(loc => ({ value: loc.id, label: loc.name || loc.code }))}
                    required
                  />
                  <Select
                    label="Floor"
                    value={formData.floorId}
                    onChange={(e) => setFormData({ ...formData, floorId: e.target.value })}
                    options={[{ value: '', label: 'Select Floor' }]}
                  />
                  <Select
                    label="Section"
                    value={formData.sectionId}
                    onChange={(e) => setFormData({ ...formData, sectionId: e.target.value })}
                    options={[{ value: '', label: 'Select Section' }]}
                  />
                  <Select
                    label="Selling Point"
                    value={formData.sellingPointId}
                    onChange={(e) => setFormData({ ...formData, sellingPointId: e.target.value })}
                    options={[{ value: '', label: 'Select Selling Point' }]}
                  />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <Select
                    label="Employee *"
                    value={formData.employeeId}
                    onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                    options={[
                      { value: '', label: 'Select Employee...' },
                      ...employees.map(emp => ({ value: emp.id, label: `${emp.fullName} (${emp.employeeCode})` }))
                    ]}
                    required
                  />
                  <Select
                    label="Level *"
                    value={formData.level}
                    onChange={(e) => setFormData({ ...formData, level: e.target.value })}
                    options={LEVELS.map(l => ({ value: l, label: l.replace(/_/g, ' ') }))}
                    required
                  />
                  <Select
                    label="Priority"
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                    options={PRIORITIES.map(p => ({ value: p, label: p }))}
                  />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Input
                    label="Date *"
                    type="date"
                    value={formData.observationDate}
                    onChange={(e) => setFormData({ ...formData, observationDate: e.target.value })}
                    required
                  />
                  <Input
                    label="Time *"
                    type="time"
                    value={formData.observationTime}
                    onChange={(e) => setFormData({ ...formData, observationTime: e.target.value })}
                    required
                  />
                  <Select
                    label="Type *"
                    value={formData.observationType}
                    onChange={(e) => setFormData({ ...formData, observationType: e.target.value })}
                    options={OBS_TYPES.map(t => ({ value: t, label: t.replace('_', ' ') }))}
                    required
                  />
                </div>

                <Textarea
                  label="Description *"
                  placeholder="Describe the observation..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  required
                  rows={4}
                />

                <Textarea
                  label="Action Required"
                  placeholder="What action is needed?"
                  value={formData.actionRequired}
                  onChange={(e) => setFormData({ ...formData, actionRequired: e.target.value })}
                  rows={3}
                />

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Input
                    label="Assigned To (User ID)"
                    type="number"
                    placeholder="User ID"
                    value={formData.assignedTo}
                    onChange={(e) => setFormData({ ...formData, assignedTo: e.target.value })}
                  />
                  <Input
                    label="Due Date"
                    type="date"
                    value={formData.dueDate}
                    onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                  />
                  <Input
                    label="Video URL"
                    placeholder="https://..."
                    value={formData.videoUrl}
                    onChange={(e) => setFormData({ ...formData, videoUrl: e.target.value })}
                  />
                  <Input
                    label="Photo URL"
                    placeholder="https://..."
                    value={formData.photoUrl}
                    onChange={(e) => setFormData({ ...formData, photoUrl: e.target.value })}
                  />
                </div>

                <div className="flex justify-end gap-2 pt-4 border-t border-gray-100">
                  <Button type="button" variant="outline" onClick={() => setShowCreateModal(false)}>Cancel</Button>
                  <Button type="submit" disabled={loading}>
                    <Plus className="w-4 h-4 mr-2" /> Create Observation
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Observation Detail Modal */}
        {selectedObs && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">{selectedObs.code} — {selectedObs.employeeName}</h3>
                <button onClick={() => setSelectedObs(null)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-4 space-y-6">
                {/* Header Info */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-2xs text-gray-500">Code</p>
                    <p className="font-mono font-medium">{selectedObs.code}</p>
                  </div>
                  <div>
                    <p className="text-2xs text-gray-500">Type</p>
                    <Badge variant="neutral" className="capitalize">{selectedObs.observationType.replace('_', ' ')}</Badge>
                  </div>
                  <div>
                    <p className="text-2xs text-gray-500">Level</p>
                    <Badge style={{ backgroundColor: `${selectedObs.levelColor}100`, color: selectedObs.levelColor }}>
                      {selectedObs.levelName}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-2xs text-gray-500">Priority</p>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${getPriorityColor(selectedObs.priority)}`}>
                      {selectedObs.priority}
                    </span>
                  </div>
                  <div>
                    <p className="text-2xs text-gray-500">Status</p>
                    <Badge variant={getStatusColor(selectedObs.status) as any} dot>
                      {selectedObs.status.replace('_', ' ')}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-2xs text-gray-500">Date</p>
                    <p className="font-medium">{selectedObs.observationDate}</p>
                  </div>
                  <div>
                    <p className="text-2xs text-gray-500">Time</p>
                    <p className="font-medium">{selectedObs.observationTime}</p>
                  </div>
                  <div>
                    <p className="text-2xs text-gray-500">Created By</p>
                    <p className="font-medium">{selectedObs.createdByName}</p>
                  </div>
                </div>

                {/* Description */}
                <div className="border-t border-gray-200 pt-4">
                  <h4 className="font-semibold text-gray-900 mb-2">Description</h4>
                  <p className="text-gray-700 whitespace-pre-wrap">{selectedObs.description}</p>
                </div>

                {selectedObs.actionRequired && (
                  <div className="border-t border-gray-200 pt-4 bg-amber-50 rounded-lg p-4">
                    <h4 className="font-semibold text-amber-900 mb-2 flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5" /> Action Required
                    </h4>
                    <p className="text-amber-800">{selectedObs.actionRequired}</p>
                  </div>
                )}

                {/* Status Change */}
                <div className="border-t border-gray-200 pt-4">
                  <h4 className="font-semibold text-gray-900 mb-3">Update Status</h4>
                  <div className="flex flex-wrap gap-2">
                    {STATUSES.map(s => (
                      <Button
                        key={s}
                        variant={selectedObs.status === s ? 'primary' : 'outline'}
                        size="sm"
                        onClick={() => handleStatusChange(selectedObs.id, s)}
                        className={cn('capitalize', getStatusColor(s).replace('bg-', 'bg-').replace('text-', 'border-'))}
                      >
                        {s.replace('_', ' ')}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Attachments */}
                {selectedObs.attachments.length > 0 && (
                  <div className="border-t border-gray-200 pt-4">
                    <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                      <Paperclip className="w-5 h-5" /> Attachments
                    </h4>
                    <div className="flex flex-wrap gap-3">
                      {selectedObs.attachments.map(att => (
                        <div key={att.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                          <Paperclip className="w-5 h-5 text-gray-500" />
                          <a href={att.filePath} target="_blank" className="text-sm font-medium text-primary-600 hover:underline">
                            {att.fileName}
                          </a>
                          <span className="text-xs text-gray-500">({(att.fileSize / 1024).toFixed(1)} KB)</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Media URLs */}
                {(selectedObs.videoUrl || selectedObs.photoUrl) && (
                  <div className="border-t border-gray-200 pt-4">
                    <h4 className="font-semibold text-gray-900 mb-3">Media</h4>
                    <div className="flex gap-4">
                      {selectedObs.videoUrl && (
                        <a href={selectedObs.videoUrl} target="_blank" className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                          <Video className="w-5 h-5 text-red-500" />
                          <span className="text-sm font-medium text-primary-600">View Video</span>
                        </a>
                      )}
                      {selectedObs.photoUrl && (
                        <a href={selectedObs.photoUrl} target="_blank" className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                          <Camera className="w-5 h-5 text-blue-500" />
                          <span className="text-sm font-medium text-primary-600">View Photo</span>
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {/* Reactions */}
                <div className="border-t border-gray-200 pt-4">
                  <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <Smile className="w-5 h-5" /> Reactions
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {REACTIONS.map(r => {
                      const count = selectedObs.reactions.filter(rx => rx.reactionCode === r.code).length;
                      const userReacted = selectedObs.reactions.some(rx => rx.reactionCode === r.code && rx.userId === 1);
                      return (
                        <Button
                          key={r.code}
                          variant={userReacted ? 'primary' : 'outline'}
                          size="sm"
                          onClick={() => handleReaction(selectedObs.id, r.code)}
                          className="gap-1"
                        >
                          <r.icon className="w-4 h-4" />
                          <span>{r.label}</span>
                          {count > 0 && <span className="text-xs bg-gray-200 px-1.5 py-0.5 rounded">{count}</span>}
                        </Button>
                      );
                    })}
                  </div>
                </div>

                {/* Comments */}
                <div className="border-t border-gray-200 pt-4">
                  <h4 className="font-semibold text-gray-900 mb-3 flex items-center justify-between">
                    <span><MessageSquare className="w-5 h-5" /> Comments ({selectedObs.comments.length})</span>
                  </h4>
                  <div className="space-y-3 max-h-64 overflow-y-auto">
                    {selectedObs.comments.map(comment => (
                      <div key={comment.id} className="p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-primary-100 flex items-center justify-center">
                              <span className="text-xs font-bold text-primary-700">{comment.userName[0]}</span>
                            </div>
                            <div>
                              <p className="font-medium text-sm">{comment.userName}</p>
                              <p className="text-xs text-gray-500">{new Date(comment.createdAt).toLocaleString()}</p>
                            </div>
                          </div>
                        </div>
                        <p className="mt-2 text-gray-700">{comment.message}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Input
                      placeholder="Add a comment..."
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      className="flex-1"
                    />
                    <Button onClick={() => handleAddComment(selectedObs.id)} disabled={!newComment.trim()}>
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function getPriorityColor(priority: string) {
  switch (priority) {
    case 'urgent': return 'bg-red-100 text-red-700';
    case 'high': return 'bg-orange-100 text-orange-700';
    case 'medium': return 'bg-amber-100 text-amber-700';
    default: return 'bg-slate-100 text-slate-700';
  }
}

function getStatusColor(status: string) {
  switch (status.toLowerCase()) {
    case 'new': return 'bg-blue-100 text-blue-700';
    case 'open': return 'bg-indigo-100 text-indigo-700';
    case 'in_review': return 'bg-purple-100 text-purple-700';
    case 'action_required': return 'bg-red-100 text-red-700';
    case 'completed': return 'bg-emerald-100 text-emerald-700';
    case 'closed': return 'bg-slate-100 text-slate-700';
    default: return 'bg-slate-100 text-slate-700';
  }
}