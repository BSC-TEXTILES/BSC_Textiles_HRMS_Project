'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { TotalPunchesDetail } from './TotalPunchesDetail';
import { FloorPresenceDetail } from './FloorPresenceDetail';
import { TerminalsDetail } from './TerminalsDetail';
import { PunctualityDetail } from './PunctualityDetail';
import { AILivenessDetail } from './AILivenessDetail';

export type MetricDetailType = 'punches' | 'presence' | 'terminals' | 'punctuality' | 'liveness' | null;

interface KpiDetailContainerProps {
  activeMetric: MetricDetailType;
  onClose: () => void;
  locationId?: string;
}

export function KpiDetailContainer({
  activeMetric,
  onClose,
  locationId = 'all',
}: KpiDetailContainerProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!activeMetric) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [activeMetric, onClose]);

  if (!mounted || !activeMetric) return null;

  const isSlideOver = activeMetric === 'punches' || activeMetric === 'presence' || activeMetric === 'liveness';

  const content = (
    <div className="fixed inset-0 z-[9999] flex justify-end animate-in fade-in duration-200">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer / Modal Container */}
      <div
        className={`relative z-10 w-full bg-white shadow-2xl flex flex-col h-full transition-transform duration-300 ease-in-out ${
          isSlideOver
            ? 'max-w-5xl md:max-w-6xl w-full h-full' // Slide-over drawer
            : 'max-w-5xl w-full h-full md:h-[94vh] md:my-auto md:mr-6 md:rounded-2xl overflow-hidden' // Modal
        }`}
        role="dialog"
        aria-modal="true"
      >
        {activeMetric === 'punches' && (
          <TotalPunchesDetail open={true} onClose={onClose} />
        )}
        {activeMetric === 'presence' && (
          <FloorPresenceDetail open={true} onClose={onClose} locationId={locationId} />
        )}
        {activeMetric === 'terminals' && (
          <TerminalsDetail open={true} onClose={onClose} locationId={locationId} />
        )}
        {activeMetric === 'punctuality' && (
          <PunctualityDetail open={true} onClose={onClose} locationId={locationId} />
        )}
        {activeMetric === 'liveness' && (
          <AILivenessDetail open={true} onClose={onClose} locationId={locationId} />
        )}
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
