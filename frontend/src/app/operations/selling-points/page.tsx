'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { 
  Building2, MapPin, Users, Target, TrendingUp, Search, Plus, 
  ChevronDown, ChevronUp, ChevronRight, Folder, FolderOpen, 
  CreditCard, Receipt, DollarSign, Download, ArrowRightLeft, 
  AlertTriangle, Sparkles, Filter, RefreshCw, Eye, Printer, 
  Phone, Mail, CheckCircle2, Clock, X, Shield, Award, UserCheck, 
  UserX, ShoppingBag, Layers, BarChart3, HelpCircle, Store
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import api from '@/lib/api';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils';
import toast from 'react-hot-toast';

export default function SellingPointsPage() {
  // State
  const [hierarchyData, setHierarchyData] = useState<any>(null);
  const [locations, setLocations] = useState<any[]>([]);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters & Controls
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFloorFilter, setSelectedFloorFilter] = useState('ALL');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('ALL');
  const [activeTab, setActiveTab] = useState<'FOLDERS' | 'DIRECTORY' | 'BILLING'>('FOLDERS');
  const [expandedFloors, setExpandedFloors] = useState<Record<string, boolean>>({});

  // Modals & Drawers
  const [isAddCounterModalOpen, setIsAddCounterModalOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [selectedSalespersonDrawer, setSelectedSalespersonDrawer] = useState<any>(null);
  const [selectedBillReceipt, setSelectedBillReceipt] = useState<any>(null);

  // Form states
  const [availableEmployees, setAvailableEmployees] = useState<any[]>([]);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [assignForm, setAssignForm] = useState({
    counterId: '',
    employeeId: '',
    isPrimary: true,
  });

  const [transferForm, setTransferForm] = useState({
    employeeId: '',
    fromCounterId: '',
    toCounterId: '',
    employeeName: '',
    fromCounterName: '',
    isPrimary: false,
  });

  const [newCounterForm, setNewCounterForm] = useState({
    name: '',
    code: '',
    locationId: '',
    floorId: '',
    sectionId: '',
    category: 'Sales',
    targetAmount: 1000000,
  });

  // Fetch Locations
  const fetchLocations = useCallback(async () => {
    try {
      const res = await api.get('/locations/all');
      const locs = res.data || [];
      setLocations(locs);
      if (locs.length > 0 && !selectedLocation) {
        setSelectedLocation(locs[0].id);
      }
    } catch (e) {
      console.error('Fetch locations error:', e);
    }
  }, [selectedLocation]);

  // Fetch Floor Hierarchy & Operations Data
  const fetchOperationsData = useCallback(async (isSilent = false) => {
    if (!selectedLocation) return;
    try {
      if (!isSilent) setLoading(true);
      else setRefreshing(true);

      const res = await api.get(`/selling-points/floor-hierarchy?locationId=${selectedLocation}`);
      const data = res.data;
      setHierarchyData(data);

      // Default expand all floors if not set
      if (data?.floors) {
        setExpandedFloors((prev) => {
          if (Object.keys(prev).length > 0) return prev;
          const initialExpanded: Record<string, boolean> = {};
          data.floors.forEach((f: any) => {
            initialExpanded[f.id] = true;
          });
          return initialExpanded;
        });
      }
    } catch (e) {
      console.error('Fetch floor hierarchy error:', e);
      toast.error('Failed to load floor operations data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedLocation]);

  // Fetch available employees for assignment dropdown
  const fetchAvailableEmployees = useCallback(async () => {
    if (!selectedLocation) return;
    try {
      const res = await api.get(`/selling-points/available-employees?locationId=${selectedLocation}`);
      setAvailableEmployees(res.data || []);
    } catch (e) {
      console.error('Fetch available employees error:', e);
    }
  }, [selectedLocation]);

  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

  useEffect(() => {
    if (selectedLocation) {
      fetchOperationsData();
      fetchAvailableEmployees();
    }
  }, [selectedLocation, fetchOperationsData, fetchAvailableEmployees]);

  // Toggle single floor
  const toggleFloor = (floorId: string) => {
    setExpandedFloors(prev => ({
      ...prev,
      [floorId]: !prev[floorId]
    }));
  };

  // Expand All / Collapse All
  const expandAllFloors = () => {
    if (!hierarchyData?.floors) return;
    const all: Record<string, boolean> = {};
    hierarchyData.floors.forEach((f: any) => {
      all[f.id] = true;
    });
    setExpandedFloors(all);
  };

  const collapseAllFloors = () => {
    if (!hierarchyData?.floors) return;
    const all: Record<string, boolean> = {};
    hierarchyData.floors.forEach((f: any) => {
      all[f.id] = false;
    });
    setExpandedFloors(all);
  };

  // Filtered Floors and Counters
  const filteredFloors = useMemo(() => {
    if (!hierarchyData?.floors) return [];
    return hierarchyData.floors
      .filter((floor: any) => {
        if (selectedFloorFilter !== 'ALL' && floor.id !== selectedFloorFilter) {
          return false;
        }
        return true;
      })
      .map((floor: any) => {
        const filteredCounters = floor.counters.filter((counter: any) => {
          // Category filter
          if (selectedCategoryFilter !== 'ALL' && counter.category !== selectedCategoryFilter) {
            return false;
          }
          // Search query (counter name, code, section, or assigned salesmen)
          if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            const matchCounter = counter.name.toLowerCase().includes(query) ||
                                 counter.code.toLowerCase().includes(query) ||
                                 counter.sectionName.toLowerCase().includes(query);
            const matchSalesmen = counter.assignedSalesmen.some((sm: any) => 
              sm.fullName.toLowerCase().includes(query) ||
              sm.employeeCode.toLowerCase().includes(query) ||
              sm.designation.toLowerCase().includes(query)
            );
            return matchCounter || matchSalesmen;
          }
          return true;
        });

        return {
          ...floor,
          counters: filteredCounters,
        };
      });
  }, [hierarchyData, selectedFloorFilter, selectedCategoryFilter, searchQuery]);

  // Flat Salesmen List for Directory Tab
  const allSalesmenFlat = useMemo(() => {
    if (!hierarchyData?.floors) return [];
    const list: any[] = [];
    hierarchyData.floors.forEach((fl: any) => {
      fl.counters.forEach((cnt: any) => {
        cnt.assignedSalesmen.forEach((sm: any) => {
          list.push({
            ...sm,
            counterName: cnt.name,
            counterCode: cnt.code,
            floorName: fl.name,
            floorId: fl.id,
            sectionName: cnt.sectionName,
          });
        });
      });
    });

    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(sm => 
      sm.fullName.toLowerCase().includes(q) ||
      sm.employeeCode.toLowerCase().includes(q) ||
      sm.designation.toLowerCase().includes(q) ||
      sm.counterName.toLowerCase().includes(q) ||
      sm.floorName.toLowerCase().includes(q)
    );
  }, [hierarchyData, searchQuery]);

  // Handle Assign Employee Submit
  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignForm.counterId || !assignForm.employeeId) {
      toast.error('Please select both a counter and an employee');
      return;
    }
    try {
      await api.post(`/selling-points/${assignForm.counterId}/assign-employee`, {
        employeeId: assignForm.employeeId,
        isPrimary: assignForm.isPrimary,
      });
      toast.success('Salesperson assigned to counter successfully!');
      setIsAssignModalOpen(false);
      setAssignForm({ counterId: '', employeeId: '', isPrimary: true });
      fetchOperationsData(true);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to assign salesperson');
    }
  };

  // Handle Transfer Employee Submit
  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferForm.toCounterId || !transferForm.employeeId) {
      toast.error('Please select target counter for transfer');
      return;
    }
    try {
      await api.post(`/selling-points/${transferForm.toCounterId}/transfer-employee`, {
        employeeId: transferForm.employeeId,
        fromSellingPointId: transferForm.fromCounterId,
        isPrimary: transferForm.isPrimary,
      });
      toast.success(`Successfully transferred to target counter!`);
      setIsTransferModalOpen(false);
      fetchOperationsData(true);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to transfer employee');
    }
  };

  // Handle Unassign Employee
  const handleUnassignEmployee = async (counterId: string, employeeId: string, employeeName: string) => {
    if (!confirm(`Are you sure you want to remove ${employeeName} from this counter? The employee record will remain safe.`)) {
      return;
    }
    try {
      await api.delete(`/selling-points/${counterId}/assign-employee/${employeeId}`);
      toast.success(`${employeeName} unassigned from counter`);
      fetchOperationsData(true);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to unassign employee');
    }
  };

  // Handle Create Counter Submit
  const handleCreateCounterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCounterForm.name || !newCounterForm.floorId) {
      toast.error('Please enter counter name and select a floor');
      return;
    }
    try {
      const generatedCode = newCounterForm.code.trim() || 
        `${hierarchyData?.location?.code || 'BEL'}-SP-${Date.now().toString().slice(-4)}`;

      // Pick first section on this floor if not selected
      let sectionId = newCounterForm.sectionId;
      if (!sectionId) {
        const floorObj = hierarchyData?.floors?.find((f: any) => f.id === newCounterForm.floorId);
        sectionId = floorObj?.sections?.[0]?.id || '';
      }

      await api.post('/selling-points', {
        ...newCounterForm,
        code: generatedCode,
        locationId: selectedLocation,
        sectionId,
      });
      toast.success('Selling Point Counter created successfully!');
      setIsAddCounterModalOpen(false);
      setNewCounterForm({
        name: '',
        code: '',
        locationId: '',
        floorId: '',
        sectionId: '',
        category: 'Sales',
        targetAmount: 1000000,
      });
      fetchOperationsData(true);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to create counter');
    }
  };

  // Export CSV Report
  const handleExportCSV = () => {
    if (!hierarchyData?.floors) {
      toast.error('No operational data available to export');
      return;
    }

    const rows: string[][] = [
      [
        'Store Location', 'Floor Name', 'Section Name', 'Counter Code', 'Counter Name', 
        'Category', 'Counter Target (INR)', 'Counter Today Sales (INR)', 'Counter Achievement %',
        'Salesman Name', 'Employee ID', 'Designation', 'Assignment Type', 'Shift', 
        'Attendance Status', 'Salesman Today Sales (INR)', 'Salesman Month Sales (INR)', 'Bills Handled'
      ]
    ];

    hierarchyData.floors.forEach((fl: any) => {
      fl.counters.forEach((cnt: any) => {
        if (cnt.assignedSalesmen.length === 0) {
          rows.push([
            hierarchyData.location?.name || '',
            fl.name,
            cnt.sectionName,
            cnt.code,
            cnt.name,
            cnt.category,
            cnt.targetAmount.toString(),
            cnt.todaySales.toString(),
            `${cnt.achievementPct}%`,
            'Unassigned',
            'N/A',
            'N/A',
            'N/A',
            'N/A',
            'N/A',
            '0',
            '0',
            '0'
          ]);
        } else {
          cnt.assignedSalesmen.forEach((sm: any) => {
            rows.push([
              hierarchyData.location?.name || '',
              fl.name,
              cnt.sectionName,
              cnt.code,
              cnt.name,
              cnt.category,
              cnt.targetAmount.toString(),
              cnt.todaySales.toString(),
              `${cnt.achievementPct}%`,
              sm.fullName,
              sm.employeeCode,
              sm.designation,
              sm.isPrimary ? 'Primary' : 'Secondary',
              sm.shiftName,
              sm.attendanceStatus,
              sm.todaySales.toString(),
              sm.monthSales.toString(),
              sm.billsHandled.toString()
            ]);
          });
        }
      });
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map(e => e.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `BSC_Textiles_Floor_Operations_${hierarchyData.location?.code || 'BEL'}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Operations report exported successfully!');
  };

  // Helper for attendance badge
  const renderAttendanceBadge = (status: string) => {
    switch (status) {
      case 'PRESENT':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Present
          </span>
        );
      case 'ON_LUNCH':
      case 'ON_TEA_BREAK':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            On Break
          </span>
        );
      case 'WEEKLY_OFF':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
            Weekly Off
          </span>
        );
      case 'ABSENT':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
            Absent
          </span>
        );
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 pb-12">
        {/* ========================================== */}
        {/* TOP BAR & LOCATION SELECTOR                */}
        {/* ========================================== */}
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 border-b border-gray-200 dark:border-slate-800 pb-5">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="px-2.5 py-0.5 rounded-full bg-primary-100 text-primary-800 dark:bg-primary-950/80 dark:text-primary-300 text-xs font-bold tracking-wider uppercase">
                Retail Floor Operations
              </span>
              <span className="text-xs text-gray-500 dark:text-slate-400 font-medium">
                BSC Textiles HRMS • Est. 1938
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white mt-1">
              Selling Points & Counters
            </h1>
            <p className="text-sm text-gray-600 dark:text-slate-300 mt-0.5">
              Floor-wise showrooms, selling sections, salesperson assignments, billing terminals, and retail analytics
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Store Location Selector */}
            <div className="flex items-center gap-2 bg-white dark:bg-slate-900 px-3 py-2 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm">
              <Store className="w-4 h-4 text-primary-600 dark:text-primary-400" />
              <select
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
                className="bg-transparent text-sm font-semibold text-gray-900 dark:text-white outline-none cursor-pointer"
              >
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id} className="text-gray-900 dark:text-slate-900">
                    {loc.name} ({loc.code})
                  </option>
                ))}
              </select>
            </div>

            {/* Refresh Button */}
            <button
              onClick={() => fetchOperationsData(true)}
              disabled={refreshing}
              className="p-2.5 bg-white dark:bg-slate-900 text-gray-600 dark:text-slate-300 hover:text-primary-600 dark:hover:text-primary-400 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm transition-colors"
              title="Refresh Data"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>

            {/* Export CSV */}
            <button
              onClick={handleExportCSV}
              className="px-3.5 py-2 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-200 hover:text-primary-600 dark:hover:text-primary-400 text-sm font-semibold rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm flex items-center gap-2 transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Export CSV</span>
            </button>

            {/* Assign Salesman Action */}
            <button
              onClick={() => {
                setAssignForm({ counterId: '', employeeId: '', isPrimary: true });
                setIsAssignModalOpen(true);
              }}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl shadow-sm flex items-center gap-1.5 transition-colors"
            >
              <Users className="w-4 h-4" />
              <span>Assign Staff</span>
            </button>

            {/* New Counter Action */}
            <button
              onClick={() => {
                const firstFloor = hierarchyData?.floors?.[0]?.id || '';
                setNewCounterForm(prev => ({ ...prev, locationId: selectedLocation, floorId: firstFloor }));
                setIsAddCounterModalOpen(true);
              }}
              className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold rounded-xl shadow-sm flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>New Counter</span>
            </button>
          </div>
        </div>

        {/* ========================================== */}
        {/* OPERATIONAL KPI SNAPSHOT CARDS             */}
        {/* ========================================== */}
        {hierarchyData?.overview && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
            {/* KPI 1: Floors & Counters */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-gray-200 dark:border-slate-800 shadow-sm hover:border-primary-300 dark:hover:border-primary-700 transition-all">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Floors & Counters</span>
                <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                  <Building2 className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-black text-gray-900 dark:text-white">
                  {hierarchyData.overview.totalFloors} <span className="text-sm font-normal text-gray-500 dark:text-slate-400">Floors</span>
                </div>
                <div className="text-xs text-gray-600 dark:text-slate-300 font-medium mt-0.5">
                  {hierarchyData.overview.totalCounters} Active Counters
                </div>
              </div>
            </div>

            {/* KPI 2: Total Sales Staff */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-gray-200 dark:border-slate-800 shadow-sm hover:border-primary-300 dark:hover:border-primary-700 transition-all">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Consultants</span>
                <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
                  <Users className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-black text-gray-900 dark:text-white">
                  {hierarchyData.overview.totalSalesmen} <span className="text-sm font-normal text-gray-500 dark:text-slate-400">Staff</span>
                </div>
                <div className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {hierarchyData.overview.presentSalesmen} Present Today
                </div>
              </div>
            </div>

            {/* KPI 3: Staff Shortages / Absent */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-gray-200 dark:border-slate-800 shadow-sm hover:border-primary-300 dark:hover:border-primary-700 transition-all">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Attendance Status</span>
                <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
                  <UserX className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-black text-gray-900 dark:text-white">
                  {hierarchyData.overview.absentSalesmen} <span className="text-sm font-normal text-gray-500 dark:text-slate-400">Off/Leave</span>
                </div>
                <div className="text-xs text-gray-600 dark:text-slate-300 font-medium mt-0.5">
                  {hierarchyData.overview.shortagesCount === 0 ? 'Optimal Staffing' : `${hierarchyData.overview.shortagesCount} on leave/break`}
                </div>
              </div>
            </div>

            {/* KPI 4: Active Billing Desks */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-gray-200 dark:border-slate-800 shadow-sm hover:border-primary-300 dark:hover:border-primary-700 transition-all">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Billing Desks</span>
                <div className="p-2 rounded-lg bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400">
                  <CreditCard className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-black text-gray-900 dark:text-white">
                  {hierarchyData.overview.activeBillingCounters} <span className="text-sm font-normal text-gray-500 dark:text-slate-400">Terminals</span>
                </div>
                <div className="text-xs text-purple-600 dark:text-purple-400 font-semibold mt-0.5">
                  {hierarchyData.overview.completedBills} Bills Processed
                </div>
              </div>
            </div>

            {/* KPI 5: Today's Store Sales */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-gray-200 dark:border-slate-800 shadow-sm hover:border-primary-300 dark:hover:border-primary-700 transition-all">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Today&apos;s Store Sales</span>
                <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
                  <DollarSign className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(hierarchyData.overview.todayStoreSales)}
                </div>
                <div className="text-xs text-gray-600 dark:text-slate-300 font-medium mt-0.5">
                  Target: {formatCurrency(hierarchyData.overview.storeSalesTarget)}
                </div>
              </div>
            </div>

            {/* KPI 6: Target Achievement */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-gray-200 dark:border-slate-800 shadow-sm hover:border-primary-300 dark:hover:border-primary-700 transition-all">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Target Achieved</span>
                <div className="p-2 rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400">
                  <Target className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-black text-gray-900 dark:text-white">
                  {hierarchyData.overview.storeAchievementPct}%
                </div>
                <div className="w-full bg-gray-100 dark:bg-slate-800 rounded-full h-1.5 mt-2 overflow-hidden">
                  <div 
                    className="bg-primary-600 h-1.5 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, hierarchyData.overview.storeAchievementPct)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================== */}
        {/* CONTROLS, SEARCH, AND VIEW TABS            */}
        {/* ========================================== */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-gray-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          {/* View Mode Tabs */}
          <div className="flex items-center gap-1.5 bg-gray-100 dark:bg-slate-800/80 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab('FOLDERS')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                activeTab === 'FOLDERS'
                  ? 'bg-white dark:bg-slate-900 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-slate-300 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <FolderOpen className="w-4 h-4 text-primary-600 dark:text-primary-400" />
              <span>Floor Folders View</span>
            </button>

            <button
              onClick={() => setActiveTab('DIRECTORY')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                activeTab === 'DIRECTORY'
                  ? 'bg-white dark:bg-slate-900 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-slate-300 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <Users className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Salesmen Directory</span>
            </button>

            <button
              onClick={() => setActiveTab('BILLING')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                activeTab === 'BILLING'
                  ? 'bg-white dark:bg-slate-900 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-slate-300 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <Receipt className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              <span>Billing & Terminal Hub</span>
            </button>
          </div>

          {/* Search & Filters */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Search Input */}
            <div className="relative min-w-[220px]">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search employee, ID, counter..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-400 outline-none focus:ring-2 focus:ring-primary-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Floor Filter */}
            <select
              value={selectedFloorFilter}
              onChange={(e) => setSelectedFloorFilter(e.target.value)}
              className="px-3 py-1.5 text-xs font-medium rounded-xl border border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800 text-gray-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-primary-500 cursor-pointer"
            >
              <option value="ALL">All Showroom Floors</option>
              {hierarchyData?.floors?.map((fl: any) => (
                <option key={fl.id} value={fl.id}>{fl.name}</option>
              ))}
            </select>

            {/* Category Filter */}
            <select
              value={selectedCategoryFilter}
              onChange={(e) => setSelectedCategoryFilter(e.target.value)}
              className="px-3 py-1.5 text-xs font-medium rounded-xl border border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800 text-gray-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-primary-500 cursor-pointer"
            >
              <option value="ALL">All Categories</option>
              <option value="Sales">Sales Floor</option>
              <option value="Billing">Billing Terminals</option>
              <option value="Customer Service">Customer Service</option>
            </select>

            {/* Expand / Collapse Controls */}
            {activeTab === 'FOLDERS' && (
              <div className="flex items-center gap-1 border-l border-gray-200 dark:border-slate-800 pl-2.5">
                <button
                  onClick={expandAllFloors}
                  className="px-2.5 py-1.5 text-[11px] font-semibold text-gray-600 dark:text-slate-300 hover:text-primary-600 dark:hover:text-primary-400 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Expand All
                </button>
                <button
                  onClick={collapseAllFloors}
                  className="px-2.5 py-1.5 text-[11px] font-semibold text-gray-600 dark:text-slate-300 hover:text-primary-600 dark:hover:text-primary-400 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Collapse All
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ========================================== */}
        {/* TAB CONTENT: 1. FOLDER-WISE HIERARCHY      */}
        {/* ========================================== */}
        {loading ? (
          <div className="py-20 text-center bg-white dark:bg-slate-900 rounded-3xl border border-gray-200 dark:border-slate-800">
            <RefreshCw className="w-8 h-8 text-primary-600 dark:text-primary-400 animate-spin mx-auto mb-3" />
            <h3 className="text-base font-bold text-gray-900 dark:text-white">Loading Floor Operations...</h3>
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
              Synchronizing showroom counters, salesmen assignments, and live attendance...
            </p>
          </div>
        ) : activeTab === 'FOLDERS' ? (
          <div className="space-y-5">
            {filteredFloors.length === 0 ? (
              <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-3xl border border-gray-200 dark:border-slate-800">
                <Store className="w-12 h-12 text-gray-300 dark:text-slate-600 mx-auto mb-3" />
                <h3 className="text-base font-bold text-gray-900 dark:text-white">No Counters Found</h3>
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                  No selling points matched your current search and filter criteria for this showroom location.
                </p>
              </div>
            ) : (
              filteredFloors.map((floor: any) => {
                const isExpanded = Boolean(expandedFloors[floor.id]);
                return (
                  <div 
                    key={floor.id} 
                    className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 shadow-sm overflow-hidden transition-all"
                  >
                    {/* FLOOR FOLDER HEADER */}
                    <div 
                      onClick={() => toggleFloor(floor.id)}
                      className="p-5 cursor-pointer select-none bg-gradient-to-r from-gray-50/80 via-white to-gray-50/40 dark:from-slate-800/60 dark:via-slate-900 dark:to-slate-800/40 hover:bg-gray-100/60 dark:hover:bg-slate-800/80 transition-colors border-b border-gray-100 dark:border-slate-800/60"
                    >
                      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                        {/* Left: Floor Identity & Manager */}
                        <div className="flex items-start gap-4">
                          <div className="p-3 rounded-2xl bg-primary-50 dark:bg-primary-950/80 text-primary-600 dark:text-primary-300 border border-primary-100 dark:border-primary-900 shadow-sm">
                            {isExpanded ? (
                              <FolderOpen className="w-6 h-6" />
                            ) : (
                              <Folder className="w-6 h-6" />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2.5 flex-wrap">
                              <h2 className="text-lg font-extrabold text-gray-900 dark:text-white tracking-tight">
                                {floor.name.toUpperCase()}
                              </h2>
                              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                                Level {floor.floorNumber}
                              </span>
                              {floor.floorManager && (
                                <span className="text-xs text-gray-600 dark:text-slate-300 font-medium flex items-center gap-1 bg-white dark:bg-slate-800 px-2.5 py-0.5 rounded-md border border-gray-200 dark:border-slate-700">
                                  <Shield className="w-3.5 h-3.5 text-primary-600 dark:text-primary-400" />
                                  Floor Mgr: <strong className="text-gray-900 dark:text-white">{floor.floorManager.fullName}</strong>
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-slate-400 mt-1">
                              <span>{floor.summary.totalSections} Selling Sections</span>
                              <span>•</span>
                              <span>{floor.summary.totalCounters} Counters Active</span>
                            </div>
                          </div>
                        </div>

                        {/* Center: Salesmen Staffing Metrics */}
                        <div className="flex items-center gap-6">
                          <div className="text-left lg:text-right">
                            <span className="text-[11px] font-semibold text-gray-500 dark:text-slate-400 block uppercase tracking-wider">
                              Assigned Sales Staff
                            </span>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-base font-extrabold text-gray-900 dark:text-white">
                                {floor.summary.totalSalesmen} Consultants
                              </span>
                              <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                {floor.summary.presentSalesmen} Present
                              </span>
                              {floor.summary.absentSalesmen > 0 && (
                                <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                                  {floor.summary.absentSalesmen} Off
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Right: Sales Target & Expand Toggle */}
                          <div className="text-left lg:text-right border-l border-gray-200 dark:border-slate-800 pl-6">
                            <span className="text-[11px] font-semibold text-gray-500 dark:text-slate-400 block uppercase tracking-wider">
                              Today&apos;s Floor Sales
                            </span>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-base font-extrabold text-emerald-600 dark:text-emerald-400">
                                {formatCurrency(floor.summary.todaySales)}
                              </span>
                              <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-primary-50 text-primary-700 dark:bg-primary-950/60 dark:text-primary-300 border border-primary-200 dark:border-primary-800">
                                {floor.summary.achievementPct}% Target
                              </span>
                            </div>
                          </div>

                          <div className="p-2 rounded-xl bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400">
                            {isExpanded ? (
                              <ChevronUp className="w-5 h-5" />
                            ) : (
                              <ChevronDown className="w-5 h-5" />
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* EXPANDED FLOOR BODY: SECTIONS & COUNTERS */}
                    {isExpanded && (
                      <div className="p-5 space-y-6 bg-gray-50/50 dark:bg-slate-950/40">
                        {/* Section Pills if floor has sections */}
                        {floor.sections && floor.sections.length > 0 && (
                          <div className="flex items-center gap-2 flex-wrap text-xs pb-1">
                            <span className="font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider text-[10px]">
                              Floor Sections:
                            </span>
                            {floor.sections.map((sec: any) => (
                              <span 
                                key={sec.id}
                                className="px-3 py-1 rounded-lg bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-200 border border-gray-200 dark:border-slate-700 font-semibold shadow-xs"
                              >
                                {sec.name}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Counters Grid */}
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                          {floor.counters.map((counter: any) => (
                            <div 
                              key={counter.id}
                              className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col justify-between"
                            >
                              {/* Counter Card Top */}
                              <div className="p-5 border-b border-gray-100 dark:border-slate-800">
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-mono font-extrabold uppercase tracking-wider text-primary-700 dark:text-primary-300 bg-primary-50 dark:bg-primary-950/80 px-2.5 py-0.5 rounded-md border border-primary-200 dark:border-primary-800">
                                        {counter.code}
                                      </span>
                                      <span className="text-xs font-semibold text-gray-500 dark:text-slate-400">
                                        • {counter.sectionName}
                                      </span>
                                    </div>
                                    <h3 className="text-lg font-bold text-gray-900 dark:text-white mt-2">
                                      {counter.name}
                                    </h3>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <span className={`text-xs px-2.5 py-1 rounded-full font-bold uppercase tracking-wider ${
                                      counter.category === 'Billing'
                                        ? 'bg-purple-100 text-purple-800 dark:bg-purple-950/80 dark:text-purple-300 border border-purple-200 dark:border-purple-800'
                                        : counter.category === 'Customer Service'
                                        ? 'bg-sky-100 text-sky-800 dark:bg-sky-950/80 dark:text-sky-300 border border-sky-200 dark:border-sky-800'
                                        : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                                    }`}>
                                      {counter.category}
                                    </span>

                                    <button
                                      onClick={() => {
                                        setAssignForm({
                                          counterId: counter.id,
                                          employeeId: '',
                                          isPrimary: false,
                                        });
                                        setIsAssignModalOpen(true);
                                      }}
                                      className="p-1.5 rounded-lg bg-gray-50 dark:bg-slate-800 hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-600 dark:text-slate-300 transition-colors"
                                      title="Assign Salesperson to Counter"
                                    >
                                      <Plus className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>

                                {/* Counter Sales Metrics Bar */}
                                <div className="mt-4 pt-3 border-t border-gray-100 dark:border-slate-800/80 grid grid-cols-4 gap-2 text-center bg-gray-50/60 dark:bg-slate-800/40 p-2.5 rounded-xl">
                                  <div>
                                    <span className="text-[10px] font-semibold text-gray-500 dark:text-slate-400 uppercase block">Today Sales</span>
                                    <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 mt-0.5 block">
                                      {formatCurrency(counter.todaySales)}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-[10px] font-semibold text-gray-500 dark:text-slate-400 uppercase block">Monthly Target</span>
                                    <span className="text-xs font-bold text-gray-900 dark:text-white mt-0.5 block">
                                      {formatCurrency(counter.targetAmount)}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-[10px] font-semibold text-gray-500 dark:text-slate-400 uppercase block">Achieved</span>
                                    <span className="text-xs font-bold text-primary-600 dark:text-primary-400 mt-0.5 block">
                                      {counter.achievementPct}%
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-[10px] font-semibold text-gray-500 dark:text-slate-400 uppercase block">Bills Done</span>
                                    <span className="text-xs font-bold text-gray-900 dark:text-white mt-0.5 block">
                                      {counter.billsCount} Bills
                                    </span>
                                  </div>
                                </div>

                                {/* Billing Terminal Session details if applicable */}
                                {counter.billingSession && (
                                  <div className="mt-3 p-2.5 rounded-xl bg-purple-50/70 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/60 flex items-center justify-between text-xs">
                                    <div className="flex items-center gap-2">
                                      <Receipt className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                                      <div>
                                        <span className="font-bold text-purple-900 dark:text-purple-200">
                                          Cashier Active: {counter.billingSession.cashierName}
                                        </span>
                                        <span className="text-[11px] text-purple-700 dark:text-purple-300 block">
                                          Terminal Session ID: {counter.billingSession.id.slice(0, 10)}
                                        </span>
                                      </div>
                                    </div>
                                    <span className="px-2 py-0.5 rounded-md font-bold text-[10px] bg-purple-200 text-purple-900 dark:bg-purple-800 dark:text-purple-100">
                                      Float ₹5,000
                                    </span>
                                  </div>
                                )}
                              </div>

                              {/* ========================================== */}
                              {/* ASSIGNED SALESMEN DIRECTORY SECTION        */}
                              {/* ========================================== */}
                              <div className="p-4 bg-white dark:bg-slate-900 space-y-3">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <Users className="w-4 h-4 text-primary-600 dark:text-primary-400" />
                                    <span className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider">
                                      Assigned Salesmen ({counter.assignedSalesmen.length})
                                    </span>
                                  </div>
                                  <span className="text-[11px] text-gray-500 dark:text-slate-400 font-medium">
                                    Real Employee ID & Live Shift
                                  </span>
                                </div>

                                {counter.assignedSalesmen.length === 0 ? (
                                  <div className="p-4 text-center rounded-xl border border-dashed border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800/40">
                                    <UserX className="w-6 h-6 text-gray-400 mx-auto mb-1" />
                                    <span className="text-xs font-semibold text-gray-700 dark:text-slate-300 block">
                                      No Salesman Assigned
                                    </span>
                                    <button
                                      onClick={() => {
                                        setAssignForm({ counterId: counter.id, employeeId: '', isPrimary: true });
                                        setIsAssignModalOpen(true);
                                      }}
                                      className="mt-2 text-xs font-bold text-primary-600 hover:text-primary-700 dark:text-primary-400 underline"
                                    >
                                      + Assign Salesman Now
                                    </button>
                                  </div>
                                ) : (
                                  <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                                    {counter.assignedSalesmen.map((salesman: any) => (
                                      <div 
                                        key={salesman.id}
                                        className="p-3 rounded-xl bg-gray-50 dark:bg-slate-800/80 border border-gray-200 dark:border-slate-700/80 hover:border-primary-300 dark:hover:border-primary-700 transition-colors flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                                      >
                                        {/* Salesman Bio & Identity */}
                                        <div className="flex items-center gap-3">
                                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-indigo-600 text-white font-bold flex items-center justify-center text-sm shadow-xs shrink-0">
                                            {salesman.fullName.slice(0, 2).toUpperCase()}
                                          </div>
                                          <div>
                                            <div className="flex items-center gap-2 flex-wrap">
                                              <span className="font-bold text-sm text-gray-900 dark:text-white">
                                                {salesman.fullName}
                                              </span>
                                              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-gray-200 dark:bg-slate-700 text-gray-800 dark:text-slate-200">
                                                {salesman.employeeCode}
                                              </span>
                                              {salesman.isPrimary && (
                                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                                                  Primary
                                                </span>
                                              )}
                                            </div>
                                            <div className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                                              {salesman.designation} • <span className="font-medium text-gray-600 dark:text-slate-300">{salesman.shiftTime}</span>
                                            </div>
                                          </div>
                                        </div>

                                        {/* Salesman Performance & Attendance */}
                                        <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-gray-200 dark:border-slate-700">
                                          <div className="text-right">
                                            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 block">
                                              {formatCurrency(salesman.todaySales)}
                                            </span>
                                            <span className="text-[10px] text-gray-500 dark:text-slate-400 font-medium block">
                                              {salesman.billsHandled} Bills • {salesman.achievementPct}%
                                            </span>
                                          </div>

                                          <div className="flex items-center gap-1.5">
                                            {renderAttendanceBadge(salesman.attendanceStatus)}

                                            {/* Action: Profile Drawer */}
                                            <button
                                              onClick={() => setSelectedSalespersonDrawer(salesman)}
                                              className="p-1.5 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
                                              title="View Salesman 360 Profile"
                                            >
                                              <Eye className="w-4 h-4" />
                                            </button>

                                            {/* Action: Transfer */}
                                            <button
                                              onClick={() => {
                                                setTransferForm({
                                                  employeeId: salesman.employeeId,
                                                  fromCounterId: counter.id,
                                                  toCounterId: '',
                                                  employeeName: salesman.fullName,
                                                  fromCounterName: counter.name,
                                                  isPrimary: false,
                                                });
                                                setIsTransferModalOpen(true);
                                              }}
                                              className="p-1.5 text-gray-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
                                              title="Transfer to another Counter"
                                            >
                                              <ArrowRightLeft className="w-4 h-4" />
                                            </button>

                                            {/* Action: Remove / Unassign */}
                                            <button
                                              onClick={() => handleUnassignEmployee(counter.id, salesman.employeeId, salesman.fullName)}
                                              className="p-1.5 text-gray-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
                                              title="Unassign from Counter"
                                            >
                                              <X className="w-4 h-4" />
                                            </button>
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        ) : activeTab === 'DIRECTORY' ? (
          /* ========================================== */
          /* TAB CONTENT: 2. COMPLETE SALESMEN TABLE   */
          /* ========================================== */
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-gray-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-extrabold text-gray-900 dark:text-white">
                  Showroom Salesmen Directory ({allSalesmenFlat.length})
                </h3>
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                  Complete staff rosters across all floors, counters, shifts, and targets
                </p>
              </div>
              <span className="text-xs px-3 py-1 rounded-full bg-primary-50 text-primary-700 dark:bg-primary-950/80 dark:text-primary-300 font-bold border border-primary-200 dark:border-primary-800">
                Authoritative HRMS Database
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 dark:bg-slate-800/80 text-gray-600 dark:text-slate-300 font-bold uppercase tracking-wider border-b border-gray-200 dark:border-slate-800">
                  <tr>
                    <th className="py-3.5 px-4">Salesperson</th>
                    <th className="py-3.5 px-4">Employee ID</th>
                    <th className="py-3.5 px-4">Floor & Counter</th>
                    <th className="py-3.5 px-4">Shift & Timing</th>
                    <th className="py-3.5 px-4">Attendance</th>
                    <th className="py-3.5 px-4 text-right">Today Sales</th>
                    <th className="py-3.5 px-4 text-right">Monthly Sales</th>
                    <th className="py-3.5 px-4 text-center">Target %</th>
                    <th className="py-3.5 px-4 text-center">Incentive</th>
                    <th className="py-3.5 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                  {allSalesmenFlat.map((sm: any) => (
                    <tr key={`${sm.floorId}-${sm.counterCode}-${sm.employeeId}`} className="hover:bg-gray-50/80 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-600 to-indigo-600 text-white font-bold flex items-center justify-center text-xs shadow-xs">
                            {sm.fullName.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <span className="font-bold text-gray-900 dark:text-white block">
                              {sm.fullName}
                            </span>
                            <span className="text-[11px] text-gray-500 dark:text-slate-400 block">
                              {sm.designation}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-mono font-bold text-gray-700 dark:text-slate-300">
                        {sm.employeeCode}
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="font-semibold text-gray-900 dark:text-white block">
                          {sm.counterName}
                        </span>
                        <span className="text-[11px] text-gray-500 dark:text-slate-400 block">
                          {sm.floorName} • {sm.sectionName}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-gray-600 dark:text-slate-300">
                        <span className="font-medium block">{sm.shiftName}</span>
                        <span className="text-[11px] text-gray-400 block">{sm.shiftTime}</span>
                      </td>

                      <td className="py-3.5 px-4">
                        {renderAttendanceBadge(sm.attendanceStatus)}
                      </td>

                      <td className="py-3.5 px-4 text-right font-bold text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(sm.todaySales)}
                      </td>

                      <td className="py-3.5 px-4 text-right font-bold text-gray-900 dark:text-white">
                        {formatCurrency(sm.monthSales)}
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <span className={`px-2 py-0.5 rounded-full font-bold text-xs ${
                          sm.achievementPct >= 100 
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : sm.achievementPct >= 80
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                        }`}>
                          {sm.achievementPct}%
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        {sm.incentiveEligible ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600 dark:text-amber-400">
                            <Award className="w-3.5 h-3.5" />
                            Eligible
                          </span>
                        ) : (
                          <span className="text-gray-400 text-[11px]">Standard</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <button
                          onClick={() => setSelectedSalespersonDrawer(sm)}
                          className="px-2.5 py-1 text-xs font-semibold text-primary-600 hover:text-primary-700 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-950/60 rounded-lg transition-colors"
                        >
                          View 360
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* ========================================== */
          /* TAB CONTENT: 3. BILLING & TERMINAL HUB     */
          /* ========================================== */
          <div className="space-y-6">
            {hierarchyData?.billingSummary && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-gray-200 dark:border-slate-800 shadow-sm">
                  <span className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase">Gross Sales (Today)</span>
                  <div className="text-2xl font-black text-gray-900 dark:text-white mt-1">
                    {formatCurrency(hierarchyData.billingSummary.grossSales)}
                  </div>
                  <span className="text-xs text-gray-500 dark:text-slate-400 mt-1 block">
                    Discounts: {formatCurrency(hierarchyData.billingSummary.discountAmount)}
                  </span>
                </div>

                <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-gray-200 dark:border-slate-800 shadow-sm">
                  <span className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase">Net Collections</span>
                  <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
                    {formatCurrency(hierarchyData.billingSummary.netSales)}
                  </div>
                  <span className="text-xs text-gray-500 dark:text-slate-400 mt-1 block">
                    GST 5%: {formatCurrency(hierarchyData.billingSummary.taxAmount)}
                  </span>
                </div>

                <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-gray-200 dark:border-slate-800 shadow-sm">
                  <span className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase">Tender Breakdown</span>
                  <div className="mt-2 space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-gray-500">UPI / QR:</span>
                      <strong className="text-gray-900 dark:text-white">{formatCurrency(hierarchyData.billingSummary.upiCollections)}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Card POS:</span>
                      <strong className="text-gray-900 dark:text-white">{formatCurrency(hierarchyData.billingSummary.cardCollections)}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Cash:</span>
                      <strong className="text-gray-900 dark:text-white">{formatCurrency(hierarchyData.billingSummary.cashCollections)}</strong>
                    </div>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-gray-200 dark:border-slate-800 shadow-sm">
                  <span className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase">Average Bill Value</span>
                  <div className="text-2xl font-black text-purple-600 dark:text-purple-400 mt-1">
                    {formatCurrency(hierarchyData.billingSummary.avgBillValue)}
                  </div>
                  <span className="text-xs text-gray-500 dark:text-slate-400 mt-1 block">
                    Total Invoices: {hierarchyData.billingSummary.completedBills}
                  </span>
                </div>
              </div>
            )}

            {/* Recent Transactions Table */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-gray-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-extrabold text-gray-900 dark:text-white">
                    Live Retail Billing Transactions
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                    Itemized customer invoices, salesperson attribution, and cash registers
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-50 dark:bg-slate-800/80 text-gray-600 dark:text-slate-300 font-bold uppercase tracking-wider border-b border-gray-200 dark:border-slate-800">
                    <tr>
                      <th className="py-3.5 px-4">Invoice #</th>
                      <th className="py-3.5 px-4">Counter & Floor</th>
                      <th className="py-3.5 px-4">Salesperson</th>
                      <th className="py-3.5 px-4">Cashier</th>
                      <th className="py-3.5 px-4">Tender</th>
                      <th className="py-3.5 px-4 text-right">Net Amount</th>
                      <th className="py-3.5 px-4 text-center">Status</th>
                      <th className="py-3.5 px-4 text-center">Receipt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                    {hierarchyData?.billingSummary?.recentTransactions?.map((tx: any) => (
                      <tr key={tx.id} className="hover:bg-gray-50/80 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="py-3.5 px-4 font-mono font-bold text-gray-900 dark:text-white">
                          {tx.billNumber}
                          <span className="block text-[10px] text-gray-400 font-normal">
                            {formatDateTime(tx.createdAt)}
                          </span>
                        </td>

                        <td className="py-3.5 px-4">
                          <span className="font-semibold text-gray-900 dark:text-white block">{tx.counterName}</span>
                          <span className="text-[11px] text-gray-400 block">{tx.floorName}</span>
                        </td>

                        <td className="py-3.5 px-4">
                          <span className="font-medium text-gray-900 dark:text-white block">{tx.salespersonName || 'Unassigned'}</span>
                          <span className="text-[10px] text-gray-400 font-mono block">{tx.salespersonCode}</span>
                        </td>

                        <td className="py-3.5 px-4">
                          <span className="font-medium text-gray-900 dark:text-white block">{tx.cashierName || 'Counter Cashier'}</span>
                          <span className="text-[10px] text-gray-400 font-mono block">{tx.cashierCode}</span>
                        </td>

                        <td className="py-3.5 px-4">
                          <span className="px-2 py-0.5 rounded font-bold text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                            {tx.paymentMethod}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 text-right font-extrabold text-gray-900 dark:text-white">
                          {formatCurrency(tx.netAmount)}
                        </td>

                        <td className="py-3.5 px-4 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            tx.status === 'COMPLETED'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : tx.status === 'PENDING'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                              : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                          }`}>
                            {tx.status}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 text-center">
                          <button
                            onClick={() => setSelectedBillReceipt(tx)}
                            className="p-1.5 text-primary-600 hover:text-primary-700 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-950/60 rounded-lg transition-colors"
                            title="View / Print Tax Receipt"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ========================================== */}
        {/* MODAL 1: ASSIGN SALESMAN TO COUNTER        */}
        {/* ========================================== */}
        {isAssignModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-gray-200 dark:border-slate-800 relative">
              <div className="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-slate-800">
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                    Assign Salesperson to Counter
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                    Connect an active employee to a showroom selling counter
                  </p>
                </div>
                <button 
                  onClick={() => setIsAssignModalOpen(false)}
                  className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-slate-200"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleAssignSubmit} className="mt-5 space-y-4">
                {/* Select Counter */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1">
                    Select Target Counter *
                  </label>
                  <select
                    required
                    value={assignForm.counterId}
                    onChange={(e) => setAssignForm({ ...assignForm, counterId: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="">-- Choose Showroom Counter --</option>
                    {hierarchyData?.floors?.map((fl: any) => (
                      <optgroup key={fl.id} label={fl.name.toUpperCase()}>
                        {fl.counters.map((c: any) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.code}) - {fl.name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>

                {/* Search & Select Employee */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1">
                    Select Employee from HRMS Database *
                  </label>
                  <input
                    type="text"
                    placeholder="Search by name, ID (e.g. TEST-EMP-001)..."
                    value={employeeSearch}
                    onChange={(e) => setEmployeeSearch(e.target.value)}
                    className="w-full mb-2 px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-white outline-none"
                  />
                  <select
                    required
                    value={assignForm.employeeId}
                    onChange={(e) => setAssignForm({ ...assignForm, employeeId: e.target.value })}
                    size={5}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    {availableEmployees
                      .filter(emp => !employeeSearch || emp.fullName.toLowerCase().includes(employeeSearch.toLowerCase()) || emp.employeeCode.toLowerCase().includes(employeeSearch.toLowerCase()))
                      .map((emp) => (
                        <option key={emp.id} value={emp.id} className="py-1">
                          {emp.fullName} ({emp.employeeCode}) — {emp.designation || 'Sales Staff'}
                        </option>
                      ))}
                  </select>
                </div>

                {/* Primary assignment checkbox */}
                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="checkbox"
                    id="isPrimary"
                    checked={assignForm.isPrimary}
                    onChange={(e) => setAssignForm({ ...assignForm, isPrimary: e.target.checked })}
                    className="w-4 h-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500"
                  />
                  <label htmlFor="isPrimary" className="text-xs text-gray-700 dark:text-slate-300 font-medium">
                    Mark as Primary Counter Assignment for this salesperson
                  </label>
                </div>

                <div className="pt-4 flex justify-end gap-3 border-t border-gray-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsAssignModalOpen(false)}
                    className="px-4 py-2 text-xs font-semibold text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 text-xs font-bold text-white bg-primary-600 hover:bg-primary-700 rounded-xl shadow-sm"
                  >
                    Confirm Assignment
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ========================================== */}
        {/* MODAL 2: TRANSFER SALESMAN BETWEEN COUNTERS*/}
        {/* ========================================== */}
        {isTransferModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-gray-200 dark:border-slate-800 relative">
              <div className="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-slate-800">
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                    Transfer Salesperson
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                    Move employee to a different counter or floor
                  </p>
                </div>
                <button 
                  onClick={() => setIsTransferModalOpen(false)}
                  className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-slate-200"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleTransferSubmit} className="mt-5 space-y-4">
                <div className="p-3 rounded-xl bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-xs">
                  <span className="text-gray-500 block">Transferring Employee:</span>
                  <strong className="text-sm text-gray-900 dark:text-white block mt-0.5">
                    {transferForm.employeeName}
                  </strong>
                  <span className="text-gray-500 block mt-2">Current Counter:</span>
                  <strong className="text-gray-900 dark:text-white block mt-0.5">
                    {transferForm.fromCounterName}
                  </strong>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1">
                    Select New Counter *
                  </label>
                  <select
                    required
                    value={transferForm.toCounterId}
                    onChange={(e) => setTransferForm({ ...transferForm, toCounterId: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="">-- Choose Destination Counter --</option>
                    {hierarchyData?.floors?.map((fl: any) => (
                      <optgroup key={fl.id} label={fl.name.toUpperCase()}>
                        {fl.counters
                          .filter((c: any) => c.id !== transferForm.fromCounterId)
                          .map((c: any) => (
                            <option key={c.id} value={c.id}>
                              {c.name} ({c.code}) - {fl.name}
                            </option>
                          ))}
                      </optgroup>
                    ))}
                  </select>
                </div>

                <div className="pt-4 flex justify-end gap-3 border-t border-gray-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsTransferModalOpen(false)}
                    className="px-4 py-2 text-xs font-semibold text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-sm"
                  >
                    Execute Transfer
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ========================================== */}
        {/* MODAL 3: CREATE NEW COUNTER                */}
        {/* ========================================== */}
        {isAddCounterModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-gray-200 dark:border-slate-800 relative">
              <div className="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-slate-800">
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                    Add Selling Point Counter
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                    Configure a new sales section or billing terminal
                  </p>
                </div>
                <button 
                  onClick={() => setIsAddCounterModalOpen(false)}
                  className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-slate-200"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreateCounterSubmit} className="mt-5 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1">
                    Counter Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Wedding Silk Saree Counter C"
                    value={newCounterForm.name}
                    onChange={(e) => setNewCounterForm({ ...newCounterForm, name: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1">
                      Counter Code
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. BEL-SP-10"
                      value={newCounterForm.code}
                      onChange={(e) => setNewCounterForm({ ...newCounterForm, code: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white font-mono outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1">
                      Category
                    </label>
                    <select
                      value={newCounterForm.category}
                      onChange={(e) => setNewCounterForm({ ...newCounterForm, category: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-primary-500"
                    >
                      <option value="Sales">Sales Floor</option>
                      <option value="Billing">Billing Terminal</option>
                      <option value="Customer Service">Customer Service Desk</option>
                      <option value="Alteration Desk">Alteration & Tailoring</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1">
                    Showroom Floor *
                  </label>
                  <select
                    required
                    value={newCounterForm.floorId}
                    onChange={(e) => setNewCounterForm({ ...newCounterForm, floorId: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="">Select Floor</option>
                    {hierarchyData?.floors?.map((fl: any) => (
                      <option key={fl.id} value={fl.id}>{fl.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1">
                    Monthly Sales Target (INR)
                  </label>
                  <input
                    type="number"
                    value={newCounterForm.targetAmount}
                    onChange={(e) => setNewCounterForm({ ...newCounterForm, targetAmount: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                <div className="pt-4 flex justify-end gap-3 border-t border-gray-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsAddCounterModalOpen(false)}
                    className="px-4 py-2 text-xs font-semibold text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 text-xs font-bold text-white bg-primary-600 hover:bg-primary-700 rounded-xl shadow-sm"
                  >
                    Create Counter
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ========================================== */}
        {/* SLIDEOVER DRAWER: SALESMAN 360 PROFILE     */}
        {/* ========================================== */}
        {selectedSalespersonDrawer && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex justify-end">
            <div className="bg-white dark:bg-slate-900 w-full max-w-md h-full shadow-2xl p-6 overflow-y-auto border-l border-gray-200 dark:border-slate-800 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-slate-800">
                  <span className="text-xs font-bold text-primary-600 dark:text-primary-400 uppercase tracking-wider">
                    Salesperson Dossier 360
                  </span>
                  <button
                    onClick={() => setSelectedSalespersonDrawer(null)}
                    className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-slate-200"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Profile Header */}
                <div className="mt-5 text-center">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-primary-600 to-indigo-600 text-white font-extrabold flex items-center justify-center text-xl mx-auto shadow-md">
                    {selectedSalespersonDrawer.fullName.slice(0, 2).toUpperCase()}
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mt-3">
                    {selectedSalespersonDrawer.fullName}
                  </h3>
                  <div className="flex items-center justify-center gap-2 mt-1">
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300">
                      {selectedSalespersonDrawer.employeeCode}
                    </span>
                    {renderAttendanceBadge(selectedSalespersonDrawer.attendanceStatus)}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                    {selectedSalespersonDrawer.designation}
                  </p>
                </div>

                {/* Performance Snapshot */}
                <div className="mt-6 grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-2xl bg-gray-50 dark:bg-slate-800/80 border border-gray-100 dark:border-slate-700 text-center">
                    <span className="text-[10px] font-semibold text-gray-500 dark:text-slate-400 uppercase block">Today Sales</span>
                    <strong className="text-base font-extrabold text-emerald-600 dark:text-emerald-400 block mt-0.5">
                      {formatCurrency(selectedSalespersonDrawer.todaySales)}
                    </strong>
                    <span className="text-[10px] text-gray-400 block mt-0.5">
                      {selectedSalespersonDrawer.billsHandled} Bills Processed
                    </span>
                  </div>

                  <div className="p-3 rounded-2xl bg-gray-50 dark:bg-slate-800/80 border border-gray-100 dark:border-slate-700 text-center">
                    <span className="text-[10px] font-semibold text-gray-500 dark:text-slate-400 uppercase block">Monthly Sales</span>
                    <strong className="text-base font-extrabold text-gray-900 dark:text-white block mt-0.5">
                      {formatCurrency(selectedSalespersonDrawer.monthSales)}
                    </strong>
                    <span className="text-[10px] text-primary-600 dark:text-primary-400 font-bold block mt-0.5">
                      {selectedSalespersonDrawer.achievementPct}% Target Achieved
                    </span>
                  </div>
                </div>

                {/* Operations & Shift Info */}
                <div className="mt-6 space-y-3 text-xs">
                  <div className="flex justify-between py-2 border-b border-gray-100 dark:border-slate-800">
                    <span className="text-gray-500 dark:text-slate-400">Assigned Counter:</span>
                    <strong className="text-gray-900 dark:text-white">{selectedSalespersonDrawer.counterName || 'Silk Sarees Counter A'}</strong>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-100 dark:border-slate-800">
                    <span className="text-gray-500 dark:text-slate-400">Assignment Role:</span>
                    <strong className="text-gray-900 dark:text-white">
                      {selectedSalespersonDrawer.isPrimary ? 'Primary Consultant' : 'Secondary Support'}
                    </strong>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-100 dark:border-slate-800">
                    <span className="text-gray-500 dark:text-slate-400">Assigned Shift:</span>
                    <strong className="text-gray-900 dark:text-white">
                      {selectedSalespersonDrawer.shiftName} ({selectedSalespersonDrawer.shiftTime})
                    </strong>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-100 dark:border-slate-800">
                    <span className="text-gray-500 dark:text-slate-400">Incentive Status:</span>
                    <strong className={selectedSalespersonDrawer.incentiveEligible ? "text-amber-600 font-bold" : "text-gray-600"}>
                      {selectedSalespersonDrawer.incentiveEligible ? "Eligible (80%+ Achievement)" : "Below Threshold"}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Drawer Bottom Actions */}
              <div className="pt-6 border-t border-gray-100 dark:border-slate-800 space-y-2">
                <Link
                  href={`/employees/profile?tab=overview`}
                  className="w-full py-2.5 px-4 bg-primary-600 hover:bg-primary-700 text-white font-bold text-xs rounded-xl text-center block transition-colors"
                >
                  Open Full Employee Profile 360
                </Link>
                <button
                  onClick={() => setSelectedSalespersonDrawer(null)}
                  className="w-full py-2 text-xs font-semibold text-gray-600 dark:text-slate-400 hover:text-gray-900"
                >
                  Close Drawer
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================== */}
        {/* MODAL 4: PRINTABLE TAX RECEIPT VIEW        */}
        {/* ========================================== */}
        {selectedBillReceipt && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <div className="bg-white text-gray-900 rounded-3xl max-w-md w-full p-6 shadow-2xl relative font-sans">
              <div className="flex justify-between items-center pb-3 border-b border-gray-200">
                <span className="text-xs font-bold text-primary-600 uppercase tracking-widest">
                  BSC Textiles Tax Invoice
                </span>
                <button onClick={() => setSelectedBillReceipt(null)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="py-4 text-center border-b border-gray-200">
                <h2 className="text-lg font-black tracking-tight">BSC TEXTILES PVT LTD</h2>
                <p className="text-[11px] text-gray-500">Since 1938 • Flagship Heritage Showroom</p>
                <p className="text-[11px] text-gray-500 font-mono mt-0.5">GSTIN: 29AAACB1234F1Z9</p>
              </div>

              <div className="py-3 text-xs space-y-1 border-b border-gray-200">
                <div className="flex justify-between">
                  <span className="text-gray-500">Bill No:</span>
                  <strong className="font-mono">{selectedBillReceipt.billNumber}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Date & Time:</span>
                  <span>{formatDateTime(selectedBillReceipt.createdAt)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Counter:</span>
                  <strong>{selectedBillReceipt.counterName}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Salesperson:</span>
                  <span>{selectedBillReceipt.salespersonName} ({selectedBillReceipt.salespersonCode})</span>
                </div>
              </div>

              <div className="py-3 space-y-2 text-xs">
                <div className="flex justify-between font-bold border-b pb-1">
                  <span>Item Description</span>
                  <span>Amount</span>
                </div>
                <div className="flex justify-between text-gray-700">
                  <span>Kanjeevaram Silk Saree (Gold Brocade)</span>
                  <span>₹28,500</span>
                </div>
                <div className="flex justify-between text-gray-700">
                  <span>Silk Blouse Fabric (1.2m)</span>
                  <span>₹2,500</span>
                </div>
              </div>

              <div className="py-3 border-t border-gray-200 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-500">Gross Amount:</span>
                  <span>{formatCurrency(selectedBillReceipt.grossAmount || selectedBillReceipt.netAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Discount:</span>
                  <span className="text-rose-600">-₹0</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">CGST (2.5%) + SGST (2.5%):</span>
                  <span>{formatCurrency((selectedBillReceipt.netAmount || 31000) * 0.05)}</span>
                </div>
                <div className="flex justify-between text-sm font-black pt-2 border-t">
                  <span>NET PAYABLE:</span>
                  <span className="text-emerald-700">{formatCurrency(selectedBillReceipt.netAmount)}</span>
                </div>
                <div className="flex justify-between text-[11px] text-gray-500 pt-1">
                  <span>Payment Tender:</span>
                  <strong className="text-gray-900 uppercase">{selectedBillReceipt.paymentMethod}</strong>
                </div>
              </div>

              <div className="pt-4 flex justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedBillReceipt(null)}
                  className="w-1/2 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-xl"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="w-1/2 py-2 text-xs font-bold text-white bg-primary-600 hover:bg-primary-700 rounded-xl shadow-sm flex items-center justify-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print Receipt
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
