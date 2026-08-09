import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Button } from '../components/Button';
import { TextField } from '../components/TextField';
import { useAuth } from '../context/AuthContext';
import { debugError, debugLog, debugWarn } from '../lib/debug';
import { getProfileAvatarLabel, getProfileAvatarUrl, getProfileDisplayName } from '../lib/profile';
import { colors, radius, spacing, typography } from '../theme';

export function EditProfileScreen({ navigation }: any) {
  const { user, updateProfile } = useAuth();
  const [name, setName] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(getProfileDisplayName(user));
    setAvatarUri(null);
  }, [user?.id, user?.name]);

  const avatarSource = useMemo(() => {
    if (avatarUri) {
      return { uri: avatarUri };
    }
    const remote = getProfileAvatarUrl(user);
    return remote ? { uri: remote } : null;
  }, [avatarUri, user]);

  async function pickAvatar() {
    debugLog('profile', 'Avatar picker requested');
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      debugWarn('profile', 'Avatar picker blocked by permission');
      Alert.alert('Permission needed', 'Allow photo access to pick a profile picture.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });

    if (!result.canceled && result.assets?.[0]) {
      debugLog('profile', 'Avatar selected', { uri: result.assets[0].uri });
      setAvatarUri(result.assets[0].uri);
    }
  }

  async function saveProfile() {
    const trimmedName = name.trim();
    debugLog('profile', 'Profile save requested', {
      userId: user?.id ?? null,
      hasAvatar: !!avatarUri,
      nameLength: trimmedName.length,
    });
    setError(null);

    if (!trimmedName) {
      setError('Name is required.');
      return;
    }

    setSaving(true);
    try {
      await updateProfile(trimmedName, avatarUri);
      debugLog('profile', 'Profile save succeeded', { userId: user?.id ?? null });
      navigation.goBack();
    } catch (err: any) {
      debugError('profile', 'Profile save failed', err);
      setError(err?.message ?? 'Could not save your profile.');
    } finally {
      setSaving(false);
      debugLog('profile', 'Profile save finished');
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.kicker}>Profile</Text>
        <Text style={styles.title}>Edit your crew card</Text>
        <Text style={styles.subtitle}>Keep your name current and swap your avatar anytime.</Text>

        <View style={styles.card}>
          <Pressable onPress={pickAvatar} style={styles.avatarWrap} accessibilityRole="button">
            {avatarSource ? (
              <Image source={avatarSource} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarLabel}>{getProfileAvatarLabel(user)}</Text>
              </View>
            )}
            <View style={styles.avatarBadge}>
              <Text style={styles.avatarBadgeText}>Change photo</Text>
            </View>
          </Pressable>

          <Text style={styles.namePreview}>{getProfileDisplayName(user)}</Text>
          <Text style={styles.email}>{user?.email}</Text>

          <View style={styles.form}>
            <TextField
              label="Display name"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              autoCorrect={false}
            />
            <Text style={styles.helper}>
              Tap the avatar to choose a new image. Your changes update the profile card and feed.
            </Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button title="Save profile" onPress={saveProfile} loading={saving} />
            <View style={{ height: spacing.md }} />
            <Button
              title="Cancel"
              variant="ghost"
              onPress={() => {
                debugLog('profile', 'Edit profile cancelled');
                navigation.goBack();
              }}
            />
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.lg, paddingBottom: spacing.xxl },
  kicker: {
    ...typography.label,
    color: colors.textDim,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  title: { ...typography.h1, color: colors.text },
  subtitle: { ...typography.body, color: colors.textDim, marginTop: spacing.sm },
  card: {
    marginTop: spacing.xl,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  avatarWrap: {
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  avatarImage: {
    width: 132,
    height: 132,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 3,
    borderColor: colors.primary,
  },
  avatarFallback: {
    width: 132,
    height: 132,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryDim,
    borderWidth: 3,
    borderColor: colors.primary,
  },
  avatarLabel: { color: '#fff', fontSize: 44, fontWeight: '700' },
  avatarBadge: {
    position: 'absolute',
    right: -2,
    bottom: 0,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  avatarBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  namePreview: { ...typography.h2, color: colors.text, textAlign: 'center' },
  email: { ...typography.small, color: colors.textDim, textAlign: 'center', marginTop: 4 },
  form: { marginTop: spacing.lg },
  helper: { ...typography.small, color: colors.textDim, marginBottom: spacing.md },
  error: { ...typography.small, color: colors.danger, marginBottom: spacing.sm },
});