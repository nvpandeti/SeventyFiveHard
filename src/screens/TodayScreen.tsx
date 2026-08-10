import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Button } from '../components/Button';
import { TaskCheckItem } from '../components/TaskCheckItem';
import {
  DEBUG_LOGS,
  PB_SUPERUSER_EMAIL,
  PB_SUPERUSER_PASSWORD,
  SHOW_DEBUG_RUN_ROLLOVER_BUTTON,
} from '../config';
import { useAuth } from '../context/AuthContext';
import { debugError, debugLog, debugWarn } from '../lib/debug';
import { getMyLogForDate, photoUrl, upsertMyLog } from '../lib/logs';
import { pb } from '../lib/pocketbase';
import { colors, radius, spacing, typography } from '../theme';
import type { DailyLog, TaskKey } from '../types';
import { TASKS } from '../types';
import { formatFriendlyDate, normalizeCurrentDay, todayISO } from '../utils/date';

type Toggles = Record<TaskKey, boolean>;

const emptyToggles: Toggles = {
  diet_ok: false,
  workout_1: false,
  workout_2: false,
  water_ok: false,
  reading_ok: false,
};

export function TodayScreen() {
  const { user, refreshUser } = useAuth();
  const [log, setLog] = useState<DailyLog | null>(null);
  const [toggles, setToggles] = useState<Toggles>(emptyToggles);
  const [photoPreviewUri, setPhotoPreviewUri] = useState<string | null>(null);
  const [savedPhotoUrl, setSavedPhotoUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [rolloverRunning, setRolloverRunning] = useState(false);
  const [rolloverLastError, setRolloverLastError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const date = todayISO();
  const dayNumber = normalizeCurrentDay(user?.current_day);

  const load = useCallback(async () => {
    debugLog('today', 'Loading today screen data', { date, userId: user?.id ?? null });
    try {
      const existing = await getMyLogForDate(date);
      setLog(existing);
      if (existing) {
        debugLog('today', 'Existing daily log loaded', {
          logId: existing.id,
          completed: existing.completed,
        });
        setToggles({
          diet_ok: !!existing.diet_ok,
          workout_1: !!existing.workout_1,
          workout_2: !!existing.workout_2,
          water_ok: !!existing.water_ok,
          reading_ok: !!existing.reading_ok,
        });
        setSavedPhotoUrl(photoUrl(existing));
      } else {
        debugLog('today', 'No existing daily log; resetting local state');
        setToggles(emptyToggles);
        setSavedPhotoUrl(null);
      }
      setPhotoPreviewUri(null);
    } catch (err: any) {
      debugError('today', 'Failed to load today screen data', err);
      Alert.alert('Sync error', err?.message ?? 'Could not load today\'s log.');
    } finally {
      setLoading(false);
      debugLog('today', 'Finished loading today screen data', { date });
    }
  }, [date, user?.id]);

  useEffect(() => {
    debugLog('today', 'TodayScreen mounted');
    load();
    return () => {
      debugLog('today', 'TodayScreen unmounted');
    };
  }, [load]);

  const allChecked = useMemo(
    () => Object.values(toggles).every(Boolean) && !!(photoPreviewUri || savedPhotoUrl),
    [toggles, photoPreviewUri, savedPhotoUrl],
  );

  function toggle(key: TaskKey) {
    setToggles((t) => {
      const next = { ...t, [key]: !t[key] };
      debugLog('today', 'Task toggled', {
        key,
        previous: t[key],
        next: next[key],
      });
      return next;
    });
  }

  async function pickPhoto() {
    debugLog('today', 'Pick photo requested');
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      debugWarn('today', 'Photo library permission denied');
      Alert.alert('Permission needed', 'Please allow photo access to upload a progress photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets?.[0]) {
      debugLog('today', 'Photo selected from library', { uri: result.assets[0].uri });
      setPhotoPreviewUri(result.assets[0].uri);
    } else {
      debugLog('today', 'Photo library picker canceled');
    }
  }

  async function takePhoto() {
    debugLog('today', 'Take photo requested');
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      debugWarn('today', 'Camera permission denied');
      Alert.alert('Permission needed', 'Please allow camera access to take a progress photo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.7,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets?.[0]) {
      debugLog('today', 'Photo captured with camera', { uri: result.assets[0].uri });
      setPhotoPreviewUri(result.assets[0].uri);
    } else {
      debugLog('today', 'Camera capture canceled');
    }
  }

  async function submit(markComplete: boolean) {
    if (markComplete && !allChecked) {
      Alert.alert('Finish all tasks first', 'Complete all 5 tasks and add a progress photo.');
      return;
    }

    debugLog('today', 'Submit requested', {
      markComplete,
      hasPhotoPreview: !!photoPreviewUri,
      hasSavedPhoto: !!savedPhotoUrl,
      toggles,
    });
    setSaving(true);
    try {
      const saved = await upsertMyLog(
        date,
        { ...toggles, completed: markComplete },
        photoPreviewUri ?? undefined,
      );
      setLog(saved);
      setSavedPhotoUrl(photoUrl(saved));
      setPhotoPreviewUri(null);
      await refreshUser();
      debugLog('today', 'Submit succeeded', {
        logId: saved.id,
        completed: saved.completed,
      });
      if (markComplete) {
        Alert.alert('Day locked in 💪', `Day ${dayNumber} complete. See you tomorrow.`);
      }
    } catch (err: any) {
      debugError('today', 'Submit failed', err);
      Alert.alert('Save failed', err?.message ?? 'Could not save your log.');
    } finally {
      setSaving(false);
      debugLog('today', 'Submit finished', { markComplete });
    }
  }

  async function runManualRollover() {
    setRolloverRunning(true);
    setRolloverLastError(null);
    debugLog('today', 'Manual rollover requested from debug tool');
    try {
      let token = '';
      const hasSignedInToken = pb.authStore.isValid && !!pb.authStore.token;
      const hasSuperCreds = !!PB_SUPERUSER_EMAIL && !!PB_SUPERUSER_PASSWORD;

      debugLog('today', 'Manual rollover auth strategy', {
        baseUrl: pb.baseUrl,
        hasSignedInToken,
        hasSuperCreds,
      });

      if (PB_SUPERUSER_EMAIL && PB_SUPERUSER_PASSWORD) {
        const authUrl = `${pb.baseUrl}/api/collections/_superusers/auth-with-password`;
        debugLog('today', 'Requesting temporary superuser token from debug env vars', {
          url: authUrl,
          identity: PB_SUPERUSER_EMAIL,
        });
        const authResponse = await fetch(authUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            identity: PB_SUPERUSER_EMAIL,
            password: PB_SUPERUSER_PASSWORD,
          }),
        });

        const authRaw = await authResponse.text();
        let authData: any = null;
        try {
          authData = authRaw ? JSON.parse(authRaw) : null;
        } catch {
          authData = { raw: authRaw };
        }

        debugLog('today', 'Superuser auth response received', {
          status: authResponse.status,
          statusText: authResponse.statusText,
          ok: authResponse.ok,
          body: authData,
        });

        if (!authResponse.ok) {
          const message = typeof authData?.message === 'string' ? authData.message : authRaw;
          throw new Error(message);
        }

        token = typeof authData?.token === 'string' ? authData.token : '';
      }

      if (!token && pb.authStore.isValid) {
        debugLog('today', 'Falling back to existing auth token for rollover request');
        token = pb.authStore.token;
      }

      if (!token) {
        throw new Error(
          'No valid auth token. Sign in as a superuser, or set EXPO_PUBLIC_PB_SUPERUSER_EMAIL and EXPO_PUBLIC_PB_SUPERUSER_PASSWORD in .env.',
        );
      }

      const rolloverUrl = `${pb.baseUrl}/api/admin/rollover`;
      debugLog('today', 'Calling manual rollover endpoint', {
        url: rolloverUrl,
      });

      const response = await fetch(rolloverUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const raw = await response.text();
      let data: any = null;
      try {
        data = raw ? JSON.parse(raw) : null;
      } catch {
        data = { raw };
      }

      debugLog('today', 'Manual rollover response received', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        body: data,
      });

      if (!response.ok && response.status !== 207) {
        const message = typeof data?.message === 'string' ? data.message : raw;
        throw new Error(message);
      }

      await refreshUser();
      await load();

      debugLog('today', 'Manual rollover succeeded', {
        status: response.status,
        summary: data?.summary ?? null,
      });
      Alert.alert('Rollover complete', JSON.stringify(data?.summary ?? {}, null, 2));
    } catch (err: any) {
      debugError('today', 'Manual rollover failed', err);
      const details = err?.message ?? 'Unable to run manual rollover.';
      setRolloverLastError(details);
      Alert.alert('Rollover failed', details);
    } finally {
      setRolloverRunning(false);
    }
  }

  const previewSource = photoPreviewUri
    ? { uri: photoPreviewUri }
    : savedPhotoUrl
    ? { uri: savedPhotoUrl }
    : null;

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            debugLog('today', 'Pull-to-refresh started');
            setRefreshing(true);
            await load();
            setRefreshing(false);
            debugLog('today', 'Pull-to-refresh finished');
          }}
          tintColor={colors.textDim}
        />
      }
    >
      <View style={styles.header}>
        <Text style={styles.label}>{formatFriendlyDate(date)}</Text>
        <Text style={styles.dayNumber}>Day {dayNumber}</Text>
        <Text style={styles.hello}>
          Hey {user?.name ?? user?.email?.split('@')[0] ?? 'friend'} — let&apos;s get it.
        </Text>
      </View>

      {loading ? (
        <Text style={styles.muted}>Loading…</Text>
      ) : (
        <>
          {TASKS.map((task) => (
            <TaskCheckItem
              key={task.key}
              task={task}
              checked={toggles[task.key]}
              onToggle={() => toggle(task.key)}
              disabled={log?.completed}
            />
          ))}

          <Text style={styles.sectionLabel}>Progress photo</Text>
          {previewSource ? (
            <Image source={previewSource} style={styles.photo} />
          ) : (
            <View style={[styles.photo, styles.photoPlaceholder]}>
              <Text style={styles.muted}>No photo yet</Text>
            </View>
          )}
          <View style={styles.row}>
            <View style={styles.rowItem}>
              <Button title="Take Photo" variant="secondary" onPress={takePhoto} />
            </View>
            <View style={{ width: spacing.md }} />
            <View style={styles.rowItem}>
              <Button title="Pick from Library" variant="secondary" onPress={pickPhoto} />
            </View>
          </View>

          <View style={{ height: spacing.lg }} />
          <Button
            title="Save Progress"
            variant="ghost"
            onPress={() => submit(false)}
            loading={saving}
          />
          <View style={{ height: spacing.sm }} />
          <Button
            title={log?.completed ? 'Day Complete ✓' : 'Submit Day'}
            onPress={() => submit(true)}
            disabled={!allChecked || log?.completed}
            loading={saving}
          />
          {!allChecked && !log?.completed ? (
            <Text style={styles.hint}>
              Check off all 5 tasks and add today&apos;s photo to lock in the day.
            </Text>
          ) : null}

          {SHOW_DEBUG_RUN_ROLLOVER_BUTTON ? (
            <>
              <View style={{ height: spacing.lg }} />
              <Button
                title="Debug: Run Rollover"
                variant="danger"
                onPress={runManualRollover}
                loading={rolloverRunning}
                disabled={saving || loading || refreshing}
              />
              {rolloverLastError ? (
                <Text style={styles.debugErrorText}>Last rollover error: {rolloverLastError}</Text>
              ) : null}
            </>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.lg, paddingBottom: spacing.xxl },
  header: { marginBottom: spacing.lg },
  label: { ...typography.label, color: colors.textDim, textTransform: 'uppercase' },
  dayNumber: { ...typography.h1, color: colors.primary, marginTop: spacing.xs },
  hello: { ...typography.body, color: colors.text, marginTop: spacing.xs },
  sectionLabel: {
    ...typography.label,
    color: colors.textDim,
    textTransform: 'uppercase',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  photo: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  photoPlaceholder: {
    borderColor: colors.border,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', marginTop: spacing.md },
  rowItem: { flex: 1 },
  muted: { ...typography.body, color: colors.textDim, textAlign: 'center' },
  hint: {
    ...typography.small,
    color: colors.textDim,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  debugErrorText: {
    ...typography.small,
    color: colors.warning,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
});
