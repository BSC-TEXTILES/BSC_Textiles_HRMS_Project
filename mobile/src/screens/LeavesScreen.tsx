import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { mobileApi } from '../api/client';
import { LeaveBalance, LeaveApplication } from '../types';

export const LeavesScreen: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [applications, setApplications] = useState<LeaveApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [selectedTypeId, setSelectedTypeId] = useState<string>('');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [isHalfDay, setIsHalfDay] = useState(false);
  const [reason, setReason] = useState('');

  const fetchData = async () => {
    try {
      const [balRes, appRes] = await Promise.all([
        mobileApi.get('/mobile/leave-balances').catch(() => ({ data: [] })),
        mobileApi.get('/leaves/applications').catch(() => ({ data: { applications: [] } })),
      ]);
      setBalances(balRes.data || []);
      const apps = appRes.data?.applications || appRes.data || [];
      setApplications(apps);
      if (balRes.data && balRes.data.length > 0 && !selectedTypeId) {
        setSelectedTypeId(balRes.data[0].leave_type_id);
      }
    } catch (e: any) {
      console.warn('Leaves fetch error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleApply = async () => {
    if (!selectedTypeId) {
      Alert.alert('Required', 'Please select a leave category.');
      return;
    }
    if (!reason.trim()) {
      Alert.alert('Required', 'Please enter a reason for the leave.');
      return;
    }

    setSubmitting(true);
    try {
      await mobileApi.post('/leaves/apply', {
        leaveTypeId: selectedTypeId,
        startDate,
        endDate,
        isHalfDay,
        halfDaySession: isHalfDay ? 'FIRST_HALF' : undefined,
        reason: reason.trim(),
      });
      Alert.alert('Submitted!', 'Your leave application was sent for supervisor approval.');
      setModalVisible(false);
      setReason('');
      setIsHalfDay(false);
      fetchData();
    } catch (e: any) {
      Alert.alert('Submission Error', e.response?.data?.error || 'Failed to submit leave application.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (id: string) => {
    Alert.alert('Cancel Request', 'Are you sure you want to cancel this leave application?', [
      { text: 'No' },
      {
        text: 'Yes, Cancel',
        onPress: async () => {
          try {
            await mobileApi.post(`/leaves/applications/${id}/cancel`);
            Alert.alert('Cancelled', 'Your leave request has been withdrawn.');
            fetchData();
          } catch (e: any) {
            Alert.alert('Error', e.response?.data?.error || 'Could not cancel request.');
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.screenTitle}>Leave & Balances</Text>
        <TouchableOpacity onPress={() => setModalVisible(true)} style={styles.applyBtn}>
          <Text style={styles.applyBtnText}>+ Apply</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Balances Grid */}
        <Text style={styles.sectionTitle}>Available Annual Quotas</Text>
        <View style={styles.balanceGrid}>
          {balances.map((b) => (
            <View key={b.leave_type_id} style={styles.balanceCard}>
              <Text style={styles.balCode}>{b.leave_code}</Text>
              <Text style={styles.balName}>{b.leave_name}</Text>
              <Text style={styles.balDays}>{b.remaining_days}</Text>
              <Text style={styles.balSub}>Remaining of {b.total_entitlement}</Text>
            </View>
          ))}
        </View>

        {/* Applications History */}
        <Text style={styles.sectionTitle}>My Leave Requests</Text>

        {loading ? (
          <ActivityIndicator color="#38BDF8" style={{ marginTop: 20 }} />
        ) : applications.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No leave requests recorded yet.</Text>
          </View>
        ) : (
          applications.map((app) => (
            <View key={app.id} style={styles.appCard}>
              <View style={styles.appHeader}>
                <Text style={styles.appType}>{app.leave_type_name || app.leave_type_code}</Text>
                <View
                  style={[
                    styles.statusBadge,
                    app.status === 'APPROVED' && styles.statusApproved,
                    app.status === 'REJECTED' && styles.statusRejected,
                    app.status === 'PENDING' && styles.statusPending,
                  ]}
                >
                  <Text style={styles.statusText}>{app.status}</Text>
                </View>
              </View>

              <Text style={styles.appDates}>
                {new Date(app.start_date).toLocaleDateString()}
                {app.start_date !== app.end_date && ` → ${new Date(app.end_date).toLocaleDateString()}`}
                {' '}({app.total_days} {Number(app.total_days) === 1 ? 'day' : 'days'})
              </Text>

              <Text style={styles.appReason}>"{app.reason}"</Text>

              {app.rejection_reason && (
                <Text style={styles.rejectReason}>Supervisor Note: {app.rejection_reason}</Text>
              )}

              {app.status === 'PENDING' && (
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => handleCancel(app.id)}
                >
                  <Text style={styles.cancelBtnText}>Withdraw Request</Text>
                </TouchableOpacity>
              )}
            </View>
          ))
        )}
      </ScrollView>

      {/* Apply Leave Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Apply for Leave</Text>

            {/* Leave Type Selector */}
            <Text style={styles.label}>Leave Type</Text>
            <View style={styles.typeSelector}>
              {balances.map((b) => (
                <TouchableOpacity
                  key={b.leave_type_id}
                  style={[
                    styles.typeChip,
                    selectedTypeId === b.leave_type_id && styles.typeChipSelected,
                  ]}
                  onPress={() => setSelectedTypeId(b.leave_type_id)}
                >
                  <Text
                    style={[
                      styles.typeChipText,
                      selectedTypeId === b.leave_type_id && styles.typeChipTextSelected,
                    ]}
                  >
                    {b.leave_code} ({b.remaining_days}d)
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.dateRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Start Date (YYYY-MM-DD)</Text>
                <TextInput
                  style={styles.input}
                  value={startDate}
                  onChangeText={setStartDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#64748B"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>End Date (YYYY-MM-DD)</Text>
                <TextInput
                  style={styles.input}
                  value={endDate}
                  onChangeText={setEndDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#64748B"
                />
              </View>
            </View>

            {/* Half Day Option */}
            <TouchableOpacity
              style={styles.halfDayToggle}
              onPress={() => setIsHalfDay(!isHalfDay)}
            >
              <Text style={styles.toggleCheckbox}>{isHalfDay ? '☑' : '☐'}</Text>
              <Text style={styles.toggleText}>Half-Day Option (0.5 day)</Text>
            </TouchableOpacity>

            <Text style={styles.label}>Reason for Leave</Text>
            <TextInput
              style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
              multiline
              value={reason}
              onChangeText={setReason}
              placeholder="State reason clearly for supervisor..."
              placeholderTextColor="#64748B"
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.closeBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.submitBtn}
                onPress={handleApply}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitBtnText}>Submit Leave</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  applyBtn: {
    backgroundColor: '#16A34A',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  applyBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  content: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
    marginTop: 6,
  },
  balanceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  balanceCard: {
    width: '48%',
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  balCode: {
    color: '#38BDF8',
    fontSize: 14,
    fontWeight: '800',
  },
  balName: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
  },
  balDays: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '900',
    marginVertical: 4,
  },
  balSub: {
    color: '#64748B',
    fontSize: 10,
  },
  appCard: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  appHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  appType: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#334155',
  },
  statusApproved: {
    backgroundColor: '#14532D',
  },
  statusRejected: {
    backgroundColor: '#7F1D1D',
  },
  statusPending: {
    backgroundColor: '#78350F',
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  appDates: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  appReason: {
    color: '#CBD5E1',
    fontSize: 12,
    fontStyle: 'italic',
  },
  rejectReason: {
    color: '#F87171',
    fontSize: 11,
    marginTop: 6,
  },
  cancelBtn: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#334155',
    alignItems: 'flex-end',
  },
  cancelBtnText: {
    color: '#94A3B8',
    fontSize: 11,
  },
  emptyCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    color: '#64748B',
    fontSize: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1E293B',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    borderTopWidth: 1,
    borderColor: '#334155',
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 16,
  },
  label: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  typeSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  typeChip: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  typeChipSelected: {
    backgroundColor: '#2563EB',
    borderColor: '#38BDF8',
  },
  typeChipText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
  },
  typeChipTextSelected: {
    color: '#FFFFFF',
  },
  dateRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  input: {
    backgroundColor: '#0F172A',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 14,
  },
  halfDayToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  toggleCheckbox: {
    color: '#38BDF8',
    fontSize: 18,
    marginRight: 8,
  },
  toggleText: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '600',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  closeBtn: {
    flex: 1,
    backgroundColor: '#334155',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  closeBtnText: {
    color: '#E2E8F0',
    fontWeight: '700',
    fontSize: 13,
  },
  submitBtn: {
    flex: 1,
    backgroundColor: '#16A34A',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
});
