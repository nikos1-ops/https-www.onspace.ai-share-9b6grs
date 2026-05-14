
import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, FlatList, ActivityIndicator, Animated, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { usePupils } from '@/hooks/usePupils';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { Colors, Spacing, FontSize, Radius, Shadow } from '@/constants/theme';

const { width: SW, height: SH } = Dimensions.get('window');

// ─── Circuit board background ─────────────────────────────────────────────
function DashboardCircuitLines() {
  const blueDots = [
    {x:SW*0.04,y:80},{x:SW*0.91,y:70},{x:SW*0.06,y:260},{x:SW*0.88,y:230},
    {x:SW*0.03,y:420},{x:SW*0.92,y:380},{x:SW*0.12,y:180},{x:SW*0.82,y:155},
    {x:SW*0.22,y:500},{x:SW*0.74,y:460},{x:SW*0.35,y:560},{x:SW*0.60,y:530},
    {x:SW*0.48,y:640},{x:SW*0.18,y:620},{x:SW*0.78,y:600},{x:SW*0.42,y:720},
    {x:SW*0.08,y:340},{x:SW*0.87,y:310},{x:SW*0.30,y:130},{x:SW*0.65,y:110},
    {x:SW*0.50,y:800},{x:SW*0.25,y:780},{x:SW*0.70,y:760},{x:SW*0.10,y:700},
    {x:SW*0.85,y:680},{x:SW*0.40,y:840},{x:SW*0.55,y:860},{x:SW*0.15,y:860},
  ];
  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      {/* Top-left cluster */}
      <View style={[dCS.hLine, { top: 68, left: 0, width: SW * 0.28 }]} />
      <View style={[dCS.vLine, { top: 40, left: SW * 0.18, height: 58 }]} />
      <View style={[dCS.hLine, { top: 40, left: 0, width: SW * 0.18 }]} />
      <View style={[dCS.node, { top: 65, left: SW * 0.28 - 3 }]} />
      <View style={[dCS.hLine, { top: 98, left: 0, width: SW * 0.10 }]} />
      <View style={[dCS.vLine, { top: 68, left: SW * 0.08, height: 44 }]} />
      <View style={[dCS.node, { top: 95, left: SW * 0.08 - 3 }]} />
      {/* Top-right cluster */}
      <View style={[dCS.hLine, { top: 52, right: 0, width: SW * 0.26, left: undefined }]} />
      <View style={[dCS.vLine, { top: 52, right: SW * 0.26, height: 52 }]} />
      <View style={[dCS.hLine, { top: 104, right: SW * 0.06, width: SW * 0.20, left: undefined }]} />
      <View style={[dCS.node, { top: 49, right: SW * 0.10 }]} />
      <View style={[dCS.hLine, { top: 78, right: 0, width: SW * 0.10, left: undefined }]} />
      {/* Mid-left */}
      <View style={[dCS.hLine, { top: 240, left: 0, width: SW * 0.18 }]} />
      <View style={[dCS.vLine, { top: 200, left: SW * 0.10, height: 40 }]} />
      <View style={[dCS.node, { top: 237, left: SW * 0.18 - 3 }]} />
      {/* Mid-right */}
      <View style={[dCS.hLine, { top: 210, right: 0, width: SW * 0.16, left: undefined }]} />
      <View style={[dCS.vLine, { top: 170, right: SW * 0.08, height: 40 }]} />
      <View style={[dCS.node, { top: 207, right: SW * 0.16 - 3 }]} />
      {/* Lower sections */}
      <View style={[dCS.hLine, { top: 430, left: 0, width: SW * 0.22 }]} />
      <View style={[dCS.vLine, { top: 390, left: SW * 0.12, height: 40 }]} />
      <View style={[dCS.hLine, { top: 430, right: 0, width: SW * 0.20, left: undefined }]} />
      <View style={[dCS.vLine, { top: 395, right: SW * 0.10, height: 35 }]} />
      <View style={[dCS.hLine, { top: 580, left: 0, width: SW * 0.16 }]} />
      <View style={[dCS.hLine, { top: 580, right: 0, width: SW * 0.18, left: undefined }]} />
      <View style={[dCS.vLine, { top: 540, left: SW * 0.08, height: 40 }]} />
      <View style={[dCS.vLine, { top: 545, right: SW * 0.09, height: 35 }]} />
      {/* Bottom area */}
      <View style={[dCS.hLine, { top: 720, left: 0, width: SW * 0.24 }]} />
      <View style={[dCS.hLine, { top: 720, right: 0, width: SW * 0.22, left: undefined }]} />
      <View style={[dCS.vLine, { top: 680, left: SW * 0.14, height: 40 }]} />
      <View style={[dCS.vLine, { top: 680, right: SW * 0.12, height: 40 }]} />
      {/* Map blocks */}
      <View style={[dCS.mapBlock, { left: SW*0.02, top: 480, width: SW*0.10, height: 24 }]} />
      <View style={[dCS.mapBlock, { right: SW*0.02, top: 460, width: SW*0.12, height: 28, left: undefined }]} />
      <View style={[dCS.mapBlock, { left: SW*0.02, top: 640, width: SW*0.14, height: 20 }]} />
      <View style={[dCS.mapBlock, { right: SW*0.02, top: 620, width: SW*0.16, height: 22, left: undefined }]} />
      <View style={[dCS.mapBlock, { left: SW*0.03, top: 770, width: SW*0.12, height: 18 }]} />
      <View style={[dCS.mapBlock, { right: SW*0.03, top: 760, width: SW*0.14, height: 18, left: undefined }]} />
      {/* Corner accent rects */}
      <View style={[dCS.oRect, { top: 28, left: SW * 0.84, width: 16, height: 12 }]} />
      <View style={[dCS.oRect, { top: 260, right: SW * 0.02, width: 12, height: 10, left: undefined }]} />
      {/* Glowing blue dots */}
      {blueDots.map((pt, i) => (
        <View key={`dbd${i}`} style={[dCS.starDot, { top: pt.y, left: pt.x }]} />
      ))}
    </View>
  );
}
const dCS = StyleSheet.create({
  hLine:    { position: 'absolute', height: 1, backgroundColor: 'rgba(40,150,255,0.20)' },
  vLine:    { position: 'absolute', width: 1, backgroundColor: 'rgba(40,150,255,0.20)' },
  node:     { position: 'absolute', width: 6, height: 6, borderRadius: 1, borderWidth: 1.2, borderColor: 'rgba(60,160,255,0.55)', backgroundColor: 'rgba(30,100,220,0.18)' },
  starDot:  { position: 'absolute', width: 4, height: 4, borderRadius: 2, backgroundColor: '#4DCCFF', opacity: 0.70 },
  oRect:    { position: 'absolute', borderWidth: 1, borderColor: 'rgba(255,149,71,0.28)', backgroundColor: 'transparent' },
  mapBlock: { position: 'absolute', borderWidth: 1, borderColor: 'rgba(40,140,255,0.14)', backgroundColor: 'rgba(20,80,180,0.06)', borderRadius: 2 },
});

// ─── Floating particle ─────────────────────────────────────────────────────
function DashParticle({ x, y, size, opacity, anim }: { x:number;y:number;size:number;opacity:number;anim:Animated.Value }) {
  const translateY = anim.interpolate({ inputRange: [0,1], outputRange: [0,-22] });
  const fadeAnim  = anim.interpolate({ inputRange: [0,0.25,0.75,1], outputRange: [0,opacity,opacity,0] });
  return (
    <Animated.View style={[{ position:'absolute', left:x, top:y, width:size, height:size, borderRadius:size/2, backgroundColor:'#4DCCFF', opacity:fadeAnim, transform:[{translateY}] }]} />
  );
}

// ─── Light Mode Palette ─────────────────────────────────────────────────────
const N = {
  bg:           '#FFFFFF',
  bgMid:        '#F8FAFC',
  navy:         '#F0F8FF',
  navyLight:    '#E8F4FD',
  border:       '#E2E8F0',
  borderBright: '#CBD5E1',
  orange:       '#FF6700',
  orangeDim:    '#E05500',
  orangeGlow:   '#FF6700',
  orangeText:   '#FF6700',
  cyan:         '#00C4FF',
  cyanDim:      'rgba(0,196,255,0.55)',
  surface:      '#F0F8FF',
  surfaceEl:    '#E8F4FD',
  white:        '#0F172A',
  whiteD:       '#475569',
  grey:         '#94A3B8',
};
import { getWeekStart, formatDate, addDays } from '@/services/pupilService';
import { getCoordinatesForPupils } from '@/services/geocodingService';
import { getDrivingMatrix, formatDuration, formatDistance } from '@/services/routingService';
import {
  buildTravelCacheKey,
  getCachedTravelTimes,
  setCachedTravelTimes,
} from '@/services/travelTimeCache';
import { Lesson, Pupil } from '@/types';

function getEndTime(lesson: Lesson): string {
  const [h, m] = lesson.startTime.split(':').map(Number);
  const totalMins = h * 60 + m + lesson.duration;
  return `${String(Math.floor(totalMins / 60)).padStart(2, '0')}:${String(totalMins % 60).padStart(2, '0')}`;
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

function lessonEarnings(lesson: Lesson, pupil?: Pupil): number {
  if (!pupil) return 0;
  return Math.round((lesson.duration / 60) * pupil.lessonRate * 100) / 100;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface DayDriveSummary {
  date: string;
  label: string;
  totalSecs: number;
  totalMeters: number;
  lessonCount: number;
  isEstimated?: boolean;
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

type DashTab = 'overview' | 'payments';

const DAY_LABELS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { logout } = useAuth();
  useTheme();
  const { pupils, lessons, messages, notifications, markNotificationRead, unreadNotificationCount } = usePupils();

  const [activeTab, setActiveTab] = useState<DashTab>('overview');
  const [paymentFilter, setPaymentFilter] = useState<string>('all');

  // ── Weekly drive totals ─────────────────────────────────────────────────
  const [weekDriveTotals, setWeekDriveTotals] = useState<{
    totalSecs: number;
    totalMeters: number;
    dayCount: number;
    days: DayDriveSummary[];
  } | null>(null);
  const [loadingDrive, setLoadingDrive] = useState(false);

  const weekStart = useMemo(() => getWeekStart(), []);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const instructorUnread = unreadNotificationCount('instructor');

  // ── Date ranges ─────────────────────────────────────
  const monthStart = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}-01`;
  }, []);

  // ── Derived data ────────────────────────────────────
  const todaysLessons = useMemo(() =>
    lessons.filter(l => l.date === today).sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [lessons, today]
  );

  const weekLessons = useMemo(() =>
    lessons.filter(l => l.weekStart === weekStart),
    [lessons, weekStart]
  );

  // ── Fetch driving totals — travelTimeCache first, OSRM fallback ──────────
  const fetchWeekDriveTotals = useCallback(async () => {
    setLoadingDrive(true);

    // Process a single day — returns a DayDriveSummary or null
    const processDay = async (d: number): Promise<DayDriveSummary | null> => {
      const date = addDays(weekStart, d);
      const dayLessons = weekLessons
        .filter(l => l.date === date)
        .sort((a, b) => a.startTime.localeCompare(b.startTime));
      if (dayLessons.length < 2) return null;

      const dayLabel = DAY_LABELS_SHORT[new Date(date).getDay()];

      // Phase 1: persisted travel-time cache (diary-computed)
      const cacheKey = buildTravelCacheKey(date, dayLessons);
      const cached = await getCachedTravelTimes(cacheKey);
      if (cached) {
        let daySecs = 0;
        let dayMeters = 0;
        let anyEstimated = false;
        for (let i = 0; i < dayLessons.length - 1; i++) {
          const key = `${dayLessons[i].id}->${dayLessons[i + 1].id}`;
          const seg = cached[key];
          if (seg) {
            daySecs += seg.durationSeconds;
            dayMeters += seg.distanceMeters;
            if (seg.isEstimated) anyEstimated = true;
          }
        }
        if (daySecs > 0) {
          return { date, label: dayLabel, totalSecs: daySecs, totalMeters: dayMeters, lessonCount: dayLessons.length, isEstimated: anyEstimated };
        }
      }

      // Phase 2: live OSRM matrix call
      const dayPupils = dayLessons
        .map(l => pupils.find(p => p.id === l.pupilId))
        .filter((p): p is NonNullable<typeof p> => !!p)
        .filter((p, i, arr) => arr.findIndex(pp => pp.id === p.id) === i);
      const coordMap = await getCoordinatesForPupils(
        dayPupils.map(p => ({ id: p.id, address: p.address ?? '', postcode: p.postcode })),
      );
      const coords = dayLessons
        .map(l => coordMap[l.pupilId])
        .filter((c): c is { lat: number; lng: number } => !!c);
      if (coords.length < 2) return null;

      try {
        const matrix = await getDrivingMatrix(coords);
        if (!matrix) return null;
        let daySecs = 0;
        let dayMeters = 0;
        const newCache: Record<string, { durationSeconds: number; distanceMeters: number }> = {};
        for (let i = 0; i < dayLessons.length - 1; i++) {
          const secs = matrix[i]?.[i + 1] ?? 0;
          const meters = Math.round(secs * 13.0);
          daySecs += secs;
          dayMeters += meters;
          newCache[`${dayLessons[i].id}->${dayLessons[i + 1].id}`] = { durationSeconds: secs, distanceMeters: meters };
        }
        setCachedTravelTimes(cacheKey, newCache).catch(() => {});
        return daySecs > 0 ? { date, label: dayLabel, totalSecs: daySecs, totalMeters: dayMeters, lessonCount: dayLessons.length } : null;
      } catch {
        return null; // OSRM unavailable for this day
      }
    };

    try {
      // All 7 days fire in parallel — no sequential blocking
      const results = await Promise.all(Array.from({ length: 7 }, (_, d) => processDay(d)));
      const days = results.filter((d): d is DayDriveSummary => d !== null);
      const totalSecs = days.reduce((s, d) => s + d.totalSecs, 0);
      const totalMeters = days.reduce((s, d) => s + d.totalMeters, 0);
      setWeekDriveTotals(days.length > 0 ? { totalSecs, totalMeters, dayCount: days.length, days } : null);
    } catch {
      setWeekDriveTotals(null);
    }
    setLoadingDrive(false);
  }, [weekStart, weekLessons, pupils]);

  useEffect(() => {
    if (weekLessons.length >= 2) {
      fetchWeekDriveTotals();
    } else {
      setWeekDriveTotals(null);
    }
  }, [weekStart, weekLessons.map(l => l.id + l.startTime).join(), fetchWeekDriveTotals]); // Added fetchWeekDriveTotals to dependencies

  const activePupils = useMemo(() => pupils.filter(p => p.status === 'active'), [pupils]);
  const isFirstTime = activePupils.length === 0 && lessons.length === 0;
  // Only count messages received from pupils (not sent by instructor)
  const unreadMessages = useMemo(() => messages.filter(m => !m.fromInstructor).length, [messages]);
  // Unacknowledged lessons for THIS week only (matches hero card scope)
  const pendingAck = useMemo(
    () => weekLessons.filter(l => !l.pupilAcknowledged && l.status === 'scheduled').length,
    [weekLessons],
  );
  // Pupil has confirmed payment but instructor has not yet marked it paid
  const pendingPayments = useMemo(
    () => lessons.filter(l => l.pupilPaidConfirmed && l.paymentStatus !== 'paid').length,
    [lessons],
  );

  const instructorNotifs = notifications
    .filter(n => n.recipientType === 'instructor' && !n.read)
    .slice(0, 3);

  // ── Payment calculations ─────────────────────────────
  const weekPotential = useMemo(() =>
    weekLessons
      .filter(l => l.status !== 'cancelled')
      .reduce((sum, l) => sum + lessonEarnings(l, pupils.find(p => p.id === l.pupilId)), 0),
    [weekLessons, pupils]
  );

  const weekEarned = useMemo(() =>
    weekLessons
      .filter(l => l.paymentStatus === 'paid')
      .reduce((sum, l) => sum + lessonEarnings(l, pupils.find(p => p.id === l.pupilId)), 0),
    [weekLessons, pupils]
  );

  const monthEarned = useMemo(() =>
    lessons
      .filter(l => l.date >= monthStart && l.paymentStatus === 'paid')
      .reduce((sum, l) => sum + lessonEarnings(l, pupils.find(p => p.id === l.pupilId)), 0),
    [lessons, monthStart, pupils]
  );

  const monthPending = useMemo(() =>
    lessons
      .filter(l => l.date >= monthStart && l.paymentStatus !== 'paid' && l.status !== 'cancelled')
      .reduce((sum, l) => sum + lessonEarnings(l, pupils.find(p => p.id === l.pupilId)), 0),
    [lessons, monthStart, pupils]
  );

  const unpaidLessons = useMemo(() =>
    lessons
      .filter(l =>
        l.paymentStatus !== 'paid' &&
        l.status !== 'cancelled' &&
        l.weekConfirmed
      )
      .sort((a, b) => b.date.localeCompare(a.date)),
    [lessons]
  );

  const pupilsWithBalance = useMemo(() =>
    pupils
      .map(p => ({
        pupil: p,
        owed: p.balance < 0 ? Math.abs(p.balance) : 0,
        credit: p.balance > 0 ? p.balance : 0,
      }))
      .filter(x => x.owed > 0 || x.credit > 0)
      .sort((a, b) => b.owed - a.owed),
    [pupils]
  );

  const pupilsWithUnpaid = useMemo(() => {
    const ids = new Set(unpaidLessons.map(l => l.pupilId));
    return pupils.filter(p => ids.has(p.id));
  }, [unpaidLessons, pupils]);

  const filteredUnpaid = useMemo(() =>
    paymentFilter === 'all'
      ? unpaidLessons
      : unpaidLessons.filter(l => l.pupilId === paymentFilter),
    [unpaidLessons, paymentFilter]
  );

  // ── Daily earnings chart data (Mon–Sun) ──────────────────────────
  const weekDates = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  const dailyEarnings = useMemo(() => {
    const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    return weekDates.map((date, i) => {
      const dayLessons = weekLessons.filter(l => l.date === date && l.status !== 'cancelled');
      const paid = dayLessons
        .filter(l => l.paymentStatus === 'paid')
        .reduce((sum, l) => sum + lessonEarnings(l, pupils.find(p => p.id === l.pupilId)), 0);
      const unpaid = dayLessons
        .filter(l => l.paymentStatus !== 'paid')
        .reduce((sum, l) => sum + lessonEarnings(l, pupils.find(p => p.id === l.pupilId)), 0);
      return { label: DAY_LABELS[i], date, paid, unpaid, total: paid + unpaid, lessonCount: dayLessons.length };
    });
  }, [weekDates, weekLessons, pupils]);

  // ── Per-pupil earnings breakdown for Payments tab ──────────────
  const pupilEarningsBreakdown = useMemo(() => {
    return activePupils
      .map(p => {
        const pupilWeekLessons = weekLessons.filter(l => l.pupilId === p.id && l.status !== 'cancelled');
        const potential = pupilWeekLessons.reduce((sum, l) => sum + Math.round((l.duration / 60) * p.lessonRate * 100) / 100, 0);
        const paidLessons = weekLessons.filter(l => l.pupilId === p.id && l.paymentStatus === 'paid');
        const paid = paidLessons.reduce((sum, l) => sum + Math.round((l.duration / 60) * p.lessonRate * 100) / 100, 0);
        const hasCard = !!(p.stripePaymentMethodId);
        return {
          pupil: p,
          lessonCount: pupilWeekLessons.length,
          potential,
          paid,
          hasCard,
        };
      })
      .filter(x => x.lessonCount > 0)
      .sort((a, b) => b.potential - a.potential);
  }, [activePupils, weekLessons]);

  const totalOwed = pupils.reduce((sum, p) => p.balance < 0 ? sum + Math.abs(p.balance) : sum, 0);
  const totalCredit = pupils.reduce((sum, p) => p.balance > 0 ? sum + p.balance : sum, 0);

  // Dashboard particles
  const dashParticles = useRef(
    Array.from({ length: 16 }, (_, i) => ({
      x: Math.random() * (SW - 10),
      y: 40 + Math.random() * 800,
      size: 1.5 + Math.random() * 2.5,
      opacity: 0.35 + Math.random() * 0.50,
      anim: new Animated.Value(Math.random()),
      delay: i * 420,
    }))
  ).current;

  useEffect(() => {
    dashParticles.forEach(p => {
      const loop = () => {
        p.anim.setValue(0);
        Animated.timing(p.anim, {
          toValue: 1, duration: 3000 + Math.random() * 3500,
          useNativeDriver: true, delay: p.delay,
        }).start(() => loop());
      };
      loop();
    });
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>

      {/* ── Header ─────────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: insets.top + 16, backgroundColor: '#FFFFFF', borderBottomColor: '#E2E8F0' }]}>
        <View>
          <Text style={styles.greeting}>Good {getGreeting()}</Text>
          <Text style={styles.title}>Instructor Dashboard</Text>
          {/* Accent underline */}
          <View style={{ height: 3, width: '72%', borderRadius: 2, backgroundColor: N.orange, marginTop: 4 }} />
        </View>
        <Pressable onPress={logout} hitSlop={8}>
          <MaterialIcons name="logout" size={24} color='#00A8D6' />
        </Pressable>
      </View>

      {/* ── Tab switcher ───────────────────────────────────────── */}
      <View style={[styles.tabRow, { backgroundColor: '#FFFFFF', borderBottomColor: '#E2E8F0' }]}>
        <Pressable
          style={[styles.tab, activeTab === 'overview' && {
            backgroundColor: N.orange,
            borderColor: N.orangeDim,
            shadowColor: N.orange,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.30,
            shadowRadius: 8,
            elevation: 6,
          }]}
          onPress={() => setActiveTab('overview')}
        >
          <MaterialIcons name="dashboard" size={15} color={activeTab === 'overview' ? '#FFFFFF' : N.grey} />
          <Text style={[styles.tabLabel, activeTab === 'overview' && { color: '#FFFFFF', fontWeight: '800' }]}>Overview</Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === 'payments' && {
            backgroundColor: N.cyan + '18',
            borderColor: N.cyan,
          }]}
          onPress={() => setActiveTab('payments')}
        >
          <MaterialIcons name="payments" size={15} color={activeTab === 'payments' ? N.cyan : N.grey} />
          <Text style={[styles.tabLabel, activeTab === 'payments' && { color: N.cyan, fontWeight: '800' }]}>Payments</Text>
          {unpaidLessons.length > 0 && (
            <View style={[styles.tabBadge, { backgroundColor: N.orange }]}>
              <Text style={styles.tabBadgeText}>{unpaidLessons.length}</Text>
            </View>
          )}
        </Pressable>
      </View>

      {/* ═══════════════════════════════════════════════════════════
          OVERVIEW TAB
      ═══════════════════════════════════════════════════════════ */}
      {activeTab === 'overview' && (
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 80 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Getting started */}
          {isFirstTime && (
            <View style={styles.gettingStarted}>
              <View style={styles.gettingStartedHeader}>
                <MaterialIcons name="rocket-launch" size={22} color={Colors.primary} />
                <Text style={styles.gettingStartedTitle}>Getting Started</Text>
              </View>
              <Text style={styles.gettingStartedSub}>Follow these steps to set up your diary:</Text>
              <GettingStartedStep step={1} icon="access-time" label="Set your working hours"
                hint="Tell the app when you are available to teach each day"
                onPress={() => router.push('/(instructor)/(tabs)/settings')} actionLabel="Go to My Hours" />
              <GettingStartedStep step={2} icon="person-add" label="Add your first pupil"
                hint="Enter their name, postcode, availability and lessons per week"
                onPress={() => router.push('/(instructor)/pupil-form')} actionLabel="Add Pupil" />
              <GettingStartedStep step={3} icon="auto-fix-high" label="Generate your weekly diary"
                hint="Use Smart Schedule to automatically fill your week based on pupil availability"
                onPress={() => router.push('/(instructor)/(tabs)/diary')} actionLabel="Open Diary" />
              <GettingStartedStep step={4} icon="how-to-reg" label="Confirm the week & notify pupils"
                hint="Once happy with the diary, confirm it so pupils receive their lesson details" />
            </View>
          )}

          {/* Weekly driving summary — always show if loading or data present */}
          {(loadingDrive || weekDriveTotals) && (
            <WeeklyDriveCard
              loading={loadingDrive}
              data={weekDriveTotals}
              onRefresh={fetchWeekDriveTotals}
            />
          )}

          {/* ── Gradient hero stats card ─────────────────────── */}
          <GradientHeroCard
            activePupils={activePupils.length}
            weekLessons={weekLessons.length}
            weekEarned={weekEarned}
            weekPotential={weekPotential}
            pendingAck={pendingAck}
          />

          {/* Stats row */}
          <View style={styles.statsRow}>
            <StatCard icon="payment" label="Owed" value={`£${totalOwed.toFixed(0)}`} color={Colors.error} />
            <StatCard icon="account-balance-wallet" label="Credit" value={`£${totalCredit.toFixed(0)}`} color={Colors.success} />
            <StatCard icon="pending-actions" label="Unack" value={String(pendingAck)} color={Colors.warning} />
            <StatCard icon="check-circle" label="Paid" value={String(weekLessons.filter(l => l.paymentStatus === 'paid').length)} color={Colors.success} />
          </View>

          {/* Alerts */}
          {(unreadMessages > 0 || pendingAck > 0 || pendingPayments > 0) && (
            <View style={styles.alertsRow}>
              {pendingPayments > 0 && (
                <Pressable
                  style={[styles.alertChip, { borderColor: Colors.success + '50', backgroundColor: Colors.success + '15' }]}
                  onPress={() => setActiveTab('payments')}
                >
                  <MaterialIcons name="payments" size={16} color={Colors.success} />
                  <Text style={[styles.alertChipText, { color: Colors.success }]}>
                    {pendingPayments} payment{pendingPayments !== 1 ? 's' : ''} to confirm
                  </Text>
                </Pressable>
              )}
              {pendingAck > 0 && (
                <Pressable style={styles.alertChip} onPress={() => router.push('/(instructor)/(tabs)/diary')}>
                  <MaterialIcons name="pending-actions" size={16} color={Colors.warning} />
                  <Text style={[styles.alertChipText, { color: Colors.warning }]}>{pendingAck} awaiting acknowledgement</Text>
                </Pressable>
              )}
              {unreadMessages > 0 && (
                <Pressable style={[styles.alertChip, { borderColor: Colors.info + '50' }]} onPress={() => router.push('/(instructor)/(tabs)/messages')}>
                  <MaterialIcons name="mark-email-unread" size={16} color={Colors.info} />
                  <Text style={[styles.alertChipText, { color: Colors.info }]}>{unreadMessages} unread messages</Text>
                </Pressable>
              )}
            </View>
          )}

          {/* Instructor notifications */}
          {instructorUnread > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                Notifications{instructorUnread > 3 ? ` (${instructorUnread} total)` : ''}
              </Text>
              {instructorNotifs.map(n => (
                <Pressable key={n.id} style={styles.notifCard} onPress={() => markNotificationRead(n.id)}>
                  <View style={[styles.notifIcon, {
                    backgroundColor: n.type === 'week_confirmed' ? Colors.success + '20' :
                      n.type === 'payment_received' ? Colors.primary + '20' : Colors.info + '20',
                  }]}>
                    <MaterialIcons
                      name={n.type === 'week_confirmed' ? 'verified' : n.type === 'payment_received' ? 'payments' : 'notifications'}
                      size={18}
                      color={n.type === 'week_confirmed' ? Colors.success : n.type === 'payment_received' ? Colors.primary : Colors.info}
                    />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.notifTitle}>{n.title}</Text>
                    <Text style={styles.notifBody} numberOfLines={2}>{n.body}</Text>
                  </View>
                  <MaterialIcons name="close" size={16} color={Colors.textTertiary} />
                </Pressable>
              ))}
            </View>
          )}

          {/* Today's lessons */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Today's Lessons</Text>
            {todaysLessons.length === 0 ? (
              <View style={styles.emptyCard}>
                <MaterialIcons name="event-available" size={32} color={Colors.textTertiary} />
                <Text style={styles.emptyText}>No lessons scheduled today</Text>
                {weekLessons.length > 0 ? (
                  <Pressable onPress={() => router.push('/(instructor)/(tabs)/diary')} style={styles.emptyAction}>
                    <Text style={styles.emptyActionText}>View this week's diary</Text>
                    <MaterialIcons name="chevron-right" size={16} color={Colors.primary} />
                  </Pressable>
                ) : activePupils.length > 0 ? (
                  <Pressable onPress={() => router.push('/(instructor)/(tabs)/diary')} style={styles.emptyAction}>
                    <Text style={styles.emptyActionText}>Generate a Smart Schedule</Text>
                    <MaterialIcons name="chevron-right" size={16} color={Colors.primary} />
                  </Pressable>
                ) : null}
              </View>
            ) : (
              todaysLessons.map(lesson => {
                const pupil = pupils.find(p => p.id === lesson.pupilId);
                return (
                  <Pressable key={lesson.id} style={styles.lessonCard}
                    onPress={() => router.push({ pathname: '/(instructor)/lesson-detail', params: { lessonId: lesson.id } })}>
                    <View style={[styles.lessonTime, lesson.status === 'completed' && styles.lessonTimeCompleted]}>
                      <Text style={styles.lessonTimeText}>{lesson.startTime}</Text>
                      <Text style={styles.lessonEndTime}>{getEndTime(lesson)}</Text>
                    </View>
                    <View style={styles.lessonInfo}>
                      <Text style={styles.lessonPupil}>{pupil ? `${pupil.firstName} ${pupil.lastName}` : 'Unknown'}</Text>
                      <Text style={styles.lessonMeta}>{lesson.duration} min · {pupil?.postcode ?? ''}</Text>
                      <View style={styles.lessonBadges}>
                        <StatusBadge status={lesson.status} />
                        <PayBadge status={lesson.paymentStatus} />
                        {lesson.pupilCheckedIn && (
                          <View style={[badgeStyles.badge, { backgroundColor: Colors.success + '30' }]}>
                            <Text style={[badgeStyles.text, { color: Colors.success }]}>Checked In</Text>
                          </View>
                        )}
                      </View>
                    </View>
                    {!lesson.pupilAcknowledged && <View style={styles.ackDot} />}
                  </Pressable>
                );
              })
            )}
          </View>

          {/* Quick actions */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Quick Actions</Text>
            <View style={styles.quickActions}>
              <QuickAction icon="person-add" label="Add Pupil" onPress={() => router.push('/(instructor)/pupil-form')} />
              <QuickAction icon="add-circle" label="Add Lesson" onPress={() => router.push('/(instructor)/lesson-form')} />
              <QuickAction icon="auto-fix-high" label="Smart Schedule" onPress={() => router.push('/(instructor)/(tabs)/diary')} />
              <QuickAction icon="send" label="Message" onPress={() => router.push('/(instructor)/compose-message')} />
            </View>
          </View>
        </ScrollView>
      )}

      {/* ═══════════════════════════════════════════════════════════
          PAYMENTS TAB
      ═══════════════════════════════════════════════════════════ */}
      {activeTab === 'payments' && (
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 80 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Earnings summary cards ────────────────────────── */}
          <View style={styles.earningsGrid}>
            <EarningsCard
              label="Earned This Week"
              value={`£${weekEarned.toFixed(2)}`}
              icon="trending-up"
              color={Colors.success}
              sub={`${weekLessons.filter(l => l.paymentStatus === 'paid').length} paid lessons`}
            />
            <EarningsCard
              label="Earned This Month"
              value={`£${monthEarned.toFixed(2)}`}
              icon="account-balance"
              color={Colors.info}
              sub={`${lessons.filter(l => l.date >= monthStart && l.paymentStatus === 'paid').length} paid lessons`}
            />
            <EarningsCard
              label="Pending (Month)"
              value={`£${monthPending.toFixed(2)}`}
              icon="hourglass-top"
              color={Colors.warning}
              sub={`${lessons.filter(l => l.date >= monthStart && l.paymentStatus !== 'paid' && l.status !== 'cancelled' && l.weekConfirmed).length} unpaid lessons`}
            />
            <EarningsCard
              label="Total Outstanding"
              value={`£${totalOwed.toFixed(2)}`}
              icon="money-off"
              color={Colors.error}
              sub={`across ${pupilsWithBalance.filter(x => x.owed > 0).length} pupils`}
            />
          </View>

          {/* ── Auto-charge vs manual summary ────────────────────── */}
          <PaymentMethodSummary pupils={activePupils} lessons={lessons} />

          {/* ── Daily earnings bar chart ────────────────────────── */}
          <WeeklyEarningsChart days={dailyEarnings} />

          {/* ── Per-pupil earnings breakdown ───────────────────── */}
          {pupilEarningsBreakdown.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Earnings by Pupil — This Week</Text>
              <View style={ebStyles.tableCard}>
                {/* Header row */}
                <View style={[ebStyles.tableRow, ebStyles.tableHeader]}>
                  <Text style={[ebStyles.colPupil, ebStyles.headerText]}>Pupil</Text>
                  <Text style={[ebStyles.colRate, ebStyles.headerText]}>Rate</Text>
                  <Text style={[ebStyles.colLessons, ebStyles.headerText]}>Lessons</Text>
                  <Text style={[ebStyles.colEarning, ebStyles.headerText]}>Potential</Text>
                  <Text style={[ebStyles.colPaid, ebStyles.headerText]}>Paid</Text>
                </View>
                {/* Data rows */}
                {pupilEarningsBreakdown.map((item, idx) => {
                  const allPaid = item.paid >= item.potential && item.potential > 0;
                  const partPaid = item.paid > 0 && item.paid < item.potential;
                  return (
                    <Pressable
                      key={item.pupil.id}
                      style={[
                        ebStyles.tableRow,
                        idx % 2 === 1 && ebStyles.tableRowAlt,
                        idx === pupilEarningsBreakdown.length - 1 && { borderBottomWidth: 0 },
                      ]}
                      onPress={() => router.push({ pathname: '/(instructor)/pupil-detail', params: { pupilId: item.pupil.id } })}
                    >
                      {/* Pupil name + avatar + card badge */}
                      <View style={[ebStyles.colPupil, { flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
                        <View style={[ebStyles.miniAvatar, item.hasCard && { backgroundColor: Colors.success + '25', borderWidth: 1, borderColor: Colors.success + '60' }]}>
                          <Text style={[ebStyles.miniAvatarText, item.hasCard && { color: Colors.success }]}>
                            {item.pupil.firstName[0]}{item.pupil.lastName[0]}
                          </Text>
                        </View>
                        <View style={{ flex: 1, gap: 1 }}>
                          <Text style={ebStyles.pupilName} numberOfLines={1}>{item.pupil.firstName}</Text>
                          {item.hasCard ? (
                            <View style={ebStyles.cardIndicator}>
                              <MaterialIcons name="credit-card" size={8} color={Colors.success} />
                              <Text style={ebStyles.cardIndicatorText}>Auto</Text>
                            </View>
                          ) : (
                            <View style={ebStyles.cardIndicator}>
                              <MaterialIcons name="account-balance" size={8} color={Colors.textTertiary} />
                              <Text style={[ebStyles.cardIndicatorText, { color: Colors.textTertiary }]}>Manual</Text>
                            </View>
                          )}
                        </View>
                      </View>
                      {/* Rate */}
                      <Text style={[ebStyles.colRate, ebStyles.cellText]}>
                        £{item.pupil.lessonRate}/hr
                      </Text>
                      {/* Lessons */}
                      <View style={[ebStyles.colLessons, { alignItems: 'center' }]}>
                        <View style={ebStyles.lessonCountBadge}>
                          <Text style={ebStyles.lessonCountText}>{item.lessonCount}</Text>
                        </View>
                      </View>
                      {/* Potential earnings */}
                      <Text style={[ebStyles.colEarning, ebStyles.potentialText]}>
                        £{item.potential.toFixed(0)}
                      </Text>
                      {/* Paid */}
                      <View style={ebStyles.colPaid}>
                        {item.paid > 0 ? (
                          <View style={[ebStyles.paidChip, allPaid ? ebStyles.paidChipFull : ebStyles.paidChipPart]}>
                            <MaterialIcons
                              name={allPaid ? 'check-circle' : 'timelapse'}
                              size={10}
                              color={allPaid ? Colors.success : Colors.warning}
                            />
                            <Text style={[ebStyles.paidChipText, { color: allPaid ? Colors.success : Colors.warning }]}>
                              £{item.paid.toFixed(0)}
                            </Text>
                          </View>
                        ) : (
                          <Text style={ebStyles.unpaidLabel}>—</Text>
                        )}
                      </View>
                    </Pressable>
                  );
                })}
                {/* Totals footer */}
                <View style={ebStyles.tableFooter}>
                  <View style={ebStyles.colPupil}>
                    <Text style={ebStyles.footerLabel}>TOTAL</Text>
                  </View>
                  <Text style={ebStyles.colRate} />
                  <Text style={[ebStyles.colLessons, ebStyles.footerValue, { textAlign: 'center' }]}>
                    {pupilEarningsBreakdown.reduce((s, x) => s + x.lessonCount, 0)}
                  </Text>
                  <Text style={[ebStyles.colEarning, ebStyles.footerValue]}>
                    £{pupilEarningsBreakdown.reduce((s, x) => s + x.potential, 0).toFixed(0)}
                  </Text>
                  <Text style={[ebStyles.colPaid, ebStyles.footerValue]}>
                    £{pupilEarningsBreakdown.reduce((s, x) => s + x.paid, 0).toFixed(0)}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* ── Outstanding balances by pupil ─────────────────── */}
          {pupilsWithBalance.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Balances by Pupil</Text>
              {pupilsWithBalance.map(({ pupil, owed, credit }) => (
                <Pressable
                  key={pupil.id}
                  style={styles.balanceRow}
                  onPress={() => router.push({ pathname: '/(instructor)/pupil-detail', params: { pupilId: pupil.id } })}
                >
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{pupil.firstName[0]}{pupil.lastName[0]}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.balanceName}>{pupil.firstName} {pupil.lastName}</Text>
                    <Text style={styles.balanceMeta}>{pupil.postcode}</Text>
                  </View>
                  {owed > 0 && (
                    <View style={[styles.balancePill, { backgroundColor: Colors.error + '20' }]}>
                      <MaterialIcons name="arrow-downward" size={12} color={Colors.error} />
                      <Text style={[styles.balancePillText, { color: Colors.error }]}>Owes £{owed.toFixed(2)}</Text>
                    </View>
                  )}
                  {credit > 0 && (
                    <View style={[styles.balancePill, { backgroundColor: Colors.success + '20' }]}>
                      <MaterialIcons name="arrow-upward" size={12} color={Colors.success} />
                      <Text style={[styles.balancePillText, { color: Colors.success }]}>Credit £{credit.toFixed(2)}</Text>
                    </View>
                  )}
                </Pressable>
              ))}
            </View>
          )}

          {/* ── Unpaid / Pending lessons ──────────────────────── */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                Unpaid Lessons
                {unpaidLessons.length > 0 ? ` (${unpaidLessons.length})` : ''}
              </Text>
            </View>

            {/* Pupil filter */}
            {pupilsWithUnpaid.length > 1 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterRow}
              >
                <Pressable
                  style={[styles.filterChip, paymentFilter === 'all' && styles.filterChipActive]}
                  onPress={() => setPaymentFilter('all')}
                >
                  <Text style={[styles.filterChipText, paymentFilter === 'all' && styles.filterChipTextActive]}>
                    All pupils
                  </Text>
                </Pressable>
                {pupilsWithUnpaid.map(p => (
                  <Pressable
                    key={p.id}
                    style={[styles.filterChip, paymentFilter === p.id && styles.filterChipActive]}
                    onPress={() => setPaymentFilter(p.id)}
                  >
                    <Text style={[styles.filterChipText, paymentFilter === p.id && styles.filterChipTextActive]}>
                      {p.firstName} {p.lastName}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}

            {filteredUnpaid.length === 0 ? (
              <View style={styles.emptyCard}>
                <MaterialIcons name="check-circle" size={36} color={Colors.success} />
                <Text style={[styles.emptyText, { color: Colors.success }]}>All lessons paid</Text>
                <Text style={[styles.emptyText, { fontSize: 12, textAlign: 'center' }]}>
                  No outstanding payments at the moment
                </Text>
              </View>
            ) : (
              filteredUnpaid.map(lesson => {
                const pupil = pupils.find(p => p.id === lesson.pupilId);
                const earnings = lessonEarnings(lesson, pupil);
                const isPupilConfirmed = lesson.pupilPaidConfirmed;
                return (
                  <Pressable
                    key={lesson.id}
                    style={[styles.unpaidCard, isPupilConfirmed && styles.unpaidCardPending]}
                    onPress={() => router.push({ pathname: '/(instructor)/lesson-detail', params: { lessonId: lesson.id } })}
                  >
                    <View style={styles.unpaidLeft}>
                      <View style={styles.avatar}>
                        <Text style={styles.avatarText}>
                          {pupil ? `${pupil.firstName[0]}${pupil.lastName[0]}` : '??'}
                        </Text>
                      </View>
                      <View style={{ gap: 2 }}>
                        <Text style={styles.unpaidPupil}>
                          {pupil ? `${pupil.firstName} ${pupil.lastName}` : 'Unknown'}
                        </Text>
                        <Text style={styles.unpaidMeta}>
                          {formatDate(lesson.date)} · {lesson.startTime} · {lesson.duration}min
                        </Text>
                        <Text style={styles.unpaidPostcode}>{pupil?.postcode ?? ''}</Text>
                      </View>
                    </View>
                    <View style={styles.unpaidRight}>
                      <Text style={styles.unpaidAmount}>£{earnings.toFixed(2)}</Text>
                      <View style={[
                        styles.unpaidBadge,
                        { backgroundColor: isPupilConfirmed ? Colors.warning + '25' : Colors.error + '20' },
                      ]}>
                        <MaterialIcons
                          name={isPupilConfirmed ? 'hourglass-top' : 'money-off'}
                          size={11}
                          color={isPupilConfirmed ? Colors.warning : Colors.error}
                        />
                        <Text style={[
                          styles.unpaidBadgeText,
                          { color: isPupilConfirmed ? Colors.warning : Colors.error },
                        ]}>
                          {isPupilConfirmed ? 'Pupil paid – confirm' : 'Unpaid'}
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                );
              })
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

// ─── Payment Method Summary Card ───────────────────────────────────────────

function PaymentMethodSummary({ pupils, lessons }: { pupils: Pupil[]; lessons: Lesson[] }) {
  const withCard = useMemo(() => pupils.filter(p => p.stripePaymentMethodId), [pupils]);
  const withoutCard = useMemo(() => pupils.filter(p => !p.stripePaymentMethodId), [pupils]);

  const monthStart = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  }, []);

  const autoChargedMonth = useMemo(() =>
    withCard.reduce((total, p) => {
      return total + lessons
        .filter(l => l.pupilId === p.id && l.paymentStatus === 'paid' && l.date >= monthStart)
        .reduce((s, l) => s + Math.round((l.duration / 60) * p.lessonRate * 100) / 100, 0);
    }, 0),
  [withCard, lessons, monthStart]);

  const manualMonth = useMemo(() =>
    withoutCard.reduce((total, p) => {
      return total + lessons
        .filter(l => l.pupilId === p.id && l.paymentStatus === 'paid' && l.date >= monthStart)
        .reduce((s, l) => s + Math.round((l.duration / 60) * p.lessonRate * 100) / 100, 0);
    }, 0),
  [withoutCard, lessons, monthStart]);

  const totalMonth = autoChargedMonth + manualMonth;
  const autoRatio = totalMonth > 0 ? autoChargedMonth / totalMonth : 0;
  const autoPct = Math.round(autoRatio * 100);
  const manualPct = 100 - autoPct;

  return (
    <View style={pmStyles.card}>
      <View style={pmStyles.header}>
        <View style={pmStyles.iconWrap}>
          <MaterialIcons name="credit-card" size={18} color={Colors.success} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={pmStyles.title}>Auto-Charge vs Manual — This Month</Text>
          <Text style={pmStyles.subtitle}>
            {withCard.length} of {pupils.length} pupils have a saved card
          </Text>
        </View>
      </View>

      {/* Totals row */}
      <View style={pmStyles.totalsRow}>
        <View style={pmStyles.totalItem}>
          <View style={[pmStyles.totalIcon, { backgroundColor: Colors.success + '20' }]}>
            <MaterialIcons name="bolt" size={14} color={Colors.success} />
          </View>
          <Text style={[pmStyles.totalValue, { color: Colors.success }]}>£{autoChargedMonth.toFixed(2)}</Text>
          <Text style={pmStyles.totalLabel}>Auto-Charged</Text>
        </View>
        <View style={pmStyles.totalDivider} />
        <View style={pmStyles.totalItem}>
          <View style={[pmStyles.totalIcon, { backgroundColor: Colors.info + '20' }]}>
            <MaterialIcons name="account-balance" size={14} color={Colors.info} />
          </View>
          <Text style={[pmStyles.totalValue, { color: Colors.info }]}>£{manualMonth.toFixed(2)}</Text>
          <Text style={pmStyles.totalLabel}>Bank Transfer</Text>
        </View>
        <View style={pmStyles.totalDivider} />
        <View style={pmStyles.totalItem}>
          <View style={[pmStyles.totalIcon, { backgroundColor: Colors.primary + '20' }]}>
            <MaterialIcons name="payments" size={14} color={Colors.primary} />
          </View>
          <Text style={[pmStyles.totalValue, { color: Colors.textPrimary }]}>£{totalMonth.toFixed(2)}</Text>
          <Text style={pmStyles.totalLabel}>Total Collected</Text>
        </View>
      </View>

      {/* Auto-charge ratio bar */}
      {totalMonth > 0 && (
        <View style={pmStyles.ratioWrap}>
          <View style={pmStyles.ratioTrack}>
            {autoRatio > 0 && <View style={[pmStyles.ratioFill, { flex: autoRatio, backgroundColor: Colors.success }]} />}
            {autoRatio < 1 && <View style={[pmStyles.ratioFill, { flex: 1 - autoRatio, backgroundColor: Colors.info }]} />}
          </View>
          <View style={pmStyles.ratioLabels}>
            <View style={pmStyles.ratioLabelItem}>
              <View style={[pmStyles.ratioDot, { backgroundColor: Colors.success }]} />
              <Text style={pmStyles.ratioLabelText}>{autoPct}% auto-charged</Text>
            </View>
            <View style={pmStyles.ratioLabelItem}>
              <View style={[pmStyles.ratioDot, { backgroundColor: Colors.info }]} />
              <Text style={pmStyles.ratioLabelText}>{manualPct}% manual</Text>
            </View>
          </View>
        </View>
      )}

      {/* Pupils without card — nudge */}
      {withoutCard.length > 0 && (
        <View style={pmStyles.noCardRow}>
          <MaterialIcons name="warning" size={13} color={Colors.warning} />
          <Text style={pmStyles.noCardText}>
            {withoutCard.map(p => p.firstName).join(', ')}{' '}
            {withoutCard.length === 1 ? 'has' : 'have'} no saved card — charged manually via bank transfer
          </Text>
        </View>
      )}
    </View>
  );
}

const pmStyles = StyleSheet.create({
  card: {
    backgroundColor: N.navy,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1.5,
    borderColor: Colors.success + '35',
    gap: Spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 3,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconWrap: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: Colors.success + '22',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    borderWidth: 1, borderColor: Colors.success + '40',
  },
  title: { fontSize: FontSize.sm, fontWeight: '700', color: N.white },
  subtitle: { fontSize: 10, color: N.whiteD, marginTop: 1 },
  totalsRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: N.navyLight, borderRadius: Radius.md,
    paddingVertical: 14, borderWidth: 1, borderColor: N.border,
  },
  totalItem: { flex: 1, alignItems: 'center', gap: 4 },
  totalIcon: {
    width: 28, height: 28, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center', marginBottom: 2,
  },
  totalValue: { fontSize: FontSize.md, fontWeight: '800' },
  totalLabel: { fontSize: 9, color: N.grey, textAlign: 'center', fontWeight: '500' },
  totalDivider: { width: 1, height: 48, backgroundColor: N.border },
  ratioWrap: { gap: 6 },
  ratioTrack: {
    height: 10, borderRadius: 5, flexDirection: 'row', overflow: 'hidden',
    backgroundColor: N.borderBright,
  },
  ratioFill: { minWidth: 4 },
  ratioLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  ratioLabelItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  ratioDot: { width: 8, height: 8, borderRadius: 4 },
  ratioLabelText: { fontSize: 10, color: N.whiteD, fontWeight: '600' },
  noCardRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 7,
    backgroundColor: 'rgba(255,190,0,0.10)', borderRadius: Radius.sm,
    padding: 10, borderWidth: 1, borderColor: 'rgba(255,190,0,0.28)',
  },
  noCardText: { flex: 1, fontSize: FontSize.xs, color: Colors.warning, lineHeight: 17 },
});

// ─── Weekly Earnings Bar Chart ─────────────────────────────────────────────

interface DailyEarning {
  label: string;
  date: string;
  paid: number;
  unpaid: number;
  total: number;
  lessonCount: number;
}

function WeeklyEarningsChart({ days }: { days: DailyEarning[] }) {
  const maxTotal = Math.max(...days.map(d => d.total), 1);
  const totalPaid = days.reduce((s, d) => s + d.paid, 0);
  const totalUnpaid = days.reduce((s, d) => s + d.unpaid, 0);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <View style={wcStyles.card}>
      <View style={wcStyles.header}>
        <View style={wcStyles.iconWrap}>
          <MaterialIcons name="bar-chart" size={18} color={Colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={wcStyles.title}>Daily Earnings — This Week</Text>
          <Text style={wcStyles.subtitle}>
            {'£'}{totalPaid.toFixed(0)} paid {'·'} {'£'}{totalUnpaid.toFixed(0)} pending
          </Text>
        </View>
      </View>

      <View style={wcStyles.legend}>
        <View style={wcStyles.legendItem}>
          <View style={[wcStyles.legendDot, { backgroundColor: Colors.success }]} />
          <Text style={wcStyles.legendText}>Paid</Text>
        </View>
        <View style={wcStyles.legendItem}>
          <View style={[wcStyles.legendDot, { backgroundColor: Colors.warning }]} />
          <Text style={wcStyles.legendText}>Unpaid</Text>
        </View>
      </View>

      <View style={wcStyles.chartArea}>
        {days.map((day) => {
          const isToday = day.date === today;
          const BAR_MAX_H = 110;
          const totalBarPx = maxTotal > 0 ? Math.max((day.total / maxTotal) * BAR_MAX_H, day.total > 0 ? 4 : 0) : 0;
          const paidPx = day.total > 0 ? Math.round(totalBarPx * (day.paid / day.total)) : 0;
          const unpaidPx = Math.round(totalBarPx) - paidPx;

          return (
            <View key={day.date} style={wcStyles.barCol}>
              <Text style={[wcStyles.amountLabel, { opacity: day.total > 0 ? 1 : 0 }]}>
                {'£'}{day.total.toFixed(0)}
              </Text>
              <View style={[wcStyles.barContainer, { height: BAR_MAX_H }]}>
                {day.total > 0 ? (
                  <View style={[wcStyles.stackedBar, { height: Math.round(totalBarPx) }]}>
                    {unpaidPx > 0 && (
                      <View style={[wcStyles.barSegment, {
                        height: unpaidPx,
                        backgroundColor: Colors.warning,
                        borderTopLeftRadius: paidPx === 0 ? 5 : 0,
                        borderTopRightRadius: paidPx === 0 ? 5 : 0,
                      }]} />
                    )}
                    {paidPx > 0 && (
                      <View style={[wcStyles.barSegment, {
                        height: paidPx,
                        backgroundColor: Colors.success,
                        borderBottomLeftRadius: 5,
                        borderBottomRightRadius: 5,
                        borderTopLeftRadius: unpaidPx === 0 ? 5 : 0,
                        borderTopRightRadius: unpaidPx === 0 ? 5 : 0,
                      }]} />
                    )}
                  </View>
                ) : (
                  <View style={wcStyles.emptyBarLine} />
                )}
              </View>
              <Text style={[wcStyles.dayLabel, isToday && wcStyles.dayLabelToday]}>
                {day.label}
              </Text>
              {day.lessonCount > 0 && (
                <View style={wcStyles.lessonDot}>
                  <Text style={wcStyles.lessonDotText}>{day.lessonCount}</Text>
                </View>
              )}
            </View>
          );
        })}
      </View>

      <View style={wcStyles.maxLabel}>
        <View style={wcStyles.maxLabelLine} />
        <Text style={wcStyles.maxLabelText}>Max {'£'}{maxTotal.toFixed(0)} / day</Text>
        <View style={wcStyles.maxLabelLine} />
      </View>

      {/* ── Weekly total row ── */}
      {(() => {
        const grandTotal = totalPaid + totalUnpaid;
        const pct = grandTotal > 0 ? Math.round((totalPaid / grandTotal) * 100) : 0;
        return (
          <View style={wcStyles.weekTotalCard}>
            <View style={wcStyles.weekTotalRow}>
              <View style={wcStyles.weekTotalLeft}>
                <MaterialIcons name="account-balance-wallet" size={14} color={Colors.primary} />
                <Text style={wcStyles.weekTotalLabel}>Week Total</Text>
              </View>
              <Text style={wcStyles.weekTotalAmount}>{'£'}{grandTotal.toFixed(0)}</Text>
            </View>
            <View style={wcStyles.weekTotalProgressTrack}>
              <View style={[wcStyles.weekTotalProgressFill, { width: `${pct}%` as any }]} />
            </View>
            <View style={wcStyles.weekTotalSplit}>
              <View style={wcStyles.weekTotalSplitItem}>
                <View style={[wcStyles.weekTotalDot, { backgroundColor: Colors.success }]} />
                <Text style={wcStyles.weekTotalSplitText}>{'£'}{totalPaid.toFixed(0)} paid</Text>
              </View>
              <Text style={wcStyles.weekTotalPct}>{pct}%</Text>
              <View style={wcStyles.weekTotalSplitItem}>
                <View style={[wcStyles.weekTotalDot, { backgroundColor: Colors.warning }]} />
                <Text style={wcStyles.weekTotalSplitText}>{'£'}{grandTotal.toFixed(0)} potential</Text>
              </View>
            </View>
          </View>
        );
      })()}
    </View>
  );
}

const wcStyles = StyleSheet.create({
  card: {
    backgroundColor: N.navy,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1.5,
    borderColor: N.orange + '35',
    gap: Spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 3,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconWrap: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: N.orange + '22',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    borderWidth: 1, borderColor: N.orange + '40',
  },
  title: { fontSize: FontSize.sm, fontWeight: '700', color: N.white },
  subtitle: { fontSize: 10, color: N.whiteD, marginTop: 1 },
  legend: { flexDirection: 'row', gap: 16, paddingHorizontal: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: FontSize.xs, color: N.whiteD, fontWeight: '500' },
  chartArea: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingTop: 4,
  },
  barCol: { flex: 1, alignItems: 'center', gap: 4 },
  amountLabel: {
    fontSize: 9, fontWeight: '700', color: N.whiteD,
    textAlign: 'center', minHeight: 12,
  },
  barContainer: { width: '72%', justifyContent: 'flex-end', alignItems: 'center' },
  stackedBar: { width: '100%', overflow: 'hidden', justifyContent: 'flex-end' },
  barSegment: { width: '100%' },
  emptyBarLine: {
    width: 2, height: 20, backgroundColor: N.border, borderRadius: 1,
  },
  dayLabel: { fontSize: 10, fontWeight: '600', color: N.grey, textAlign: 'center' },
  dayLabelToday: { color: N.orange, fontWeight: '800' },
  lessonDot: {
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: N.orange + '22',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: N.orange + '40',
  },
  lessonDotText: { fontSize: 8, fontWeight: '800', color: N.orange },
  maxLabel: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4, marginTop: 2 },
  maxLabelLine: { flex: 1, height: 1, backgroundColor: N.border },
  maxLabelText: { fontSize: 9, color: N.grey, fontWeight: '500' },
  // Weekly total row
  weekTotalCard: {
    backgroundColor: N.navyLight,
    borderRadius: Radius.md,
    padding: 12,
    borderWidth: 1,
    borderColor: N.orange + '35',
    gap: 8,
    marginTop: 2,
  },
  weekTotalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  weekTotalLeft: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  weekTotalLabel: { fontSize: FontSize.xs, fontWeight: '700', color: N.orange },
  weekTotalAmount: { fontSize: FontSize.md, fontWeight: '800', color: N.white },
  weekTotalProgressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: N.border,
    overflow: 'hidden',
  },
  weekTotalProgressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: N.orange,
  },
  weekTotalSplit: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  weekTotalSplitItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  weekTotalDot: { width: 7, height: 7, borderRadius: 3.5 },
  weekTotalSplitText: { fontSize: 10, color: N.whiteD, fontWeight: '500' },
  weekTotalPct: { fontSize: 11, fontWeight: '800', color: N.orange },
});

// ─── Gradient Hero Card ──────────────────────────────────────────────────────

function GradientHeroCard({
  activePupils,
  weekLessons,
  weekEarned,
  weekPotential,
  pendingAck,
}: {
  activePupils: number;
  weekLessons: number;
  weekEarned: number;
  weekPotential: number;
  pendingAck: number;
}) {
  return (
    <View style={heroStyles.wrapper}>
      {/* Outer neon border glow */}
      <View style={heroStyles.glowRing} />
      <LinearGradient
        colors={['#EBF5FB', '#F0F8FF', '#E8F4FD']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={heroStyles.gradient}
      >
        {/* Title */}
        <Text style={[heroStyles.topLabel, { color: '#FF6700' }]}>THIS WEEK'S OVERVIEW</Text>

        {/* First row — 3 columns */}
        <View style={heroStyles.firstRow}>
          <View style={heroStyles.statItem}>
            <Text style={heroStyles.statValue}>{activePupils}</Text>
            <Text style={heroStyles.statLabel}>Active Pupils</Text>
          </View>
          <View style={heroStyles.statDivider} />
          <View style={heroStyles.statItem}>
            <Text style={heroStyles.statValue}>{weekLessons}</Text>
            <Text style={heroStyles.statLabel}>Lessons</Text>
          </View>
          <View style={heroStyles.statDivider} />
          <View style={heroStyles.statItem}>
            <Text style={heroStyles.statValue}>{'£'}{weekPotential.toFixed(0)}</Text>
            <Text style={heroStyles.statLabel}>{'Potential\nEarnings'}</Text>
          </View>
        </View>

        {/* Horizontal separator */}
        <View style={heroStyles.hRule} />

        {/* Second row — 2 columns centred */}
        <View style={heroStyles.secondRow}>
          <View style={heroStyles.statItem}>
            <Text style={heroStyles.statValue}>{'£'}{weekEarned.toFixed(0)}</Text>
            <Text style={heroStyles.statLabel}>Earned</Text>
          </View>
          <View style={heroStyles.statDivider} />
          <View style={heroStyles.statItem}>
            <Text style={[heroStyles.statValue, { color: pendingAck > 0 ? '#FF6700' : '#94A3B8' }]}>{pendingAck}</Text>
            <Text style={heroStyles.statLabel}>Unack</Text>
          </View>
        </View>

        {/* Progress bar — paid vs potential */}
        {weekPotential > 0 && (() => {
          const pct = Math.min(weekEarned / weekPotential, 1);
          const pctLabel = Math.round(pct * 100);
          return (
            <View style={heroStyles.progressWrap}>
              <View style={heroStyles.progressTrack}>
                <View style={[heroStyles.progressFill, { width: `${pctLabel}%` as any }]} />
              </View>
              <View style={heroStyles.progressLabelRow}>
                <Text style={heroStyles.progressLabelLeft}>
                  £{weekEarned.toFixed(0)} paid
                </Text>
                <Text style={heroStyles.progressLabelCenter}>
                  {pctLabel}%
                </Text>
                <Text style={heroStyles.progressLabelRight}>
                  of £{weekPotential.toFixed(0)}
                </Text>
              </View>
            </View>
          );
        })()}
      </LinearGradient>
    </View>
  );
}

const heroStyles = StyleSheet.create({
  wrapper: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 6,
  },
  glowRing: {
    position: 'absolute', inset: -3, borderRadius: 23,
    backgroundColor: 'transparent',
  },
  gradient: {
    paddingVertical: 24,
    paddingHorizontal: 20,
    gap: 0,
  },
  topLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FF6700',
    textAlign: 'center',
    letterSpacing: 2,
    marginBottom: 22,
  },
  firstRow: {
    flexDirection: 'row',
    marginBottom: 18,
    alignItems: 'center',
  },
  secondRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    height: 44,
    backgroundColor: '#CBD5E1',
  },
  hRule: {
    height: 1,
    backgroundColor: '#CBD5E1',
    marginVertical: 18,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  statValue: {
    fontSize: 30,
    fontWeight: '700',
    color: '#0F172A',
  },
  statLabel: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 15,
    paddingHorizontal: 4,
  },
  // Progress bar
  progressWrap: {
    marginTop: 20,
    gap: 6,
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E2E8F0',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: N.orange,
  },
  progressLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  progressLabelLeft: {
    fontSize: 11,
    color: N.orange,
    fontWeight: '700',
  },
  progressLabelCenter: {
    fontSize: 12,
    color: '#0F172A',
    fontWeight: '800',
  },
  progressLabelRight: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
});

// ─── Sub-components ───────────────────────────────────────────────────────────

function WeeklyDriveCard({
  loading,
  data,
  onRefresh,
}: {
  loading: boolean;
  data: { totalSecs: number; totalMeters: number; dayCount: number; days: DayDriveSummary[] } | null;
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={driveStyles.card}>
      {/* ── Header ── */}
      <View style={driveStyles.header}>
        <View style={driveStyles.iconWrap}>
          <MaterialIcons name="directions-car" size={18} color={Colors.info} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={driveStyles.title}>Weekly Driving Summary</Text>
          {data && !loading && (
            <Text style={driveStyles.subtitle}>
              {data.dayCount} day{data.dayCount !== 1 ? 's' : ''} with lessons this week
            </Text>
          )}
        </View>
        <Pressable onPress={onRefresh} hitSlop={10}>
          {loading ? (
            <ActivityIndicator size="small" color={Colors.info} />
          ) : (
            <MaterialIcons name="refresh" size={16} color={Colors.textTertiary} />
          )}
        </Pressable>
      </View>

      {/* ── Loading skeleton ── */}
      {loading && !data ? (
        <View style={driveStyles.loadingRow}>
          <ActivityIndicator size="small" color={Colors.info} />
          <Text style={driveStyles.loadingText}>Loading from cache · calculating routes…</Text>
        </View>
      ) : data ? (
        <>
          {/* ── Weekly totals row ── */}
          <View style={driveStyles.totalsRow}>
            <View style={driveStyles.totalItem}>
              <MaterialIcons name="timer" size={14} color={Colors.info} />
              <Text style={driveStyles.totalValue}>{formatDuration(data.totalSecs)}</Text>
              <Text style={driveStyles.totalLabel}>Total Drive Time</Text>
            </View>
            <View style={driveStyles.totalDivider} />
            <View style={driveStyles.totalItem}>
              <MaterialIcons name="straighten" size={14} color={Colors.info} />
              <Text style={driveStyles.totalValue}>{formatDistance(data.totalMeters)}</Text>
              <Text style={driveStyles.totalLabel}>Total Distance</Text>
            </View>
            <View style={driveStyles.totalDivider} />
            <View style={driveStyles.totalItem}>
              <MaterialIcons name="speed" size={14} color={Colors.info} />
              <Text style={driveStyles.totalValue}>{formatDistance(data.totalMeters / data.dayCount)}</Text>
              <Text style={driveStyles.totalLabel}>Avg per Day</Text>
            </View>
          </View>

          {/* ── Per-day breakdown toggle ── */}
          {data.days.length > 0 && (
            <Pressable
              style={driveStyles.breakdownToggle}
              onPress={() => setExpanded(v => !v)}
              hitSlop={8}
            >
              <Text style={driveStyles.breakdownToggleText}>
                {expanded ? 'Hide' : 'Show'} daily breakdown
              </Text>
              <MaterialIcons
                name={expanded ? 'expand-less' : 'expand-more'}
                size={16}
                color={Colors.info}
              />
            </Pressable>
          )}

          {/* ── Per-day rows ── */}
          {expanded && data.days.map((day, idx) => (
            <View
              key={day.date}
              style={[driveStyles.dayRow, idx === 0 && { borderTopWidth: 0 }]}
            >
              <View style={driveStyles.dayLabelWrap}>
                <Text style={driveStyles.dayLabel}>{day.label}</Text>
                <Text style={driveStyles.dayLessons}>
                  {day.lessonCount} lesson{day.lessonCount !== 1 ? 's' : ''}
                </Text>
              </View>
              <View style={driveStyles.dayStats}>
                <View style={driveStyles.dayStatChip}>
                  <MaterialIcons name="timer" size={11} color={Colors.info} />
                  <Text style={driveStyles.dayStatText}>{formatDuration(day.totalSecs)}</Text>
                </View>
                <View style={driveStyles.dayStatChip}>
                  <MaterialIcons name="straighten" size={11} color={Colors.info} />
                  <Text style={driveStyles.dayStatText}>{formatDistance(day.totalMeters)}</Text>
                  {day.isEstimated ? (
                    <Text style={driveStyles.dayEstTag}>Est.</Text>
                  ) : null}
                </View>
              </View>
            </View>
          ))}

          {/* ── Footer caption ── */}
          <Text style={driveStyles.caption}>
            Avg {formatDuration(Math.round(data.totalSecs / data.dayCount))} drive per day{' '}
            · sourced from diary route cache
          </Text>
        </>
      ) : null}
    </View>
  );
}

const driveStyles = StyleSheet.create({
  card: {
    backgroundColor: N.navy,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1.5,
    borderColor: N.cyan + '35',
    gap: Spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: N.cyan + '20',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    borderWidth: 1,
    borderColor: N.cyan + '40',
  },
  title: { fontSize: FontSize.sm, fontWeight: '700', color: N.white },
  subtitle: { fontSize: 10, color: N.whiteD, marginTop: 1 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  loadingText: { fontSize: FontSize.xs, color: N.whiteD, flex: 1 },

  // ── Weekly totals
  totalsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: N.navyLight,
    borderRadius: Radius.md,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: N.border,
  },
  totalItem: { flex: 1, alignItems: 'center', gap: 4 },
  totalValue: { fontSize: FontSize.md, fontWeight: '800', color: N.cyan },
  totalLabel: { fontSize: 9, color: N.grey, textAlign: 'center', fontWeight: '500' },
  totalDivider: { width: 1, height: 38, backgroundColor: N.border },

  // ── Breakdown toggle
  breakdownToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  breakdownToggleText: { fontSize: FontSize.xs, color: N.cyan, fontWeight: '600' },

  // ── Per-day rows
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: N.border,
  },
  dayLabelWrap: { gap: 2 },
  dayLabel: { fontSize: FontSize.sm, fontWeight: '700', color: N.white },
  dayLessons: { fontSize: 10, color: N.grey },
  dayStats: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  dayStatChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: N.cyan + '18',
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: N.cyan + '35',
  },
  dayStatText: { fontSize: FontSize.xs, fontWeight: '700', color: N.cyan },
  dayEstTag: { fontSize: 9, color: N.orange, fontWeight: '700' },

  caption: {
    fontSize: 10,
    color: N.grey,
    textAlign: 'center',
    fontStyle: 'italic',
    lineHeight: 14,
  },
});

function GettingStartedStep({
  step, icon, label, hint, onPress, actionLabel,
}: {
  step: number; icon: any; label: string; hint: string;
  onPress?: () => void; actionLabel?: string;
}) {
  return (
    <View style={gsStyles.row}>
      <View style={gsStyles.stepNum}>
        <Text style={gsStyles.stepNumText}>{step}</Text>
      </View>
      <MaterialIcons name={icon} size={18} color={Colors.primary} style={{ marginTop: 1 }} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={gsStyles.label}>{label}</Text>
        <Text style={gsStyles.hint}>{hint}</Text>
        {onPress && actionLabel && (
          <Pressable onPress={onPress} style={gsStyles.actionBtn}>
            <Text style={gsStyles.actionBtnText}>{actionLabel}</Text>
            <MaterialIcons name="arrow-forward" size={12} color={Colors.primary} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

function EarningsCard({ label, value, icon, color, sub }: {
  label: string; value: string; icon: any; color: string; sub: string;
}) {
  return (
    <View style={[earningsStyles.card, { borderColor: color + '30' }]}>
      <View style={[earningsStyles.iconWrap, { backgroundColor: color + '20' }]}>
        <MaterialIcons name={icon} size={20} color={color} />
      </View>
      <Text style={[earningsStyles.value, { color }]}>{value}</Text>
      <Text style={earningsStyles.label}>{label}</Text>
      <Text style={earningsStyles.sub}>{sub}</Text>
    </View>
  );
}

function StatCard({ icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  return (
    <View style={[statStyles.card, {
      borderColor: color + '50',
      shadowColor: color,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.40,
      shadowRadius: 14,
      elevation: 10,
    }]}>
      <MaterialIcons name={icon} size={20} color={color} />
      <Text style={[statStyles.value, { color, textShadowColor: color, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 10 }]}>{value}</Text>
      <Text style={statStyles.label}>{label}</Text>
    </View>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    scheduled: [Colors.info + '30', Colors.info],
    completed: [Colors.success + '30', Colors.success],
    cancelled: [Colors.error + '30', Colors.error],
    no_show: [Colors.warning + '30', Colors.warning],
  };
  const [bg, text] = map[status] ?? [Colors.textTertiary + '30', Colors.textTertiary];
  return <View style={[badgeStyles.badge, { backgroundColor: bg }]}><Text style={[badgeStyles.text, { color: text }]}>{status.replace('_', ' ')}</Text></View>;
}

function PayBadge({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    paid: [Colors.success + '30', Colors.success],
    unpaid: [Colors.error + '30', Colors.error],
    partial: [Colors.warning + '30', Colors.warning],
  };
  const [bg, text] = map[status] ?? [Colors.textTertiary + '30', Colors.textTertiary];
  return <View style={[badgeStyles.badge, { backgroundColor: bg }]}><Text style={[badgeStyles.text, { color: text }]}>{status}</Text></View>;
}

function QuickAction({ icon, label, onPress }: { icon: any; label: string; onPress: () => void }) {
  return (
    <Pressable style={qaStyles.btn} onPress={onPress}>
      <View style={qaStyles.iconWrap}>
        <MaterialIcons name={icon} size={22} color={Colors.primary} />
      </View>
      <Text style={qaStyles.label}>{label}</Text>
    </Pressable>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const gsStyles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: N.navyLight, borderRadius: Radius.md,
    padding: Spacing.sm, borderWidth: 1, borderColor: N.border,
  },
  stepNum: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: N.orange, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  stepNumText: { fontSize: 11, fontWeight: '800', color: '#FFFFFF' },
  label: { fontSize: FontSize.sm, fontWeight: '700', color: N.white },
  hint: { fontSize: FontSize.xs, color: N.whiteD, lineHeight: 16 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  actionBtnText: { fontSize: FontSize.xs, color: N.orange, fontWeight: '700' },
});

const earningsStyles = StyleSheet.create({
  card: {
    flex: 1, minWidth: '47%', backgroundColor: N.navy,
    borderRadius: Radius.md, padding: Spacing.md,
    borderWidth: 1.5, gap: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 1,
  },
  iconWrap: {
    width: 36, height: 36, borderRadius: Radius.sm,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  value: { fontSize: FontSize.md, fontWeight: '800' },
  label: { fontSize: FontSize.xs, color: N.white, fontWeight: '600' },
  sub: { fontSize: 10, color: N.grey },
});

const statStyles = StyleSheet.create({
  card: {
    flex: 1, backgroundColor: N.navy, borderRadius: Radius.md,
    padding: Spacing.sm, alignItems: 'center', gap: 4, borderWidth: 1.5,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 4,
  },
  value: { fontSize: FontSize.md, fontWeight: '700' },
  label: { fontSize: 10, color: N.grey, textAlign: 'center' },
});

const badgeStyles = StyleSheet.create({
  badge: { borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  text: { fontSize: 10, fontWeight: '600', textTransform: 'capitalize' },
});

const qaStyles = StyleSheet.create({
  btn: { flex: 1, alignItems: 'center', gap: 6 },
  iconWrap: {
    width: 52, height: 52, borderRadius: Radius.md,
    backgroundColor: N.orange + '22',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: N.orange + '50',
    shadowColor: N.orange, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.30, shadowRadius: 8, elevation: 4,
  },
  label: { fontSize: FontSize.xs, color: N.whiteD, textAlign: 'center' },
});

// ─── Earnings Breakdown Table Styles ────────────────────────────────────────

const ebStyles = StyleSheet.create({
  tableCard: {
    backgroundColor: N.navy,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: N.border,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 3,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: N.border,
  },
  tableRowAlt: {
    backgroundColor: N.navyLight,
  },
  tableHeader: {
    backgroundColor: N.navyLight,
    paddingVertical: 8,
  },
  tableFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: N.orange + '15',
    borderTopWidth: 1.5,
    borderTopColor: N.orange + '40',
  },
  headerText: {
    fontSize: 10,
    fontWeight: '700',
    color: N.grey,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  cellText: {
    fontSize: FontSize.xs,
    color: N.whiteD,
    fontWeight: '500',
  },
  footerLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: N.orange,
    letterSpacing: 0.5,
  },
  footerValue: {
    fontSize: FontSize.xs,
    fontWeight: '800',
    color: N.white,
  },
  // Column widths
  colPupil: { flex: 2.2 },
  colRate: { flex: 1.5, fontSize: FontSize.xs, color: Colors.textSecondary },
  colLessons: { flex: 1 },
  colEarning: { flex: 1.3, textAlign: 'right', fontSize: FontSize.xs },
  colPaid: { flex: 1.3, alignItems: 'flex-end' },
  // Pupil cell
  miniAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: N.cyan + '20',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    borderWidth: 1,
    borderColor: N.cyan + '40',
  },
  miniAvatarText: {
    fontSize: 8,
    fontWeight: '800',
    color: N.cyan,
  },
  pupilName: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: N.white,
    flex: 1,
  },
  // Lessons count
  lessonCountBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: N.orange + '22',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: N.orange + '40',
  },
  lessonCountText: {
    fontSize: 10,
    fontWeight: '800',
    color: N.orange,
  },
  // Potential
  potentialText: {
    fontWeight: '700',
    color: N.white,
    textAlign: 'right',
  },
  // Paid chip
  paidChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: Radius.full,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderWidth: 1,
  },
  paidChipFull: {
    backgroundColor: Colors.success + '15',
    borderColor: Colors.success + '40',
  },
  paidChipPart: {
    backgroundColor: Colors.warning + '15',
    borderColor: Colors.warning + '40',
  },
  paidChipText: {
    fontSize: 9,
    fontWeight: '700',
  },
  unpaidLabel: {
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
    textAlign: 'right',
  },
  // Card status indicators
  cardIndicator: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
  },
  cardIndicatorText: { fontSize: 8, fontWeight: '700', color: Colors.success },
  unpaidLabel: {
    fontSize: FontSize.xs,
    color: N.grey,
    textAlign: 'right',
  },
  cardIndicator: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
  },
  cardIndicatorText: { fontSize: 8, fontWeight: '700', color: Colors.success },
});

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingHorizontal: Spacing.md, paddingBottom: Spacing.md,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1, borderBottomColor: '#E2E8F0',
  },
  greeting: { fontSize: FontSize.sm, color: '#94A3B8', letterSpacing: 0.3 },
  title: {
    fontSize: FontSize.xl, fontWeight: '800', color: N.orange, letterSpacing: 0.3,
  },

  tabRow: {
    flexDirection: 'row', gap: 8,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    backgroundColor: N.bg,
    borderBottomWidth: 1, borderBottomColor: N.border,
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: Radius.md,
    backgroundColor: N.navy, borderWidth: 1.5, borderColor: N.border,
  },
  tabActive: { backgroundColor: '#FF6700', borderColor: '#E05500' },
  tabLabel: { fontSize: FontSize.sm, fontWeight: '600', color: '#606060' },
  tabLabelActive: { color: '#FFFFFF' },
  tabBadge: {
    backgroundColor: N.orange, borderRadius: Radius.full,
    minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  tabBadgeText: { fontSize: 9, fontWeight: '800', color: '#FFFFFF' },

  scrollContent: { paddingHorizontal: Spacing.md, paddingTop: Spacing.md, gap: Spacing.lg },

  statsRow: { flexDirection: 'row', gap: Spacing.sm },
  alertsRow: { gap: Spacing.sm },
  alertChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: N.orange + '18',
    borderWidth: 1, borderColor: N.orange + '40',
    borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  alertChipText: { fontSize: FontSize.xs, color: N.orange, fontWeight: '600' },

  section: { gap: Spacing.sm },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: {
    fontSize: FontSize.md, fontWeight: '700', color: '#0F172A',
  },

  gettingStarted: {
    backgroundColor: N.navy, borderRadius: Radius.lg,
    padding: Spacing.md, borderWidth: 1.5, borderColor: N.orange + '40', gap: Spacing.sm,
  },
  gettingStartedHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  gettingStartedTitle: { fontSize: FontSize.md, fontWeight: '700', color: N.orange },
  gettingStartedSub: { fontSize: FontSize.xs, color: N.whiteD, marginBottom: 4 },

  emptyCard: {
    backgroundColor: N.navy, borderRadius: Radius.lg,
    padding: Spacing.xl, alignItems: 'center', gap: 8,
    borderWidth: 1.5, borderColor: N.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 2,
  },
  emptyText: { color: N.whiteD, fontSize: FontSize.sm },
  emptyAction: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  emptyActionText: { fontSize: FontSize.xs, color: N.cyan, fontWeight: '600' },

  notifCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: N.navy, borderRadius: Radius.md,
    padding: Spacing.md, borderWidth: 1.5, borderColor: N.cyan + '35',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 2,
  },
  notifIcon: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  notifTitle: { fontSize: FontSize.sm, fontWeight: '700', color: N.white },
  notifBody: { fontSize: FontSize.xs, color: N.whiteD, lineHeight: 16 },

  lessonCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: N.navy, borderRadius: Radius.md,
    padding: Spacing.md, borderWidth: 1.5, borderColor: N.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 2,
  },
  lessonTime: {
    backgroundColor: N.orange + '22', borderRadius: Radius.sm,
    padding: Spacing.sm, alignItems: 'center', minWidth: 52,
    borderWidth: 1, borderColor: N.orange + '50',
  },
  lessonTimeCompleted: { backgroundColor: Colors.success + '20' },
  lessonTimeText: { fontSize: FontSize.sm, fontWeight: '700', color: N.orange },
  lessonEndTime: { fontSize: 10, color: N.grey },
  lessonInfo: { flex: 1, gap: 2 },
  lessonPupil: { fontSize: FontSize.base, fontWeight: '600', color: N.white },
  lessonMeta: { fontSize: FontSize.xs, color: N.whiteD },
  lessonBadges: { flexDirection: 'row', gap: 6, marginTop: 4 },
  ackDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: N.orange },

  quickActions: { flexDirection: 'row', gap: Spacing.md, justifyContent: 'space-between' },

  earningsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm,
  },

  balanceRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: N.navy, borderRadius: Radius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: N.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 1,
  },
  avatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: N.cyan + '20', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    borderWidth: 1, borderColor: N.cyan + '40',
  },
  avatarText: { fontSize: FontSize.sm, fontWeight: '700', color: N.cyan },
  balanceName: { fontSize: FontSize.base, color: N.white, fontWeight: '600' },
  balanceMeta: { fontSize: FontSize.xs, color: N.grey },
  balancePill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 5,
  },
  balancePillText: { fontSize: FontSize.xs, fontWeight: '700' },

  filterRow: {
    gap: 8, paddingBottom: 4, paddingTop: 2,
  },
  filterChip: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: Radius.full, borderWidth: 1,
    borderColor: N.border, backgroundColor: N.navy,
  },
  filterChipActive: { backgroundColor: N.cyan + '20', borderColor: N.cyan },
  filterChipText: { fontSize: FontSize.xs, color: N.whiteD, fontWeight: '600' },
  filterChipTextActive: { color: N.cyan },

  unpaidCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: N.navy, borderRadius: Radius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.error + '40',
    borderLeftWidth: 4, borderLeftColor: Colors.error,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 2,
  },
  unpaidCardPending: {
    borderColor: Colors.warning + '40', borderLeftColor: Colors.warning,
    shadowColor: Colors.warning,
  },
  unpaidLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
  unpaidRight: { alignItems: 'flex-end', gap: 6 },
  unpaidPupil: { fontSize: FontSize.sm, fontWeight: '700', color: N.white },
  unpaidMeta: { fontSize: FontSize.xs, color: N.whiteD },
  unpaidPostcode: { fontSize: FontSize.xs, color: N.grey },
  unpaidAmount: { fontSize: FontSize.md, fontWeight: '800', color: N.white },
  unpaidBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3,
  },
  unpaidBadgeText: { fontSize: 9, fontWeight: '700' },
});
