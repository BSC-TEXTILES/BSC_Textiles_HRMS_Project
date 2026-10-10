import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { mobileApi } from '../api/client';
import { EmployeeProfile } from '../types';

export const ProfileScreen: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [profile, setProfile] = useState<EmployeeProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async () => {
    try {
      const res = await mobileApi.get('/mobile/profile');
      setProfile(res.data);
    } catch (e: any) {
      console.warn('Profile fetch error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  return (
    <View style={styles.container}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.screenTitle}>Employee Dossier 360</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {loading ? (
          <ActivityIndicator color="#38BDF8" style={{ marginTop: 40 }} />
        ) : !profile ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>Unable to load employee profile.</Text>
          </View>
        ) : (
          <>
            {/* Identity Card */}
            <View style={styles.identityCard}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {profile.fullName ? profile.fullName.substring(0, 2).toUpperCase() : 'EM'}
                </Text>
              </View>
              <Text style={styles.fullName}>{profile.fullName}</Text>
              <Text style={styles.code}>{profile.employeeCode} • {profile.designation || 'Staff'}</Text>

              <View style={styles.badgeRow}>
                <View style={styles.activeBadge}>
                  <Text style={styles.activeBadgeText}>{profile.status || 'ACTIVE'}</Text>
                </View>
                <View style={styles.digiBadge}>
                  <Text style={styles.digiBadgeText}>✓ DigiLocker KYC Verified</Text>
                </View>
              </View>
            </View>

            {/* Workplace Details */}
            <Text style={styles.sectionTitle}>Workplace Placement</Text>
            <View style={styles.card}>
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Department:</Text>
                <Text style={styles.fieldVal}>{profile.departmentName || 'Showroom Operations'}</Text>
              </View>
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Showroom Hub:</Text>
                <Text style={styles.fieldVal}>{profile.locationName || 'Belagavi Flagship'}</Text>
              </View>
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Joining Date:</Text>
                <Text style={styles.fieldVal}>
                  {profile.joiningDate ? new Date(profile.joiningDate).toLocaleDateString() : '01-Jan-2023'}
                </Text>
              </View>
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Assigned Shift:</Text>
                <Text style={styles.fieldVal}>{profile.shiftName || 'General Floor (10:00 - 20:30)'}</Text>
              </View>
            </View>

            {/* Contact & Emergency */}
            <Text style={styles.sectionTitle}>Contact & Emergency</Text>
            <View style={styles.card}>
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Email:</Text>
                <Text style={styles.fieldVal}>{profile.email}</Text>
              </View>
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Phone:</Text>
                <Text style={styles.fieldVal}>{profile.phone || '+91 98450 12345'}</Text>
              </View>
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Emergency Kin:</Text>
                <Text style={styles.fieldVal}>{profile.emergencyContactName || 'Family Member'}</Text>
              </View>
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Emergency Phone:</Text>
                <Text style={styles.fieldVal}>{profile.emergencyContactPhone || '+91 98450 99999'}</Text>
              </View>
            </View>

            {/* Statutory Details */}
            <Text style={styles.sectionTitle}>Statutory & Payroll Data</Text>
            <View style={styles.card}>
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Bank Account:</Text>
                <Text style={styles.fieldVal}>{profile.bankAccount ? `•••• ${profile.bankAccount.slice(-4)}` : 'HDFC Bank •••• 4091'}</Text>
              </View>
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>PAN Number:</Text>
                <Text style={styles.fieldVal}>{profile.pan || '••••••••12'}</Text>
              </View>
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>EPFO UAN:</Text>
                <Text style={styles.fieldVal}>{profile.uan || '101239847192'}</Text>
              </View>
            </View>
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
  identityCard: {
    backgroundColor: '#1E293B',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 20,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#1E3E62',
    borderWidth: 2,
    borderColor: '#38BDF8',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '900',
  },
  fullName: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },
  code: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 4,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  activeBadge: {
    backgroundColor: '#14532D',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  activeBadgeText: {
    color: '#4ADE80',
    fontSize: 11,
    fontWeight: '800',
  },
  digiBadge: {
    backgroundColor: '#0C4A6E',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  digiBadgeText: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '700',
  },
  sectionTitle: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 4,
  },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 16,
  },
  fieldRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#0F172A',
  },
  fieldLabel: {
    color: '#94A3B8',
    fontSize: 12,
  },
  fieldVal: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  emptyCard: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    color: '#64748B',
    fontSize: 13,
  },
});
