'use client';

import React from 'react';
import { GlobalHeaderSearch } from '@/components/layout/GlobalHeaderSearch';
import {
  SearchEmployeeItem,
  SearchDeptItem,
  SearchHubItem,
  SearchResultsData,
} from './ExecutiveSearchResultsDrawer';

export type {
  SearchEmployeeItem,
  SearchDeptItem,
  SearchHubItem,
  SearchResultsData,
};

export interface ExecutiveHeaderSearchProps {
  onSelectDept: (deptId: string) => void;
  onSelectHub: (hubId: string) => void;
  onOpenSearchDrawer?: (query: string, results: SearchResultsData) => void;
  selectedHubId?: string;
}

export function ExecutiveHeaderSearch({
  onSelectDept,
  onSelectHub,
}: ExecutiveHeaderSearchProps) {
  return (
    <GlobalHeaderSearch
      onSelectDept={onSelectDept}
      onSelectHub={onSelectHub}
    />
  );
}

export default ExecutiveHeaderSearch;
