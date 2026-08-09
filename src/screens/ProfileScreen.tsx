import React, { useCallback, useEffect, useState } from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Button } from '../components/Button';
import { useAuth } from '../context/AuthContext';
import { debugError, debugLog } from '../lib/debug';
import { listUserLogs } from '../lib/logs';
import { getProfileAvatarLabel, getProfileAvatarUrl, getProfileDisplayName } from '../lib/profile';
import { getFeedLogStatus } from '../lib/feedStatus';
import { CHALLENGE_LENGTH } from '../config';
import { colors, radius, spacing, typography } from '../theme';
import type { DailyLog } from '../types';
import { formatFriendlyDate, normalizeCurrentDay } from '../utils/date';

export function ProfileScreen({ navigation }: any) {
  const { user, signOut } = useAuth();
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) {
      debugLog('profile', 'Skipping load; no user');
      return;
    }
    debugLog('profile', 'Loading profile history', { userId: user.id });
    try {
      const items = await listUserLogs(user.id, CHALLENGE_LENGTH);
      setLogs(items);
      debugLog('profile', 'Profile history loaded', {
        userId: user.id,
        count: items.length,
      });
    } catch (error) {
      debugError('profile', 'Profile history load failed', error);
    } finally {
      setLoading(false);
      debugLog('profile', 'Profile history load finished');
    }
  }, [user]);

  useEffect(() => {
    debugLog('profile', 'ProfileScreen mounted');
    load();
    return () => {
      debugLog('profile', 'ProfileScreen unmounted');
    };
  }, [load]);

  const dayNumber = normalizeCurrentDay(user?.current_day);
  const completedFromLogs = logs.filter((l) => l.completed).length;
  const completedCount = Math.max(0, Number(user?.completed_days ?? completedFromLogs));
  const avatarUrl = getProfileAvatarUrl(user);
  const displayName = getProfileDisplayName(user);

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
      <View style={styles.heroCard}>
        <View style={styles.header}>
          <View style={styles.avatar}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarText}>{getProfileAvatarLabel(user)}</Text>
            )}
          </View>
          <View style={styles.headerCopy}>
            <Text style={styles.name}>{displayName}</Text>
            <Text style={styles.email}>{user?.email}</Text>
          </View>
        </View>

        <Button
          title="Edit Profile"
          variant="secondary"
          onPress={() => navigation.navigate('EditProfile')}
        />
      </View>

      <View style={styles.statsRow}>
        <StatCard label="Current day" value={String(dayNumber)} />
        <StatCard label="Completed" value={`${completedCount}/${CHALLENGE_LENGTH}`} />
      </View>

      <Text style={styles.sectionLabel}>Recent days</Text>
      {loading ? (
        <Text style={styles.muted}>Loading…</Text>
      ) : logs.length === 0 ? (
        <Text style={styles.muted}>No logs yet. Head to Today to start.</Text>
      ) : (
        logs.map((l) => {
          const status = getFeedLogStatus(l.date, l.completed);
          const label =
            status === 'complete' ? '✓ Complete' :
            status === 'in-progress' ? '● In Progress' : null;
          const labelStyle =
            status === 'complete' ? styles.ok : styles.pending;
          return (
            <View key={l.id} style={styles.logRow}>
              <Text style={styles.logDate}>{formatFriendlyDate(l.date.slice(0, 10))}</Text>
              {label ? (
                <Text style={[styles.logStatus, labelStyle]}>{label}</Text>
              ) : null}
            </View>
          );
        })
      )}

      <View style={{ height: spacing.xl }} />
      <Button
        title="Sign Out"
        variant="danger"
        onPress={() => {
          debugLog('profile', 'Sign-out button pressed', { userId: user?.id ?? null });
          signOut();
        }}
      />
    </ScrollView>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.lg, paddingBottom: spacing.xxl },
  heroCard: {
    marginBottom: spacing.xl,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryDim,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
    overflow: 'hidden',
  },
  avatarImage: { width: '100%', height: '100%' },
  avatarText: { color: '#fff', fontSize: 28, fontWeight: '700' },
  headerCopy: { flex: 1 },
  name: { ...typography.h2, color: colors.text },
  email: { ...typography.small, color: colors.textDim },
  statsRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.xl },
  stat: {
    flex: 1,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.lg,
    alignItems: 'center',
  },
  statValue: { ...typography.h1, color: colors.primary },
  statLabel: {
    ...typography.label,
    color: colors.textDim,
    textTransform: 'uppercase',
    marginTop: spacing.xs,
  },
  sectionLabel: {
    ...typography.label,
    color: colors.textDim,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  logRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  logDate: { ...typography.body, color: colors.text },
  logStatus: { ...typography.small },
  ok: { color: colors.success },
  pending: { color: colors.textDim },
  muted: { ...typography.body, color: colors.textDim, textAlign: 'center' },
});
