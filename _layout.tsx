import { Tabs } from 'expo-router';
import { Platform, View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import { usePupils } from '@/hooks/usePupils';
import { useTheme } from '@/hooks/useTheme';
import { OfflineBanner } from '@/components/ui/OfflineBanner';
import { ReconnectBar } from '@/components/ui/ReconnectBar';
import { SubscriptionGuard } from '@/components/feature/SubscriptionGuard';
import { useSubscription } from '@/hooks/useSubscription';

// Red badge overlay on the bell icon
function NotifBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <View style={{
      position: 'absolute', top: -4, right: -8,
      backgroundColor: '#EF4444', borderRadius: 9,
      minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center',
      paddingHorizontal: 4, borderWidth: 1.5, borderColor: '#FFFFFF',
    }}>
      <Text style={{ fontSize: 9, fontWeight: '800', color: '#FFFFFF', lineHeight: 12 }}>
        {count > 99 ? '99+' : count > 9 ? '9+' : count}
      </Text>
    </View>
  );
}

// Bell icon with badge overlay
function AlertsTabIcon({ color, size }: { color: string; size: number }) {
  const { unreadNotificationCount } = usePupils();
  const count = unreadNotificationCount('instructor');
  return (
    <View style={{ width: size + 12, height: size + 8, alignItems: 'center', justifyContent: 'center' }}>
      <MaterialIcons name="notifications" size={size} color={color} />
      <NotifBadge count={count} />
    </View>
  );
}

// Trial status banner shown inside the tab bar area
function TrialBanner() {
  const { isInTrial, trialDaysLeft } = useSubscription();
  const router = useRouter();
  if (!isInTrial || trialDaysLeft > 3) return null;
  const isUrgent = trialDaysLeft <= 1;
  return (
    <Pressable
      onPress={() => router.push('/paywall')}
      style={{
        backgroundColor: isUrgent ? '#EF444415' : '#F59E0B15',
        borderBottomWidth: 1,
        borderBottomColor: isUrgent ? '#EF444440' : '#F59E0B40',
        paddingHorizontal: 16,
        paddingVertical: 7,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <Text style={{ fontSize: 11, color: isUrgent ? '#EF4444' : '#F59E0B', fontWeight: '700', flex: 1 }}>
        {isUrgent ? '🔴' : '⏱'}{'  '}Free trial: {trialDaysLeft === 1 ? 'last day' : `${trialDaysLeft} days remaining`} {'—'} Tap to subscribe
      </Text>
      <MaterialIcons name="chevron-right" size={14} color={isUrgent ? '#EF4444' : '#F59E0B'} />
    </Pressable>
  );
}

export default function InstructorTabLayout() {
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const { messages, unreadNotificationCount, isReconnecting } = usePupils();
  // Only count unread messages FROM pupils (from_instructor = false) for the badge
  const unreadFromPupils = messages.filter(m => !m.fromInstructor).length;
  const instrUnread = unreadNotificationCount('instructor');
  return (
    <SubscriptionGuard>
    <View style={{ flex: 1 }}>
      <OfflineBanner />
      <ReconnectBar visible={isReconnecting} />
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          height: Platform.select({ ios: insets.bottom + 60, android: insets.bottom + 60, default: 70 }),
          paddingTop: 8,
          paddingBottom: Platform.select({ ios: insets.bottom + 8, android: insets.bottom + 8, default: 8 }),
          paddingHorizontal: 8,
          backgroundColor: '#FFFFFF',
          borderTopWidth: 1,
          borderTopColor: '#E2E8F0',
        },
        tabBarActiveTintColor: '#FF6700',
        tabBarInactiveTintColor: '#94A3B8',
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => <MaterialIcons name="dashboard" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="pupils"
        options={{
          title: 'Pupils',
          tabBarIcon: ({ color, size }) => <MaterialIcons name="people" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="diary"
        options={{
          title: 'Diary',
          tabBarIcon: ({ color, size }) => <MaterialIcons name="calendar-today" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Messages',
          tabBarBadge: unreadFromPupils > 0 ? (unreadFromPupils > 9 ? '9+' : unreadFromPupils) : undefined,
          tabBarBadgeStyle: { backgroundColor: Colors.error, fontSize: 10 },
          tabBarIcon: ({ color, size }) => <MaterialIcons name="message" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Alerts',
          tabBarIcon: ({ color, size }) => <AlertsTabIcon color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'My Hours',
          tabBarIcon: ({ color, size }) => <MaterialIcons name="access-time" size={size} color={color} />,
        }}
      />
    </Tabs>
    </View>
    </SubscriptionGuard>
  );
}
