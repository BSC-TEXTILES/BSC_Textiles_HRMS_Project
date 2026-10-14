'use client';

import React from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { HrAnalysisModule } from '@/components/employees/analysis/HrAnalysisModule';

export default function EmployeeAnalysisPage() {
  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-7xl mx-auto px-2 sm:px-4 lg:px-6 py-4">
        <HrAnalysisModule standalonePage={true} />
      </div>
    </DashboardLayout>
  );
}
