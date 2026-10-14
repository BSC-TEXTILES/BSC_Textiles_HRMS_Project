'use client';

import React, { useState, useEffect, Suspense, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import {
  Search,
  X,
  Loader2,
  User,
  Building2,
  Store,
  Calendar,
  UserMinus,
  ShieldCheck,
  FileText,
  QrCode,
  Fingerprint,
  ClipboardCheck,
  LayoutDashboard,
  ArrowRight,
  ExternalLink,
  ChevronRight,
  Filter,
} from 'lucide-react';
import api from '@/lib/api';
import { HighlightText, SearchGroup, SearchResultItem } from '@/components/layout/GlobalHeaderSearch';

function getGroupIcon(groupId: string) {
  switch (groupId) {
    case 'employees':
      return <User className="w-4 h-4 text-blue-600 dark:text-blue-400" />;
    case 'departments':
      return <Building2 className="w-4 h-4 text-purple-600 dark:text-purple-400" />;
    case 'hubs':
      return <Store className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />;
    case 'shifts':
      return <Calendar className="w-4 h-4 text-amber-600 dark:text-amber-400" />;
    case 'former_staff':
      return <UserMinus className="w-4 h-4 text-rose-600 dark:text-rose-400" />;
    case 'kyc_documents':
      return <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />;
    case 'biometric_qr':
      return <QrCode className="w-4 h-4 text-teal-600 dark:text-teal-400" />;
    case 'attendance':
      return <ClipboardCheck className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />;
    case 'modules':
      return <LayoutDashboard className="w-4 h-4 text-slate-600 dark:text-slate-400" />;
    default:
      return <Search className="w-4 h-4 text-slate-500" />;
  }
}

function SearchPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const initialQuery = searchParams.get('q') || '';
  const [query, setQuery] = useState(initialQuery);
  const [activeTab, setActiveTab] = useState<string>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<SearchGroup[]>([]);
  const [totalCount, setTotalCount] = useState(0);

  const fetchSearchResults = useCallback(async (searchQuery: string) => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setGroups([]);
      setTotalCount(0);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await api.get(`/search?q=${encodeURIComponent(q)}&limit=25`);
      const data = res.data;
      setGroups(Array.isArray(data.groups) ? data.groups : []);
      setTotalCount(typeof data.totalCount === 'number' ? data.totalCount : 0);
    } catch (err: any) {
      setError('Search is currently unavailable. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const q = searchParams.get('q') || '';
    setQuery(q);
    fetchSearchResults(q);
  }, [searchParams, fetchSearchResults]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      router.replace(`/search?q=${encodeURIComponent(query.trim())}`);
      fetchSearchResults(query.trim());
    }
  };

  const filteredGroups = activeTab === 'all' ? groups : groups.filter((g) => g.id === activeTab);

  return (
    <div className="flex flex-col gap-6 max-w-6xl mx-auto w-full pb-12">
      {/* Search Header Banner */}
      <div className="bg-white dark:bg-[#10192e] rounded-xl border border-slate-200 dark:border-[#1f2d4e] p-6 shadow-sm">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Search className="w-5 h-5 text-[#0058be] dark:text-[#3b82f6]" />
              Global Workforce &amp; Operations Search
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Showing unified results across all Karnataka workforce ledger modules, records, and directories.
            </p>
          </div>
          {totalCount > 0 && (
            <div className="px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 text-xs font-bold">
              {totalCount} Total Matches Found
            </div>
          )}
        </div>

        {/* Query Input Box */}
        <form onSubmit={handleSearchSubmit} className="relative flex items-center">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search employees, departments, hubs, or modules..."
            className="w-full pl-10 pr-28 py-2.5 text-sm bg-slate-50 dark:bg-[#090f1d] border border-slate-300 dark:border-[#1f2d4e] rounded-lg text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-[#0058be] dark:focus:border-[#3b82f6] focus:ring-1 focus:ring-[#0058be]"
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5" />
          <div className="absolute right-2 flex items-center gap-1.5">
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setGroups([]);
                  setTotalCount(0);
                  router.replace('/search');
                }}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-md"
                aria-label="Clear query"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <button
              type="submit"
              className="px-3.5 py-1.5 text-xs font-bold bg-[#0058be] hover:bg-[#00479e] text-white rounded-md shadow-xs transition-colors"
            >
              Search
            </button>
          </div>
        </form>
      </div>

      {/* Group Navigation Tabs */}
      {groups.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-slate-200 dark:border-[#1f2d4e]">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              activeTab === 'all'
                ? 'bg-[#0058be] text-white shadow-xs'
                : 'bg-white dark:bg-[#10192e] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            All Results ({totalCount})
          </button>
          {groups.map((group) => (
            <button
              key={group.id}
              onClick={() => setActiveTab(group.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                activeTab === group.id
                  ? 'bg-[#0058be] text-white shadow-xs'
                  : 'bg-white dark:bg-[#10192e] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {getGroupIcon(group.id)}
              {group.title} ({group.count})
            </button>
          ))}
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex flex-col items-center justify-center p-16 bg-white dark:bg-[#10192e] rounded-xl border border-slate-200 dark:border-[#1f2d4e]">
          <Loader2 className="w-8 h-8 text-[#0058be] animate-spin mb-3" />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Searching across workforce records…
          </p>
          <p className="text-xs text-slate-400 mt-1">Checking employees, departments, shifts, hubs, and documents</p>
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div className="p-6 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-xl text-center">
          <p className="text-sm font-bold text-red-700 dark:text-red-300 mb-1">{error}</p>
          <button
            onClick={() => fetchSearchResults(query)}
            className="mt-2 text-xs font-bold text-red-600 underline hover:text-red-800"
          >
            Retry Search
          </button>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && initialQuery && totalCount === 0 && (
        <div className="p-16 bg-white dark:bg-[#10192e] rounded-xl border border-slate-200 dark:border-[#1f2d4e] text-center">
          <Search className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
            No matches found for &ldquo;{initialQuery}&rdquo;
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto mt-1">
            Try searching by employee code (e.g. TEST-EMP-001, EMP-BEL-EX01), employee name, department name, hub code, shift name, or module title.
          </p>
        </div>
      )}

      {/* Results Groups */}
      {!loading && !error && filteredGroups.length > 0 && (
        <div className="space-y-6">
          {filteredGroups.map((group) => (
            <div
              key={group.id}
              className="bg-white dark:bg-[#10192e] rounded-xl border border-slate-200 dark:border-[#1f2d4e] overflow-hidden shadow-xs"
            >
              {/* Group Header */}
              <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-[#1f2d4e] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {getGroupIcon(group.id)}
                  <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    {group.title}
                  </h2>
                </div>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                  {group.count} {group.count === 1 ? 'match' : 'matches'}
                </span>
              </div>

              {/* Items List */}
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {group.items.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => router.push(item.targetRoute)}
                    className="p-4 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 cursor-pointer transition-colors flex items-center justify-between gap-4 group"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="mt-1 p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 shrink-0">
                        {getGroupIcon(group.id)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-[#0058be] dark:group-hover:text-[#3b82f6] transition-colors">
                            <HighlightText text={item.displayLabel} query={query} />
                          </h3>
                          {item.badge && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300">
                              {item.badge}
                            </span>
                          )}
                          <span className="text-[10px] font-medium text-slate-400">
                            Matched on: {item.matchedField}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                          <HighlightText text={item.secondaryLine} query={query} />
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 hidden sm:inline">
                        {item.moduleName || 'View Record'}
                      </span>
                      <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 group-hover:bg-[#0058be] group-hover:text-white transition-colors flex items-center justify-center text-slate-400">
                        <ChevronRight className="w-4 h-4" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <DashboardLayout>
      <Suspense
        fallback={
          <div className="p-12 text-center text-slate-500 flex items-center justify-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-[#0058be]" />
            <span>Loading search workspace…</span>
          </div>
        }
      >
        <SearchPageContent />
      </Suspense>
    </DashboardLayout>
  );
}
