import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DEBUG_LOGS } from './src/config';
import { AuthProvider } from './src/context/AuthContext';
import { debugLog } from './src/lib/debug';
import { RootNavigator } from './src/navigation';

export default function App() {
  useEffect(() => {
    debugLog('app', 'App mounted', { debugLogs: DEBUG_LOGS });
  }, []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="light" />
        <RootNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
