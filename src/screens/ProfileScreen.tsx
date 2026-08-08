import React, { useCallback, useEffect, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Button } from '../components/Button';
import { useAuth } from '../context/AuthContext';
import { listUserLogs } from '../lib/logs';
import { CHALLENGE_LENGTH } from '../config';
import { colors, radius, spacing, typography } from '../theme';
import type { DailyLog } from '../types';
import { normalizeCurrentDay } from '../utils/date';

export function ProfileScreen() {
  const { user, signOut } = useAuth();
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const items = await listUserLogs(user.id, CHALLENGE_LENGTH);
      setLogs(items);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const dayNumber = normalizeCurrentDay(user?.current_day);
  const completedCount = logs.filter((l) => l.completed).length;

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(user?.name ?? user?.email ?? '?').charAt(0).toUpperCase()}
          </Text>
        </View>
        <Text style={styles.name}>{user?.name ?? user?.email ?? 'You'}</Text>
        <Text style={styles.email}>{user?.email}</Text>
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
        logs.map((l) => (
          <View key={l.id} style={styles.logRow}>
            <Text style={styles.logDate}>{l.date}</Text>
            <Text style={[styles.logStatus, l.completed ? styles.ok : styles.pending]}>
              {l.completed ? '✓ complete' : '· in progress'}
            </Text>
          </View>
        ))
      )}

      <View style={{ height: spacing.xl }} />
      <Button title="Sign Out" variant="danger" onPress={signOut} />
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
  header: { alignItems: 'center', marginBottom: spacing.xl },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryDim,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  avatarText: { color: '#fff', fontSize: 28, fontWeight: '700' },
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
