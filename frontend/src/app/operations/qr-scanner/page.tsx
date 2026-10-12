'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Camera, QrCode, CheckCircle2, AlertCircle, AlertTriangle,
  User, MapPin, Building2, Clock, Coffee, Utensils,
  RefreshCw, Settings, X, Check, WifiOff,
  Shield, Keyboard, Flashlight, FlipHorizontal, ArrowRight,
  Sparkles, CheckCheck, Store, Volume2, VolumeX
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import jsQR from 'jsqr';

interface QRScanResult {
  success: boolean;
  message?: string;
  result?: string;
  reason?: string;
  scanRecord?: {
    id: string;
    purpose: string;
    scannedAt?: string;
    locationId?: string;
  };
  employee?: {
    id: string;
    employeeCode: string;
    fullName: string;
    gender?: string;
    department?: { name: string } | string;
    floor?: { name: string } | string;
    shift?: { name: string; startTime?: string; endTime?: string } | string;
    photo?: string;
  };
  breakRecord?: any;
}

const PURPOSES = [
  { value: 'ATTENDANCE_CHECK_IN', label: 'Attendance Check-in', icon: CheckCheck },
  { value: 'ATTENDANCE_CHECK_OUT', label: 'Attendance Check-out', icon: Clock },
  { value: 'LUNCH_START', label: 'Lunch Start', icon: Utensils },
  { value: 'LUNCH_END', label: 'Lunch End', icon: Utensils },
  { value: 'TEA_BREAK_START', label: 'Tea Break Start', icon: Coffee },
  { value: 'TEA_BREAK_END', label: 'Tea Break End', icon: Coffee },
  { value: 'SELLING_POINT_CHECK_IN', label: 'Selling Point Check-in', icon: Store },
];

const LOCATIONS = [
  { value: 'all', label: 'Auto-detect' },
  { value: 'bel', label: 'Belagavi Flagship (BEL-01)' },
  { value: 'dav', label: 'Davanagere City Hub (DAV-01)' },
  { value: 'shi', label: 'Shivamogga Central (SHI-01)' },
];

const SAMPLE_EMPLOYEES = [
  { code: 'BSC-001', name: 'Priya Sharma', dept: 'Retail Sales', hub: 'Belagavi' },
  { code: 'BSC-002', name: 'Rahul Patil', dept: 'Operations & Billing', hub: 'Belagavi' },
  { code: 'BSC-003', name: 'Ananya Rao', dept: 'Customer Support', hub: 'Davanagere' },
  { code: 'BSC-004', name: 'Kiran Kumar', dept: 'Showroom Floor', hub: 'Shivamogga' },
];

// Web Audio API confirmation tone
function playSuccessSound() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
    osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.12); // E6

    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  } catch {
    // Audio context not allowed without interaction
  }
}

export default function QRScannerPage() {
  const [scanning, setScanning] = useState(false);
  const [purpose, setPurpose] = useState('ATTENDANCE_CHECK_IN');
  const [locationId, setLocationId] = useState('all');
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [hasTorch, setHasTorch] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const [scanResult, setScanResult] = useState<QRScanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [manualToken, setManualToken] = useState('');
  const [recentScans, setRecentScans] = useState<Array<{
    id: string;
    code: string;
    name: string;
    purpose: string;
    time: string;
    status: 'success' | 'error';
    reason?: string;
  }>>([]);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanLoopRef = useRef<number | null>(null);
  const lastScannedTokenRef = useRef<{ token: string; time: number } | null>(null);
  const isProcessingRef = useRef(false);

  // Stop camera tracks
  const stopCamera = useCallback(() => {
    if (scanLoopRef.current) {
      cancelAnimationFrame(scanLoopRef.current);
      scanLoopRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setScanning(false);
    setIsTorchOn(false);
    setHasTorch(false);
  }, []);

  // Post scan to backend
  const handleScanToken = useCallback(async (token: string) => {
    if (!token || isProcessingRef.current) return;

    // Throttle duplicate scans within 2.5s
    const now = Date.now();
    if (
      lastScannedTokenRef.current &&
      lastScannedTokenRef.current.token === token &&
      now - lastScannedTokenRef.current.time < 2500
    ) {
      return;
    }

    isProcessingRef.current = true;
    lastScannedTokenRef.current = { token, time: now };
    setLoading(true);

    try {
      const payload: Record<string, any> = {
        token,
        purpose,
        deviceInfo: {
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
          scannerMode: 'BACK_CAMERA_PHONE_SCANNER',
        },
      };

      if (locationId !== 'all') {
        payload.locationId = locationId;
      }

      const res = await api.post('/qr-codes/scan', payload);
      const data: QRScanResult = res.data;

      setScanResult(data);
      if (soundEnabled) playSuccessSound();

      // Haptic feedback on phone
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate([120, 60, 120]);
      }

      const empCode = data.employee?.employeeCode || 'EMP-PASS';
      const empName = data.employee?.fullName || 'Verified Employee';
      toast.success(`Scanned: ${empName} (${empCode})`);

      setRecentScans((prev) => [
        {
          id: Math.random().toString(36).substring(2, 9),
          code: empCode,
          name: empName,
          purpose: PURPOSES.find((p) => p.value === purpose)?.label || purpose,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          status: 'success',
        },
        ...prev.slice(0, 14),
      ]);
    } catch (err: any) {
      const reason = err.response?.data?.reason || err.response?.data?.error || err.message || 'QR Verification Failed';
      const failedResult: QRScanResult = {
        success: false,
        result: err.response?.data?.result || 'FAILED',
        reason,
        message: reason,
      };

      setScanResult(failedResult);
      toast.error(reason);

      setRecentScans((prev) => [
        {
          id: Math.random().toString(36).substring(2, 9),
          code: token.length > 12 ? `${token.slice(0, 10)}...` : token,
          name: 'Verification Failed',
          purpose: PURPOSES.find((p) => p.value === purpose)?.label || purpose,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          status: 'error',
          reason,
        },
        ...prev.slice(0, 14),
      ]);
    } finally {
      setLoading(false);
      isProcessingRef.current = false;
    }
  }, [purpose, locationId, soundEnabled]);

  // Frame processing loop using jsQR
  const startScanLoop = useCallback(() => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    let frameCount = 0;

    const tick = () => {
      const video = videoRef.current;
      if (video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        frameCount++;
        // Scan every second frame to maintain smooth 60fps UI performance
        if (frameCount % 2 === 0 && !isProcessingRef.current) {
          canvas.width = video.videoWidth || 640;
          canvas.height = video.videoHeight || 480;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

          try {
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const qrCode = jsQR(imageData.data, imageData.width, imageData.height, {
              inversionAttempts: 'dontInvert',
            });

            if (qrCode && qrCode.data && qrCode.data.trim()) {
              handleScanToken(qrCode.data.trim());
            }
          } catch {
            // Ignore capture error
          }
        }
      }

      scanLoopRef.current = requestAnimationFrame(tick);
    };

    scanLoopRef.current = requestAnimationFrame(tick);
  }, [handleScanToken]);

  // Open back camera with fallback
  const startCamera = useCallback(async () => {
    stopCamera();
    setCameraError(null);

    try {
      // 1. Try back camera (facingMode: { ideal: 'environment' })
      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
      } catch {
        // Fallback to simpler constraints
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { facingMode },
          });
        } catch {
          // Fallback to default camera
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: true,
          });
        }
      }

      if (!stream) {
        throw new Error('Unable to acquire camera stream');
      }

      streamRef.current = stream;

      // Check if back camera has torch / flashlight capability
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        const capabilities: any = typeof videoTrack.getCapabilities === 'function' ? videoTrack.getCapabilities() : {};
        if (capabilities && capabilities.torch) {
          setHasTorch(true);
        }
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        videoRef.current.muted = true;
        await videoRef.current.play();
      }

      setScanning(true);
      startScanLoop();
    } catch (err: any) {
      console.warn('Camera access failed:', err);
      const name = err?.name;
      let msg = 'Camera access was blocked or is unavailable.';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        msg = 'Camera permission denied. Please allow camera permissions in your browser or phone settings.';
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        msg = 'No camera found on this device. You can use Manual Entry below.';
      }
      setCameraError(msg);
      setScanning(false);
    }
  }, [facingMode, startScanLoop, stopCamera]);

  // Toggle Torch
  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (!track) return;

    try {
      const nextState = !isTorchOn;
      await (track as any).applyConstraints({
        advanced: [{ torch: nextState }],
      });
      setIsTorchOn(nextState);
    } catch (e) {
      toast.error('Torch toggle not supported on this browser');
    }
  };

  // Flip Camera between back and front
  const toggleCameraFacing = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  // Start on mount / restart when facingMode changes
  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, [startCamera, stopCamera]);

  const handleManualSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!manualToken.trim()) return;
    const token = manualToken.trim();
    setManualToken('');
    setShowManual(false);
    handleScanToken(token);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-7xl mx-auto pb-12">
        {/* ========================================================================= */}
        {/* HEADER & CONTEXT BAR                                                      */}
        {/* ========================================================================= */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-[#0058be] text-white flex items-center justify-center shadow-xs">
                  <QrCode className="w-5 h-5" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    QR Code Scanner
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                      Live Telemetry
                    </span>
                  </h1>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Scan employee QR passes for attendance, breaks, and showroom selling point check-ins
                  </p>
                </div>
              </div>
            </div>

            {/* PURPOSE & LOCATION SELECTORS */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Purpose Selector */}
              <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/80 p-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 px-2">Mode:</span>
                <select
                  value={purpose}
                  onChange={(e) => {
                    setPurpose(e.target.value);
                    setScanResult(null);
                  }}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold text-[#0058be] dark:text-blue-400 rounded-lg px-3 py-2 outline-none cursor-pointer focus:ring-2 focus:ring-[#0058be]"
                >
                  {PURPOSES.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Location Selector */}
              <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/80 p-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
                <MapPin className="w-4 h-4 text-slate-400 ml-1.5" />
                <select
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value)}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 rounded-lg px-3 py-2 outline-none cursor-pointer focus:ring-2 focus:ring-[#0058be]"
                >
                  {LOCATIONS.map((loc) => (
                    <option key={loc.value} value={loc.value}>
                      {loc.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Manual Entry Button */}
              <button
                type="button"
                onClick={() => setShowManual(true)}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-[#eff4ff] dark:bg-blue-950/60 hover:bg-[#dce9ff] dark:hover:bg-blue-900/60 text-[#0058be] dark:text-blue-300 border border-[#dce9ff] dark:border-blue-900 shadow-2xs transition-all active:scale-95"
              >
                <Keyboard className="w-4 h-4" />
                <span>Manual Entry</span>
              </button>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* MAIN SCANNER GRID                                                         */}
        {/* ========================================================================= */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* CAMERA VIEWFINDER PANEL */}
          <div className="lg:col-span-7 space-y-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
              {/* Camera Header Bar */}
              <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
                <div className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${scanning ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    {scanning ? `Back Camera Active (${facingMode === 'environment' ? 'Back' : 'Front'})` : 'Camera Stopped'}
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  {/* Torch Toggle */}
                  {hasTorch && (
                    <button
                      type="button"
                      onClick={toggleTorch}
                      className={`p-2 rounded-lg text-xs font-semibold border transition-all ${
                        isTorchOn
                          ? 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300'
                          : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                      }`}
                      title="Toggle Torch / Flashlight"
                    >
                      <Flashlight className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {/* Flip Camera Button */}
                  <button
                    type="button"
                    onClick={toggleCameraFacing}
                    className="p-2 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all"
                    title="Switch Camera (Back / Front)"
                  >
                    <FlipHorizontal className="w-3.5 h-3.5" />
                  </button>

                  {/* Mute/Unmute audio beep */}
                  <button
                    type="button"
                    onClick={() => setSoundEnabled(!soundEnabled)}
                    className="p-2 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all"
                    title={soundEnabled ? 'Mute Beep Tone' : 'Enable Beep Tone'}
                  >
                    {soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-[#0058be]" /> : <VolumeX className="w-3.5 h-3.5 text-slate-400" />}
                  </button>

                  {/* Restart Camera */}
                  <button
                    type="button"
                    onClick={scanning ? stopCamera : startCamera}
                    className="p-2 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all"
                    title={scanning ? 'Pause Camera' : 'Start Camera'}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              {/* Viewfinder Canvas / Video Frame */}
              <div className="relative aspect-4/3 sm:aspect-16/10 bg-slate-950 flex items-center justify-center overflow-hidden">
                {/* Real video stream */}
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover"
                  playsInline
                  muted
                  autoPlay
                />

                {/* Camera error fallback */}
                {cameraError && (
                  <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center p-6 text-center z-20">
                    <div className="w-14 h-14 rounded-2xl bg-rose-950/60 border border-rose-800 text-rose-400 flex items-center justify-center mb-3">
                      <WifiOff className="w-7 h-7" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-100">Camera Unavailable</h3>
                    <p className="text-xs text-slate-400 mt-1 max-w-sm mb-4">
                      {cameraError}
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={startCamera}
                        className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-[#0058be] hover:bg-[#0047a0] text-white shadow-xs transition-all"
                      >
                        Retry Camera
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowManual(true)}
                        className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all"
                      >
                        Use Manual Entry
                      </button>
                    </div>
                  </div>
                )}

                {/* Laser Scanning Reticle & Corner Brackets */}
                {scanning && !cameraError && (
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div className="relative w-64 h-64 sm:w-72 sm:h-72">
                      {/* Corner Target Markers */}
                      <div className="absolute -top-1 -left-1 w-8 h-8 border-t-4 border-l-4 border-[#0058be] rounded-tl-xl shadow-[0_0_15px_rgba(0,88,190,0.5)]" />
                      <div className="absolute -top-1 -right-1 w-8 h-8 border-t-4 border-r-4 border-[#0058be] rounded-tr-xl shadow-[0_0_15px_rgba(0,88,190,0.5)]" />
                      <div className="absolute -bottom-1 -left-1 w-8 h-8 border-b-4 border-l-4 border-[#0058be] rounded-bl-xl shadow-[0_0_15px_rgba(0,88,190,0.5)]" />
                      <div className="absolute -bottom-1 -right-1 w-8 h-8 border-b-4 border-r-4 border-[#0058be] rounded-br-xl shadow-[0_0_15px_rgba(0,88,190,0.5)]" />

                      {/* Inner Targeting Grid */}
                      <div className="absolute inset-0 border border-[#0058be]/30 rounded-lg" />

                      {/* Animated Laser Scanning Line */}
                      <div className="absolute left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-[#0058be] to-transparent shadow-[0_0_12px_#0058be] animate-pulse"
                        style={{
                          animation: 'scanLine 2.2s ease-in-out infinite alternate',
                        }}
                      />

                      {/* Overlay Instruction Badge */}
                      <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 whitespace-nowrap bg-black/75 backdrop-blur-xs text-white text-[11px] font-semibold px-3 py-1 rounded-full border border-white/10 shadow-lg">
                        Align Employee QR Pass Inside Frame
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Viewfinder Footer Tips */}
              <div className="p-3 bg-slate-50 dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
                <span className="flex items-center gap-1.5 font-medium">
                  <Sparkles className="w-3.5 h-3.5 text-[#0058be]" />
                  Real-time jsQR High-Speed Decoding (Back Camera Default)
                </span>
                <span className="font-mono text-[11px]">
                  Target: {PURPOSES.find((p) => p.value === purpose)?.label}
                </span>
              </div>
            </div>

            {/* QUICK SAMPLE PERSONAS BAR */}
            <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl p-3">
              <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-2 flex items-center justify-between">
                <span>Quick Test Persona (1-Click Test Token):</span>
                <span className="text-[10px] text-slate-400">Click to test instant scan</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {SAMPLE_EMPLOYEES.map((emp) => (
                  <button
                    key={emp.code}
                    type="button"
                    onClick={() => handleScanToken(emp.code)}
                    disabled={loading}
                    className="p-2 text-left rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-[#0058be] hover:bg-[#eff4ff]/50 dark:hover:bg-blue-950/40 transition-all text-xs"
                  >
                    <div className="font-bold text-slate-800 dark:text-slate-200 font-mono text-[11px]">
                      {emp.code}
                    </div>
                    <div className="text-slate-600 dark:text-slate-400 text-[11px] truncate">
                      {emp.name}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* TELEMETRY & SCAN RESULT PANEL */}
          <div className="lg:col-span-5 space-y-4">
            {/* SCAN RESULT DOSSIER CARD */}
            <div className={`rounded-2xl border p-5 transition-all shadow-xs ${
              !scanResult
                ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                : scanResult.success
                ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800'
                : 'bg-rose-50/70 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800'
            }`}>
              {!scanResult ? (
                <div className="text-center py-8 space-y-3">
                  <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-[#0058be] dark:text-blue-300 flex items-center justify-center mx-auto border border-blue-100 dark:border-blue-900">
                    <QrCode className="w-7 h-7" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      Ready to Scan
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs mx-auto">
                      Aim the back camera at any employee QR pass or enter an employee code manually.
                    </p>
                  </div>
                </div>
              ) : scanResult.success ? (
                <div className="space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center border border-emerald-200 dark:border-emerald-700">
                        <CheckCircle2 className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">
                          Verification Passed
                        </div>
                        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                          {scanResult.employee?.fullName || 'Employee Verified'}
                        </h3>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 border border-emerald-300">
                      PASS
                    </span>
                  </div>

                  {/* Employee Details Grid */}
                  <div className="grid grid-cols-2 gap-2.5 p-3 rounded-xl bg-white dark:bg-slate-900/90 border border-emerald-100 dark:border-emerald-900/60 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 block">Employee Code</span>
                      <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                        {scanResult.employee?.employeeCode}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">Department</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        {typeof scanResult.employee?.department === 'object'
                          ? scanResult.employee.department?.name
                          : scanResult.employee?.department || 'Retail Operations'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">Floor / Location</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        {typeof scanResult.employee?.floor === 'object'
                          ? scanResult.employee.floor?.name
                          : scanResult.employee?.floor || 'Ground Floor Flagship'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">Shift Timing</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        {typeof scanResult.employee?.shift === 'object'
                          ? scanResult.employee.shift?.name
                          : scanResult.employee?.shift || 'Morning General (10:00 - 19:00)'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-slate-500 font-mono">
                      Timestamp: {new Date().toLocaleTimeString()}
                    </span>
                    <button
                      type="button"
                      onClick={() => setScanResult(null)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs transition-all"
                    >
                      <span>Scan Next</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300 flex items-center justify-center border border-rose-200 dark:border-rose-700">
                        <AlertCircle className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-rose-700 dark:text-rose-400 uppercase tracking-wide">
                          Verification Rejected
                        </div>
                        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                          {scanResult.result || 'Scan Failed'}
                        </h3>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200 border border-rose-300">
                      REJECTED
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-white dark:bg-slate-900/90 border border-rose-100 dark:border-rose-900/60 text-xs text-rose-700 dark:text-rose-300">
                    {scanResult.reason || scanResult.message || 'The QR token could not be verified or has expired.'}
                  </div>

                  <div className="flex items-center justify-end pt-1">
                    <button
                      type="button"
                      onClick={() => setScanResult(null)}
                      className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-2xs transition-all"
                    >
                      Clear & Try Again
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* RECENT SCANS LOG */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider flex items-center gap-2">
                  <Clock className="w-4 h-4 text-slate-400" />
                  Recent Scanner Activity
                </h3>
                <span className="text-[11px] text-slate-400 font-mono">
                  {recentScans.length} events
                </span>
              </div>

              {recentScans.length === 0 ? (
                <div className="text-center py-6 text-xs text-slate-400">
                  No scans performed yet in this session.
                </div>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {recentScans.map((scan) => (
                    <div
                      key={scan.id}
                      className="p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className={`w-2 h-2 rounded-full ${scan.status === 'success' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                        <div>
                          <div className="font-bold text-slate-800 dark:text-slate-200 font-mono">
                            {scan.code} <span className="font-sans font-normal text-slate-500">({scan.name})</span>
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {scan.purpose}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] font-mono text-slate-400 block">{scan.time}</span>
                        <span className={`text-[10px] font-bold ${scan.status === 'success' ? 'text-emerald-600' : 'text-rose-500'}`}>
                          {scan.status.toUpperCase()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* MANUAL ENTRY MODAL                                                        */}
        {/* ========================================================================= */}
        {showManual && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-[#eff4ff] dark:bg-blue-950/60 text-[#0058be] flex items-center justify-center">
                    <Keyboard className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      Manual QR Token / Employee Entry
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Type or paste full QR token string or Employee Code
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowManual(false)}
                  className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleManualSubmit} className="space-y-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                    QR Token or Employee Code *
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    value={manualToken}
                    onChange={(e) => setManualToken(e.target.value)}
                    placeholder="e.g. DAILY-BSC-001-... or BSC-001"
                    className="w-full px-3.5 py-2.5 border border-slate-300 dark:border-slate-700 rounded-xl text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-mono outline-none focus:ring-2 focus:ring-[#0058be]"
                  />
                </div>

                {/* Quick Presets in modal */}
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block mb-1">
                    Quick Sample Codes:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {SAMPLE_EMPLOYEES.map((emp) => (
                      <button
                        key={emp.code}
                        type="button"
                        onClick={() => setManualToken(emp.code)}
                        className="px-2 py-1 rounded-lg text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-800 hover:bg-[#eff4ff] hover:text-[#0058be] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                      >
                        {emp.code}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowManual(false)}
                    className="px-3.5 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!manualToken.trim() || loading}
                    className="px-4 py-2 text-xs font-bold bg-[#0058be] hover:bg-[#0047a0] text-white rounded-xl shadow-xs disabled:opacity-50 transition-all flex items-center gap-1.5"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Submit Scan</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>

      <style jsx global>{`
        @keyframes scanLine {
          0% {
            top: 5%;
          }
          100% {
            top: 95%;
          }
        }
      `}</style>
    </DashboardLayout>
  );
}
