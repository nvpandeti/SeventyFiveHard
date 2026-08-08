import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Button } from '../components/Button';
import { TextField } from '../components/TextField';
import { useAuth } from '../context/AuthContext';
import { debugError, debugLog, debugWarn } from '../lib/debug';
import { colors, spacing, typography } from '../theme';

export function SignUpScreen({ navigation }: any) {
  const { signUp } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    const normalizedEmail = email.trim();
    const normalizedName = name.trim();
    debugLog('signup', 'Sign-up submit pressed', {
      email: normalizedEmail,
      hasName: !!normalizedName,
      passwordLength: password.length,
    });
    setError(null);
    if (password.length < 8) {
      debugWarn('signup', 'Sign-up blocked by password length validation', {
        passwordLength: password.length,
      });
      setError('Password must be at least 8 characters.');
      return;
    }
    setLoading(true);
    try {
      await signUp(normalizedEmail, password, normalizedName || undefined);
      debugLog('signup', 'Sign-up submit succeeded', {
        email: normalizedEmail,
      });
    } catch (err: any) {
      debugError('signup', 'Sign-up submit failed', err);
      setError(err?.message ?? 'Sign-up failed.');
    } finally {
      setLoading(false);
      debugLog('signup', 'Sign-up submit finished');
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.brand}>Join the crew</Text>
        <Text style={styles.subtitle}>Create your account to start Day 1.</Text>

        <View>
          <TextField label="Name" value={name} onChangeText={setName} />
          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />
          <TextField
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button title="Create Account" onPress={submit} loading={loading} />
          <View style={{ height: spacing.md }} />
          <Button
            title="Back to Sign In"
            variant="ghost"
            onPress={() => {
              debugLog('signup', 'Returning to sign-in screen');
              navigation.goBack();
            }}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  container: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl },
  brand: {
    ...typography.h1,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.body,
    color: colors.textDim,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  error: {
    ...typography.small,
    color: colors.danger,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
});
