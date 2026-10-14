'use client';

import React, { useState, useEffect, useRef, useCallback, useId } from 'react';
import { useRouter } from 'next/navigation';
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
  RefreshCw,
} from 'lucide-react';
import api from '@/lib/api';

export interface SearchResultItem {
  id: string;
  type: string;
  targetRoute: string;
  displayLabel: string;
  secondaryLine: string;
  matchedField: string;
  badge?: string;
  moduleName?: string;
  maskedPhone?: string;
  email?: string;
}

export interface SearchGroup {
  id: string;
  title: string;
  count: number;
  items: SearchResultItem[];
}

export interface SearchApiResponse {
  query: string;
  totalCount: number;
  groups: SearchGroup[];
}

export interface GlobalHeaderSearchProps {
  onSelectDept?: (deptId: string) => void;
  onSelectHub?: (hubId: string) => void;
  onSelectShift?: (shiftId: string) => void;
  placeholder?: string;
  className?: string;
}

export function HighlightText({ text, query }: { text: string; query: string }) {
  if (!text) return <span>Not available</span>;
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

function getGroupIcon(groupId: string) {
  switch (groupId) {
    case 'employees':
      return <User className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />;
    case 'departments':
      return <Building2 className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />;
    case 'hubs':
      return <Store className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />;
    case 'shifts':
      return <Calendar className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />;
    case 'former_staff':
      return <UserMinus className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />;
    case 'kyc_documents':
      return <ShieldCheck className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />;
    case 'biometric_qr':
      return <QrCode className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />;
    case 'attendance':
      return <ClipboardCheck className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />;
    case 'modules':
      return <LayoutDashboard className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />;
    default:
      return <Search className="w-3.5 h-3.5 text-slate-500" />;
  }
}

export function GlobalHeaderSearch({
  onSelectDept,
  onSelectHub,
  onSelectShift,
  placeholder = 'Search employees, departments, hubs, or modules...',
  className = '',
}: GlobalHeaderSearchProps) {
  const router = useRouter();
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef<boolean>(true);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<SearchGroup[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [hasSearched, setHasSearched] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [announcement, setAnnouncement] = useState('');

  const listboxId = useId();

  // Track mount status
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Flatten items for keyboard navigation index
  const flattenedItems = React.useMemo(() => {
    const items: { group: SearchGroup; item: SearchResultItem }[] = [];
    groups.forEach((g) => {
      g.items.forEach((item) => {
        items.push({ group: g, item });
      });
    });
    return items;
  }, [groups]);

  // Execute Search with AbortController
  const executeSearch = useCallback(
    async (searchQuery: string) => {
      const q = searchQuery.trim();
      if (q.length < 2) {
        setGroups([]);
        setTotalCount(0);
        setHasSearched(false);
        setIsOpen(false);
        setLoading(false);
        setError(null);
        return;
      }

      // Cancel previous request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setLoading(true);
      setError(null);
      setIsOpen(true);

      try {
        const res = await api.get(`/search?q=${encodeURIComponent(q)}&limit=5`, {
          signal: controller.signal,
        });

        if (!isMountedRef.current) return;

        const data: SearchApiResponse = res.data;
        const returnedGroups = Array.isArray(data.groups) ? data.groups : [];
        const returnedTotal = typeof data.totalCount === 'number' ? data.totalCount : 0;

        setGroups(returnedGroups);
        setTotalCount(returnedTotal);
        setHasSearched(true);
        setActiveIndex(-1);

        if (returnedTotal === 0) {
          setAnnouncement(`No matches found for ${q}`);
        } else {
          setAnnouncement(`${returnedTotal} ${returnedTotal === 1 ? 'result' : 'results'} found across ${returnedGroups.length} categories.`);
        }
      } catch (err: any) {
        if (err?.name === 'CanceledError' || err?.message === 'canceled') {
          return;
        }
        if (!isMountedRef.current) return;
        setError('Search is unavailable');
      } finally {
        if (isMountedRef.current) {
          setLoading(false);
        }
      }
    },
    []
  );

  // Debounced input change (250–300 ms)
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newQuery = e.target.value;
    setQuery(newQuery);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (newQuery.trim().length === 0) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      setGroups([]);
      setTotalCount(0);
      setHasSearched(false);
      setIsOpen(false);
      setLoading(false);
      setError(null);
      return;
    }

    debounceTimerRef.current = setTimeout(() => {
      executeSearch(newQuery);
    }, 280);
  };

  const handleClear = () => {
    setQuery('');
    setGroups([]);
    setTotalCount(0);
    setHasSearched(false);
    setIsOpen(false);
    setLoading(false);
    setError(null);
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    inputRef.current?.focus();
  };

  const handleOpenFullResults = () => {
    if (!query.trim()) return;
    setIsOpen(false);
    router.push(`/search?q=${encodeURIComponent(query.trim())}`);
  };

  const handleSelectResult = (item: SearchResultItem, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
    }

    setIsOpen(false);

    // Filter-based result handling on pages with active filter listeners
    if (item.type === 'department' && onSelectDept) {
      const deptId = item.id;
      onSelectDept(deptId);
      return;
    }

    if (item.type === 'hub' && onSelectHub) {
      const hubId = item.id;
      onSelectHub(hubId);
      return;
    }

    if (item.type === 'shift' && onSelectShift) {
      const shiftId = item.id;
      onSelectShift(shiftId);
      return;
    }

    // Default route navigation
    if (item.targetRoute) {
      router.push(item.targetRoute);
    }
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen && query.trim().length >= 2) {
        setIsOpen(true);
        return;
      }
      if (flattenedItems.length === 0) return;
      setActiveIndex((prev) => (prev < flattenedItems.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) return;
      if (flattenedItems.length === 0) return;
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : flattenedItems.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (isOpen && activeIndex >= 0 && activeIndex < flattenedItems.length) {
        handleSelectResult(flattenedItems[activeIndex].item);
      } else if (query.trim().length > 0) {
        handleOpenFullResults();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (query.length > 0) {
        // First press clears query
        handleClear();
      } else {
        // Second press closes panel
        setIsOpen(false);
      }
    }
  };

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const activeItemId =
    activeIndex >= 0 && activeIndex < flattenedItems.length
      ? `${listboxId}-item-${activeIndex}`
      : undefined;

  return (
    <div
      ref={searchContainerRef}
      className={`relative flex-1 max-w-xl ${className}`}
    >
      {/* Live Region for Screen Readers */}
      <span className="sr-only" role="status" aria-live="polite">
        {announcement}
      </span>

      {/* Input Container */}
      <div
        className={`relative flex items-center bg-white/15 focus-within:bg-white/25 rounded-lg border transition-all duration-150 px-3 py-1 shadow-xs ${
          isOpen
            ? 'border-white/50 ring-1 ring-white/30'
            : 'border-white/25 hover:border-white/35'
        }`}
      >
        <Search className="w-3.5 h-3.5 text-sky-200 mr-2 shrink-0" aria-hidden="true" />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-activedescendant={activeItemId}
          aria-autocomplete="list"
          aria-label="Search across all modules"
          value={query}
          onChange={handleInputChange}
          onFocus={() => {
            if (query.trim().length >= 2 && (groups.length > 0 || hasSearched)) {
              setIsOpen(true);
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full bg-transparent text-xs text-white placeholder:text-white/70 focus:outline-none"
        />

        {/* Clear Button */}
        {query.length > 0 && (
          <button
            type="button"
            onClick={handleClear}
            className="p-1 rounded-md text-white/80 hover:text-white hover:bg-white/10 transition-colors mr-1"
            aria-label="Clear search"
          >
            <X className="w-3 h-3" />
          </button>
        )}

        {/* Loading Spinner */}
        {loading && (
          <Loader2 className="w-3.5 h-3.5 text-white animate-spin shrink-0" aria-label="Loading" />
        )}
      </div>

      {/* Results Dropdown Panel */}
      {isOpen && (
        <div
          id={listboxId}
          role="listbox"
          aria-label="Search across all modules"
          className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden min-w-[420px] max-sm:min-w-full max-sm:fixed max-sm:inset-x-2 max-sm:top-14 max-h-[480px] flex flex-col animate-in fade-in zoom-in-95 duration-100"
        >
          {/* Error State with Retry */}
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-950/40 border-b border-red-200 dark:border-red-900/50 flex items-center justify-between text-xs text-red-600 dark:text-red-400">
              <span>{error}</span>
              <button
                type="button"
                onClick={() => executeSearch(query)}
                className="inline-flex items-center gap-1 font-bold text-red-700 dark:text-red-300 hover:underline"
              >
                <RefreshCw className="w-3 h-3" />
                Retry
              </button>
            </div>
          )}

          {/* Loading Bar when re-fetching with previous results visible */}
          {loading && groups.length > 0 && (
            <div className="px-3 py-1 bg-slate-50 dark:bg-slate-900/80 border-b border-slate-100 dark:border-slate-800/80 flex items-center gap-2 text-[11px] text-slate-500">
              <Loader2 className="w-3 h-3 animate-spin text-[#0058be]" />
              <span>Updating results…</span>
            </div>
          )}

          {/* Empty State */}
          {!loading && !error && hasSearched && totalCount === 0 && (
            <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
              <p className="font-semibold text-slate-700 dark:text-slate-200 mb-1">
                No matches for &ldquo;{query}&rdquo;
              </p>
              <p className="text-[11px] text-slate-400">
                Try an employee ID, name, department, hub, or module name.
              </p>
            </div>
          )}

          {/* Scrollable Results List */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
            {groups.map((group) => {
              return (
                <div key={group.id} className="py-1.5" role="group" aria-label={group.title}>
                  {/* Group Header */}
                  <div className="px-3 py-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    <span className="flex items-center gap-1.5">
                      {getGroupIcon(group.id)}
                      {group.title}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      {group.count}
                    </span>
                  </div>

                  {/* Group Items */}
                  <div className="mt-0.5">
                    {group.items.map((item) => {
                      const itemIndex = flattenedItems.findIndex(
                        (fi) => fi.item.id === item.id && fi.group.id === group.id
                      );
                      const isActive = activeIndex === itemIndex;

                      return (
                        <div
                          key={item.id}
                          id={`${listboxId}-item-${itemIndex}`}
                          role="option"
                          aria-selected={isActive}
                          onClick={(e) => handleSelectResult(item, e)}
                          onMouseEnter={() => setActiveIndex(itemIndex)}
                          className={`px-3 py-2 cursor-pointer flex items-center justify-between gap-3 transition-colors ${
                            isActive
                              ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-100'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-800 dark:text-slate-200'
                          }`}
                        >
                          <div className="flex items-start gap-2.5 min-w-0">
                            <div className="mt-0.5 shrink-0 opacity-80">
                              {getGroupIcon(group.id)}
                            </div>
                            <div className="min-w-0">
                              <div className="font-semibold text-xs flex items-center gap-1.5 flex-wrap">
                                <HighlightText text={item.displayLabel} query={query} />
                                {item.badge && (
                                  <span className="text-[9px] px-1.5 py-0.2 rounded-xs bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold uppercase tracking-wider">
                                    {item.badge}
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                                <HighlightText text={item.secondaryLine} query={query} />
                              </div>
                            </div>
                          </div>

                          <div className="shrink-0 text-right">
                            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                              {item.moduleName || item.matchedField}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer: View All Results */}
          {totalCount > 0 && (
            <div className="px-3 py-2 bg-slate-50 dark:bg-slate-900/90 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
              <span className="text-[11px] text-slate-500 font-medium">
                {totalCount} total {totalCount === 1 ? 'match' : 'matches'}
              </span>
              <button
                type="button"
                onClick={handleOpenFullResults}
                className="inline-flex items-center gap-1 text-xs font-bold text-[#0058be] dark:text-[#3b82f6] hover:underline cursor-pointer"
                aria-label="View all search results"
              >
                <span>View all results ({totalCount})</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default GlobalHeaderSearch;
