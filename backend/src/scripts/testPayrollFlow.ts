import axios from 'axios';

async function main() {
  const loginRes = await axios.post('http://localhost:4000/api/auth/login', {
    email: 'kavita.bhat@bsctextiles.com',
    password: 'password123'
  });
  const token = loginRes.data.token;
  console.log('Login OK. User:', loginRes.data.user?.fullName);

  // 1. Test load-or-calculate for Sadashiva (1372)
  const calcRes = await axios.get('http://localhost:4000/api/payroll/load-or-calculate', {
    params: { employeeCode: '1372', month: 'Aug', year: 2026 },
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = calcRes.data.data;
  console.log('\n--- Payslip Data loaded successfully ---');
  console.log('Employee Name:', data.fullName);
  console.log('Designation:', data.designation);
  console.log('Department:', data.departmentName);
  console.log('Section:', data.section);
  console.log('Shift:', data.shift);
  console.log('PF No:', data.pfNo, '| ESI No:', data.esiNo, '| UAN:', data.uanNo);
  console.log('Bank:', data.bankName, '| Account:', data.bankAccount);
  console.log('Gross Salary:', data.grossSalary);
  console.log('Total Deductions:', data.totalDeductions);
  console.log('Net Payable:', data.netPayable);
  console.log('CTC:', data.ctc);
  console.log('Earnings count:', data.earningsConfig?.length);
  console.log('Deductions count:', data.deductionsConfig?.length);

  // 2. Test PDF endpoint
  const pdfRes = await axios.get(`http://localhost:4000/api/payroll/payslip/${data.id}/pdf`, {
    headers: { Authorization: `Bearer ${token}` },
    responseType: 'arraybuffer'
  });
  console.log('\nPDF Download Stream test: Status', pdfRes.status, 'Size:', pdfRes.data.length, 'bytes');

  // 3. Test Save / Update Payslip
  const saveRes = await axios.post('http://localhost:4000/api/payroll/save-payslip', {
    ...data,
    remarks: 'Verified & Approved by HR Kavita Bhat for Davangere Showroom'
  }, {
    headers: { Authorization: `Bearer ${token}` }
  });
  console.log('\nSave Payslip test: Success =', saveRes.data.success, '| Net Pay =', saveRes.data.payslip?.netPayable);

  console.log('\nALL TESTS PASSED SUCCESSFULLY!');
}

main().catch(err => {
  console.error('Error in test:', err.response?.data || err.message);
  process.exit(1);
});
