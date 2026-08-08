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
import { debugError, debugLog } from '../lib/debug';
import { colors, spacing, typography } from '../theme';

export function SignInScreen({ navigation }: any) {
	const { signIn } = useAuth();
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	async function submit() {
		const normalizedEmail = email.trim();
		debugLog('signin', 'Sign-in submit pressed', {
			email: normalizedEmail,
			passwordLength: password.length,
		});
		setError(null);
		setLoading(true);
		try {
			await signIn(normalizedEmail, password);
			debugLog('signin', 'Sign-in submit succeeded', { email: normalizedEmail });
		} catch (err: any) {
			debugError('signin', 'Sign-in submit failed', err);
			setError(err?.message ?? 'Sign-in failed.');
		} finally {
			setLoading(false);
			debugLog('signin', 'Sign-in submit finished');
		}
	}

	return (
		<KeyboardAvoidingView
			style={styles.flex}
			behavior={Platform.OS === 'ios' ? 'padding' : undefined}
		>
			<ScrollView contentContainerStyle={styles.container}>
				<Text style={styles.brand}>SeventyFiveHard</Text>
				<Text style={styles.subtitle}>Sign in to continue your streak.</Text>

				<View>
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
					<Button title="Sign In" onPress={submit} loading={loading} />
					<View style={{ height: spacing.md }} />
					<Button
						title="Create Account"
						variant="ghost"
						onPress={() => {
							debugLog('signin', 'Navigating to sign-up screen');
							navigation.navigate('SignUp');
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
