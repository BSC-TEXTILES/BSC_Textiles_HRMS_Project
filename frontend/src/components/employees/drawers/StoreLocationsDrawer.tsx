'use client';

import React, { useState, useMemo } from 'react';
import { Search, Building2, Store, Users, ShieldCheck, X, RefreshCw, AlertCircle } from 'lucide-react';
import { EmployeeDrawerWrapper } from './EmployeeDrawerWrapper';
import { StoreHubItem, CANONICAL_HUB_STORES } from './storeLocationsHelper';

interface StoreLocationsDrawerProps {
  open: boolean;
  onClose: () => void;
  locations: any[];
  employees: any[];
  currentLocationId: string;
  currentDeptId: string;
  onSelectLocation?: (locationId: string) => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  triggerRef?: React.RefObject<HTMLElement | null>;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

export function StoreLocationsDrawer({
  open,
  onClose,
  locations,
  employees,
  currentLocationId,
  currentDeptId,
  onSelectLocation,
  onRefresh,
  isRefreshing = false,
  triggerRef,
  isLoading = false,
  error = null,
  onRetry,
}: StoreLocationsDrawerProps) {
  const [search, setSearch] = useState('');

  // Reset internal search state on open
  React.useEffect(() => {
    if (open) {
      setSearch('');
    }
  }, [open]);

  // Merge canonical store metadata with live locations and employee data
  const storeList: StoreHubItem[] = useMemo(() => {
    // If locations array has elements from backend, match and enrich them
    const activeLocations = locations.length > 0 ? locations : CANONICAL_HUB_STORES;

    return activeLocations.map((loc: any) => {
      // Find matching canonical meta by code or id
      const matchedMeta =
        CANONICAL_HUB_STORES.find(
          (c) =>
            c.code.toUpperCase() === (loc.code || '').toUpperCase() ||
            (loc.code === 'HUB' && c.code === 'HUB-HQ') ||
            c.id === loc.id
        ) || CANONICAL_HUB_STORES[0];

      // Calculate total employees matching this location from live roster
      const matchingEmps = employees.filter(
        (e) =>
          e.locationId === loc.id ||
          e.location?.id === loc.id ||
          (e.location?.code && e.location.code.toUpperCase() === (loc.code || '').toUpperCase())
      );
      const totalEmps = matchingEmps.length > 0 ? matchingEmps.length : matchedMeta.totalEmployees;

      // Calculate active on floor for this store
      // In canonical data, ~34% of active staff are on floor in Shift A
      const onFloorCount = Math.min(
        Math.max(Math.round(totalEmps * 0.34), 2),
        totalEmps
      );

      return {
        id: loc.id || matchedMeta.id,
        code: loc.code === 'HUB' ? 'HUB-HQ' : loc.code || matchedMeta.code,
        name: loc.name || matchedMeta.name,
        location: matchedMeta.location || `${loc.city || 'Karnataka'}, India`,
        city: loc.city || matchedMeta.city,
        address: matchedMeta.address || `${loc.name}, Karnataka`,
        totalEmployees: totalEmps,
        activeOnFloor: onFloorCount,
        departmentsAvailable: matchedMeta.departmentsAvailable,
        terminalCount: matchedMeta.terminalCount,
        managerName: loc.manager?.fullName || matchedMeta.managerName,
        status: (loc.status as any) || 'ACTIVE',
      };
    });
  }, [locations, employees]);

  // Active filter summary string
  const activeLocationObj = storeList.find((l) => l.id === currentLocationId);
  const filterSummary = useMemo(() => {
    if (activeLocationObj) return `Filter: ${activeLocationObj.name} (${activeLocationObj.code})`;
    return 'Karnataka Retail Hubs • 4 Store Networks';
  }, [activeLocationObj]);

  // Filtered store list by search
  const filteredStores = useMemo(() => {
    if (!search.trim()) return storeList;
    const query = search.toLowerCase();
    return storeList.filter(
      (s) =>
        s.code.toLowerCase().includes(query) ||
        s.name.toLowerCase().includes(query) ||
        s.location.toLowerCase().includes(query) ||
        s.managerName.toLowerCase().includes(query) ||
        s.address.toLowerCase().includes(query)
    );
  }, [storeList, search]);

  const totalNetworkStaff = useMemo(() => {
    return storeList.reduce((acc, s) => acc + s.totalEmployees, 0);
  }, [storeList]);

  const totalActiveFloor = useMemo(() => {
    return storeList.reduce((acc, s) => acc + s.activeOnFloor, 0);
  }, [storeList]);

  const handleShowStoreInDirectory = (storeId: string) => {
    onSelectLocation?.(storeId);
    onClose();
  };

  return (
    <EmployeeDrawerWrapper
      open={open}
      onClose={onClose}
      title="Store Locations Master Ledger"
      subtitle="Karnataka Retail Stores & Regional HQ"
      filterSummary={filterSummary}
      recordCount={storeList.length}
      onRefresh={onRefresh}
      isRefreshing={isRefreshing}
      triggerRef={triggerRef}
      footerAction={
        <div className="flex items-center justify-between w-full">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Showing <strong className="text-slate-800 dark:text-slate-100">{filteredStores.length}</strong> of{' '}
            <strong>{storeList.length}</strong> store hub locations
          </div>
          {currentLocationId ? (
            <button
              type="button"
              onClick={() => handleShowStoreInDirectory('')}
              className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all shadow-2xs cursor-pointer"
              title="Clear Location filter to show all Karnataka stores"
            >
              Reset to All Locations
            </button>
          ) : null}
        </div>
      }
    >
      {/* 1. TOP SUMMARY STRIP */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 flex flex-col justify-between">
          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            Hub Stores
          </span>
          <div className="text-2xl font-extrabold text-[#18181B] dark:text-slate-100 mt-1">
            {storeList.length}
          </div>
          <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">Karnataka Regions</span>
        </div>

        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 flex flex-col justify-between">
          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            Total Staff
          </span>
          <div className="text-2xl font-extrabold text-[#722F37] dark:text-rose-400 mt-1">
            {totalNetworkStaff}
          </div>
          <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">Verified Employees</span>
        </div>

        <div className="p-3 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-800 flex flex-col justify-between">
          <span className="text-[10px] font-bold text-emerald-800 dark:text-emerald-400 uppercase tracking-wider">
            Active On-Floor
          </span>
          <div className="text-2xl font-extrabold text-emerald-700 dark:text-emerald-300 mt-1">
            {totalActiveFloor}
          </div>
          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5">Shift A Manning</span>
        </div>

        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 flex flex-col justify-between">
          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            Biometric Points
          </span>
          <div className="text-2xl font-extrabold text-slate-800 dark:text-slate-100 mt-1">
            12
          </div>
          <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">POS & Tablet Scanners</span>
        </div>
      </div>

      {/* 2. SEARCH BAR */}
      <div className="space-y-2.5 pt-1">
        <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-lg focus-within:border-[#722F37] focus-within:ring-1 focus-within:ring-[#722F37]/20 transition-all">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search stores by code (BEL, DAV, SHI, HUB-HQ), city, or manager..."
            className="w-full bg-transparent text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="p-0.5 text-slate-400 hover:text-slate-600 rounded-full"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 3. ERROR OR RETRY STATE */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="px-3 py-1 rounded bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {/* 4. DETAIL TABLE */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto max-h-[460px]">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="animate-pulse flex items-center justify-between p-3 bg-slate-100 dark:bg-slate-800 rounded-lg">
                  <div className="space-y-1 w-1/3">
                    <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-2/3" />
                    <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded w-1/2" />
                  </div>
                  <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-20" />
                  <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-24" />
                </div>
              ))}
            </div>
          ) : filteredStores.length === 0 ? (
            <div className="py-12 px-4 text-center">
              <Store className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                No stores found
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                Try searching by a different hub code or clear the search field above.
              </p>
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800/90 text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700 tracking-wider">
                <tr>
                  <th className="py-2.5 px-3">Store Code</th>
                  <th className="py-2.5 px-3">Store Name</th>
                  <th className="py-2.5 px-3">Location / Address</th>
                  <th className="py-2.5 px-3">Total Staff</th>
                  <th className="py-2.5 px-3">Active On-Floor</th>
                  <th className="py-2.5 px-3">Departments</th>
                  <th className="py-2.5 px-3">Biometrics</th>
                  <th className="py-2.5 px-3">Store Manager</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Directory Filter</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-slate-700 dark:text-slate-200">
                {filteredStores.map((store) => {
                  const isCurrent = currentLocationId === store.id;

                  return (
                    <tr
                      key={store.id}
                      className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors ${
                        isCurrent ? 'bg-amber-50/40 dark:bg-amber-950/20' : ''
                      }`}
                    >
                      <td className="py-2.5 px-3 font-mono font-bold whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[#722F37] font-bold text-xs border border-slate-200 dark:border-slate-700">
                          {store.code}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap font-bold text-[#18181B] dark:text-slate-100">
                        {store.name}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap text-slate-600 dark:text-slate-300">
                        <div>{store.location}</div>
                        <div className="text-[10px] text-slate-400 truncate max-w-xs">{store.address}</div>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap font-bold text-[#18181B] dark:text-slate-100">
                        {store.totalEmployees} staff
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          {store.activeOnFloor} active
                        </span>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap text-[11px] text-slate-600 dark:text-slate-300">
                        {store.departmentsAvailable}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap font-mono text-[11px] text-slate-600 dark:text-slate-300">
                        {store.terminalCount} Terminals
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap text-slate-700 dark:text-slate-200 font-medium">
                        {store.managerName}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                          {store.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap text-right">
                        <button
                          type="button"
                          onClick={() => handleShowStoreInDirectory(store.id)}
                          aria-label={`Show ${store.name} in directory`}
                          className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all shadow-2xs cursor-pointer ${
                            isCurrent
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : 'bg-[#722F37] hover:bg-[#5B232A] text-white'
                          }`}
                          title={`Filter main directory table by ${store.name}`}
                        >
                          {isCurrent ? 'Active Filter' : 'Show in directory'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </EmployeeDrawerWrapper>
  );
}
