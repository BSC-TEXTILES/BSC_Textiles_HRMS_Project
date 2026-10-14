'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Search, X, User, Building2, Store, ArrowRight, ExternalLink } from 'lucide-react';

export interface SearchEmployeeItem {
  id: string;
  employeeCode: string;
  fullName: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  designation?: string;
  department?: { id?: string; name?: string };
  location?: { id?: string; name?: string; code?: string };
}

export interface SearchDeptItem {
  id: string;
  name: string;
  code?: string;
  staffCount?: number;
  locationId?: string;
}

export interface SearchHubItem {
  id: string;
  code: string;
  name: string;
  city?: string;
  state?: string;
}

export interface SearchResultsData {
  employees: SearchEmployeeItem[];
  departments: SearchDeptItem[];
  hubs: SearchHubItem[];
}

interface ExecutiveSearchResultsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  query: string;
  results: SearchResultsData;
  onSelectDept: (deptId: string) => void;
  onSelectHub: (hubId: string) => void;
  selectedHubId?: string;
}

function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!text) return <span>Not available.</span>;
  if (!query || query.trim().length === 0) return <span>{text}</span>;

  const trimmed = query.trim();
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));

  return (
    <span>
      {parts.map((part, i) =>
        part.toLowerCase() === trimmed.toLowerCase() ? (
          <mark
            key={i}
            className="bg-amber-100 dark:bg-amber-950/70 text-amber-900 dark:text-amber-200 font-bold px-0.5 rounded-xs"
          >
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </span>
  );
}

export function ExecutiveSearchResultsDrawer({
  isOpen,
  onClose,
  query,
  results,
  onSelectDept,
  onSelectHub,
  selectedHubId = 'all',
}: ExecutiveSearchResultsDrawerProps) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Handle ESC key to close drawer
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, onClose]);

  if (!mounted || !isOpen) return null;

  const totalMatches =
    (results.employees?.length || 0) +
    (results.departments?.length || 0) +
    (results.hubs?.length || 0);

  const handleSelectEmployee = (emp: SearchEmployeeItem) => {
    onClose();
    router.push(`/employees/profile/${emp.id}`);
  };

  const handleSelectDepartment = (dept: SearchDeptItem) => {
    onClose();
    onSelectDept(dept.id);
  };

  const handleSelectHubItem = (hub: SearchHubItem) => {
    onClose();
    onSelectHub(hub.code || hub.id);
  };

  const content = (
    <div className="fixed inset-0 z-[9999] flex justify-end animate-in fade-in duration-200">
      {/* Backdrop without blur to avoid white gap / performance hit */}
      <div
        className="fixed inset-0 bg-slate-900/60 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-over Drawer Panel */}
      <div
        className="relative z-10 w-full max-w-xl md:max-w-2xl bg-white dark:bg-[#0c1424] shadow-2xl flex flex-col h-full border-l border-slate-200 dark:border-slate-800"
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-search-title"
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0 bg-white dark:bg-[#0c1424]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900/50 flex items-center justify-center text-[#0058be] dark:text-blue-400">
              <Search className="w-5 h-5" />
            </div>
            <div>
              <h2
                id="drawer-search-title"
                className="text-base font-bold text-[#0b1c30] dark:text-white flex items-center gap-2"
              >
                <span>Search Results</span>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 dark:bg-blue-900/60 text-[#0058be] dark:text-blue-300">
                  {totalMatches} {totalMatches === 1 ? 'match' : 'matches'}
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Matching query: <span className="font-semibold text-slate-800 dark:text-slate-200">&ldquo;{query}&rdquo;</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Close search results"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content with internal scroll */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {totalMatches === 0 ? (
            <div className="py-16 text-center text-slate-500 dark:text-slate-400">
              <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 mb-3">
                <Search className="w-6 h-6" />
              </div>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                No matches for &ldquo;{query}&rdquo;
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Try searching with an employee ID (e.g. TEST-EMP-001), name, department, or hub code (e.g. BEL).
              </p>
            </div>
          ) : (
            <>
              {/* Section 1: Employees */}
              {results.employees && results.employees.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    <span className="flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-[#0058be] dark:text-blue-400" />
                      Employees ({results.employees.length})
                    </span>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800/80 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-[#0f172a]">
                    {results.employees.map((emp) => {
                      const empName = emp.fullName || `${emp.firstName || ''} ${emp.lastName || ''}`.trim() || 'Not available.';
                      const initials = empName
                        .split(' ')
                        .map((n) => n[0])
                        .slice(0, 2)
                        .join('')
                        .toUpperCase();

                      return (
                        <button
                          key={emp.id}
                          type="button"
                          onClick={() => handleSelectEmployee(emp)}
                          className="w-full text-left p-3.5 flex items-center justify-between gap-3 hover:bg-blue-50/60 dark:hover:bg-[#15233e] transition-colors group focus:outline-none focus:bg-blue-50/60 dark:focus:bg-[#15233e]"
                          aria-label={`Open profile for ${empName}`}
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className="w-9 h-9 rounded-full bg-[#eff4ff] dark:bg-blue-950/80 text-[#0058be] dark:text-blue-300 font-bold text-xs flex items-center justify-center shrink-0 border border-[#dce9ff] dark:border-blue-900/50">
                              {initials || 'EM'}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-bold text-[#0b1c30] dark:text-white truncate">
                                  <HighlightMatch text={empName} query={query} />
                                </span>
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                                  <HighlightMatch text={emp.employeeCode} query={query} />
                                </span>
                              </div>
                              <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                <span className="truncate">
                                  <HighlightMatch text={emp.designation || 'Not available.'} query={query} />
                                </span>
                                <span>•</span>
                                <span className="truncate text-slate-600 dark:text-slate-300 font-medium">
                                  <HighlightMatch
                                    text={emp.location?.name || emp.location?.code || 'Not available.'}
                                    query={query}
                                  />
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 text-[11px] font-semibold text-[#0058be] dark:text-blue-400 shrink-0 opacity-70 group-hover:opacity-100 transition-opacity">
                            <span>Open Dossier</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Section 2: Departments */}
              {results.departments && results.departments.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    <span className="flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-[#0058be] dark:text-blue-400" />
                      Departments ({results.departments.length})
                    </span>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800/80 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-[#0f172a]">
                    {results.departments.map((dept) => (
                      <button
                        key={dept.id}
                        type="button"
                        onClick={() => handleSelectDepartment(dept)}
                        className="w-full text-left p-3.5 flex items-center justify-between gap-3 hover:bg-blue-50/60 dark:hover:bg-[#15233e] transition-colors group focus:outline-none focus:bg-blue-50/60 dark:focus:bg-[#15233e]"
                        aria-label={`Filter dashboard by ${dept.name}`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="w-9 h-9 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 font-bold text-xs flex items-center justify-center shrink-0 border border-emerald-200 dark:border-emerald-900/50">
                            <Building2 className="w-4 h-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-[#0b1c30] dark:text-white truncate">
                                <HighlightMatch text={dept.name} query={query} />
                              </span>
                              {dept.code && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                                  <HighlightMatch text={dept.code} query={query} />
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                              {dept.staffCount !== undefined ? `${dept.staffCount} staff` : 'Not available.'}{' '}
                              {selectedHubId !== 'all' ? 'in selected hub' : 'across Karnataka'}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 text-[11px] font-semibold text-[#0058be] dark:text-blue-400 shrink-0 opacity-70 group-hover:opacity-100 transition-opacity">
                          <span>Apply Filter</span>
                          <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Section 3: Hubs / Stores */}
              {results.hubs && results.hubs.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    <span className="flex items-center gap-1.5">
                      <Store className="w-3.5 h-3.5 text-[#0058be] dark:text-blue-400" />
                      Hubs & Stores ({results.hubs.length})
                    </span>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800/80 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-[#0f172a]">
                    {results.hubs.map((hub) => {
                      const locationStr =
                        [hub.city, hub.state].filter(Boolean).join(', ') || 'Karnataka';

                      return (
                        <button
                          key={hub.id}
                          type="button"
                          onClick={() => handleSelectHubItem(hub)}
                          className="w-full text-left p-3.5 flex items-center justify-between gap-3 hover:bg-blue-50/60 dark:hover:bg-[#15233e] transition-colors group focus:outline-none focus:bg-blue-50/60 dark:focus:bg-[#15233e]"
                          aria-label={`Filter dashboard by ${hub.name}`}
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className="w-9 h-9 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 font-bold text-xs flex items-center justify-center shrink-0 border border-amber-200 dark:border-amber-900/50">
                              <Store className="w-4 h-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-[#0b1c30] dark:text-white truncate">
                                  <HighlightMatch text={hub.name} query={query} />
                                </span>
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                                  <HighlightMatch text={hub.code} query={query} />
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                Location: <HighlightMatch text={locationStr} query={query} />
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 text-[11px] font-semibold text-[#0058be] dark:text-blue-400 shrink-0 opacity-70 group-hover:opacity-100 transition-opacity">
                            <span>Filter Hub</span>
                            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090f1d] flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>Press ESC to close</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
