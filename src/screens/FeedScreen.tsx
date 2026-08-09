import React, { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { debugError, debugLog } from '../lib/debug';
import { listFeedLogs, photoUrl } from '../lib/logs';
import { colors, radius, spacing, typography } from '../theme';
import type { DailyLog } from '../types';
import { TASKS } from '../types';
import { formatFriendlyDate } from '../utils/date';

export function FeedScreen() {
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    debugLog('feed', 'Loading feed');
    try {
      const items = await listFeedLogs();
      setLogs(items);
      debugLog('feed', 'Feed loaded', { count: items.length });
    } catch (error) {
      debugError('feed', 'Feed load failed', error);
      // network / not signed in; leave list empty.
    } finally {
      setLoading(false);
      debugLog('feed', 'Feed load finished');
    }
  }, []);

  useEffect(() => {
    debugLog('feed', 'FeedScreen mounted');
    load();
    return () => {
      debugLog('feed', 'FeedScreen unmounted');
    };
  }, [load]);

  return (
    <FlatList
      style={styles.flex}
      contentContainerStyle={styles.container}
      data={logs}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.label}>Recent Check-ins</Text>
          <Text style={styles.title}>The Crew</Text>
        </View>
      }
      ListEmptyComponent={
        loading ? (
          <Text style={styles.muted}>Loading feed…</Text>
        ) : (
          <Text style={styles.muted}>No check-ins yet. Be the first!</Text>
        )
      }
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            debugLog('feed', 'Feed pull-to-refresh started');
            setRefreshing(true);
            await load();
            setRefreshing(false);
            debugLog('feed', 'Feed pull-to-refresh finished');
          }}
          tintColor={colors.textDim}
        />
      }
      renderItem={({ item }) => <FeedCard log={item} />}
      ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
    />
  );
}

function FeedCard({ log }: { log: DailyLog }) {
  const name = log.expand?.user?.name ?? log.expand?.user?.email ?? 'Unknown';
  const day = log.expand?.user?.current_day ?? '—';
  const logDate = formatFriendlyDate(log.date.slice(0, 10));
  const url = photoUrl(log);
  const checks = TASKS.map((t) => ({
    key: t.key,
    icon: t.icon,
    done: (log as any)[t.key] as boolean,
  }));

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{name.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{name}</Text>
          <Text style={styles.sub}>
            {logDate} · Day {day} {log.completed ? '· ✅ complete' : '· in progress'}
          </Text>
        </View>
      </View>
      {url ? <Image source={{ uri: url }} style={styles.photo} /> : null}
      <View style={styles.checksRow}>
        {checks.map((c) => (
          <View key={c.key} style={[styles.chip, c.done && styles.chipDone]}>
            <Text style={styles.chipIcon}>{c.icon}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.lg, paddingBottom: spacing.xxl },
  header: { marginBottom: spacing.lg },
  label: { ...typography.label, color: colors.textDim, textTransform: 'uppercase' },
  title: { ...typography.h1, color: colors.text, marginTop: spacing.xs },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontWeight: '700' },
  name: { ...typography.h3, color: colors.text },
  sub: { ...typography.small, color: colors.textDim },
  photo: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    marginBottom: spacing.md,
  },
  checksRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    opacity: 0.5,
  },
  chipDone: {
    opacity: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primaryDim,
  },
  chipIcon: { fontSize: 16 },
  muted: {
    ...typography.body,
    color: colors.textDim,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
});
