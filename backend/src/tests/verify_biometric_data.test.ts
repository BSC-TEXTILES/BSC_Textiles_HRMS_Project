import { listBiometricDevices, getEmployeeBiometricMappings, getRawPunchesLedger } from '../services/biometricService';

async function main() {
  console.log('\n========================================');
  console.log('BIOMETRIC TERMINALS WITH DATES & TIMESTAMPS');
  console.log('========================================');
  const terminals = await listBiometricDevices();
  terminals.forEach(t => {
    console.log(`- Terminal: ${t.name} (${t.serialNumber}) [${t.locationCode}]`);
    console.log(`  IP/Port: ${t.ipAddress}:${t.port} | Status: ${t.status}`);
    console.log(`  Last Sync: ${t.lastSyncAt ? new Date(t.lastSyncAt).toLocaleString() : 'N/A'}`);
    console.log(`  Last Heartbeat/Ping: ${t.lastHeartbeatAt ? new Date(t.lastHeartbeatAt).toLocaleString() : (t.lastConnectionAt ? new Date(t.lastConnectionAt).toLocaleString() : 'N/A')}`);
  });

  console.log('\n========================================');
  console.log('EMPLOYEE MAPPINGS (EMPLOYEE ID === BIOMETRIC PIN)');
  console.log('========================================');
  const mappings = await getEmployeeBiometricMappings();
  mappings.forEach(m => {
    const isIdentical = (m.employeeCode === m.enrollmentNumber);
    console.log(`- Employee: ${m.employeeName}`);
    console.log(`  Employee Code:        #${m.employeeCode}`);
    console.log(`  Biometric Device ID:  #${m.biometricDeviceEmployeeId}`);
    console.log(`  Terminal PIN:         #${m.enrollmentNumber}`);
    console.log(`  IDs Identical?:       ${isIdentical ? 'YES (IDENTICAL)' : 'MISMATCH'}`);
    console.log(`  Enrolled Date:        ${m.effectiveDate || m.createdAt || 'N/A'}`);
    console.log(`  Attendance Date:      ${m.lastAttendanceDate || 'N/A'}`);
    console.log(`  Last Punch Time:      ${m.lastPunchTime || 'N/A'}`);
    console.log(`  Attendance Status:    ${m.attendanceStatus || 'N/A'}`);
    console.log('----------------------------------------');
  });

  console.log('\n========================================');
  console.log('RAW PUNCHES LEDGER (DATE & TIMESTAMPS)');
  console.log('========================================');
  const punches = await getRawPunchesLedger({ limit: 5 });
  punches.forEach(p => {
    console.log(`- Punch ID: ${p.id}`);
    console.log(`  Employee: ${p.employeeName || 'Unknown'} (PIN: #${p.enrollmentNumber})`);
    console.log(`  Punch Timestamp:  ${p.punchTime}`);
    console.log(`  Attendance Date:  ${p.attendanceDate || 'N/A'}`);
    console.log(`  Punch Type:       ${p.punchType}`);
    console.log(`  Terminal Serial:  ${p.serialNumber || 'N/A'}`);
  });
  console.log('\nVerification complete.\n');
  process.exit(0);
}

main().catch(err => {
  console.error('Error running verification:', err);
  process.exit(1);
});
