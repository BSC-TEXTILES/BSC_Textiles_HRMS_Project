import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { mobileApi } from '../api/client';
import { LeaveApplication } from '../types';

export const ManagerApprovalsScreen: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [requests, setRequests] = useState<LeaveApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [actionInProgress, setActionInProgress] = useState(false);

  const fetchPendingRequests = async () => {
    try {
      const res = await mobileApi.get('/leaves/applications?status=PENDING');
      setRequests(res.data?.applications || res.data || []);
    } catch (e: any) {
      console.warn('Approvals fetch error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPendingRequests();
  }, []);

  const handleApprove = async (id: string, empName: string) => {
    setActionInProgress(true);
    try {
      await mobileApi.post(`/leaves/applications/${id}/approve`);
      Alert.alert('Approved!', `Leave request for ${empName} has been approved.`);
      fetchPendingRequests();
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.error || 'Failed to approve request.');
    } finally {
      setActionInProgress(false);
    }
  };

  const handleRejectConfirm = async () => {
    if (!selectedRequestId) return;
    if (!rejectReason.trim()) {
      Alert.alert('Required', 'A documented rejection reason is mandatory under HR policy.');
      return;
    }

    setActionInProgress(true);
    try {
      await mobileApi.post(`/leaves/applications/${selectedRequestId}/reject`, {
        reason: rejectReason.trim(),
      });
      Alert.alert('Rejected', 'Leave request has been formally rejected.');
      setRejectModalVisible(false);
      setRejectReason('');
      setSelectedRequestId(null);
      fetchPendingRequests();
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.error || 'Failed to reject request.');
    } finally {
      setActionInProgress(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.screenTitle}>Supervisor Approvals</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>
          Pending Floor Leave Requests ({requests.length})
        </Text>

        {loading ? (
          <ActivityIndicator color="#38BDF8" style={{ marginTop: 40 }} />
        ) : requests.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>All Caught Up! 🎉</Text>
            <Text style={styles.emptyText}>
              There are no pending employee leave requests requiring your review.
            </Text>
          </View>
        ) : (
          requests.map((req) => (
            <View key={req.id} style={styles.reqCard}>
              <View style={styles.reqHeader}>
                <View>
                  <Text style={styles.empName}>{req.employee_name || 'Staff Member'}</Text>
                  <Text style={styles.empCode}>{req.employee_code || 'EMP'}</Text>
                </View>
                <View style={styles.typeBadge}>
                  <Text style={styles.typeBadgeText}>
                    {req.leave_type_name || req.leave_type_code}
                  </Text>
                </View>
              </View>

              <Text style={styles.dates}>
                🗓️ {new Date(req.start_date).toLocaleDateString()}
                {req.start_date !== req.end_date && ` → ${new Date(req.end_date).toLocaleDateString()}`}
                {' '}({req.total_days} {Number(req.total_days) === 1 ? 'day' : 'days'})
              </Text>

              <Text style={styles.reason}>"{req.reason}"</Text>

              <View style={styles.actionsRow}>
                <TouchableOpacity
                  style={[styles.btn, styles.rejectBtn]}
                  disabled={actionInProgress}
                  onPress={() => {
                    setSelectedRequestId(req.id);
                    setRejectModalVisible(true);
                  }}
                >
                  <Text style={styles.rejectBtnText}>Reject</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.btn, styles.approveBtn]}
                  disabled={actionInProgress}
                  onPress={() => handleApprove(req.id, req.employee_name || 'Staff')}
                >
                  <Text style={styles.approveBtnText}>Approve Request</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Rejection Modal */}
      <Modal visible={rejectModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Specify Rejection Reason</Text>
            <Text style={styles.modalSub}>
              BSC HRMS mandates a documented reason before turning down an employee's leave request.
            </Text>

            <TextInput
              style={styles.textArea}
              multiline
              numberOfLines={3}
              placeholder="e.g. Critical showroom festival rush; insufficient floor coverage..."
              placeholderTextColor="#64748B"
              value={rejectReason}
              onChangeText={setRejectReason}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelModalBtn}
                onPress={() => {
                  setRejectModalVisible(false);
                  setRejectReason('');
                }}
              >
                <Text style={styles.cancelModalText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.confirmRejectBtn}
                onPress={handleRejectConfirm}
                disabled={actionInProgress}
              >
                <Text style={styles.confirmRejectText}>Confirm Rejection</Text>
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
  content: {
    padding: 16,
  },
  sectionTitle: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  reqCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 12,
  },
  reqHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  empName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  empCode: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 1,
  },
  typeBadge: {
    backgroundColor: '#1E3E62',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  typeBadgeText: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '700',
  },
  dates: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  reason: {
    color: '#94A3B8',
    fontSize: 12,
    fontStyle: 'italic',
    marginBottom: 14,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#334155',
    paddingTop: 12,
  },
  btn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  rejectBtn: {
    backgroundColor: '#450A0A',
    borderWidth: 1,
    borderColor: '#7F1D1D',
  },
  rejectBtnText: {
    color: '#F87171',
    fontWeight: '700',
    fontSize: 12,
  },
  approveBtn: {
    backgroundColor: '#16A34A',
  },
  approveBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12,
  },
  emptyCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 30,
    alignItems: 'center',
    marginTop: 20,
  },
  emptyTitle: {
    color: '#4ADE80',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 6,
  },
  emptyText: {
    color: '#94A3B8',
    fontSize: 12,
    textAlign: 'center',
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
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 6,
  },
  modalSub: {
    color: '#94A3B8',
    fontSize: 11,
    marginBottom: 14,
  },
  textArea: {
    backgroundColor: '#0F172A',
    borderRadius: 10,
    padding: 12,
    color: '#FFFFFF',
    fontSize: 13,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 16,
    height: 80,
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelModalBtn: {
    flex: 1,
    backgroundColor: '#334155',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  cancelModalText: {
    color: '#CBD5E1',
    fontWeight: '600',
    fontSize: 12,
  },
  confirmRejectBtn: {
    flex: 1,
    backgroundColor: '#DC2626',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  confirmRejectText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12,
  },
});
