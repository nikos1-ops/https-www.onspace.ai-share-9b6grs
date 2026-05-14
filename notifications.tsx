import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, SectionList, Pressable, Animated,
} from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { usePupils } from '@/hooks/usePupils';
import { Colors, Spacing, FontSize, Radius, Shadow } from '@/constants/theme';
import { AppNotification } from '@/types';
import { useAlert } from '@/template';

// ─── Notification type config ────────────────────────────────────────────────

interface NotifConfig {
  icon: any;
  color: string;
  label: string;
}

function getNotifConfig(type: AppNotification['type']): NotifConfig {
  switch (type) {
    case 'week_confirmed':
      return { icon: 'verified', color: Colors.success, label: 'Week Confirmed' };
    case 'payment_received':
      return { icon: 'payments', color: Colors.primary, label: 'Payment Received' };
    case 'payment_request':
      return { icon: 'request-quote', color: Colors.warning, label: 'Payment Request' };
    case 'checkin':
      return { icon: 'login', color: Colors.info, label: 'Check-In' };
    default:
      return { icon: 'notifications', color: Colors.textSecondary, label: 'Notification' };
  }
}

// ─── Section grouping helper ──────────────────────────────────────────────────

function groupByDate(notifs: AppNotification[]) {
  const map: Record<string, AppNotification[]> = {};
  for (const n of notifs) {
    const date = n.createdAt.slice(0, 10);
    if (!map[date]) map[date] = [];
    map[date].push(n);
  }
  // Sort dates descending
  const sortedDates = Object.keys(map).sort((a, b) => b.localeCompare(a));
  return sortedDates.map(date => ({ title: date, data: map[date] }));
}

function formatSectionTitle(dateStr: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (dateStr === today) return 'Today';
  if (dateStr === yesterday) return 'Yesterday';
  return new Date(dateStr).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
}

function timeAgo(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = Math.max(0, Math.floor((now - then) / 1000));
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ─── Filter tabs ──────────────────────────────────────────────────────────────

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'week_confirmed', label: 'Schedule' },
  { key: 'payment_received', label: 'Payments' },
] as const;

type FilterKey = typeof FILTERS[number]['key'];

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function InstructorNotificationsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { showAlert } = useAlert();
  const {
    notifications, lessons, pupils,
    markNotificationRead, unreadNotificationCount, deleteNotification,
  } = usePupils();

  const [filter, setFilter] = useState<FilterKey>('all');

  // Auto-mark all unread instructor notifications as read on mount
  useEffect(() => {
    const unread = notifications.filter(
      n => n.recipientType === 'instructor' && !n.read
    );
    if (unread.length === 0) return;
    // Small delay so the badge update feels intentional, not jarring
    const timer = setTimeout(() => {
      unread.forEach(n => markNotificationRead(n.id));
    }, 600);
    return () => clearTimeout(timer);
  }, []); // Run once on mount only

  const instrNotifs = useMemo(() =>
    notifications
      .filter(n => n.recipientType === 'instructor')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [notifications]
  );

  const unreadCount = unreadNotificationCount('instructor');

  const filtered = useMemo(() => {
    switch (filter) {
      case 'unread': return instrNotifs.filter(n => !n.read);
      case 'week_confirmed': return instrNotifs.filter(n => n.type === 'week_confirmed');
      case 'payment_received': return instrNotifs.filter(n => n.type === 'payment_received');
      default: return instrNotifs;
    }
  }, [instrNotifs, filter]);

  const sections = useMemo(() => groupByDate(filtered), [filtered]);

  const handleMarkAllRead = useCallback(() => {
    const unread = instrNotifs.filter(n => !n.read);
    if (unread.length === 0) return;
    showAlert(
      'Mark All Read',
      `Mark all ${unread.length} notification${unread.length !== 1 ? 's' : ''} as read?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark All Read',
          onPress: async () => {
            for (const n of unread) {
              await markNotificationRead(n.id);
            }
          },
        },
      ]
    );
  }, [instrNotifs, markNotificationRead, showAlert]);

  const handleDeleteNotif = useCallback((notifId: string) => {
    showAlert(
      'Delete Notification',
      'Remove this notification permanently?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteNotification(notifId) },
      ]
    );
  }, [deleteNotification, showAlert]);

  const handleNotifPress = useCallback(async (notif: AppNotification) => {
    // Mark read
    if (!notif.read) await markNotificationRead(notif.id);

    // Navigate to relevant screen
    if (notif.lessonId) {
      router.push({
        pathname: '/(instructor)/lesson-detail',
        params: { lessonId: notif.lessonId },
      });
    } else if (notif.weekStart) {
      router.push('/(instructor)/(tabs)/diary');
    }
  }, [markNotificationRead, router]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      {/* Header — solid yellow bar */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Text style={styles.title}>Notifications</Text>
        {unreadCount > 0 && (
          <Pressable style={styles.markAllBtn} onPress={handleMarkAllRead} hitSlop={8}>
            <MaterialIcons name="done-all" size={16} color="#111111" />
            <Text style={styles.markAllText}>Mark all read</Text>
          </Pressable>
        )}
      </View>

      {/* Filter tabs */}
      <View style={styles.filterWrap}>
        {FILTERS.map(f => {
          const isActive = filter === f.key;
          const count = f.key === 'unread' ? unreadCount : undefined;
          return (
            <Pressable
              key={f.key}
              style={[styles.filterTab, isActive && styles.filterTabActive]}
              onPress={() => setFilter(f.key)}
            >
              <Text style={[styles.filterLabel, isActive && styles.filterLabelActive]}>
                {f.label}
              </Text>
              {count != null && count > 0 && (
                <View style={styles.filterBadge}>
                  <Text style={styles.filterBadgeText}>{count > 99 ? '99+' : count}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>

      {/* Notification list */}
      {sections.length === 0 ? (
        <View style={styles.empty}>
          <MaterialIcons name="notifications-none" size={52} color="#FF6700" />
          <Text style={styles.emptyTitle}>
            {filter === 'unread' ? 'All caught up' : 'No notifications yet'}
          </Text>
          <Text style={styles.emptyHint}>
            {filter === 'unread'
              ? 'No unread notifications at the moment'
              : 'Confirm a week or receive a payment to see notifications here'}
          </Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={item => item.id}
          contentContainerStyle={{
            paddingHorizontal: Spacing.md,
            paddingBottom: insets.bottom + 100,
            paddingTop: Spacing.sm,
          }}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{formatSectionTitle(section.title)}</Text>
              <View style={styles.sectionLine} />
            </View>
          )}
          renderItem={({ item: notif }) => (
            <NotifCard
              notif={notif}
              onPress={() => handleNotifPress(notif)}
              onMarkRead={() => markNotificationRead(notif.id)}
              onDelete={() => handleDeleteNotif(notif.id)}
              lessons={lessons}
              pupils={pupils}
            />
          )}
          ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
          SectionSeparatorComponent={() => <View style={{ height: 4 }} />}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
    </GestureHandlerRootView>
  );
}

// ─── Notification card ────────────────────────────────────────────────────────

function NotifCard({
  notif, onPress, onMarkRead, onDelete, lessons, pupils,
}: {
  notif: AppNotification;
  onPress: () => void;
  onMarkRead: () => void;
  onDelete: () => void;
  lessons: any[];
  pupils: any[];
}) {
  const cfg = getNotifConfig(notif.type);
  const lesson = notif.lessonId ? lessons.find((l: any) => l.id === notif.lessonId) : null;
  const pupil = lesson ? pupils.find((p: any) => p.id === lesson.pupilId) : null;
  const swipeableRef = useRef<Swipeable>(null);

  const renderRightActions = (progress: Animated.AnimatedInterpolation<number>) => {
    const translateX = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [80, 0],
    });
    return (
      <Animated.View style={[styles.swipeAction, { transform: [{ translateX }] }]}>
        <Pressable
          style={styles.swipeDeleteBtn}
          onPress={() => {
            swipeableRef.current?.close();
            onDelete();
          }}
        >
          <MaterialIcons name="delete" size={22} color="#fff" />
          <Text style={styles.swipeDeleteText}>Delete</Text>
        </Pressable>
      </Animated.View>
    );
  };

  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      rightThreshold={40}
      overshootRight={false}
      friction={2}
    >
    <Pressable
      style={[styles.card, !notif.read && styles.cardUnread]}
      onPress={onPress}
    >
      {/* Unread indicator */}
      {!notif.read && <View style={styles.unreadDot} />}

      {/* Icon */}
      <View style={[styles.iconWrap, { backgroundColor: cfg.color + '20' }]}>
        <MaterialIcons name={cfg.icon} size={22} color={cfg.color} />
      </View>

      {/* Content */}
      <View style={styles.cardContent}>
        <View style={styles.cardTop}>
          <View style={[styles.typeTag, { backgroundColor: cfg.color + '20' }]}>
            <Text style={[styles.typeTagText, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
          <Text style={styles.timeAgo}>{timeAgo(notif.createdAt)}</Text>
          {/* Delete button */}
          <Pressable
            style={styles.deleteBtn}
            onPress={(e) => { e.stopPropagation(); onDelete(); }}
            hitSlop={10}
          >
            <MaterialIcons name="delete-outline" size={16} color={Colors.error} />
          </Pressable>
        </View>

        <Text style={[styles.cardTitle, !notif.read && styles.cardTitleUnread]}>
          {notif.title}
        </Text>
        <Text style={styles.cardBody} numberOfLines={3}>{notif.body}</Text>

        {/* Linked lesson info */}
        {lesson && pupil && (
          <View style={styles.lessonLink}>
            <MaterialIcons name="person" size={12} color={Colors.textTertiary} />
            <Text style={styles.lessonLinkText}>
              {pupil.firstName} {pupil.lastName} · {lesson.date} at {lesson.startTime}
            </Text>
          </View>
        )}

        {/* Actions */}
        <View style={styles.cardActions}>
          {notif.lessonId || notif.weekStart ? (
            <Pressable style={styles.viewBtn} onPress={onPress}>
              <Text style={styles.viewBtnText}>View Details</Text>
              <MaterialIcons name="arrow-forward" size={12} color={Colors.primary} />
            </Pressable>
          ) : null}
          {!notif.read && (
            <Pressable style={styles.readBtn} onPress={onMarkRead} hitSlop={8}>
              <MaterialIcons name="check" size={12} color={Colors.textTertiary} />
              <Text style={styles.readBtnText}>Mark read</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Pressable>
    </Swipeable>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingBottom: Spacing.md,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1, borderBottomColor: '#E2E8F0',
  },
  title: { fontSize: FontSize.xl, fontWeight: '800', color: '#FF6700', textAlign: 'center', flex: 1 },
  markAllBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FF670015',
    borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 1, borderColor: '#FF670040',
  },
  markAllText: { fontSize: FontSize.xs, color: '#FF6700', fontWeight: '700' },

  // Filter tabs
  filterWrap: {
    flexDirection: 'row', gap: 6,
    paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm,
    paddingTop: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  filterTab: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: Radius.full,
    backgroundColor: '#FAFBFC',
    borderWidth: 1, borderColor: '#E2E8F0',
  },
  filterTabActive: {
    backgroundColor: '#FF6700',
    borderColor: '#E05500',
    shadowColor: '#FF6700', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25, shadowRadius: 6, elevation: 4,
  },
  filterLabel: { fontSize: FontSize.xs, color: '#64748B', fontWeight: '600' },
  filterLabelActive: { color: '#FFFFFF', fontWeight: '800' },
  filterBadge: {
    backgroundColor: Colors.warning,
    borderRadius: Radius.full, minWidth: 16, height: 16,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  filterBadgeText: { fontSize: 9, fontWeight: '800', color: Colors.textInverse },

  // Section header
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: Spacing.sm,
  },
  sectionTitle: {
    fontSize: FontSize.xs, fontWeight: '700', color: Colors.textTertiary,
    textTransform: 'uppercase', letterSpacing: 0.6, flexShrink: 0,
  },
  sectionLine: { flex: 1, height: 1, backgroundColor: Colors.surfaceBorder },

  // Card
  card: {
    flexDirection: 'row', gap: Spacing.sm,
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.surfaceBorder,
    ...Shadow.sm,
  },
  cardUnread: {
    borderColor: Colors.primary + '50',
    backgroundColor: Colors.primary + '08',
  },
  unreadDot: {
    position: 'absolute', top: 14, left: 14,
    width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.primary,
    zIndex: 1,
  },
  iconWrap: {
    width: 44, height: 44, borderRadius: Radius.md,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    marginTop: 2,
  },
  cardContent: { flex: 1, gap: 4 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  typeTag: {
    borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start',
  },
  typeTagText: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  deleteBtn: {
    marginLeft: 2, padding: 2,
  },
  timeAgo: { fontSize: 10, color: Colors.textTertiary, marginLeft: 'auto' },
  cardTitle: {
    fontSize: FontSize.base, fontWeight: '600', color: Colors.textSecondary, lineHeight: 20,
  },
  cardTitleUnread: { color: Colors.textPrimary },
  cardBody: { fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 17 },
  lessonLink: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.sm,
    paddingHorizontal: 8, paddingVertical: 4, alignSelf: 'flex-start',
  },
  lessonLinkText: { fontSize: 10, color: Colors.textTertiary },
  cardActions: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginTop: 2,
  },
  viewBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  viewBtnText: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: '700' },
  readBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  readBtnText: { fontSize: FontSize.xs, color: Colors.textTertiary },

  // Swipe-to-delete action
  swipeAction: {
    width: 80,
    justifyContent: 'center',
    alignItems: 'stretch',
    marginLeft: 6,
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  swipeDeleteBtn: {
    flex: 1,
    backgroundColor: Colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: Radius.lg,
  },
  swipeDeleteText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
  },

  // Empty
  empty: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 40,
    backgroundColor: '#FAFBFC',
  },
  emptyTitle: { fontSize: FontSize.md, fontWeight: '700', color: '#0F172A' },
  emptyHint: {
    fontSize: FontSize.sm, color: '#64748B', textAlign: 'center', lineHeight: 20,
  },
});
