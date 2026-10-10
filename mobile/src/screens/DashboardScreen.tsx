import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { mobileApi } from '../api/client';

interface DashboardProps {
  onNavigate: (screen: string) => void;
}

export const DashboardScreen: React.FC<DashboardProps> = ({ onNavigate }) => {
  const { user, isManagerOrHr, logout } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [balances, setBalances] = useState<any[]>([]);
  const [latestPayslip, setLatestPayslip] = useState<any>(null);
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchDashboardData = async () => {
    try {
      const [profRes, balRes, slipRes] = await Promise.all([
        mobileApi.get('/mobile/profile').catch(() => ({ data: {} })),
        mobileApi.get('/mobile/leave-balances').catch(() => ({ data: [] })),
        mobileApi.get('/mobile/payslips').catch(() => ({ data: [] })),
      ]);

      setProfile(profRes.data);
      setBalances(balRes.data || []);
      if (slipRes.data && slipRes.data.length > 0) {
        setLatestPayslip(slipRes.data[0]);
      }

      if (isManagerOrHr) {
        const appsRes = await mobileApi.get('/leaves/applications?status=PENDING').catch(() => ({ data: { pagination: { total: 0 } } }));
        setPendingApprovalsCount(appsRes.data?.pagination?.total || (appsRes.data?.applications || []).length);
      }
    } catch (e) {
      console.warn('Dashboard fetch error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchDashboardData();
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#38BDF8" />
        <Text style={styles.loadingText}>Connecting to BSC Textiles Core...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#38BDF8" />}
    >
      {/* Top Header Card */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.greeting}>Namaskara,</Text>
            <Text style={styles.userName}>{profile?.fullName || user?.fullName || 'Staff Member'}</Text>
            <Text style={styles.userRole}>
              {profile?.employeeCode || user?.employeeCode || 'BSC-EMP'} • {profile?.designation || 'Specialist'}
            </Text>
          </View>
          <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
            <Text style={styles.logoutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.locationBadge}>
          <Text style={styles.locationText}>
            📍 {profile?.locationName || 'Belagavi Flagship Hub'}
          </Text>
        </View>
      </View>

      {/* Quick Action: Attendance Punch */}
      <View style={styles.punchCard}>
        <View style={styles.punchHeader}>
          <View>
            <Text style={styles.punchTitle}>Geofenced Floor Attendance</Text>
            <Text style={styles.punchSubtitle}>Shift: General Floor (10:00 AM – 08:30 PM)</Text>
          </View>
          <View style={styles.liveIndicator}>
            <View style={styles.pulseDot} />
            <Text style={styles.liveText}>GPS Active</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.punchButton}
          onPress={() => onNavigate('attendance')}
        >
          <Text style={styles.punchButtonText}>Open Biometric Punch Pad →</Text>
        </TouchableOpacity>
      </View>

      {/* Manager Approvals Alert */}
      {isManagerOrHr && (
        <TouchableOpacity
          style={styles.managerBanner}
          onPress={() => onNavigate('approvals')}
        >
          <View style={styles.managerBadge}>
            <Text style={styles.managerBadgeText}>{pendingApprovalsCount}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.managerTitle}>Supervisor Action Required</Text>
            <Text style={styles.managerSubtitle}>Pending leave & shift regularization approvals</Text>
          </View>
          <Text style={styles.arrowText}>›</Text>
        </TouchableOpacity>
      )}

      {/* Leave Quota Balances */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Annual Leave Quotas</Text>
        <TouchableOpacity onPress={() => onNavigate('leaves')}>
          <Text style={styles.seeAll}>Apply Leave ›</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.quotaRow}>
        {balances.slice(0, 3).map((b, idx) => (
          <View key={b.leave_type_id || idx} style={styles.quotaCard}>
            <Text style={styles.quotaCode}>{b.leave_code}</Text>
            <Text style={styles.quotaDays}>{b.remaining_days}</Text>
            <Text style={styles.quotaLabel}>Days Left</Text>
          </View>
        ))}
      </View>

      {/* Latest Payslip Summary */}
      {latestPayslip && (
        <View style={styles.payslipCard}>
          <View style={styles.payslipHeader}>
            <Text style={styles.payslipTitle}>Latest Net Salary Disbursed</Text>
            <TouchableOpacity onPress={() => onNavigate('payslips')}>
              <Text style={styles.seeAll}>History ›</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.netAmount}>₹{Number(latestPayslip.net_pay || 0).toLocaleString('en-IN')}</Text>
          <Text style={styles.payslipPeriod}>
            Period: {new Date(latestPayslip.period_start).toLocaleDateString()} – {new Date(latestPayslip.period_end).toLocaleDateString()}
          </Text>
        </View>
      )}

      {/* Module Grid Links */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>HRMS Quick Navigation</Text>
      </View>

      <View style={styles.grid}>
        <TouchableOpacity style={styles.gridItem} onPress={() => onNavigate('attendance')}>
          <Text style={styles.gridIcon}>⏱️</Text>
          <Text style={styles.gridText}>Attendance</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.gridItem} onPress={() => onNavigate('leaves')}>
          <Text style={styles.gridIcon}>📅</Text>
          <Text style={styles.gridText}>Leaves</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.gridItem} onPress={() => onNavigate('payslips')}>
          <Text style={styles.gridIcon}>💳</Text>
          <Text style={styles.gridText}>Salary Slips</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.gridItem} onPress={() => onNavigate('profile')}>
          <Text style={styles.gridIcon}>👤</Text>
          <Text style={styles.gridText}>Profile Dossier</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.gridItem} onPress={() => onNavigate('settlement')}>
          <Text style={styles.gridIcon}>📄</Text>
          <Text style={styles.gridText}>Ex-Employee & F&F</Text>
        </TouchableOpacity>

        {isManagerOrHr && (
          <TouchableOpacity style={styles.gridItem} onPress={() => onNavigate('approvals')}>
            <Text style={styles.gridIcon}>🛡️</Text>
            <Text style={styles.gridText}>Team Approvals</Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B192C',
    padding: 16,
  },
  centerContainer: {
    flex: 1,
    backgroundColor: '#0B192C',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#94A3B8',
    marginTop: 12,
    fontSize: 14,
  },
  header: {
    backgroundColor: '#1E293B',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  greeting: {
    fontSize: 13,
    color: '#94A3B8',
  },
  userName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 2,
  },
  userRole: {
    fontSize: 12,
    color: '#38BDF8',
    marginTop: 2,
  },
  logoutBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#334155',
    borderRadius: 8,
  },
  logoutText: {
    color: '#E2E8F0',
    fontSize: 11,
    fontWeight: '600',
  },
  locationBadge: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  locationText: {
    color: '#CBD5E1',
    fontSize: 12,
  },
  punchCard: {
    backgroundColor: '#1E3E62',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
  },
  punchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  punchTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  punchSubtitle: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(56, 229, 77, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#38E54D',
    marginRight: 6,
  },
  liveText: {
    color: '#38E54D',
    fontSize: 10,
    fontWeight: '700',
  },
  punchButton: {
    backgroundColor: '#2563EB',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  punchButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  managerBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#431407',
    borderWidth: 1,
    borderColor: '#7C2D12',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  managerBadge: {
    backgroundColor: '#EA580C',
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  managerBadgeText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
  managerTitle: {
    color: '#FFEDD5',
    fontWeight: '700',
    fontSize: 13,
  },
  managerSubtitle: {
    color: '#FDBA74',
    fontSize: 11,
  },
  arrowText: {
    color: '#FDBA74',
    fontSize: 20,
    fontWeight: '700',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#E2E8F0',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  seeAll: {
    fontSize: 12,
    color: '#38BDF8',
    fontWeight: '600',
  },
  quotaRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  quotaCard: {
    flex: 1,
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
  },
  quotaCode: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
  },
  quotaDays: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    marginVertical: 4,
  },
  quotaLabel: {
    color: '#64748B',
    fontSize: 10,
  },
  payslipCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 16,
  },
  payslipHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  payslipTitle: {
    color: '#94A3B8',
    fontSize: 12,
  },
  netAmount: {
    color: '#38E54D',
    fontSize: 24,
    fontWeight: '900',
  },
  payslipPeriod: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 32,
  },
  gridItem: {
    width: '31%',
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  gridIcon: {
    fontSize: 24,
    marginBottom: 6,
  },
  gridText: {
    color: '#CBD5E1',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
});
