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
import { SettlementStatus } from '../types';

export const SettlementScreen: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [settlement, setSettlement] = useState<SettlementStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSettlement = async () => {
    try {
      const res = await mobileApi.get('/mobile/settlement');
      setSettlement(res.data?.settlement || res.data || null);
    } catch (e: any) {
      console.warn('Settlement fetch error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettlement();
  }, []);

  const handleDownloadPdf = (settlementId: string) => {
    const pdfUrl = `${API_BASE_URL}/exits/settlement/${settlementId}/statement-pdf`;
    Alert.alert(
      'F&F Settlement Statement',
      `Official BSC Textiles Full & Final Statement.\n\nDownload Link:\n${pdfUrl}`,
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
        <Text style={styles.screenTitle}>Ex-Employee & F&F</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {loading ? (
          <ActivityIndicator color="#38BDF8" style={{ marginTop: 40 }} />
        ) : !settlement ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Active Employment Status</Text>
            <Text style={styles.emptyText}>
              Your employment record is in ACTIVE standing. Full & Final Settlement workflows only apply upon initiating formal exit clearance or retirement.
            </Text>
          </View>
        ) : (
          <>
            {/* Exit Status Header */}
            <View style={styles.headerCard}>
              <View style={styles.headerRow}>
                <View>
                  <Text style={styles.exitType}>{settlement.exit_type} WORKFLOW</Text>
                  <Text style={styles.lwdText}>
                    Last Working Day: {settlement.last_working_date ? new Date(settlement.last_working_date).toLocaleDateString() : 'Pending'}
                  </Text>
                </View>
                <View style={styles.statusBadge}>
                  <Text style={styles.statusBadgeText}>{settlement.status}</Text>
                </View>
              </View>
            </View>

            {/* Department Clearance Progress */}
            <Text style={styles.sectionTitle}>Department Clearance Checklist</Text>
            <View style={styles.clearanceContainer}>
              {(settlement.clearanceTasks || []).map((task) => (
                <View key={task.id} style={styles.taskCard}>
                  <View>
                    <Text style={styles.taskDept}>{task.department_name}</Text>
                    <Text style={styles.taskName}>{task.task_name}</Text>
                  </View>
                  <View
                    style={[
                      styles.taskBadge,
                      task.status === 'APPROVED' && styles.taskBadgeApproved,
                      task.status === 'PENDING' && styles.taskBadgePending,
                    ]}
                  >
                    <Text style={styles.taskBadgeText}>{task.status}</Text>
                  </View>
                </View>
              ))}
            </View>

            {/* Settlement Financials */}
            {settlement.settlement ? (
              <View style={styles.financialCard}>
                <Text style={styles.financialTitle}>Full & Final Settlement Summary</Text>
                <View style={styles.netRow}>
                  <Text style={styles.netLabel}>Net Settlement Amount:</Text>
                  <Text style={styles.netValue}>
                    ₹{Number(settlement.settlement.net_payable || 0).toLocaleString('en-IN')}
                  </Text>
                </View>

                <View style={styles.disbursementRow}>
                  <Text style={styles.disbursementLabel}>Disbursement Status:</Text>
                  <Text style={styles.disbursementVal}>{settlement.settlement.status}</Text>
                </View>

                {settlement.settlement.payment_reference && (
                  <View style={styles.disbursementRow}>
                    <Text style={styles.disbursementLabel}>Bank UTR Reference:</Text>
                    <Text style={styles.disbursementVal}>{settlement.settlement.payment_reference}</Text>
                  </View>
                )}

                <TouchableOpacity
                  style={styles.pdfBtn}
                  onPress={() => handleDownloadPdf(settlement.settlement!.id)}
                >
                  <Text style={styles.pdfBtnText}>📄 Download F&F Statement PDF</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.pendingCalcCard}>
                <Text style={styles.pendingCalcText}>
                  Settlement calculation will be initiated upon completion of all department clearance signoffs.
                </Text>
              </View>
            )}
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
  headerCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  exitType: {
    color: '#38BDF8',
    fontSize: 14,
    fontWeight: '800',
  },
  lwdText: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 3,
  },
  statusBadge: {
    backgroundColor: '#334155',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusBadgeText: {
    color: '#E2E8F0',
    fontSize: 10,
    fontWeight: '800',
  },
  sectionTitle: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  clearanceContainer: {
    marginBottom: 20,
  },
  taskCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  taskDept: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  taskName: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
  },
  taskBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#334155',
  },
  taskBadgeApproved: {
    backgroundColor: '#14532D',
  },
  taskBadgePending: {
    backgroundColor: '#78350F',
  },
  taskBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  financialCard: {
    backgroundColor: '#1E3E62',
    borderRadius: 16,
    padding: 18,
    marginBottom: 20,
  },
  financialTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 12,
  },
  netRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  netLabel: {
    color: '#BAE6FD',
    fontSize: 12,
    fontWeight: '700',
  },
  netValue: {
    color: '#38E54D',
    fontSize: 22,
    fontWeight: '900',
  },
  disbursementRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  disbursementLabel: {
    color: '#94A3B8',
    fontSize: 11,
  },
  disbursementVal: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
  pdfBtn: {
    backgroundColor: '#2563EB',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 14,
  },
  pdfBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  pendingCalcCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
  },
  pendingCalcText: {
    color: '#94A3B8',
    fontSize: 12,
    textAlign: 'center',
  },
  emptyCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginTop: 20,
  },
  emptyTitle: {
    color: '#38E54D',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 8,
  },
  emptyText: {
    color: '#94A3B8',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
});
