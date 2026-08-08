import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  NavigationContainer,
  DefaultTheme,
  createNavigationContainerRef,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useAuth } from './context/AuthContext';
import { debugLog } from './lib/debug';
import { FeedScreen } from './screens/FeedScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { SignInScreen } from './screens/SignInScreen';
import { SignUpScreen } from './screens/SignUpScreen';
import { TodayScreen } from './screens/TodayScreen';
import { colors } from './theme';

const AuthStack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();
const navRef = createNavigationContainerRef<any>();

const navTheme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    background: colors.bg,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    primary: colors.primary,
    notification: colors.primary,
  },
};

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="SignIn" component={SignInScreen} />
      <AuthStack.Screen name="SignUp" component={SignUpScreen} />
    </AuthStack.Navigator>
  );
}

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  return (
    <Text
      style={{
        fontSize: 20,
        opacity: focused ? 1 : 0.5,
      }}
    >
      {label}
    </Text>
  );
}

function MainTabs() {
  return (
    <Tabs.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTitleStyle: { color: colors.text },
        headerShadowVisible: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textDim,
      }}
    >
      <Tabs.Screen
        name="Today"
        component={TodayScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon label="🎯" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="Feed"
        component={FeedScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon label="👥" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon label="👤" focused={focused} />,
        }}
      />
    </Tabs.Navigator>
  );
}

export function RootNavigator() {
  const { user, loading } = useAuth();
  const lastRouteName = useRef<string | null>(null);

  useEffect(() => {
    debugLog('navigation', 'Auth state changed', {
      loading,
      userId: user?.id ?? null,
      signedIn: !!user,
    });
  }, [loading, user?.id, user]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  return (
    <NavigationContainer
      ref={navRef}
      theme={navTheme}
      onReady={() => {
        const currentRoute = navRef.getCurrentRoute();
        lastRouteName.current = currentRoute?.name ?? null;
        debugLog('navigation', 'Navigation ready', {
          route: currentRoute?.name ?? null,
        });
      }}
      onStateChange={() => {
        const currentRoute = navRef.getCurrentRoute();
        const currentRouteName = currentRoute?.name ?? null;
        if (currentRouteName !== lastRouteName.current) {
          debugLog('navigation', 'Route changed', {
            from: lastRouteName.current,
            to: currentRouteName,
          });
          lastRouteName.current = currentRouteName;
        }
      }}
    >
      {user ? <MainTabs /> : <AuthNavigator />}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
