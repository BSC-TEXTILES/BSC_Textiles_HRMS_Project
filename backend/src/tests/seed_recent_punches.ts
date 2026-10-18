import { ingestRawPunches } from '../services/biometricService.js';

async function seedRecentPunches() {
  const punches = [
    { serialNumber: 'JNP2252300795', enrollmentNumber: '1001', punchTime: '2026-10-17 09:28:14', punchType: 'CHECK_IN', verifyMode: 1 },
    { serialNumber: 'JNP2252300795', enrollmentNumber: '1004', punchTime: '2026-10-17 09:29:45', punchType: 'CHECK_IN', verifyMode: 1 },
    { serialNumber: 'JNP2252300797', enrollmentNumber: '1012', punchTime: '2026-10-17 09:30:10', punchType: 'CHECK_IN', verifyMode: 1 },
    { serialNumber: 'JNP2252300795', enrollmentNumber: '1101', punchTime: '2026-10-17 09:31:05', punchType: 'CHECK_IN', verifyMode: 1 },
    { serialNumber: 'JNP2252300802', enrollmentNumber: '1301', punchTime: '2026-10-17 09:32:20', punchType: 'CHECK_IN', verifyMode: 1 },
    { serialNumber: 'JNP2252300797', enrollmentNumber: '1604', punchTime: '2026-10-17 09:33:00', punchType: 'CHECK_IN', verifyMode: 1 },
  ];

  console.log('Ingesting raw punches via biometricService.ingestRawPunches...');
  const res = await ingestRawPunches(punches);
  console.log('Ingest result:', res);
  process.exit(0);
}

seedRecentPunches().catch(err => {
  console.error('Punch ingest error:', err);
  process.exit(1);
});
