'use client';

import { useState } from 'react';
import { ShieldQuestion, Award, Users, Plus, CheckCircle } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';

export default function DesignationsPage() {
  const designations = [
    { title: 'Store General Manager', grade: 'L5 - Executive', band: '₹75,000 – ₹1,20,000', count: 4, desc: 'Overall store P&L and workforce administrative leadership' },
    { title: 'Floor Manager', grade: 'L4 - Senior Supervisory', band: '₹45,000 – ₹65,000', count: 12, desc: 'Floor shift operations, discipline, and break monitoring' },
    { title: 'Department Team Lead', grade: 'L3 - Supervisory', band: '₹35,000 – ₹45,000', count: 18, desc: 'Section targets, saree presentations, and floor mentoring' },
    { title: 'Senior Sales Consultant', grade: 'L2 - Operational', band: '₹28,000 – ₹38,000', count: 24, desc: 'Customer engagement, bridal saree consultations, closing' },
    { title: 'Cashier & Billing Executive', grade: 'L2 - Operational', band: '₹25,000 – ₹32,000', count: 8, desc: 'POS checkout, transaction processing, and reconciliation' },
    { title: 'Tea Break & Canteen Owner', grade: 'L1 - Support Operator', band: 'Special Operator', count: 4, desc: 'Authorized canteen QR token validation and meal passes' },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Designations & Grade Matrix</h1>
          <p className="text-sm text-gray-500 mt-1">
            Standard career grades, salary bands, and functional responsibilities across retail stores
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {designations.map((d, i) => (
            <div key={i} className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-primary-700 bg-primary-50 px-2.5 py-0.5 rounded">
                    {d.grade}
                  </span>
                  <h3 className="font-bold text-gray-900 text-base mt-2">{d.title}</h3>
                </div>
                <div className="w-8 h-8 rounded-lg bg-gray-50 text-gray-600 flex items-center justify-center">
                  <Award className="w-4 h-4" />
                </div>
              </div>

              <p className="text-xs text-gray-500 mt-2 leading-relaxed">{d.desc}</p>

              <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
                <span className="font-mono text-gray-700 font-semibold">{d.band}</span>
                <span className="text-gray-500 font-medium flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" /> {d.count} Staff
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
