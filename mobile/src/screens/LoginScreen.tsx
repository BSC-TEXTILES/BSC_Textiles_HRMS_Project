import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { useAuth } from '../context/AuthContext';

export const LoginScreen: React.FC = () => {
  const { login, isLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [secureText, setSecureText] = useState(true);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Required Fields', 'Please enter your work email and password.');
      return;
    }
    try {
      await login(email.trim(), password);
    } catch (err: any) {
      Alert.alert('Login Failed', err.message);
    }
  };

  const handleQuickDemo = (role: 'employee' | 'admin') => {
    if (role === 'admin') {
      setEmail('admin@bsctextiles.com');
      setPassword('Admin@123');
    } else {
      setEmail('staff@bsctextiles.com');
      setPassword('Staff@123');
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Brand Header */}
        <View style={styles.brandContainer}>
          <View style={styles.logoBadge}>
            <Text style={styles.logoText}>BSC</Text>
          </View>
          <Text style={styles.brandTitle}>BSC TEXTILES</Text>
          <Text style={styles.brandSubtitle}>Human Resource Management System</Text>
          <Text style={styles.motto}>Karnataka Flagship Showrooms & Production Mills</Text>
        </View>

        {/* Login Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Mobile Workforce Sign In</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Corporate Email / Employee ID</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. employee@bsctextiles.com"
              placeholderTextColor="#94A3B8"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordContainer}>
              <TextInput
                style={styles.passwordInput}
                placeholder="Enter account password"
                placeholderTextColor="#94A3B8"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={secureText}
              />
              <TouchableOpacity
                onPress={() => setSecureText(!secureText)}
                style={styles.eyeButton}
              >
                <Text style={styles.eyeText}>{secureText ? 'SHOW' : 'HIDE'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={styles.signInButton}
            onPress={handleLogin}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.signInText}>Sign In Securely</Text>
            )}
          </TouchableOpacity>

          {/* Quick Demo Shortcuts */}
          <View style={styles.demoSection}>
            <Text style={styles.demoTitle}>Quick Fill Roles:</Text>
            <View style={styles.demoRow}>
              <TouchableOpacity
                style={styles.demoChip}
                onPress={() => handleQuickDemo('admin')}
              >
                <Text style={styles.demoChipText}>HR / Admin</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.demoChip}
                onPress={() => handleQuickDemo('employee')}
              >
                <Text style={styles.demoChipText}>Store Staff</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <Text style={styles.footerNote}>
          Form T & Factories Act Compliance • Geofenced GPS Check-in
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B192C',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  brandContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoBadge: {
    width: 68,
    height: 68,
    borderRadius: 20,
    backgroundColor: '#1E3E62',
    borderWidth: 2,
    borderColor: '#38E54D',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  logoText: {
    fontSize: 24,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 2,
  },
  brandTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 1.5,
  },
  brandSubtitle: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 4,
  },
  motto: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: '#334155',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 20,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#CBD5E1',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#334155',
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: '#FFFFFF',
  },
  eyeButton: {
    paddingHorizontal: 16,
  },
  eyeText: {
    fontSize: 11,
    color: '#38BDF8',
    fontWeight: '700',
  },
  signInButton: {
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  signInText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  demoSection: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  demoTitle: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  demoRow: {
    flexDirection: 'row',
    gap: 8,
  },
  demoChip: {
    flex: 1,
    backgroundColor: '#0F172A',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  demoChipText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  footerNote: {
    textAlign: 'center',
    color: '#64748B',
    fontSize: 11,
    marginTop: 24,
  },
});
