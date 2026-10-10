import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { mobileApi, API_BASE_URL } from '../api/client';
import { PayslipSummary } from '../types';

export const PayslipsScreen: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [payslips, setPayslips] = useState<PayslipSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSlip, setSelectedSlip] = useState<PayslipSummary | null>(null);

  const fetchPayslips = async () => {
    try {
      const res = await mobileApi.get('/mobile/payslips');
      const slips = res.data?.payslips || res.data || [];
      setPayslips(slips);
      if (slips.length > 0) {
        setSelectedSlip(slips[0]);
      }
    } catch (e: any) {
      console.warn('Payslips fetch error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayslips();
  }, []);

  const handleDownloadPdf = (id: string, employeeCode: string) => {
    const pdfUrl = `${API_BASE_URL}/payroll/payslips/${id}/pdf`;
    Alert.alert(
      'Form T Payslip PDF',
      `Official encrypted salary statement ready for download.\n\nEndpoint:\n${pdfUrl}`,
      [{ text: 'OK' }]
    );
  };

  return (
    <View style={styles.container}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.screenTitle}>My Salary Slips</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {loading ? (
          <ActivityIndicator color="#38BDF8" style={{ marginTop: 40 }} />
        ) : payslips.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No finalized payslips available for download.</Text>
          </View>
        ) : (
          <>
            {/* Active Selected Slip Card */}
            {selectedSlip && (
              <View style={styles.activeCard}>
                <View style={styles.slipHeader}>
                  <View>
                    <Text style={styles.companyTitle}>BSC TEXTILES PVT LTD</Text>
                    <Text style={styles.formT}>Form T Form (Factories Act, 1948)</Text>
                  </View>
                  <View style={styles.finalizedBadge}>
                    <Text style={styles.finalizedText}>{selectedSlip.run_status || 'FINALIZED'}</Text>
                  </View>
                </View>

                <View style={styles.periodBanner}>
                  <Text style={styles.periodText}>
                    Salary Period: {new Date(selectedSlip.period_start).toLocaleDateString()} – {new Date(selectedSlip.period_end).toLocaleDateString()}
                  </Text>
                </View>

                {/* Earnings & Deductions Breakdown */}
                <View style={styles.breakdownSection}>
                  <View style={styles.breakdownColumn}>
                    <Text style={styles.columnTitle}>Earnings (+)</Text>
                    <View style={styles.row}>
                      <Text style={styles.rowLabel}>Basic Salary:</Text>
                      <Text style={styles.rowVal}>₹{Number(selectedSlip.basic_salary || 0).toLocaleString('en-IN')}</Text>
                    </View>
                    <View style={styles.row}>
                      <Text style={styles.rowLabel}>HRA & Allowances:</Text>
                      <Text style={styles.rowVal}>₹{Number(selectedSlip.allowances || 0).toLocaleString('en-IN')}</Text>
                    </View>
                    <View style={[styles.row, styles.totalRow]}>
                      <Text style={styles.totalLabel}>Gross Pay:</Text>
                      <Text style={styles.totalVal}>₹{Number(selectedSlip.gross_earnings || 0).toLocaleString('en-IN')}</Text>
                    </View>
                  </View>

                  <View style={styles.breakdownColumn}>
                    <Text style={styles.columnTitle}>Deductions (−)</Text>
                    <View style={styles.row}>
                      <Text style={styles.rowLabel}>PF / Statutory:</Text>
                      <Text style={styles.rowVal}>₹{Number(selectedSlip.total_deductions || 0).toLocaleString('en-IN')}</Text>
                    </View>
                    <View style={[styles.row, styles.totalRow]}>
                      <Text style={styles.totalLabel}>Total Deductions:</Text>
                      <Text style={styles.totalVal}>₹{Number(selectedSlip.total_deductions || 0).toLocaleString('en-IN')}</Text>
                    </View>
                  </View>
                </View>

                {/* Net Salary Payable */}
                <View style={styles.netCard}>
                  <View>
                    <Text style={styles.netLabel}>NET SALARY PAYABLE</Text>
                    <Text style={styles.disbursedNote}>Direct NEFT Credit to Bank</Text>
                  </View>
                  <Text style={styles.netValue}>₹{Number(selectedSlip.net_pay || 0).toLocaleString('en-IN')}</Text>
                </View>

                {/* Download PDF Button */}
                <TouchableOpacity
                  style={styles.downloadBtn}
                  onPress={() => handleDownloadPdf(selectedSlip.id, selectedSlip.employee_code)}
                >
                  <Text style={styles.downloadBtnText}>📥 Download Form T PDF</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Previous Payslips History List */}
            <Text style={styles.historyTitle}>Historical Salary Slips</Text>
            {payslips.map((slip) => (
              <TouchableOpacity
                key={slip.id}
                style={[
                  styles.historyItem,
                  selectedSlip?.id === slip.id && styles.historyItemSelected,
                ]}
                onPress={() => setSelectedSlip(slip)}
              >
                <View>
                  <Text style={styles.historyPeriod}>
                    {new Date(slip.period_start).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                  </Text>
                  <Text style={styles.historySub}>
                    Net: ₹{Number(slip.net_pay || 0).toLocaleString('en-IN')}
                  </Text>
                </View>
                <Text style={styles.viewLink}>View Breakdown ›</Text>
              </TouchableOpacity>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B192C',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  backBtn: {
    padding: 8,
  },
  backText: {
    color: '#38BDF8',
    fontSize: 16,
    fontWeight: '700',
  },
  screenTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  content: {
    padding: 16,
  },
  activeCard: {
    backgroundColor: '#1E293B',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 24,
  },
  slipHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  companyTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 1,
  },
  formT: {
    color: '#94A3B8',
    fontSize: 10,
    marginTop: 2,
  },
  finalizedBadge: {
    backgroundColor: '#14532D',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  finalizedText: {
    color: '#4ADE80',
    fontSize: 10,
    fontWeight: '800',
  },
  periodBanner: {
    backgroundColor: '#0F172A',
    padding: 8,
    borderRadius: 8,
    marginBottom: 16,
    alignItems: 'center',
  },
  periodText: {
    color: '#CBD5E1',
    fontSize: 11,
    fontWeight: '600',
  },
  breakdownSection: {
    marginBottom: 16,
  },
  breakdownColumn: {
    marginBottom: 12,
  },
  columnTitle: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  rowLabel: {
    color: '#94A3B8',
    fontSize: 12,
  },
  rowVal: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: '#334155',
    paddingTop: 6,
    marginTop: 4,
  },
  totalLabel: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  totalVal: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  netCard: {
    backgroundColor: '#1E3E62',
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  netLabel: {
    color: '#BAE6FD',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  disbursedNote: {
    color: '#94A3B8',
    fontSize: 10,
    marginTop: 2,
  },
  netValue: {
    color: '#38E54D',
    fontSize: 24,
    fontWeight: '900',
  },
  downloadBtn: {
    backgroundColor: '#2563EB',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  downloadBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  historyTitle: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  historyItem: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  historyItemSelected: {
    borderColor: '#38BDF8',
  },
  historyPeriod: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  historySub: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
  },
  viewLink: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '600',
  },
  emptyCard: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 30,
    alignItems: 'center',
    marginTop: 20,
  },
  emptyText: {
    color: '#64748B',
    fontSize: 13,
  },
});
