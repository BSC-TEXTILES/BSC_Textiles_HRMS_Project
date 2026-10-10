import React, { useState } from 'react';
import { SafeAreaView, StatusBar, StyleSheet, View } from 'react-native';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { LoginScreen } from './src/screens/LoginScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { AttendanceScreen } from './src/screens/AttendanceScreen';
import { LeavesScreen } from './src/screens/LeavesScreen';
import { PayslipsScreen } from './src/screens/PayslipsScreen';
import { SettlementScreen } from './src/screens/SettlementScreen';
import { ManagerApprovalsScreen } from './src/screens/ManagerApprovalsScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';

const MainNavigator: React.FC = () => {
  const { user } = useAuth();
  const [currentScreen, setCurrentScreen] = useState<string>('dashboard');

  if (!user) {
    return <LoginScreen />;
  }

  const renderScreen = () => {
    switch (currentScreen) {
      case 'attendance':
        return <AttendanceScreen onBack={() => setCurrentScreen('dashboard')} />;
      case 'leaves':
        return <LeavesScreen onBack={() => setCurrentScreen('dashboard')} />;
      case 'payslips':
        return <PayslipsScreen onBack={() => setCurrentScreen('dashboard')} />;
      case 'settlement':
        return <SettlementScreen onBack={() => setCurrentScreen('dashboard')} />;
      case 'approvals':
        return <ManagerApprovalsScreen onBack={() => setCurrentScreen('dashboard')} />;
      case 'profile':
        return <ProfileScreen onBack={() => setCurrentScreen('dashboard')} />;
      case 'dashboard':
      default:
        return <DashboardScreen onNavigate={(screen) => setCurrentScreen(screen)} />;
    }
  };

  return <View style={styles.container}>{renderScreen()}</View>;
};

export default function App() {
  return (
    <AuthProvider>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" backgroundColor="#0B192C" />
        <MainNavigator />
      </SafeAreaView>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0B192C',
  },
  container: {
    flex: 1,
    backgroundColor: '#0B192C',
  },
});
