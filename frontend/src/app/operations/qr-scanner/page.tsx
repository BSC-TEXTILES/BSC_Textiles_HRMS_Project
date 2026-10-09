'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Camera, QrCode, CheckCircle, AlertCircle, AlertTriangle,
  User, MapPin, Building2, Clock, Coffee, Utensils,
  RefreshCw, Settings, X, Check, WifiOff, Wifi,
  Shield, Keyboard
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { api } from '@/lib/api';

interface QRScanResult {
  success: boolean;
  result?: string;
  reason?: string;
  scanId?: string;
  employee?: {
    id: number;
    code: string;
    name: string;
    gender: string;
    locationId: number;
  };
  qrCode?: {
    id: number;
    token: string;
    tokenType: string;
    purpose: string;
  };
  message?: string;
  scannedAt?: string;
}

interface EmployeeInfo {
  employee: { id: number; code: string; name: string; gender: string; photo?: string };
  location: { id: number; name: string };
  floor: { id: number; name: string } | null;
  shift: { code: string; start: string; end: string } | null;
  attendance: { status: string; checkIn: string; checkOut: string; lateMinutes: number; otMinutes: number; isWeekOff: boolean };
  break: { status: string; category: string; startTime: string; endTime: string } | null;
  remainingTeaBreak: number;
  remainingLunchBreak: number;
}

const PURPOSES = [
  { value: 'ATTENDANCE_CHECK_IN', label: 'Attendance Check-in' },
  { value: 'ATTENDANCE_CHECK_OUT', label: 'Attendance Check-out' },
  { value: 'LUNCH_START', label: 'Lunch Start' },
  { value: 'LUNCH_END', label: 'Lunch End' },
  { value: 'TEA_BREAK_START', label: 'Tea Break Start' },
  { value: 'TEA_BREAK_END', label: 'Tea Break End' },
  { value: 'BREAK_START', label: 'Break Start' },
  { value: 'BREAK_END', label: 'Break End' },
  { value: 'SELLING_POINT_CHECK_IN', label: 'Selling Point Check-in' },
];

export default function QRScannerPage() {
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<QRScanResult | null>(null);
  const [employeeInfo, setEmployeeInfo] = useState<EmployeeInfo | null>(null);
  const [purpose, setPurpose] = useState('ATTENDANCE_CHECK_IN');
  const [locationId, setLocationId] = useState<string>('all');
  const [floorId, setFloorId] = useState<string>('');
  const [manualToken, setManualToken] = useState('');
  const [showManual, setShowManual] = useState(false);
  const [lastScans, setLastScans] = useState<QRScanResult[]>([]);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchEmployeeInfo = useCallback(async (employeeId: number) => {
    try {
      const res = await api.get<EmployeeInfo>(`/staff-ops/live-status?employee_id=${employeeId}`);
      if (res.data.employee) {
        setEmployeeInfo(res.data);
      }
    } catch (err) {
      console.error('Failed to fetch employee info:', err);
    }
  }, []);

  const handleScan = useCallback(async (token: string) => {
    try {
      const res = await api.post<QRScanResult>('/qr-codes/scan', {
        token,
        purpose,
        locationId: locationId !== 'all' ? locationId : undefined,
        floorId: floorId || undefined,
        deviceInfo: {
          userAgent: navigator.userAgent,
          platform: navigator.platform,
        },
      });
      
      const result = res.data;
      setScanResult(result);
      setLastScans(prev => [result, ...prev.slice(0, 9)]);

      if (result.success && result.employee) {
        await fetchEmployeeInfo(result.employee.id);
      }
    } catch (err: any) {
      const errorResult: QRScanResult = {
        success: false,
        result: 'error',
        reason: err.response?.data?.error || err.message || 'Scan failed',
      };
      setScanResult(errorResult);
      setLastScans(prev => [errorResult, ...prev.slice(0, 9)]);
    }
  }, [locationId, floorId, purpose, fetchEmployeeInfo]);

  const processScan = useCallback(async (token: string) => {
    stopCamera();
    setManualToken(token);
    await handleScan(token);
  }, [handleScan]);

  const startScanLoop = useCallback(() => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return;

    const scanFrame = async () => {
      if (!scanning || !videoRef.current || videoRef.current.readyState !== videoRef.current.HAVE_ENOUGH_DATA) {
        scanIntervalRef.current = setTimeout(scanFrame, 100);
        return;
      }

      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      context.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      
      try {
        const { BarcodeDetector } = window as any;
        if (BarcodeDetector) {
          const detector = new BarcodeDetector({ formats: ['qr_code'] });
          const barcodes = await detector.detect(imageData);
          if (barcodes.length > 0) {
            await processScan(barcodes[0].rawValue);
            return;
          }
        }
      } catch (err) {
        // BarcodeDetector not available
      }

      scanIntervalRef.current = setTimeout(scanFrame, 200);
    };

    scanFrame();
  }, [scanning, processScan]);

  const startCamera = useCallback(async () => {
    try {
      setCameraError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setScanning(true);
      startScanLoop();
    } catch (err) {
      console.error('Camera access denied:', err);
      setCameraError('Camera access is required for QR scanning. Please allow camera permissions or use manual entry.');
      setScanning(false);
    }
  }, [startScanLoop]);

  const stopCamera = () => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setScanning(false);
  };

  const handleManualScan = async () => {
    if (!manualToken.trim()) return;
    const token = manualToken.trim();
    setManualToken('');
    setShowManual(false);
    await handleScan(token);
  };

  const resetScan = () => {
    setScanResult(null);
    setEmployeeInfo(null);
    if (!scanning) startCamera();
  };

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, [startCamera]);

  const getResultIcon = (result?: string) => {
    switch (result) {
      case 'success': return <CheckCircle className="w-12 h-12 text-emerald-500" />;
      case 'already_scanned': return <AlertCircle className="w-12 h-12 text-amber-500" />;
      case 'expired': return <AlertTriangle className="w-12 h-12 text-orange-500" />;
      case 'unauthorized_scanner': return <Shield className="w-12 h-12 text-red-500" />;
      case 'location_mismatch': return <MapPin className="w-12 h-12 text-red-500" />;
      case 'invalid_token': return <X className="w-12 h-12 text-red-500" />;
      default: return <AlertTriangle className="w-12 h-12 text-red-500" />;
    }
  };

  const getResultColor = (result?: string) => {
    switch (result) {
      case 'success': return 'text-emerald-600 bg-emerald-50 border-emerald-200';
      case 'already_scanned': return 'text-amber-700 bg-amber-50 border-amber-200';
      case 'expired': return 'text-orange-700 bg-orange-50 border-orange-200';
      default: return 'text-red-700 bg-red-50 border-red-200';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">QR Code Scanner</h1>
          <p className="text-gray-600 mt-1">Scan employee QR codes for attendance, breaks, and selling point check-ins</p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            options={PURPOSES}
            className="w-56"
          />
          <Select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            options={[
              { value: 'all', label: 'Auto-detect' },
              { value: 'bel', label: 'Belagavi' },
              { value: 'dav', label: 'Davanagere' },
              { value: 'shi', label: 'Shivamogga' },
            ]}
            className="w-48"
          />
          <Button variant="outline" onClick={() => setShowManual(true)}>
            <Settings className="w-4 h-4" /> Manual Entry
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Scanner Panel */}
        <Card className="p-0">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <QrCode className="w-5 h-5 text-primary-600" /> Scanner
            </h3>
            <div className="flex items-center gap-2">
              <Badge variant={scanning ? 'success' : 'neutral'} dot>
                {scanning ? 'Active' : 'Stopped'}
              </Badge>
              <Button variant="ghost" size="sm" onClick={scanning ? stopCamera : startCamera}>
                {scanning ? <X className="w-4 h-4" /> : <RefreshCw className="w-4 h-4" />}
              </Button>
            </div>
          </div>
          
          <div className="relative aspect-video bg-black">
            {cameraError && !scanning && (
              <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center text-red-600">
                <WifiOff className="w-16 h-16 mb-4 text-gray-400" />
                <p className="text-lg font-medium">Camera Unavailable</p>
                <p className="text-sm text-gray-500 mt-1">{cameraError}</p>
                <Button variant="outline" className="mt-4" onClick={() => setShowManual(true)}>
                  <Settings className="w-4 h-4 mr-2" /> Use Manual Entry
                </Button>
              </div>
            )}
            {scanning && !cameraError && (
              <>
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover"
                  playsInline
                  muted
                />
                {/* Scanning overlay */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="relative w-64 h-64">
                    <div className="absolute inset-0 border-2 border-primary-500/50 rounded-lg" />
                    <div className="absolute -top-3 -left-3 w-6 h-6 border-t-4 border-l-4 border-primary-500 rounded-tl-lg" />
                    <div className="absolute -top-3 -right-3 w-6 h-6 border-t-4 border-r-4 border-primary-500 rounded-tr-lg" />
                    <div className="absolute -bottom-3 -left-3 w-6 h-6 border-b-4 border-l-4 border-primary-500 rounded-bl-lg" />
                    <div className="absolute -bottom-3 -right-3 w-6 h-6 border-b-4 border-r-4 border-primary-500 rounded-br-lg" />
                    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white text-xs font-medium bg-black/70 px-3 py-1 rounded">
                      Position QR code within frame
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {!scanning && !cameraError && (
            <div className="p-8 text-center text-gray-500">
              <Camera className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>Camera is stopped. Click refresh to start scanning.</p>
            </div>
          )}

          {/* Manual Entry Trigger */}
          <div className="p-4 border-t border-gray-200">
            <Button variant="outline" className="w-full" onClick={() => setShowManual(true)}>
              <Keyboard className="w-4 h-4 mr-2" /> Enter Token Manually
            </Button>
          </div>
        </Card>

        {/* Result & Employee Info Panel */}
        <div className="space-y-4">
          {/* Scan Result */}
          <Card className={`p-4 ${scanResult ? getResultColor(scanResult.result) : ''}`}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                {scanResult ? getResultIcon(scanResult.result) : <QrCode className="w-12 h-12 text-gray-300" />}
                <div>
                  {scanResult ? (
                    <>
                      <h3 className="font-semibold text-lg">{scanResult.success ? 'QR SCANNED SUCCESSFULLY' : `SCAN ${scanResult.result?.toUpperCase().replace('_', ' ')}`}</h3>
                      <p className="text-sm text-gray-600 mt-1">{scanResult.reason || scanResult.message || 'Processing...'}</p>
                      {scanResult.scanId && <p className="text-xs text-gray-500 mt-1 font-mono">Scan ID: {scanResult.scanId}</p>}
                    </>
                  ) : (
                    <>
                      <h3 className="font-semibold text-lg">Ready to Scan</h3>
                      <p className="text-sm text-gray-600 mt-1">Point camera at employee QR code or use manual entry</p>
                    </>
                  )}
                </div>
              </div>
              {scanResult && !scanResult.success && (
                <Button variant="outline" size="sm" onClick={resetScan}>
                  <RefreshCw className="w-4 h-4" /> Retry
                </Button>
              )}
            </div>
          </Card>

          {/* Employee Details */}
          {employeeInfo && (
            <Card>
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <User className="w-5 h-5" /> Employee Details
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-2xs text-gray-500">Name</p>
                  <p className="font-medium">{employeeInfo.employee.name}</p>
                </div>
                <div>
                  <p className="text-2xs text-gray-500">Code</p>
                  <p className="font-medium font-mono">{employeeInfo.employee.code}</p>
                </div>
                <div>
                  <p className="text-2xs text-gray-500">Location</p>
                  <p className="font-medium flex items-center gap-1"><MapPin className="w-3 h-3" />{employeeInfo.location.name}</p>
                </div>
                <div>
                  <p className="text-2xs text-gray-500">Floor</p>
                  <p className="font-medium">{employeeInfo.floor?.name || '—'}</p>
                </div>
                <div>
                  <p className="text-2xs text-gray-500">Shift</p>
                  <p className="font-medium">{employeeInfo.shift?.code || '—'}</p>
                </div>
                <div>
                  <p className="text-2xs text-gray-500">Status</p>
                  <Badge variant={employeeInfo.attendance.isWeekOff ? 'neutral' : employeeInfo.attendance.status === 'present' ? 'success' : employeeInfo.attendance.status === 'late' ? 'warning' : 'danger'} dot>
                    {employeeInfo.attendance.isWeekOff ? 'Weekly Off' : employeeInfo.attendance.status}
                  </Badge>
                </div>
                <div>
                  <p className="text-2xs text-gray-500">Check In</p>
                  <p className="font-medium font-mono">{employeeInfo.attendance.checkIn ? new Date(employeeInfo.attendance.checkIn).toLocaleTimeString() : '—'}</p>
                </div>
                <div>
                  <p className="text-2xs text-gray-500">Late</p>
                  <p className="font-medium">{employeeInfo.attendance.lateMinutes > 0 ? `${employeeInfo.attendance.lateMinutes}m` : '—'}</p>
                </div>
                <div>
                  <p className="text-2xs text-gray-500">Break</p>
                  <p className="font-medium">{employeeInfo.break ? `${employeeInfo.break.category} (${employeeInfo.break.status})` : 'None'}</p>
                </div>
                <div>
                  <p className="text-2xs text-gray-500">Tea Left</p>
                  <p className="font-medium">{employeeInfo.remainingTeaBreak}m</p>
                </div>
                <div>
                  <p className="text-2xs text-gray-500">Lunch Left</p>
                  <p className="font-medium">{employeeInfo.remainingLunchBreak}m</p>
                </div>
              </div>
            </Card>
          )}

          {/* Recent Scans */}
          {lastScans.length > 0 && (
            <Card>
              <h3 className="font-semibold text-gray-900 mb-3">Recent Scans</h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {lastScans.map((scan, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg text-sm">
                    <div className="flex items-center gap-2">
                      <Badge variant={scan.success ? 'success' : 'danger'} dot>
                        {scan.success ? 'OK' : scan.result?.toUpperCase()}
                      </Badge>
                      <span className="font-mono text-xs">{scan.employee?.code || 'Unknown'}</span>
                      <span className="text-gray-500">{scan.employee?.name || ''}</span>
                    </div>
                    <span className="text-xs text-gray-500">{scan.scannedAt ? new Date(scan.scannedAt).toLocaleTimeString() : 'Now'}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* Manual Entry Modal */}
        {showManual && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-xl max-w-md w-full p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Manual QR Token Entry</h3>
              <Input
                label="QR Token"
                placeholder="Paste or type QR token here"
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                autoFocus
              />
              <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-gray-100">
                <Button variant="outline" onClick={() => setShowManual(false)}>Cancel</Button>
                <Button onClick={handleManualScan} disabled={!manualToken.trim()}>
                  <Check className="w-4 h-4 mr-2" /> Scan Token
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
