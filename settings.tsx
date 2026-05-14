import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, Switch, ActivityIndicator, TextInput, Modal, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { usePupils } from '@/hooks/usePupils';
import { getCacheStats, clearGeocodingCache, CacheStats, getCoordinatesForPupils } from '@/services/geocodingService';
import { getMatrixCacheStats, clearMatrixCache, MatrixCacheStats } from '@/services/schedulerService';
import { useAlert } from '@/template';
import { Colors, Spacing, FontSize, Radius, Shadow } from '@/constants/theme';
import {
  TrafficPrefs, DEFAULT_TRAFFIC_PREFS, DEFAULT_RUSH_HOURS,
  TrafficModel, ScheduleMode, SchedulePriority, RushHourWindow,
  SCHEDULE_PRIORITY_LABELS,
} from '@/services/trafficService';
import {
  formatSecs, formatMiles, efficiencyLabel, efficiencyColor,
  severityColor, severityLabel, loadLastReport, WeeklyEfficiencyReport,
} from '@/services/scheduleEfficiencyService';
import { LESSON_DAYS } from '@/constants/config';
import { InstructorAvailability, InstructorDaySchedule } from '@/types';
import {
  fetchVersions, publishVersion, bumpVersion, formatVersionDate, AppVersion, notifyPupilsOfUpdate,
} from '@/services/changelogService';
import { createDemoData, removeDemoData } from '@/services/seedData';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { useSubscription } from '@/hooks/useSubscription';

const NAVY = '#0F172A';
const GOLD = '#D4AF37';
const INDIGO = '#6366F1';

// ─── Light mode card tokens ───────────────────────────────────────────────────
const LM_CARD      = '#FAFBFC';
const LM_BORDER    = '#E2E8F0';
const LM_TEXT      = '#0F172A';
const LM_TEXT_SEC  = '#64748B';
const LM_TEXT_DIM  = '#94A3B8';
const LM_SURFACE   = '#FFFFFF';
const LM_ELEVATED  = '#F1F5F9';

// ─── Customer Center helper ──────────────────────────────────────────────────
async function openCustomerCenter(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const Purchases = (await import('react-native-purchases')).default;
    await (Purchases as any).presentCustomerCenter();
  } catch (err) {
    console.warn('[RevenueCat] Customer Center unavailable:', err);
  }
}

const SLOT_START_H = 6;
const SLOT_END_H = 22;

const TIME_SLOTS: string[] = (() => {
  const slots: string[] = [];
  for (let h = SLOT_START_H; h <= SLOT_END_H; h++) {
    for (const m of [0, 15, 30, 45]) {
      if (h === SLOT_END_H && m > 0) break;
      slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }
  return slots;
})();

function toMins(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function slotDurationHours(start: string, end: string): number {
  return (toMins(end) - toMins(start)) / 60;
}

type EditingField = 'start' | 'end' | null;

const DEMO_PUPILS = [
  { name: 'Emma Johnson',    email: 'emma.johnson@drivesmart-demo.com',    pin: '1234' },
  { name: 'James Smith',     email: 'james.smith@drivesmart-demo.com',     pin: '2345' },
  { name: 'Sophie Williams', email: 'sophie.williams@drivesmart-demo.com', pin: '3456' },
  { name: 'Ryan Davies',     email: 'ryan.davies@drivesmart-demo.com',     pin: '4567' },
  { name: 'Charlotte Evans', email: 'charlotte.evans@drivesmart-demo.com', pin: '5678' },
];

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { instructorId } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const { isActive, isPaid, isInTrial, trialDaysLeft } = useSubscription();
  const [openingCC, setOpeningCC] = useState(false);

  // ── Demo data state ──────────────────────────────────────────────────────
  const [seedingDemo, setSeedingDemo] = useState(false);
  const [removingDemo, setRemovingDemo] = useState(false);
  const [demoSeeded, setDemoSeeded] = useState(false);

  const handleManageSubscription = async () => {
    if (Platform.OS === 'web') {
      showAlert('Manage Subscription', 'Subscription management is available on iOS and Android devices only.');
      return;
    }
    setOpeningCC(true);
    await openCustomerCenter();
    setOpeningCC(false);
  };

  const { instructorAvailability, saveInstructorAvailability, bufferMinutes, saveBufferMinutes, sameZoneBuffer, diffZoneBuffer, saveZoneBuffers, postDriveBuffer, savePostDriveBuffer, lessonBufferBefore, lessonBufferAfter, lessonBuffersEnabled, saveLessonBuffers, homeAddress, saveHomeAddress, trafficPrefs, saveTrafficPrefs, pupils } = usePupils();

  // ── App Updates state ──────────────────────────────────────────────────
  const [versions, setVersions] = useState<AppVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [publishModalVisible, setPublishModalVisible] = useState(false);
  const [publishTitle, setPublishTitle] = useState('');
  const [publishDesc, setPublishDesc] = useState('');
  const [bumpType, setBumpType] = useState<'patch' | 'minor' | 'major'>('patch');
  const [publishing, setPublishing] = useState(false);

  const latestVersion = versions[0];
  const nextPreview = latestVersion ? bumpVersion(latestVersion.version, bumpType) : '1.0.1';

  const loadVersions = useCallback(async () => {
    setVersionsLoading(true);
    const v = await fetchVersions();
    setVersions(v);
    setVersionsLoading(false);
  }, []);

  useEffect(() => { loadVersions(); }, [loadVersions]);

  const handlePublish = async () => {
    if (!publishTitle.trim()) { showAlert('Missing title', 'Please enter a short headline for this update.'); return; }
    if (!publishDesc.trim()) { showAlert('Missing description', 'Please describe what changed in this update.'); return; }
    if (!instructorId) { showAlert('Not authenticated', 'Please log in again.'); return; }
    setPublishing(true);
    const { version, error } = await publishVersion(instructorId, publishTitle, publishDesc, bumpType);
    setPublishing(false);
    if (error) { showAlert('Publish failed', error); return; }
    setPublishModalVisible(false);
    const savedTitle = publishTitle.trim();
    setPublishTitle('');
    setPublishDesc('');
    setBumpType('patch');
    await loadVersions();
    const pupilIds = pupils.filter(p => p.status === 'active').map(p => p.id);
    notifyPupilsOfUpdate(instructorId, version, savedTitle, pupilIds);
    showAlert(
      'Published!',
      `v${version} is live.${pupilIds.length > 0 ? ` Push notification sent to ${pupilIds.length} pupil${pupilIds.length !== 1 ? 's' : ''}.` : ''} Pupils will see a "What's New" popup next time they open the app.`,
    );
  };

  // ── Traffic preferences state ─────────────────────────────────────────────
  const [localTrafficPrefs, setLocalTrafficPrefs] = useState<TrafficPrefs>({ ...trafficPrefs });
  const [trafficChanged, setTrafficChanged] = useState(false);
  const [lastReport, setLastReport] = useState<WeeklyEfficiencyReport | null>(null);

  useEffect(() => {
    loadLastReport().then(r => setLastReport(r)).catch(() => {});
  }, []);

  const [localBuffer, setLocalBuffer] = useState(bufferMinutes);
  const [localSameZone, setLocalSameZone] = useState(sameZoneBuffer);
  const [localDiffZone, setLocalDiffZone] = useState(diffZoneBuffer);
  const [localPostDrive, setLocalPostDrive] = useState(postDriveBuffer);
  // Per-lesson buffer state
  const [localLessonBufferBefore, setLocalLessonBufferBefore] = useState(lessonBufferBefore);
  const [localLessonBufferAfter, setLocalLessonBufferAfter] = useState(lessonBufferAfter);
  const [localLessonBuffersEnabled, setLocalLessonBuffersEnabled] = useState(lessonBuffersEnabled);
  const [lessonBufferBeforeError, setLessonBufferBeforeError] = useState<string | null>(null);
  const [lessonBufferAfterError, setLessonBufferAfterError] = useState<string | null>(null);
  const [localHomeAddress, setLocalHomeAddress] = useState(homeAddress);
  const [bufferChanged, setBufferChanged] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyCoords, setVerifyCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const homeAddressRef = useRef<TextInput>(null);
  const { showAlert } = useAlert();

  const [cacheStats, setCacheStats] = useState<CacheStats>({ addressCount: 0, postcodeCount: 0, lastUpdated: null });
  const [matrixStats, setMatrixStats] = useState<MatrixCacheStats>({ matrixCount: 0, pairCount: 0 });
  const [clearingCache, setClearingCache] = useState(false);
  const [clearingMatrix, setClearingMatrix] = useState(false);

  const refreshCacheStats = useCallback(() => {
    setCacheStats(getCacheStats());
    setMatrixStats(getMatrixCacheStats());
  }, []);

  useEffect(() => {
    const timer = setTimeout(refreshCacheStats, 400);
    return () => clearTimeout(timer);
  }, []);

  const handleClearCache = useCallback(() => {
    showAlert(
      'Clear All Routing Caches?',
      'All cached address coordinates and driving-distance matrices will be deleted. The next Smart Schedule run will re-fetch them (slower on first use).',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All', style: 'destructive',
          onPress: async () => {
            setClearingCache(true);
            await Promise.all([clearGeocodingCache(), clearMatrixCache()]);
            setClearingCache(false);
            refreshCacheStats();
            showAlert('Caches Cleared', 'Coordinates and distance matrix will be re-fetched on the next Smart Schedule run.');
          },
        },
      ],
    );
  }, [showAlert, refreshCacheStats]);

  const handleClearMatrixOnly = useCallback(async () => {
    setClearingMatrix(true);
    await clearMatrixCache();
    setClearingMatrix(false);
    refreshCacheStats();
    showAlert('Matrix Cleared', 'Driving-distance matrix will be recalculated on the next Smart Schedule run.');
  }, [showAlert, refreshCacheStats]);

  function formatCacheDate(iso: string | null): string {
    if (!iso) return 'Never';
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) +
      ' at ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  const [availability, setAvailability] = useState<InstructorAvailability>({ ...instructorAvailability });
  const [selectedDay, setSelectedDay] = useState<string>('Monday');
  const [hasChanges, setHasChanges] = useState(false);

  const currentDay = availability[selectedDay as keyof InstructorAvailability];
  const [showSlotPicker, setShowSlotPicker] = useState<EditingField>(null);

  const updateDay = useCallback((day: string, patch: Partial<InstructorDaySchedule>) => {
    setAvailability(prev => ({
      ...prev,
      [day]: { ...prev[day as keyof InstructorAvailability], ...patch },
    }));
    setHasChanges(true);
  }, []);

  const handleSlotTap = (slot: string) => {
    if (!currentDay.enabled) return;
    const editing = showSlotPicker;
    if (editing === 'start') {
      if (toMins(slot) >= toMins(currentDay.endTime)) { showAlert('Invalid time', 'Start time must be before end time'); return; }
      updateDay(selectedDay, { startTime: slot });
      setShowSlotPicker('end');
    } else if (editing === 'end') {
      if (toMins(slot) <= toMins(currentDay.startTime)) { showAlert('Invalid time', 'End time must be after start time'); return; }
      updateDay(selectedDay, { endTime: slot });
      setShowSlotPicker(null);
    }
  };

  const handleSave = async () => {
    const ops: Promise<any>[] = [saveInstructorAvailability(availability)];
    if (bufferChanged) {
      ops.push(saveBufferMinutes(localBuffer));
      ops.push(saveZoneBuffers(localSameZone, localDiffZone));
      ops.push(savePostDriveBuffer(localPostDrive));
    }
    if (localHomeAddress.trim() !== homeAddress.trim()) {
      ops.push(saveHomeAddress(localHomeAddress.trim()));
    }
    if (trafficChanged) {
      ops.push(saveTrafficPrefs(localTrafficPrefs));
    }
    // Always save lesson buffers if they changed
    ops.push(saveLessonBuffers(
      localLessonBuffersEnabled ? Math.max(0, Math.min(60, localLessonBufferBefore)) : localLessonBufferBefore,
      localLessonBuffersEnabled ? Math.max(0, Math.min(60, localLessonBufferAfter))  : localLessonBufferAfter,
      localLessonBuffersEnabled,
    ));
    await Promise.all(ops);
    setBufferChanged(false); setTrafficChanged(false); setHasChanges(false);
    showAlert('Saved', 'Your working hours, travel gap, lesson buffers and traffic settings have been updated.');
  };

  const updateTrafficPref = <K extends keyof TrafficPrefs>(key: K, value: TrafficPrefs[K]) => {
    setLocalTrafficPrefs(prev => ({ ...prev, [key]: value }));
    setTrafficChanged(true);
    setHasChanges(true);
  };

  const updateRushHourWindow = (idx: number, patch: Partial<RushHourWindow>) => {
    const updated = localTrafficPrefs.rushHourWindows.map((w, i) => i === idx ? { ...w, ...patch } : w);
    updateTrafficPref('rushHourWindows', updated);
  };

  /** Validate and update a lesson buffer field. Returns the clamped value or null on error. */
  const handleLessonBufferChange = (raw: string, field: 'before' | 'after') => {
    const setError = field === 'before' ? setLessonBufferBeforeError : setLessonBufferAfterError;
    const setValue = field === 'before' ? setLocalLessonBufferBefore : setLocalLessonBufferAfter;
    const trimmed = raw.trim();
    if (trimmed === '') { setValue(5); setError(null); setHasChanges(true); return; }
    const num = parseInt(trimmed, 10);
    if (isNaN(num) || !Number.isInteger(Number(trimmed)) || trimmed.includes('.')) {
      setError('Enter a whole number (0–60)');
      return;
    }
    if (num < 0 || num > 60) {
      setError('Must be between 0 and 60 minutes');
      return;
    }
    setError(null);
    setValue(num);
    setHasChanges(true);
  };

  const handleSameZoneChange = (delta: number) => { const next = Math.max(0, Math.min(60, localSameZone + delta)); setLocalSameZone(next); setBufferChanged(true); setHasChanges(true); };
  const handleDiffZoneChange = (delta: number) => { const next = Math.max(0, Math.min(90, localDiffZone + delta)); setLocalDiffZone(next); setBufferChanged(true); setHasChanges(true); };
  const handlePostDriveChange = (delta: number) => { const next = Math.max(0, Math.min(30, localPostDrive + delta)); setLocalPostDrive(next); setBufferChanged(true); setHasChanges(true); };

  useEffect(() => { setLocalHomeAddress(homeAddress); setVerifyCoords(null); setVerifyError(null); }, [homeAddress]);
  // Sync lesson buffer state from context when it changes
  useEffect(() => { setLocalLessonBufferBefore(lessonBufferBefore); }, [lessonBufferBefore]);
  useEffect(() => { setLocalLessonBufferAfter(lessonBufferAfter); }, [lessonBufferAfter]);
  useEffect(() => { setLocalLessonBuffersEnabled(lessonBuffersEnabled); }, [lessonBuffersEnabled]);

  const handleVerifyLocation = useCallback(async () => {
    const addr = localHomeAddress.trim();
    if (!addr) { showAlert('No Address', 'Enter a home address before verifying.'); return; }
    setVerifying(true); setVerifyCoords(null); setVerifyError(null);
    try {
      const result = await getCoordinatesForPupils([{ id: '__home_verify__', address: addr, postcode: '' }]);
      const coord = result['__home_verify__'];
      if (coord) { setVerifyCoords({ lat: coord.lat, lng: coord.lng }); }
      else { setVerifyError('Address not recognised. Try adding more detail (e.g. town, postcode).'); }
    } catch { setVerifyError('Geocoding failed. Check your internet connection and try again.'); }
    setVerifying(false);
  }, [localHomeAddress, showAlert]);

  const enabledDays = LESSON_DAYS.filter(d => availability[d as keyof InstructorAvailability].enabled);
  const totalWeeklyHours = enabledDays.reduce((sum, d) => {
    const day = availability[d as keyof InstructorAvailability];
    return sum + slotDurationHours(day.startTime, day.endTime);
  }, 0);

  const anyCacheEmpty = cacheStats.addressCount === 0 && cacheStats.postcodeCount === 0 && matrixStats.matrixCount === 0;
  const startSlots = TIME_SLOTS.filter(s => toMins(s) < toMins(currentDay.endTime));
  const endSlots = TIME_SLOTS.filter(s => toMins(s) > toMins(currentDay.startTime));

  // ── Demo data handlers ────────────────────────────────────────────────────
  const handleCreateDemo = () => {
    if (!instructorId) { showAlert('Not signed in', 'Please sign in as an instructor first.'); return; }
    showAlert(
      'Create Demo Data?',
      'This will add 5 demo pupils (Emma Johnson, James Smith, Sophie Williams, Ryan Davies, Charlotte Evans), 10 sample lessons and 3 messages. Your existing data is not affected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Create',
          onPress: async () => {
            setSeedingDemo(true);
            const result = await createDemoData(instructorId);
            setSeedingDemo(false);
            if (result.success) {
              setDemoSeeded(true);
              showAlert(
                'Demo Data Created!',
                `Added ${result.inserted.pupils} pupils, ${result.inserted.lessons} lessons and ${result.inserted.messages} messages. Reviewers can now log in with any demo pupil account.`,
              );
            } else {
              showAlert('Error', result.error ?? 'Failed to create demo data.');
            }
          },
        },
      ],
    );
  };

  const handleRemoveDemo = () => {
    showAlert(
      'Remove Demo Data?',
      'This will permanently delete the 5 demo pupils and all their lessons and messages. Your real data will not be affected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive',
          onPress: async () => {
            setRemovingDemo(true);
            await removeDemoData();
            setRemovingDemo(false);
            setDemoSeeded(false);
            showAlert('Removed', 'Demo data deleted. Your real pupils and lessons are unaffected.');
          },
        },
      ],
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16, backgroundColor: '#FFFFFF' }]}>
        <Text style={styles.title}>MY HOURS</Text>
        <Text style={styles.subtitle}>Set when you are available to teach</Text>
        {hasChanges && (
          <Pressable style={styles.saveBtn} onPress={handleSave}>
            <MaterialIcons name="check" size={16} color={Colors.textInverse} />
            <Text style={styles.saveBtnText}>Save</Text>
          </Pressable>
        )}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
      >
        {/* ── Subscription Management ──────────────────────────────────── */}
        <Pressable style={[styles.profileBanner, styles.subBanner]} onPress={handleManageSubscription} disabled={openingCC}>
          <View style={[styles.profileBannerIcon, styles.subBannerIcon]}>
            {openingCC ? <ActivityIndicator size="small" color={GOLD} /> : <MaterialIcons name="star" size={22} color={GOLD} />}
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={[styles.profileBannerTitle, { color: '#FF6700' }]}>Drive Smart Pro</Text>
              {isPaid ? (
                <View style={styles.subActiveBadge}><Text style={styles.subActiveBadgeText}>ACTIVE</Text></View>
              ) : isInTrial ? (
                <View style={[styles.subActiveBadge, { backgroundColor: '#F59E0B20', borderColor: '#F59E0B50' }]}><Text style={[styles.subActiveBadgeText, { color: '#F59E0B' }]}>TRIAL</Text></View>
              ) : (
                <View style={[styles.subActiveBadge, { backgroundColor: '#EF444420', borderColor: '#EF444450' }]}><Text style={[styles.subActiveBadgeText, { color: '#EF4444' }]}>EXPIRED</Text></View>
              )}
            </View>
            <Text style={styles.profileBannerSub}>
              {isPaid ? 'Manage billing, view history & request support'
                : isInTrial ? `Trial active · ${trialDaysLeft} day${trialDaysLeft !== 1 ? 's' : ''} remaining · Tap to subscribe`
                : 'Trial expired · Tap to subscribe and restore access'}
            </Text>
          </View>
          {openingCC ? null : <MaterialIcons name="chevron-right" size={20} color={'#FF6700'} />}
        </Pressable>

        {/* Profile shortcut */}
        <Pressable style={styles.profileBanner} onPress={() => router.push('/(instructor)/profile')}>
          <View style={styles.profileBannerIcon}><MaterialIcons name="account-circle" size={22} color={Colors.primary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.profileBannerTitle}>My Profile</Text>
            <Text style={styles.profileBannerSub}>Name, email, password and account details</Text>
          </View>
          <MaterialIcons name="chevron-right" size={20} color={Colors.textTertiary} />
        </Pressable>

        {/* Theme toggle */}
        <Pressable style={[styles.profileBanner, { borderColor: '#FF670035' }]} onPress={toggleTheme}>
          <View style={[styles.profileBannerIcon, { backgroundColor: '#FF670015' }]}>
            <MaterialIcons name={isDark ? 'brightness-3' : 'brightness-7'} size={22} color={Colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.profileBannerTitle}>{isDark ? 'Dark Mode' : 'Light Mode'}</Text>
            <Text style={styles.profileBannerSub}>Tap to switch to {isDark ? 'light' : 'dark'} mode</Text>
          </View>
          <View style={[styles.themeToggleTrack, { backgroundColor: !isDark ? '#FF6700' : '#CBD5E1' }]}>
            <View style={[styles.themeToggleThumb, { backgroundColor: '#FFFFFF', transform: [{ translateX: !isDark ? 20 : 0 }] }]} />
          </View>
        </Pressable>

        {/* Terms & Conditions editor shortcut */}
        <Pressable style={[styles.profileBanner, { borderColor: '#E2E8F0' }]} onPress={() => router.push('/(instructor)/terms-editor')}>
          <View style={[styles.profileBannerIcon, { backgroundColor: '#00C4FF18' }]}><MaterialIcons name="gavel" size={22} color="#00C4FF" /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.profileBannerTitle}>Terms & Conditions</Text>
            <Text style={styles.profileBannerSub}>View, edit and publish T&C versions for pupils</Text>
          </View>
          <MaterialIcons name="chevron-right" size={20} color={'#CBD5E1'} />
        </Pressable>

        {/* Privacy Policy */}
        <Pressable style={[styles.profileBanner, { borderColor: '#E2E8F0' }]} onPress={() => router.push('/(instructor)/privacy-policy')}>
          <View style={[styles.profileBannerIcon, { backgroundColor: '#FF670015' }]}><MaterialIcons name="privacy-tip" size={22} color={Colors.primary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.profileBannerTitle}>Privacy Policy</Text>
            <Text style={styles.profileBannerSub}>How we collect, use and protect your data (UK GDPR)</Text>
          </View>
          <MaterialIcons name="chevron-right" size={20} color={Colors.textTertiary} />
        </Pressable>

        {/* Help & Support */}
        <Pressable style={[styles.profileBanner, { borderColor: '#E2E8F0' }]} onPress={() => router.push('/(instructor)/support')}>
          <View style={[styles.profileBannerIcon, { backgroundColor: '#22C55E18' }]}><MaterialIcons name="support-agent" size={22} color="#22C55E" /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.profileBannerTitle}>Help &amp; Support</Text>
            <Text style={styles.profileBannerSub}>FAQs, contact support, and report a bug</Text>
          </View>
          <MaterialIcons name="chevron-right" size={20} color={Colors.textTertiary} />
        </Pressable>

        {/* Notification settings shortcut */}
        <Pressable style={[styles.profileBanner, { borderColor: '#E2E8F0' }]} onPress={() => router.push('/(instructor)/notification-settings')}>
          <View style={[styles.profileBannerIcon, { backgroundColor: '#00C4FF18' }]}><MaterialIcons name="notifications" size={22} color="#00C4FF" /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.profileBannerTitle}>Push Notifications</Text>
            <Text style={styles.profileBannerSub}>Configure which alerts you receive on this device</Text>
          </View>
          <MaterialIcons name="chevron-right" size={20} color={Colors.textTertiary} />
        </Pressable>

        {/* Weekly summary */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{enabledDays.length}</Text>
              <Text style={styles.summaryLabel}>Working days</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{totalWeeklyHours}</Text>
              <Text style={styles.summaryLabel}>Available hrs/week</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{enabledDays.map(d => d.slice(0, 2)).join(' ')}</Text>
              <Text style={styles.summaryLabel}>Active days</Text>
            </View>
          </View>
          <Text style={styles.summaryHint}>
            <MaterialIcons name="auto-fix-high" size={12} color={Colors.primary} />
            {' '}Smart Schedule will only book lessons within these hours
          </Text>
        </View>

        {/* Day selector */}
        <Text style={styles.sectionLabel}>Select Day</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayChips}>
          {LESSON_DAYS.map(day => {
            const dayData = availability[day as keyof InstructorAvailability];
            const isSelected = selectedDay === day;
            const isEnabled = dayData.enabled;
            return (
              <Pressable
                key={day}
                style={[
                  styles.dayChip,
                  isSelected && { backgroundColor: Colors.primary, borderColor: Colors.primary },
                  !isSelected && isEnabled && { borderColor: Colors.primary + '60' },
                  !isEnabled && !isSelected && styles.dayChipOff,
                ]}
                onPress={() => { setSelectedDay(day); setShowSlotPicker(null); }}
              >
                <Text style={[
                  styles.dayChipText,
                  isSelected && { color: Colors.textInverse },
                  !isSelected && isEnabled && { color: Colors.primary },
                  !isEnabled && !isSelected && { color: Colors.textTertiary },
                ]}>
                  {day.slice(0, 3)}
                </Text>
                {isEnabled && !isSelected && <View style={[styles.dayDot, { backgroundColor: Colors.primary }]} />}
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Day settings card */}
        <View style={styles.dayCard}>
          <View style={styles.dayCardHeader}>
            <View>
              <Text style={styles.dayCardTitle}>{selectedDay}</Text>
              <Text style={styles.dayCardSub}>
                {currentDay.enabled
                  ? `Working ${currentDay.startTime} – ${currentDay.endTime} (${slotDurationHours(currentDay.startTime, currentDay.endTime).toFixed(2).replace(/\.?0+$/, '')} hrs)`
                  : 'Day off — not available for lessons'}
              </Text>
            </View>
            <Switch
              value={currentDay.enabled}
              onValueChange={val => { updateDay(selectedDay, { enabled: val }); setShowSlotPicker(null); }}
              trackColor={{ false: Colors.surfaceBorder, true: Colors.primary + '60' }}
              thumbColor={currentDay.enabled ? Colors.primary : Colors.textTertiary}
            />
          </View>

          {currentDay.enabled && (
            <>
              <View style={styles.timePromptRow}>
                <Pressable
                  style={[styles.timeChip, showSlotPicker === 'start' && { borderColor: Colors.primary, backgroundColor: Colors.primary + '20' }]}
                  onPress={() => setShowSlotPicker(showSlotPicker === 'start' ? null : 'start')}
                >
                  <MaterialIcons name="play-arrow" size={14} color={showSlotPicker === 'start' ? Colors.primary : Colors.textSecondary} />
                  <Text style={[styles.timeChipLabel, showSlotPicker === 'start' && { color: Colors.primary }]}>Start</Text>
                  <Text style={[styles.timeChipValue, showSlotPicker === 'start' && { color: Colors.primary }]}>{currentDay.startTime}</Text>
                  <MaterialIcons name={showSlotPicker === 'start' ? 'expand-less' : 'expand-more'} size={14} color={showSlotPicker === 'start' ? Colors.primary : Colors.textTertiary} />
                </Pressable>
                <MaterialIcons name="arrow-forward" size={16} color={Colors.textTertiary} />
                <Pressable
                  style={[styles.timeChip, showSlotPicker === 'end' && { borderColor: Colors.success, backgroundColor: Colors.success + '20' }]}
                  onPress={() => setShowSlotPicker(showSlotPicker === 'end' ? null : 'end')}
                >
                  <MaterialIcons name="stop" size={14} color={showSlotPicker === 'end' ? Colors.success : Colors.textSecondary} />
                  <Text style={[styles.timeChipLabel, showSlotPicker === 'end' && { color: Colors.success }]}>End</Text>
                  <Text style={[styles.timeChipValue, showSlotPicker === 'end' && { color: Colors.success }]}>{currentDay.endTime}</Text>
                  <MaterialIcons name={showSlotPicker === 'end' ? 'expand-less' : 'expand-more'} size={14} color={showSlotPicker === 'end' ? Colors.success : Colors.textTertiary} />
                </Pressable>
              </View>

              {showSlotPicker && (
                <View style={styles.slotPickerContainer}>
                  <View style={styles.slotPickerHeader}>
                    <MaterialIcons name={showSlotPicker === 'start' ? 'play-arrow' : 'stop'} size={14} color={showSlotPicker === 'start' ? Colors.primary : Colors.success} />
                    <Text style={[styles.slotPickerTitle, { color: showSlotPicker === 'start' ? Colors.primary : Colors.success }]}>
                      Select {showSlotPicker === 'start' ? 'Start' : 'End'} Time
                    </Text>
                    <Text style={styles.slotPickerHint}>15-minute intervals</Text>
                    <Pressable onPress={() => setShowSlotPicker(null)} hitSlop={10}><MaterialIcons name="close" size={16} color={Colors.textTertiary} /></Pressable>
                  </View>
                  <ScrollView style={{ maxHeight: 220 }} showsVerticalScrollIndicator nestedScrollEnabled>
                    <View style={styles.slotPickerGrid}>
                      {(showSlotPicker === 'start' ? startSlots : endSlots).map(slot => {
                        const isSelected = slot === (showSlotPicker === 'start' ? currentDay.startTime : currentDay.endTime);
                        const isHour = slot.endsWith(':00');
                        const accentColor = showSlotPicker === 'start' ? Colors.primary : Colors.success;
                        return (
                          <Pressable
                            key={slot}
                            style={[
                              styles.slotPickerItem,
                              isSelected && { backgroundColor: accentColor, borderColor: accentColor },
                              !isSelected && isHour && { borderColor: accentColor + '60', backgroundColor: accentColor + '10' },
                            ]}
                            onPress={() => handleSlotTap(slot)}
                          >
                            <Text style={[
                              styles.slotPickerItemText,
                              isSelected && { color: Colors.textInverse, fontWeight: '800' },
                              !isSelected && isHour && { color: accentColor, fontWeight: '700' },
                            ]}>{slot}</Text>
                            {isSelected && <MaterialIcons name="check" size={11} color={Colors.textInverse} />}
                          </Pressable>
                        );
                      })}
                    </View>
                  </ScrollView>
                </View>
              )}

              {!showSlotPicker && (
                <View style={styles.hoursVisualWrap}>
                  <View style={styles.hoursVisualRow}>
                    {TIME_SLOTS.filter(s => s.endsWith(':00')).map(s => {
                      const mins = toMins(s);
                      const isActive = mins >= toMins(currentDay.startTime) && mins < toMins(currentDay.endTime);
                      return (
                        <Pressable
                          key={s}
                          style={[
                            styles.hoursVisualBlock,
                            isActive ? { backgroundColor: Colors.primary + '30', borderColor: Colors.primary + '60' }
                              : { backgroundColor: Colors.surfaceElevated, borderColor: Colors.surfaceBorder },
                          ]}
                          onPress={() => setShowSlotPicker('start')}
                        >
                          <Text style={[styles.hoursVisualText, isActive && { color: Colors.primary, fontWeight: '600' }]}>{s.slice(0, 2)}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <View style={styles.hoursVisualLegend}>
                    <View style={styles.legendItem}><View style={[styles.legendSwatch, { backgroundColor: Colors.primary }]} /><Text style={styles.legendText}>Start: {currentDay.startTime}</Text></View>
                    <View style={styles.legendItem}><View style={[styles.legendSwatch, { backgroundColor: Colors.primary + '30', borderWidth: 1, borderColor: Colors.primary + '60' }]} /><Text style={styles.legendText}>Working hours</Text></View>
                    <View style={styles.legendItem}><View style={[styles.legendSwatch, { backgroundColor: Colors.success + '40', borderWidth: 1, borderColor: Colors.success }]} /><Text style={styles.legendText}>End: {currentDay.endTime}</Text></View>
                  </View>
                </View>
              )}
            </>
          )}

          {!currentDay.enabled && (
            <View style={styles.dayOffBanner}>
              <MaterialIcons name="weekend" size={28} color={Colors.textTertiary} />
              <Text style={styles.dayOffText}>No lessons on {selectedDay}</Text>
              <Text style={styles.dayOffHint}>Toggle the switch above to enable this day</Text>
            </View>
          )}
        </View>

        {/* Weekly Overview */}
        <Text style={styles.sectionLabel}>Weekly Overview</Text>
        <View style={styles.overviewCard}>
          {LESSON_DAYS.map(day => {
            const dayData = availability[day as keyof InstructorAvailability];
            const hours = dayData.enabled ? slotDurationHours(dayData.startTime, dayData.endTime) : 0;
            return (
              <Pressable key={day} style={[styles.overviewRow, selectedDay === day && styles.overviewRowActive]} onPress={() => { setSelectedDay(day); setShowSlotPicker(null); }}>
                <View style={[styles.overviewDayDot, { backgroundColor: dayData.enabled ? Colors.primary : Colors.surfaceBorder }]} />
                <Text style={[styles.overviewDay, !dayData.enabled && { color: Colors.textTertiary }]}>{day}</Text>
                {dayData.enabled ? (
                  <>
                    <Text style={styles.overviewTime}>{dayData.startTime} – {dayData.endTime}</Text>
                    <View style={styles.overviewHoursBadge}><Text style={styles.overviewHoursText}>{hours % 1 === 0 ? hours : hours.toFixed(2).replace(/0+$/, '')}h</Text></View>
                  </>
                ) : (
                  <Text style={styles.overviewOff}>Day off</Text>
                )}
                <MaterialIcons name="chevron-right" size={16} color={Colors.textTertiary} />
              </Pressable>
            );
          })}
        </View>

        {/* Home / Starting Location */}
        <Text style={styles.sectionLabel}>Home / Starting Location</Text>
        <View style={styles.homeCard}>
          <View style={styles.homeCardHeader}>
            <View style={[styles.cacheIconWrap, { backgroundColor: Colors.primary + '20' }]}><MaterialIcons name="home" size={20} color={Colors.primary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.bufferTitle}>Starting Address</Text>
              <Text style={styles.bufferDesc}>Your home or base location. The optimizer uses this as the route origin so drive time from home to the first lesson is included in the schedule.</Text>
            </View>
          </View>
          <View style={styles.homeInputRow}>
            <MaterialIcons name="location-on" size={18} color={Colors.textTertiary} style={{ marginTop: 2 }} />
            <TextInput
              ref={homeAddressRef}
              style={styles.homeInput}
              placeholder="e.g. 14 High Street, Cardiff, CF10 1AB"
              placeholderTextColor={Colors.textTertiary}
              value={localHomeAddress}
              onChangeText={v => { setLocalHomeAddress(v); setHasChanges(true); setVerifyCoords(null); setVerifyError(null); }}
              autoCapitalize="words"
              returnKeyType="done"
              onSubmitEditing={handleSave}
            />
            {localHomeAddress.length > 0 && (
              <Pressable onPress={() => { setLocalHomeAddress(''); setHasChanges(true); setVerifyCoords(null); setVerifyError(null); }} hitSlop={8}>
                <MaterialIcons name="close" size={18} color={Colors.textTertiary} />
              </Pressable>
            )}
          </View>
          <Pressable style={[styles.verifyBtn, (verifying || !localHomeAddress.trim()) && { opacity: 0.45 }]} onPress={handleVerifyLocation} disabled={verifying || !localHomeAddress.trim()}>
            {verifying ? <ActivityIndicator size="small" color={Colors.primary} /> : <MaterialIcons name="my-location" size={15} color={Colors.primary} />}
            <Text style={styles.verifyBtnText}>{verifying ? 'Locating...' : 'Verify Location'}</Text>
          </Pressable>
          {verifyCoords && (
            <View style={styles.verifySuccessRow}>
              <MaterialIcons name="check-circle" size={14} color={Colors.success} />
              <View style={{ flex: 1 }}>
                <Text style={styles.verifySuccessTitle}>Location resolved</Text>
                <Text style={styles.verifySuccessCoords}>{`Lat: ${verifyCoords.lat.toFixed(5)}  ·  Lng: ${verifyCoords.lng.toFixed(5)}`}</Text>
                <Text style={styles.verifySuccessHint}>The optimizer will route from this point to the first lesson of each day.</Text>
              </View>
            </View>
          )}
          {verifyError && (
            <View style={styles.verifyErrorRow}>
              <MaterialIcons name="error-outline" size={14} color={Colors.error} />
              <Text style={styles.verifyErrorText}>{verifyError}</Text>
            </View>
          )}
          {localHomeAddress.trim().length > 0 ? (
            <View style={styles.homeSetRow}><MaterialIcons name="check-circle" size={13} color={Colors.success} /><Text style={styles.homeSetText}>Starting location set — optimizer will calculate drive time from here to the first lesson.</Text></View>
          ) : (
            <View style={styles.homeUnsetRow}><MaterialIcons name="info-outline" size={13} color={Colors.warning} /><Text style={styles.homeUnsetText}>No starting location set. The optimizer will begin from the first pupil of the day.</Text></View>
          )}
        </View>

        {/* Buffer settings */}
        <Text style={styles.sectionLabel}>Travel Gap Between Lessons</Text>
        <View style={styles.bufferCard}>
          {/* Same Area */}
          <View style={styles.bufferInfo}>
            <MaterialIcons name="my-location" size={22} color={Colors.primary} />
            <View style={{ flex: 1 }}><Text style={styles.bufferTitle}>Same Area Gap</Text><Text style={styles.bufferDesc}>When two consecutive lessons share the same postcode prefix (e.g. CF44 → CF44) this gap is applied between them.</Text></View>
          </View>
          <View style={styles.bufferControls}>
            <Pressable style={[styles.bufferBtn, localSameZone <= 0 && { opacity: 0.35 }]} onPress={() => handleSameZoneChange(-5)} disabled={localSameZone <= 0}><MaterialIcons name="remove" size={20} color={Colors.primary} /></Pressable>
            <View style={styles.bufferValueWrap}><Text style={styles.bufferValue}>{localSameZone}</Text><Text style={styles.bufferUnit}>min</Text></View>
            <Pressable style={[styles.bufferBtn, localSameZone >= 60 && { opacity: 0.35 }]} onPress={() => handleSameZoneChange(5)} disabled={localSameZone >= 60}><MaterialIcons name="add" size={20} color={Colors.primary} /></Pressable>
          </View>
          <View style={styles.bufferPresets}>
            {[0, 5, 10, 15, 20, 30].map(v => (
              <Pressable key={v} style={[styles.bufferPreset, localSameZone === v && { backgroundColor: Colors.primary, borderColor: Colors.primary }]} onPress={() => { setLocalSameZone(v); setBufferChanged(true); setHasChanges(true); }}>
                <Text style={[styles.bufferPresetText, localSameZone === v && { color: Colors.textInverse }]}>{v === 0 ? 'None' : `${v}m`}</Text>
              </Pressable>
            ))}
          </View>
          {/* Different Area */}
          <View style={[styles.bufferInfo, { marginTop: Spacing.sm }]}>
            <MaterialIcons name="swap-horiz" size={22} color={Colors.warning} />
            <View style={{ flex: 1 }}><Text style={[styles.bufferTitle, { color: Colors.warning }]}>Different Area Gap</Text><Text style={styles.bufferDesc}>When two consecutive lessons have different postcode prefixes (e.g. CF44 → CF37) this longer gap is applied for travel.</Text></View>
          </View>
          <View style={styles.bufferControls}>
            <Pressable style={[styles.bufferBtn, localDiffZone <= 0 && { opacity: 0.35 }]} onPress={() => handleDiffZoneChange(-5)} disabled={localDiffZone <= 0}><MaterialIcons name="remove" size={20} color={Colors.warning} /></Pressable>
            <View style={styles.bufferValueWrap}><Text style={[styles.bufferValue, { color: Colors.warning }]}>{localDiffZone}</Text><Text style={styles.bufferUnit}>min</Text></View>
            <Pressable style={[styles.bufferBtn, localDiffZone >= 90 && { opacity: 0.35 }]} onPress={() => handleDiffZoneChange(5)} disabled={localDiffZone >= 90}><MaterialIcons name="add" size={20} color={Colors.warning} /></Pressable>
          </View>
          <View style={styles.bufferPresets}>
            {[0, 15, 20, 30, 45, 60].map(v => (
              <Pressable key={v} style={[styles.bufferPreset, localDiffZone === v && { backgroundColor: Colors.warning, borderColor: Colors.warning }]} onPress={() => { setLocalDiffZone(v); setBufferChanged(true); setHasChanges(true); }}>
                <Text style={[styles.bufferPresetText, localDiffZone === v && { color: Colors.textInverse }]}>{v === 0 ? 'Drive only' : `${v}m`}</Text>
              </Pressable>
            ))}
          </View>
          {/* Post-Drive */}
          <View style={[styles.bufferInfo, { marginTop: Spacing.sm }]}>
            <MaterialIcons name="access-time" size={22} color={Colors.success} />
            <View style={{ flex: 1 }}><Text style={[styles.bufferTitle, { color: Colors.success }]}>Post-Drive Buffer (Global Default)</Text><Text style={styles.bufferDesc}>Extra minutes held after arriving at a pupil — for setup, payment, or unexpected delays.</Text></View>
          </View>
          <View style={styles.bufferControls}>
            <Pressable style={[styles.bufferBtn, { borderColor: Colors.success }, localPostDrive <= 0 && { opacity: 0.35 }]} onPress={() => handlePostDriveChange(-5)} disabled={localPostDrive <= 0}><MaterialIcons name="remove" size={20} color={Colors.success} /></Pressable>
            <View style={styles.bufferValueWrap}><Text style={[styles.bufferValue, { color: Colors.success }]}>{localPostDrive}</Text><Text style={styles.bufferUnit}>min</Text></View>
            <Pressable style={[styles.bufferBtn, { borderColor: Colors.success }, localPostDrive >= 30 && { opacity: 0.35 }]} onPress={() => handlePostDriveChange(5)} disabled={localPostDrive >= 30}><MaterialIcons name="add" size={20} color={Colors.success} /></Pressable>
          </View>
          <View style={styles.bufferPresets}>
            {[0, 5, 10, 15, 20, 30].map(v => (
              <Pressable key={v} style={[styles.bufferPreset, localPostDrive === v && { backgroundColor: Colors.success, borderColor: Colors.success }]} onPress={() => { setLocalPostDrive(v); setBufferChanged(true); setHasChanges(true); }}>
                <Text style={[styles.bufferPresetText, localPostDrive === v && { color: Colors.textInverse }]}>{v === 0 ? 'None' : `${v}m`}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.bufferHintRow}>
            <MaterialIcons name="info-outline" size={13} color={Colors.textTertiary} />
            <Text style={styles.bufferHint}>Example: if drive is 12 min + 5 m post-drive buffer + 15 m same-area gap, the total gap becomes 32 min snapped to nearest 15 min = 45 min before next lesson.</Text>
          </View>
        </View>

        {/* ─── Per-Lesson Buffers ───────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>Per-Lesson Buffers</Text>
        <View style={lbStyles.card}>
          <View style={lbStyles.headerRow}>
            <View style={lbStyles.iconWrap}>
              <MaterialIcons name="timer" size={22} color={Colors.info} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={lbStyles.cardTitle}>Lesson Block Buffers</Text>
              <Text style={lbStyles.cardDesc}>
                Full block = [Buffer Before] + [Actual Lesson] + [Buffer After].{"\n"}
                Availability is checked against the lesson only. Travel to the next lesson starts after the block ends.
              </Text>
            </View>
            <Switch
              value={localLessonBuffersEnabled}
              onValueChange={v => { setLocalLessonBuffersEnabled(v); setHasChanges(true); }}
              trackColor={{ false: Colors.surfaceBorder, true: Colors.info + '60' }}
              thumbColor={localLessonBuffersEnabled ? Colors.info : Colors.textTertiary}
            />
          </View>

          {/* Buffer Before */}
          <View style={[lbStyles.fieldRow, !localLessonBuffersEnabled && { opacity: 0.4 }]}>
            <View style={[lbStyles.fieldIconWrap, { backgroundColor: Colors.primary + '18' }]}>
              <MaterialIcons name="skip-previous" size={18} color={Colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={lbStyles.fieldLabel}>Buffer Before Lesson</Text>
              <Text style={lbStyles.fieldDesc}>Reserved time before the lesson starts (instructor arrives, pupil walks out)</Text>
            </View>
            <View style={lbStyles.inputWrap}>
              <TextInput
                style={[lbStyles.input, lessonBufferBeforeError ? lbStyles.inputError : null]}
                value={String(localLessonBufferBefore)}
                onChangeText={v => handleLessonBufferChange(v, 'before')}
                keyboardType="number-pad"
                maxLength={2}
                editable={localLessonBuffersEnabled}
                selectTextOnFocus
              />
              <Text style={lbStyles.inputUnit}>min</Text>
            </View>
          </View>
          {lessonBufferBeforeError ? (
            <View style={lbStyles.errorRow}>
              <MaterialIcons name="error-outline" size={13} color={Colors.error} />
              <Text style={lbStyles.errorText}>{lessonBufferBeforeError}</Text>
            </View>
          ) : null}

          {/* Buffer After */}
          <View style={[lbStyles.fieldRow, !localLessonBuffersEnabled && { opacity: 0.4 }]}>
            <View style={[lbStyles.fieldIconWrap, { backgroundColor: Colors.success + '18' }]}>
              <MaterialIcons name="skip-next" size={18} color={Colors.success} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={lbStyles.fieldLabel}>Buffer After Lesson</Text>
              <Text style={lbStyles.fieldDesc}>Reserved time after the lesson ends before travel to the next pupil starts</Text>
            </View>
            <View style={lbStyles.inputWrap}>
              <TextInput
                style={[lbStyles.input, lessonBufferAfterError ? lbStyles.inputError : null]}
                value={String(localLessonBufferAfter)}
                onChangeText={v => handleLessonBufferChange(v, 'after')}
                keyboardType="number-pad"
                maxLength={2}
                editable={localLessonBuffersEnabled}
                selectTextOnFocus
              />
              <Text style={lbStyles.inputUnit}>min</Text>
            </View>
          </View>
          {lessonBufferAfterError ? (
            <View style={lbStyles.errorRow}>
              <MaterialIcons name="error-outline" size={13} color={Colors.error} />
              <Text style={lbStyles.errorText}>{lessonBufferAfterError}</Text>
            </View>
          ) : null}

          {/* Presets */}
          {localLessonBuffersEnabled && (
            <>
              <Text style={lbStyles.presetsLabel}>Quick presets</Text>
              <View style={lbStyles.presetsRow}>
                {([[0,0,'None'],[5,5,'5 min'],[10,10,'10 min'],[15,15,'15 min']] as const).map(([b, a, label]) => {
                  const isActive = localLessonBufferBefore === b && localLessonBufferAfter === a;
                  return (
                    <Pressable key={label}
                      style={[lbStyles.preset, isActive && { backgroundColor: Colors.info, borderColor: Colors.info }]}
                      onPress={() => { setLocalLessonBufferBefore(b); setLocalLessonBufferAfter(a); setLessonBufferBeforeError(null); setLessonBufferAfterError(null); setHasChanges(true); }}>
                      <Text style={[lbStyles.presetText, isActive && { color: '#fff' }]}>{label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}

          {/* Example block diagram */}
          {localLessonBuffersEnabled && (localLessonBufferBefore > 0 || localLessonBufferAfter > 0) && (
            <View style={lbStyles.blockDiagram}>
              <MaterialIcons name="info-outline" size={13} color={Colors.info} />
              <Text style={lbStyles.blockDiagramText}>
                Full block = {localLessonBufferBefore}m before + lesson + {localLessonBufferAfter}m after.{' '}
                For a {60}-min lesson: total block = {localLessonBufferBefore + 60 + localLessonBufferAfter} min.
              </Text>
            </View>
          )}
        </View>

        {/* Routing Cache */}
        <Text style={styles.sectionLabel}>Routing Cache</Text>
        <View style={styles.cacheCard}>
          <View style={styles.cacheHeaderRow}>
            <View style={[styles.cacheIconWrap, { backgroundColor: Colors.info + '20' }]}><MaterialIcons name="storage" size={20} color={Colors.info} /></View>
            <View style={{ flex: 1 }}><Text style={styles.cacheTitle}>Address Coordinate Cache</Text><Text style={styles.cacheDesc}>Geocoded addresses are stored locally so Smart Schedule skips Nominatim lookups on subsequent runs.</Text></View>
          </View>
          <View style={styles.cacheStatsRow}>
            <View style={styles.cacheStat}><View style={[styles.cacheStatDot, { backgroundColor: Colors.success }]} /><View><Text style={styles.cacheStatValue}>{cacheStats.addressCount}</Text><Text style={styles.cacheStatLabel}>Addresses</Text></View></View>
            <View style={styles.cacheStatDivider} />
            <View style={styles.cacheStat}><View style={[styles.cacheStatDot, { backgroundColor: Colors.primary }]} /><View><Text style={styles.cacheStatValue}>{cacheStats.postcodeCount}</Text><Text style={styles.cacheStatLabel}>Postcodes</Text></View></View>
            <View style={styles.cacheStatDivider} />
            <View style={[styles.cacheStat, { flex: 2 }]}><MaterialIcons name="update" size={13} color={Colors.textTertiary} /><View><Text style={styles.cacheStatValue}>{formatCacheDate(cacheStats.lastUpdated)}</Text><Text style={styles.cacheStatLabel}>Last refreshed</Text></View></View>
          </View>
          <View style={styles.matrixRow}>
            <View style={[styles.cacheIconWrap, { backgroundColor: Colors.secondary + '20', width: 36, height: 36, borderRadius: 10 }]}><MaterialIcons name="grid-on" size={18} color={Colors.secondary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.matrixTitle}>Distance Matrix</Text>
              <Text style={styles.matrixDesc}>{matrixStats.matrixCount === 0 ? 'No matrices cached — run Smart Schedule to build' : `${matrixStats.matrixCount} set${matrixStats.matrixCount !== 1 ? 's' : ''} · ${matrixStats.pairCount} route pair${matrixStats.pairCount !== 1 ? 's' : ''}`}</Text>
            </View>
            <Pressable style={[styles.matrixClearBtn, (clearingMatrix || matrixStats.matrixCount === 0) && { opacity: 0.4 }]} onPress={handleClearMatrixOnly} disabled={clearingMatrix || matrixStats.matrixCount === 0}>
              {clearingMatrix ? <ActivityIndicator size="small" color={Colors.error} /> : <MaterialIcons name="delete-outline" size={15} color={Colors.error} />}
              <Text style={styles.matrixClearBtnText}>{clearingMatrix ? '...' : 'Clear'}</Text>
            </Pressable>
          </View>
          {cacheStats.addressCount === 0 && cacheStats.postcodeCount === 0 ? (
            <View style={styles.cacheEmptyRow}><MaterialIcons name="info-outline" size={14} color={Colors.warning} /><Text style={styles.cacheEmptyText}>No addresses cached yet — run Smart Schedule once to populate.</Text></View>
          ) : (
            <View style={styles.cacheHealthRow}><MaterialIcons name="check-circle" size={14} color={Colors.success} /><Text style={styles.cacheHealthText}>{cacheStats.addressCount + cacheStats.postcodeCount} location{cacheStats.addressCount + cacheStats.postcodeCount !== 1 ? 's' : ''} cached{matrixStats.pairCount > 0 ? ` · ${matrixStats.pairCount} route pairs` : ''} — Smart Schedule will start instantly.</Text></View>
          )}
          <View style={styles.cacheBtnRow}>
            <Pressable style={styles.cacheRefreshBtn} onPress={refreshCacheStats}><MaterialIcons name="refresh" size={15} color={Colors.info} /><Text style={styles.cacheRefreshBtnText}>Refresh Stats</Text></Pressable>
            <Pressable style={[styles.cacheClearBtn, (clearingCache || anyCacheEmpty) && { opacity: 0.45 }]} onPress={handleClearCache} disabled={clearingCache || anyCacheEmpty}>
              {clearingCache ? <ActivityIndicator size="small" color={Colors.textInverse} /> : <MaterialIcons name="delete-sweep" size={15} color={Colors.textInverse} />}
              <Text style={styles.cacheClearBtnText}>{clearingCache ? 'Clearing...' : 'Clear All'}</Text>
            </Pressable>
          </View>
          <View style={styles.cacheHintRow}><MaterialIcons name="info-outline" size={12} color={Colors.textTertiary} /><Text style={styles.cacheHint}>Addresses auto-invalidate when a pupil profile is updated. Clear matrix manually if pupil addresses have changed significantly to force a fresh OSRM re-fetch.</Text></View>
        </View>

        {/* ─── App Store Review Demo Data ───────────────────────────────── */}
        <Text style={styles.sectionLabel}>App Store Review Data</Text>
        <View style={demoStyles.card}>
          <View style={demoStyles.headerRow}>
            <View style={demoStyles.iconWrap}>
              <MaterialIcons name="people" size={22} color={INDIGO} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={demoStyles.cardTitle}>Demo Data for Reviewers</Text>
              <Text style={demoStyles.cardDesc}>
                Populate the app with 5 realistic demo pupils, 10 lessons across this week and next, and 3 sample messages — so Apple/Google reviewers see a fully working app immediately.
              </Text>
            </View>
          </View>

          {demoSeeded && (
            <View style={demoStyles.successRow}>
              <MaterialIcons name="check-circle" size={15} color={Colors.success} />
              <Text style={demoStyles.successText}>
                Demo data created — 5 pupils, 10 lessons, 3 messages. Reviewers can log in with any demo pupil email and PIN below.
              </Text>
            </View>
          )}

          {/* Credentials box */}
          <View style={demoStyles.credBox}>
            <View style={demoStyles.credRow}>
              <MaterialIcons name="school" size={13} color={GOLD} />
              <Text style={demoStyles.credLabel}>Instructor:</Text>
              <Text style={demoStyles.credMono}>reviewer@drivesmart-demo.com</Text>
            </View>
            <View style={demoStyles.credRow}>
              <MaterialIcons name="lock" size={13} color={GOLD} />
              <Text style={demoStyles.credLabel}>Password:</Text>
              <Text style={demoStyles.credMono}>DemoInstructor2025!</Text>
            </View>
            <View style={demoStyles.credDivider} />
            <Text style={demoStyles.credSectionLabel}>Pupil accounts (email + PIN):</Text>
            {DEMO_PUPILS.map(p => (
              <View key={p.name} style={demoStyles.credPupilRow}>
                <MaterialIcons name="person" size={11} color={Colors.textTertiary} />
                <Text style={demoStyles.credPupilName}>{p.name}</Text>
                <View style={demoStyles.pinBadge}>
                  <Text style={demoStyles.pinBadgeText}>{p.pin}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* Create button */}
          <Pressable
            style={[demoStyles.createBtn, (seedingDemo || !instructorId) && { opacity: 0.55 }]}
            onPress={handleCreateDemo}
            disabled={seedingDemo || !instructorId}
          >
            {seedingDemo
              ? <ActivityIndicator size="small" color="#fff" />
              : <MaterialIcons name="add-circle" size={18} color="#fff" />}
            <Text style={demoStyles.createBtnText}>
              {seedingDemo ? 'Creating Demo Data…' : 'Create Demo Data'}
            </Text>
          </Pressable>

          {/* Remove button */}
          <Pressable
            style={[demoStyles.removeBtn, (removingDemo || !instructorId) && { opacity: 0.45 }]}
            onPress={handleRemoveDemo}
            disabled={removingDemo || !instructorId}
          >
            {removingDemo
              ? <ActivityIndicator size="small" color={Colors.error} />
              : <MaterialIcons name="delete-outline" size={16} color={Colors.error} />}
            <Text style={demoStyles.removeBtnText}>
              {removingDemo ? 'Removing…' : 'Remove Demo Data'}
            </Text>
          </Pressable>

          <View style={demoStyles.infoRow}>
            <MaterialIcons name="info-outline" size={12} color={Colors.textTertiary} />
            <Text style={demoStyles.infoText}>
              Demo records use "demo_" prefixed IDs and @drivesmart-demo.com emails so they are easy to identify. Removing demo data does not affect your real pupils or lessons.
            </Text>
          </View>
        </View>

        {/* ─── App Updates ──────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>App Updates</Text>
        <View style={updStyles.card}>
          <View style={updStyles.headerRow}>
            <View style={updStyles.iconWrap}><MaterialIcons name="system-update" size={22} color={GOLD} /></View>
            <View style={{ flex: 1 }}>
              <Text style={updStyles.cardTitle}>Release Management</Text>
              <Text style={updStyles.cardDesc}>Publish a new version when you update the app. Pupils will see a "What's New" notification on next open.</Text>
            </View>
          </View>
          {latestVersion && (
            <View style={updStyles.currentBadge}>
              <MaterialIcons name="verified" size={14} color={GOLD} />
              <Text style={updStyles.currentText}>Current: v{latestVersion.version} — {latestVersion.title}</Text>
              <Text style={updStyles.currentDate}>{formatVersionDate(latestVersion.createdAt)}</Text>
            </View>
          )}
          <Pressable style={updStyles.publishBtn} onPress={() => setPublishModalVisible(true)}>
            <MaterialIcons name="publish" size={18} color={NAVY} />
            <Text style={updStyles.publishBtnText}>Publish New Update</Text>
          </Pressable>
          <View style={updStyles.historyHeader}>
            <Text style={updStyles.historyTitle}>Version History</Text>
            <Pressable onPress={loadVersions} hitSlop={8}>
              {versionsLoading ? <ActivityIndicator size="small" color={Colors.textTertiary} /> : <MaterialIcons name="refresh" size={16} color={Colors.textTertiary} />}
            </Pressable>
          </View>
          {versions.length === 0 && !versionsLoading && <Text style={updStyles.emptyHistory}>No versions published yet.</Text>}
          {versions.slice(0, 5).map((v, i) => (
            <View key={v.id} style={[updStyles.versionRow, i === 0 && updStyles.versionRowLatest]}>
              <View style={updStyles.versionBadge}><Text style={[updStyles.versionBadgeText, i === 0 && { color: GOLD }]}>v{v.version}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={updStyles.versionTitle}>{v.title}</Text>
                <Text style={updStyles.versionDesc} numberOfLines={2}>{v.description}</Text>
                <Text style={updStyles.versionDate}>{formatVersionDate(v.createdAt)}</Text>
              </View>
              {i === 0 && <View style={updStyles.latestChip}><Text style={updStyles.latestChipText}>LATEST</Text></View>}
            </View>
          ))}
          {versions.length > 5 && <Text style={updStyles.moreVersions}>+{versions.length - 5} earlier versions</Text>}
        </View>

        {/* ─── Schedule Efficiency Report ────────────────────────────────── */}
        {lastReport && (
          <>
            <Text style={styles.sectionLabel}>Last Schedule Report</Text>
            <ScheduleEfficiencyCard report={lastReport} />
          </>
        )}

        {/* ─── Traffic-Aware Scheduling ─────────────────────────────────── */}
        <Text style={styles.sectionLabel}>Traffic-Aware Scheduling</Text>
        <TrafficPrefsCard
          prefs={localTrafficPrefs}
          onUpdate={updateTrafficPref}
          onUpdateRushHour={updateRushHourWindow}
        />

        {hasChanges && (
          <Pressable style={styles.bottomSaveBtn} onPress={handleSave}>
            <MaterialIcons name="check-circle" size={20} color={Colors.textInverse} />
            <Text style={styles.bottomSaveBtnText}>Save Working Hours</Text>
          </Pressable>
        )}
      </ScrollView>

      {/* Publish Modal */}
      <Modal visible={publishModalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPublishModalVisible(false)}>
        <View style={[updStyles.modal, { paddingTop: 24 }]}>
          <View style={updStyles.modalHeader}>
            <Pressable onPress={() => setPublishModalVisible(false)} hitSlop={8}><MaterialIcons name="close" size={22} color={Colors.textPrimary} /></Pressable>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <MaterialIcons name="system-update" size={20} color={GOLD} />
              <Text style={updStyles.modalTitle}>Publish Update</Text>
            </View>
            <Pressable style={[updStyles.modalSendBtn, publishing && { opacity: 0.6 }]} onPress={handlePublish} disabled={publishing}>
              {publishing ? <ActivityIndicator size="small" color="#fff" /> : <MaterialIcons name="publish" size={16} color="#fff" />}
              <Text style={updStyles.modalSendBtnText}>{publishing ? 'Publishing…' : 'Publish'}</Text>
            </Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={updStyles.modalBody} keyboardShouldPersistTaps="handled">
            <Text style={updStyles.fieldLabel}>Version Bump</Text>
            <View style={updStyles.bumpRow}>
              {(['patch', 'minor', 'major'] as const).map(t => (
                <Pressable key={t} style={[updStyles.bumpBtn, bumpType === t && updStyles.bumpBtnActive]} onPress={() => setBumpType(t)}>
                  <Text style={[updStyles.bumpBtnText, bumpType === t && { color: '#fff' }]}>{t.charAt(0).toUpperCase() + t.slice(1)}</Text>
                  <Text style={[updStyles.bumpBtnSub, bumpType === t && { color: 'rgba(255,255,255,0.7)' }]}>{t === 'patch' ? 'Bug fixes' : t === 'minor' ? 'New features' : 'Major release'}</Text>
                </Pressable>
              ))}
            </View>
            <View style={updStyles.nextVersionPreview}>
              <MaterialIcons name="arrow-forward" size={14} color={GOLD} />
              <Text style={updStyles.nextVersionText}>Next version: <Text style={{ fontWeight: '800', color: GOLD }}>v{nextPreview}</Text>{latestVersion ? `  (current: v${latestVersion.version})` : ''}</Text>
            </View>
            <Text style={updStyles.fieldLabel}>Update Title</Text>
            <TextInput style={updStyles.input} value={publishTitle} onChangeText={setPublishTitle} placeholder="e.g. Bug fixes & speed improvements" placeholderTextColor={Colors.textTertiary} maxLength={120} />
            <Text style={updStyles.fieldLabel}>{"What's New (shown to pupils)"}</Text>
            <TextInput style={updStyles.textArea} value={publishDesc} onChangeText={setPublishDesc} placeholder={"Describe what changed:\n• Fixed map scrolling bug\n• Improved Compress My Day speed"} placeholderTextColor={Colors.textTertiary} multiline textAlignVertical="top" maxLength={1000} />
            <Text style={updStyles.charCount}>{publishDesc.length}/1000</Text>
            <View style={updStyles.infoBox}>
              <MaterialIcons name="info-outline" size={14} color={GOLD} />
              <Text style={updStyles.infoText}>Publishing creates a new version entry in the database. Pupils will see a "What's New" popup the next time they open the app.</Text>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: { alignItems: 'center', paddingHorizontal: Spacing.md, paddingBottom: Spacing.md, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  title: { fontSize: FontSize.xl, fontWeight: '800', color: '#FF6700', textAlign: 'center' },
  subtitle: { fontSize: FontSize.xs, color: '#64748B', marginTop: 4 },
  saveBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.primary, borderRadius: Radius.md, paddingHorizontal: 14, paddingVertical: 8, shadowColor: '#FF7A00', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.80, shadowRadius: 14, elevation: 10 },
  saveBtnText: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.textInverse },
  content: { paddingHorizontal: Spacing.md, gap: Spacing.md },
  summaryCard: { backgroundColor: '#FAFBFC', borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: '#E2E8F0', gap: Spacing.sm },
  summaryRow: { flexDirection: 'row', alignItems: 'center' },
  summaryItem: { flex: 1, alignItems: 'center', gap: 2 },
  summaryDivider: { width: 1, height: 32, backgroundColor: Colors.surfaceBorder },
  summaryValue: { fontSize: FontSize.lg, fontWeight: '700', color: '#FF6700' },
  summaryLabel: { fontSize: 10, color: '#94A3B8', textAlign: 'center' },
  summaryHint: { fontSize: FontSize.xs, color: Colors.textSecondary, textAlign: 'center', lineHeight: 18 },
  sectionLabel: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.8 },
  dayChips: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  dayChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.full, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.surfaceBorder, flexDirection: 'row', alignItems: 'center', gap: 5 },
  dayChipOff: { opacity: 0.5 },
  dayChipText: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: '600' },
  dayDot: { width: 6, height: 6, borderRadius: 3 },
  dayCard: { backgroundColor: LM_CARD, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: LM_BORDER, gap: Spacing.md, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  dayCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dayCardTitle: { fontSize: FontSize.md, fontWeight: '700', color: LM_TEXT },
  dayCardSub: { fontSize: FontSize.xs, color: LM_TEXT_SEC, marginTop: 2 },
  timePromptRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  timeChip: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: Colors.surfaceBorder },
  timeChipLabel: { fontSize: FontSize.xs, color: Colors.textTertiary },
  timeChipValue: { fontSize: FontSize.base, fontWeight: '700', color: Colors.textPrimary, marginLeft: 'auto' },
  slotPickerContainer: { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.surfaceBorder, overflow: 'hidden' },
  slotPickerHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.md, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder, backgroundColor: Colors.surface },
  slotPickerTitle: { fontSize: FontSize.sm, fontWeight: '700', flex: 1 },
  slotPickerHint: { fontSize: 10, color: Colors.textTertiary, fontStyle: 'italic' },
  slotPickerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, padding: Spacing.sm },
  slotPickerItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, width: '22%', height: 40, borderRadius: Radius.sm, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.surfaceBorder },
  slotPickerItemText: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: '600' },
  hoursVisualWrap: { gap: 8 },
  hoursVisualRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  hoursVisualBlock: { width: '14%', height: 36, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  hoursVisualText: { fontSize: 10, color: Colors.textTertiary, fontWeight: '500' },
  hoursVisualLegend: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  legend: { flexDirection: 'row', gap: 14, paddingTop: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendSwatch: { width: 14, height: 14, borderRadius: 3 },
  legendText: { fontSize: 10, color: Colors.textTertiary },
  dayOffBanner: { alignItems: 'center', paddingVertical: Spacing.lg, gap: 8 },
  dayOffText: { fontSize: FontSize.base, color: Colors.textSecondary, fontWeight: '600' },
  dayOffHint: { fontSize: FontSize.xs, color: Colors.textTertiary },
  overviewCard: { backgroundColor: LM_CARD, borderRadius: Radius.lg, borderWidth: 1, borderColor: LM_BORDER, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  overviewRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: Spacing.md, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: LM_BORDER },
  overviewRowActive: { backgroundColor: Colors.primary + '10' },
  overviewDayDot: { width: 8, height: 8, borderRadius: 4 },
  overviewDay: { width: 90, fontSize: FontSize.sm, fontWeight: '600', color: LM_TEXT },
  overviewTime: { flex: 1, fontSize: FontSize.xs, color: LM_TEXT_SEC },
  overviewHoursBadge: { backgroundColor: Colors.primary + '20', borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  overviewHoursText: { fontSize: 10, fontWeight: '700', color: Colors.primary },
  overviewOff: { flex: 1, fontSize: FontSize.xs, color: Colors.textTertiary, fontStyle: 'italic' },
  profileBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FAFBFC', borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: '#E2E8F0' },
  profileBannerIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#00C4FF18', alignItems: 'center', justifyContent: 'center' },
  profileBannerTitle: { fontSize: FontSize.base, fontWeight: '700', color: '#0F172A' },
  profileBannerSub: { fontSize: FontSize.xs, color: '#64748B' },
  themeToggleTrack: { width: 44, height: 24, borderRadius: 12, borderWidth: 0, justifyContent: 'center', paddingHorizontal: 2 },
  themeToggleThumb: { width: 18, height: 18, borderRadius: 9 },
  subBanner: { borderColor: '#FF670055', shadowColor: '#FF6700', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.20, shadowRadius: 8, elevation: 4 },
  subBannerIcon: { backgroundColor: '#FF670018', borderWidth: 1, borderColor: '#FF670040' },
  subActiveBadge: { backgroundColor: '#22C55E20', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: '#22C55E50' },
  subActiveBadgeText: { fontSize: 9, fontWeight: '800', color: '#22C55E', letterSpacing: 0.6 },
  bottomSaveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingVertical: 16, marginTop: 4, shadowColor: '#FF7A00', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.85, shadowRadius: 18, elevation: 14 },
  bottomSaveBtnText: { fontSize: FontSize.base, fontWeight: '700', color: Colors.textInverse },
  bufferCard: { backgroundColor: LM_CARD, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: LM_BORDER, gap: Spacing.md, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  bufferInfo: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  bufferTitle: { fontSize: FontSize.base, fontWeight: '700', color: LM_TEXT, marginBottom: 2 },
  bufferDesc: { fontSize: FontSize.xs, color: LM_TEXT_SEC, lineHeight: 18, flex: 1 },
  bufferControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20, backgroundColor: LM_SURFACE, borderRadius: Radius.md, paddingVertical: 12, borderWidth: 1, borderColor: LM_BORDER },
  bufferBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.primary },
  bufferValueWrap: { alignItems: 'center', minWidth: 60 },
  bufferValue: { fontSize: FontSize.xxxl, fontWeight: '700', color: Colors.primary },
  bufferUnit: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: '600' },
  bufferPresets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bufferPreset: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: Radius.full, backgroundColor: LM_ELEVATED, borderWidth: 1, borderColor: LM_BORDER },
  bufferPresetText: { fontSize: FontSize.xs, fontWeight: '700', color: LM_TEXT_SEC },
  bufferHintRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  bufferHint: { flex: 1, fontSize: 10, color: Colors.textTertiary, lineHeight: 16 },
  cacheCard: { backgroundColor: LM_CARD, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: LM_BORDER, gap: Spacing.md, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  cacheHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  cacheIconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cacheTitle: { fontSize: FontSize.base, fontWeight: '700', color: LM_TEXT, marginBottom: 2 },
  cacheDesc: { fontSize: FontSize.xs, color: LM_TEXT_SEC, lineHeight: 18, flex: 1 },
  cacheStatsRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: LM_SURFACE, borderRadius: Radius.md, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md, borderWidth: 1, borderColor: LM_BORDER },
  cacheStat: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  cacheStatDot: { width: 8, height: 8, borderRadius: 4 },
  cacheStatValue: { fontSize: FontSize.sm, fontWeight: '700', color: LM_TEXT },
  cacheStatLabel: { fontSize: 10, color: LM_TEXT_DIM },
  cacheStatDivider: { width: 1, height: 32, backgroundColor: LM_BORDER, marginHorizontal: 8 },
  matrixRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: LM_SURFACE, borderRadius: Radius.md, paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: LM_BORDER },
  matrixTitle: { fontSize: FontSize.sm, fontWeight: '700', color: LM_TEXT },
  matrixDesc: { fontSize: 10, color: Colors.textSecondary, marginTop: 2, lineHeight: 15 },
  matrixClearBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.error + '12', borderRadius: Radius.sm, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: Colors.error + '40' },
  matrixClearBtnText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.error },
  cacheEmptyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.warning + '12', borderRadius: Radius.sm, padding: 10, borderWidth: 1, borderColor: Colors.warning + '30' },
  cacheEmptyText: { flex: 1, fontSize: FontSize.xs, color: Colors.warning, lineHeight: 17 },
  cacheHealthRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.success + '12', borderRadius: Radius.sm, padding: 10, borderWidth: 1, borderColor: Colors.success + '30' },
  cacheHealthText: { flex: 1, fontSize: FontSize.xs, color: Colors.success, lineHeight: 17 },
  cacheBtnRow: { flexDirection: 'row', gap: 8 },
  cacheRefreshBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Colors.info + '15', borderRadius: Radius.md, paddingVertical: 10, borderWidth: 1, borderColor: Colors.info + '40' },
  cacheRefreshBtnText: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.info },
  cacheClearBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Colors.error, borderRadius: Radius.md, paddingVertical: 10 },
  cacheClearBtnText: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.textInverse },
  cacheHintRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  cacheHint: { flex: 1, fontSize: 10, color: Colors.textTertiary, lineHeight: 16 },
  homeCard: { backgroundColor: LM_CARD, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: LM_BORDER, gap: Spacing.md, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  homeCardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  homeInputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: LM_SURFACE, borderRadius: Radius.md, borderWidth: 1, borderColor: LM_BORDER, paddingHorizontal: Spacing.md, paddingVertical: 10, minHeight: 48 },
  homeInput: { flex: 1, color: LM_TEXT, fontSize: FontSize.base, paddingVertical: 0 },
  homeSetRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: Colors.success + '12', borderRadius: Radius.sm, padding: 10, borderWidth: 1, borderColor: Colors.success + '30' },
  homeSetText: { flex: 1, fontSize: FontSize.xs, color: Colors.success, lineHeight: 17 },
  homeUnsetRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: Colors.warning + '12', borderRadius: Radius.sm, padding: 10, borderWidth: 1, borderColor: Colors.warning + '30' },
  homeUnsetText: { flex: 1, fontSize: FontSize.xs, color: Colors.warning, lineHeight: 17 },
  verifyBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: Colors.primary + '15', borderRadius: Radius.md, paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: Colors.primary + '45', alignSelf: 'flex-start', shadowColor: '#FF7A00', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.55, shadowRadius: 10, elevation: 6 },
  verifyBtnText: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.primary },
  verifySuccessRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: Colors.success + '12', borderRadius: Radius.sm, padding: 10, borderWidth: 1, borderColor: Colors.success + '35' },
  verifySuccessTitle: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.success },
  verifySuccessCoords: { fontSize: FontSize.xs, color: Colors.textPrimary, fontWeight: '600', marginTop: 2 },
  verifySuccessHint: { fontSize: 10, color: Colors.textSecondary, marginTop: 3, lineHeight: 15 },
  verifyErrorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: Colors.error + '10', borderRadius: Radius.sm, padding: 10, borderWidth: 1, borderColor: Colors.error + '35' },
  verifyErrorText: { flex: 1, fontSize: FontSize.xs, color: Colors.error, lineHeight: 17 },
});

// ── Lesson Buffer styles ──────────────────────────────────────────────────────

const lbStyles = StyleSheet.create({
  card: {
    backgroundColor: LM_CARD, borderRadius: Radius.lg,
    padding: Spacing.md, borderWidth: 1, borderColor: LM_BORDER,
    gap: Spacing.md,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  iconWrap: { width: 44, height: 44, borderRadius: 12, backgroundColor: Colors.info + '15', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.info + '30' },
  cardTitle: { fontSize: FontSize.base, fontWeight: '700', color: LM_TEXT, marginBottom: 2 },
  cardDesc: { fontSize: FontSize.xs, color: LM_TEXT_SEC, lineHeight: 18, flex: 1 },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: LM_SURFACE, borderRadius: Radius.md, padding: 12, borderWidth: 1, borderColor: LM_BORDER },
  fieldIconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  fieldLabel: { fontSize: FontSize.sm, fontWeight: '700', color: LM_TEXT, marginBottom: 2 },
  fieldDesc: { fontSize: FontSize.xs, color: LM_TEXT_SEC, lineHeight: 16 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  input: {
    width: 52, height: 40, textAlign: 'center', fontSize: FontSize.lg, fontWeight: '700',
    color: LM_TEXT, backgroundColor: LM_SURFACE, borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: LM_BORDER, paddingHorizontal: 4,
  },
  inputError: { borderColor: Colors.error },
  inputUnit: { fontSize: FontSize.xs, color: LM_TEXT_SEC, fontWeight: '600' },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.error + '10', borderRadius: Radius.sm, padding: 8, borderWidth: 1, borderColor: Colors.error + '35' },
  errorText: { flex: 1, fontSize: FontSize.xs, color: Colors.error, fontWeight: '600' },
  presetsLabel: { fontSize: FontSize.xs, fontWeight: '700', color: LM_TEXT_DIM, textTransform: 'uppercase', letterSpacing: 0.7 },
  presetsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  preset: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.full, backgroundColor: LM_ELEVATED, borderWidth: 1, borderColor: LM_BORDER },
  presetText: { fontSize: FontSize.xs, fontWeight: '700', color: LM_TEXT_SEC },
  blockDiagram: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: Colors.info + '10', borderRadius: Radius.md, padding: Spacing.sm, borderWidth: 1, borderColor: Colors.info + '35' },
  blockDiagramText: { flex: 1, fontSize: FontSize.xs, color: LM_TEXT_SEC, lineHeight: 17 },
});

// ── Demo Data styles ──────────────────────────────────────────────────────────

// ─── Traffic Preferences Card ─────────────────────────────────────────────────

const TRAFFIC_MODELS: Array<{ key: TrafficModel; label: string; desc: string }> = [
  { key: 'best_guess',  label: 'Best Guess',  desc: 'Typical conditions for day & time' },
  { key: 'pessimistic', label: 'Pessimistic',  desc: 'Worst-case traffic conditions' },
  { key: 'optimistic',  label: 'Optimistic',   desc: 'Lighter than usual conditions' },
];

const SCHEDULE_MODES: Array<{ key: ScheduleMode; label: string; icon: string; desc: string }> = [
  { key: 'traffic_optimised', label: 'Traffic Optimised', icon: 'directions-car', desc: 'Avoid congestion — slightly longer day, less stress' },
  { key: 'fastest',           label: 'Fastest Schedule',  icon: 'flash-on',        desc: 'Pack lessons as tight as possible, ignore traffic' },
];

// ─── Schedule Efficiency Card ─────────────────────────────────────────────────

function ScheduleEfficiencyCard({ report }: { report: WeeklyEfficiencyReport }) {
  const scoreColor = efficiencyColor(report.efficiencyScore);
  const scoreLabel = efficiencyLabel(report.efficiencyScore);

  return (
    <View style={seStyles.card}>
      {/* Header */}
      <View style={seStyles.headerRow}>
        <View style={[seStyles.iconWrap, { backgroundColor: scoreColor + '18' }]}>
          <MaterialIcons name="speed" size={22} color={scoreColor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={seStyles.title}>Schedule Efficiency</Text>
          <Text style={seStyles.subtitle}>{report.priorityMode.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())} mode · {report.usedGoogleMaps ? 'Google Maps' : 'Estimated'}</Text>
        </View>
        <View style={[seStyles.scoreBadge, { backgroundColor: scoreColor }]}>
          <Text style={seStyles.scoreNum}>{report.efficiencyScore}</Text>
          <Text style={seStyles.scoreLabel}>{scoreLabel}</Text>
        </View>
      </View>

      {/* Delta */}
      {report.deltaVsPreviousPct !== null && (
        <View style={[seStyles.deltaRow, {
          backgroundColor: report.deltaVsPreviousPct <= 0 ? Colors.success + '12' : Colors.error + '10',
          borderColor:     report.deltaVsPreviousPct <= 0 ? Colors.success + '45' : Colors.error + '35',
        }]}>
          <MaterialIcons
            name={report.deltaVsPreviousPct <= 0 ? 'trending-down' : 'trending-up'}
            size={16}
            color={report.deltaVsPreviousPct <= 0 ? Colors.success : Colors.error}
          />
          <Text style={[seStyles.deltaText, {
            color: report.deltaVsPreviousPct <= 0 ? Colors.success : Colors.error,
          }]}>
            {Math.abs(report.deltaVsPreviousPct)}% {report.deltaVsPreviousPct <= 0 ? 'less' : 'more'} driving vs last week
          </Text>
        </View>
      )}

      {/* Stats grid */}
      <View style={seStyles.statsGrid}>
        <StatCell icon="directions-car" value={formatSecs(report.totalDriveSecs)} label="Total Drive" color="#00C4FF" />
        <StatCell icon="schedule" value={formatSecs(report.totalDelaySecs)} label="Traffic Delay" color={Colors.warning} />
        <StatCell icon="route" value={formatMiles(report.totalDistanceMeters)} label="Distance" color={Colors.success} />
        <StatCell icon="local-gas-station" value={`£${report.totalFuelGBP.toFixed(2)}`} label="Fuel Est." color="#FF6700" />
        <StatCell icon="school" value={String(report.totalLessons)} label="Lessons" color={Colors.primary} />
        <StatCell
          icon="traffic"
          value={severityLabel(report.worstSeverity)}
          label="Worst Traffic"
          color={severityColor(report.worstSeverity)}
        />
      </View>

      {/* Warnings */}
      {report.warnings.map((w, i) => (
        <View key={i} style={[seStyles.warningRow, {
          backgroundColor: w.severity === 'error' ? Colors.error + '10' : w.severity === 'warning' ? Colors.warning + '10' : Colors.info + '10',
          borderColor:     w.severity === 'error' ? Colors.error + '35' : w.severity === 'warning' ? Colors.warning + '35' : Colors.info + '35',
        }]}>
          <MaterialIcons
            name={w.severity === 'error' ? 'error-outline' : w.severity === 'warning' ? 'warning' : 'info-outline'}
            size={13}
            color={w.severity === 'error' ? Colors.error : w.severity === 'warning' ? Colors.warning : Colors.info}
          />
          <Text style={[seStyles.warningText, {
            color: w.severity === 'error' ? Colors.error : w.severity === 'warning' ? Colors.warning : Colors.info,
          }]}>{w.message}</Text>
        </View>
      ))}
    </View>
  );
}

function StatCell({ icon, value, label, color }: { icon: any; value: string; label: string; color: string }) {
  return (
    <View style={seStyles.statCell}>
      <MaterialIcons name={icon} size={16} color={color} />
      <Text style={[seStyles.statValue, { color }]}>{value}</Text>
      <Text style={seStyles.statLabel}>{label}</Text>
    </View>
  );
}

const seStyles = StyleSheet.create({
  card: {
    backgroundColor: LM_CARD, borderRadius: Radius.lg,
    padding: Spacing.md, borderWidth: 1, borderColor: LM_BORDER,
    gap: Spacing.md,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  iconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  title:    { fontSize: FontSize.base, fontWeight: '700', color: LM_TEXT },
  subtitle: { fontSize: FontSize.xs, color: LM_TEXT_SEC, marginTop: 2 },
  scoreBadge: { borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 6, alignItems: 'center', gap: 2 },
  scoreNum:   { fontSize: FontSize.lg, fontWeight: '800', color: '#fff' },
  scoreLabel: { fontSize: 9, fontWeight: '700', color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase', letterSpacing: 0.5 },
  deltaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: Radius.md, padding: 10, borderWidth: 1 },
  deltaText: { flex: 1, fontSize: FontSize.sm, fontWeight: '700' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statCell: { flex: 1, minWidth: '30%', alignItems: 'center', gap: 4, backgroundColor: LM_SURFACE, borderRadius: Radius.md, padding: 10, borderWidth: 1, borderColor: LM_BORDER },
  statValue: { fontSize: FontSize.sm, fontWeight: '800' },
  statLabel: { fontSize: 9, color: LM_TEXT_DIM, textAlign: 'center' },
  warningRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: Radius.sm, padding: 10, borderWidth: 1 },
  warningText: { flex: 1, fontSize: FontSize.xs, lineHeight: 17 },
});

function TrafficPrefsCard({
  prefs,
  onUpdate,
  onUpdateRushHour,
}: {
  prefs: TrafficPrefs;
  onUpdate: <K extends keyof TrafficPrefs>(key: K, value: TrafficPrefs[K]) => void;
  onUpdateRushHour: (idx: number, patch: Partial<RushHourWindow>) => void;
}) {
  const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => i);
  const MAX_DELAY_STEPS = [5, 10, 15, 20, 30, 45, 60];
  const PRIORITY_ENTRIES = Object.entries(SCHEDULE_PRIORITY_LABELS) as Array<[SchedulePriority, typeof SCHEDULE_PRIORITY_LABELS[SchedulePriority]]>;

  return (
    <View style={tcStyles.card}>
      {/* Header */}
      <View style={tcStyles.headerRow}>
        <View style={tcStyles.iconWrap}>
          <MaterialIcons name="traffic" size={22} color="#00C4FF" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={tcStyles.title}>Traffic-Aware Scheduling</Text>
          <Text style={tcStyles.desc}>Smart Schedule uses live Google Maps traffic data to pick slots that avoid congestion and realistic drive times.</Text>
        </View>
      </View>

      {/* Scheduling priority (now 3-mode: balanced / min_distance / min_traffic) */}
      <Text style={tcStyles.sectionLabel}>Scheduling Priority</Text>
      <View style={tcStyles.modeRow}>
        {PRIORITY_ENTRIES.map(([key, meta]) => (
          <Pressable
            key={key}
            style={[tcStyles.modeBtn, prefs.schedulePriority === key && tcStyles.modeBtnActive]}
            onPress={() => onUpdate('schedulePriority', key)}
          >
            <MaterialIcons name={meta.icon as any} size={18} color={prefs.schedulePriority === key ? '#FFFFFF' : Colors.textSecondary} />
            <Text style={[tcStyles.modeBtnLabel, prefs.schedulePriority === key && { color: '#FFFFFF' }]}>{meta.label}</Text>
            <Text style={[tcStyles.modeBtnDesc, prefs.schedulePriority === key && { color: 'rgba(255,255,255,0.75)' }]}>{meta.desc}</Text>
          </Pressable>
        ))}
      </View>

      {/* Traffic model */}
      <Text style={tcStyles.sectionLabel}>Traffic Model</Text>
      <View style={tcStyles.chipRow}>
        {TRAFFIC_MODELS.map(t => (
          <Pressable
            key={t.key}
            style={[tcStyles.chip, prefs.trafficModel === t.key && tcStyles.chipActive]}
            onPress={() => onUpdate('trafficModel', t.key)}
          >
            <Text style={[tcStyles.chipText, prefs.trafficModel === t.key && tcStyles.chipTextActive]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={tcStyles.chipHint}>
        {TRAFFIC_MODELS.find(t => t.key === prefs.trafficModel)?.desc ?? ''}
      </Text>

      {/* Max delay tolerance */}
      <Text style={tcStyles.sectionLabel}>Maximum Acceptable Delay</Text>
      <View style={tcStyles.delayRow}>
        {MAX_DELAY_STEPS.map(v => (
          <Pressable
            key={v}
            style={[tcStyles.delayChip, prefs.maxDelayMins === v && tcStyles.delayChipActive]}
            onPress={() => onUpdate('maxDelayMins', v)}
          >
            <Text style={[tcStyles.delayChipText, prefs.maxDelayMins === v && tcStyles.delayChipTextActive]}>{v}m</Text>
          </Pressable>
        ))}
      </View>
      <Text style={tcStyles.chipHint}>Slots where traffic adds more than this will be rejected or flagged.</Text>

      {/* Avoid rush hours toggle */}
      <View style={tcStyles.toggleRow}>
        <MaterialIcons name="do-not-disturb" size={20} color={Colors.warning} />
        <View style={{ flex: 1 }}>
          <Text style={tcStyles.toggleLabel}>Avoid Rush Hours</Text>
          <Text style={tcStyles.toggleDesc}>Skip lesson slots that start during configured rush-hour windows</Text>
        </View>
        <Switch
          value={prefs.avoidRushHours}
          onValueChange={v => onUpdate('avoidRushHours', v)}
          trackColor={{ false: Colors.surfaceBorder, true: Colors.warning + '60' }}
          thumbColor={prefs.avoidRushHours ? Colors.warning : Colors.textTertiary}
        />
      </View>

      {/* Rush hour windows */}
      {prefs.avoidRushHours && (
        <View style={tcStyles.rushSection}>
          <Text style={tcStyles.rushSectionLabel}>Rush Hour Windows</Text>
          {prefs.rushHourWindows.map((w, idx) => (
            <View key={idx} style={tcStyles.rushRow}>
              <View style={tcStyles.rushLabelWrap}>
                <MaterialIcons name="schedule" size={14} color={Colors.warning} />
                <Text style={tcStyles.rushLabel}>{w.label}</Text>
              </View>
              <View style={tcStyles.rushTimeRow}>
                <Text style={tcStyles.rushTimeFrom}>From</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxWidth: 80 }}>
                  <View style={{ flexDirection: 'row', gap: 4 }}>
                    {HOUR_OPTIONS.filter(h => h >= 5 && h <= 22).map(h => (
                      <Pressable
                        key={h}
                        style={[tcStyles.hourChip, w.startHH === h && tcStyles.hourChipActive]}
                        onPress={() => onUpdateRushHour(idx, { startHH: h })}
                      >
                        <Text style={[tcStyles.hourChipText, w.startHH === h && { color: '#fff' }]}>{String(h).padStart(2,'0')}</Text>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
                <Text style={tcStyles.rushTimeSep}>→</Text>
                <Text style={tcStyles.rushTimeFrom}>To</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxWidth: 80 }}>
                  <View style={{ flexDirection: 'row', gap: 4 }}>
                    {HOUR_OPTIONS.filter(h => h >= 5 && h <= 23).map(h => (
                      <Pressable
                        key={h}
                        style={[tcStyles.hourChip, w.endHH === h && tcStyles.hourChipActive]}
                        onPress={() => onUpdateRushHour(idx, { endHH: h })}
                      >
                        <Text style={[tcStyles.hourChipText, w.endHH === h && { color: '#fff' }]}>{String(h).padStart(2,'0')}</Text>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
              </View>
            </View>
          ))}
          <Pressable
            style={tcStyles.resetRushBtn}
            onPress={() => onUpdate('rushHourWindows', [...DEFAULT_RUSH_HOURS])}
          >
            <MaterialIcons name="refresh" size={14} color={Colors.textTertiary} />
            <Text style={tcStyles.resetRushBtnText}>Reset to defaults</Text>
          </Pressable>
        </View>
      )}

      {/* Show traffic in diary */}
      <View style={tcStyles.toggleRow}>
        <MaterialIcons name="visibility" size={20} color={Colors.info} />
        <View style={{ flex: 1 }}>
          <Text style={tcStyles.toggleLabel}>Show Traffic in Diary</Text>
          <Text style={tcStyles.toggleDesc}>Display colour-coded traffic severity badges on diary travel cards</Text>
        </View>
        <Switch
          value={prefs.showTrafficInDiary}
          onValueChange={v => onUpdate('showTrafficInDiary', v)}
          trackColor={{ false: Colors.surfaceBorder, true: Colors.info + '60' }}
          thumbColor={prefs.showTrafficInDiary ? Colors.info : Colors.textTertiary}
        />
      </View>

      {/* Info */}
      <View style={tcStyles.infoBox}>
        <MaterialIcons name="info-outline" size={13} color={Colors.info} />
        <Text style={tcStyles.infoText}>
          Traffic data is fetched from Google Maps when Smart Schedule runs or when you pull-to-refresh the diary.
          Green = clear road · Amber = moderate congestion · Red = heavy traffic.
        </Text>
      </View>
    </View>
  );
}

const tcStyles = StyleSheet.create({
  card: {
    backgroundColor: LM_CARD, borderRadius: Radius.lg,
    padding: Spacing.md, borderWidth: 1, borderColor: LM_BORDER,
    gap: Spacing.md,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  iconWrap: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: '#00C4FF12', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#00C4FF30',
  },
  title: { fontSize: FontSize.base, fontWeight: '700', color: LM_TEXT, marginBottom: 2 },
  desc: { fontSize: FontSize.xs, color: LM_TEXT_SEC, lineHeight: 18, flex: 1 },
  sectionLabel: {
    fontSize: FontSize.xs, fontWeight: '700', color: LM_TEXT_DIM,
    textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: -4,
  },
  // Schedule mode
  modeRow: { flexDirection: 'row', gap: 8 },
  modeBtn: {
    flex: 1, borderRadius: Radius.md, padding: 10, gap: 4,
    backgroundColor: LM_SURFACE, borderWidth: 1.5, borderColor: LM_BORDER,
  },
  modeBtnActive: { backgroundColor: '#FF6700', borderColor: '#E05500' },
  modeBtnLabel: { fontSize: FontSize.xs, fontWeight: '700', color: LM_TEXT },
  modeBtnDesc: { fontSize: 9, color: LM_TEXT_DIM, lineHeight: 13 },
  // Model chips
  chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radius.full,
    backgroundColor: LM_ELEVATED, borderWidth: 1, borderColor: LM_BORDER,
  },
  chipActive: { backgroundColor: '#00C4FF', borderColor: '#00C4FF' },
  chipText: { fontSize: FontSize.xs, fontWeight: '600', color: LM_TEXT_SEC },
  chipTextActive: { color: '#FFFFFF' },
  chipHint: { fontSize: 10, color: LM_TEXT_DIM, lineHeight: 15, marginTop: -8 },
  // Delay chips
  delayRow: { flexDirection: 'row', gap: 7, flexWrap: 'wrap' },
  delayChip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radius.full,
    backgroundColor: LM_ELEVATED, borderWidth: 1, borderColor: LM_BORDER,
  },
  delayChipActive: { backgroundColor: Colors.warning, borderColor: Colors.warning },
  delayChipText: { fontSize: FontSize.xs, fontWeight: '600', color: LM_TEXT_SEC },
  delayChipTextActive: { color: '#FFFFFF' },
  // Toggle row
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: LM_SURFACE, borderRadius: Radius.md,
    paddingHorizontal: 12, paddingVertical: 12,
    borderWidth: 1, borderColor: LM_BORDER,
  },
  toggleLabel: { fontSize: FontSize.sm, fontWeight: '700', color: LM_TEXT, marginBottom: 2 },
  toggleDesc: { fontSize: FontSize.xs, color: LM_TEXT_SEC, lineHeight: 16, flex: 1 },
  // Rush hours
  rushSection: { gap: 10, backgroundColor: Colors.warning + '08', borderRadius: Radius.md, padding: 12, borderWidth: 1, borderColor: Colors.warning + '30' },
  rushSectionLabel: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.warning, textTransform: 'uppercase', letterSpacing: 0.7 },
  rushRow: { gap: 6 },
  rushLabelWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rushLabel: { fontSize: FontSize.xs, fontWeight: '700', color: LM_TEXT },
  rushTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  rushTimeFrom: { fontSize: FontSize.xs, color: LM_TEXT_DIM, fontWeight: '600' },
  rushTimeSep: { fontSize: FontSize.sm, color: Colors.warning, fontWeight: '700' },
  hourChip: {
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.sm,
    backgroundColor: LM_SURFACE, borderWidth: 1, borderColor: LM_BORDER,
  },
  hourChipActive: { backgroundColor: Colors.warning, borderColor: Colors.warning },
  hourChipText: { fontSize: 10, fontWeight: '700', color: LM_TEXT_SEC },
  resetRushBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-end',
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.md,
    backgroundColor: LM_ELEVATED, borderWidth: 1, borderColor: LM_BORDER,
  },
  resetRushBtnText: { fontSize: FontSize.xs, color: LM_TEXT_DIM, fontWeight: '600' },
  // Info box
  infoBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#00C4FF08', borderRadius: Radius.md,
    padding: Spacing.sm, borderWidth: 1, borderColor: '#00C4FF25',
  },
  infoText: { flex: 1, fontSize: FontSize.xs, color: LM_TEXT_SEC, lineHeight: 17 },
});

const demoStyles = StyleSheet.create({
  card: { backgroundColor: LM_CARD, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: LM_BORDER, gap: Spacing.md, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  iconWrap: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#FF670015', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#FF670030' },
  cardTitle: { fontSize: FontSize.base, fontWeight: '700', color: LM_TEXT, marginBottom: 2 },
  cardDesc: { fontSize: FontSize.xs, color: LM_TEXT_SEC, lineHeight: 18, flex: 1 },
  successRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: Colors.success + '12', borderRadius: Radius.md, padding: 10, borderWidth: 1, borderColor: Colors.success + '35' },
  successText: { flex: 1, fontSize: FontSize.xs, color: Colors.success, lineHeight: 17 },
  credBox: { backgroundColor: LM_SURFACE, borderRadius: Radius.md, padding: 12, borderWidth: 1, borderColor: LM_BORDER, gap: 7 },
  credRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  credDivider: { height: 1, backgroundColor: LM_BORDER, marginVertical: 2 },
  credLabel: { fontSize: FontSize.xs, fontWeight: '700', color: LM_TEXT_SEC, width: 72 },
  credMono: { fontSize: FontSize.xs, color: LM_TEXT, flex: 1 },
  credSectionLabel: { fontSize: 10, fontWeight: '700', color: LM_TEXT_DIM, textTransform: 'uppercase', letterSpacing: 0.5 },
  credPupilRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  credPupilName: { fontSize: FontSize.xs, fontWeight: '600', color: LM_TEXT, flex: 1 },
  pinBadge: { backgroundColor: '#FF670015', borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: '#FF670040' },
  pinBadgeText: { fontSize: FontSize.xs, fontWeight: '800', color: '#FF6700' },
  createBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#FF6700', borderRadius: Radius.lg, paddingVertical: 14, shadowColor: '#FF6700', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.30, shadowRadius: 10, elevation: 6 },
  createBtnText: { fontSize: FontSize.base, fontWeight: '800', color: '#fff' },
  removeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderColor: Colors.error + '55', borderRadius: Radius.lg, paddingVertical: 12, backgroundColor: Colors.error + '08' },
  removeBtnText: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.error },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  infoText: { flex: 1, fontSize: 10, color: LM_TEXT_DIM, lineHeight: 16 },
});

// ── App Updates styles ─────────────────────────────────────────────────────────

const updStyles = StyleSheet.create({
  card: { backgroundColor: LM_CARD, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: LM_BORDER, gap: Spacing.md, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  iconWrap: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#FF670015', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#FF670030' },
  cardTitle: { fontSize: FontSize.base, fontWeight: '700', color: LM_TEXT, marginBottom: 2 },
  cardDesc: { fontSize: FontSize.xs, color: LM_TEXT_SEC, lineHeight: 18, flex: 1 },
  currentBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', backgroundColor: '#FF670010', borderRadius: Radius.md, padding: 10, borderWidth: 1, borderColor: '#FF670030' },
  currentText: { fontSize: FontSize.sm, fontWeight: '700', color: LM_TEXT, flex: 1 },
  currentDate: { fontSize: FontSize.xs, color: LM_TEXT_DIM },
  publishBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#FF6700', borderRadius: Radius.lg, paddingVertical: 14, shadowColor: '#FF6700', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.30, shadowRadius: 10, elevation: 6 },
  publishBtnText: { fontSize: FontSize.base, fontWeight: '800', color: '#FFFFFF' },
  historyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: LM_BORDER },
  historyTitle: { fontSize: FontSize.sm, fontWeight: '700', color: LM_TEXT_SEC },
  emptyHistory: { fontSize: FontSize.sm, color: LM_TEXT_DIM, textAlign: 'center', paddingVertical: 8 },
  versionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: LM_BORDER },
  versionRowLatest: { borderBottomWidth: 0 },
  versionBadge: { minWidth: 48, backgroundColor: LM_ELEVATED, borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 4, alignItems: 'center', borderWidth: 1, borderColor: LM_BORDER },
  versionBadgeText: { fontSize: FontSize.xs, fontWeight: '800', color: LM_TEXT_SEC },
  versionTitle: { fontSize: FontSize.sm, fontWeight: '700', color: LM_TEXT, marginBottom: 2 },
  versionDesc: { fontSize: FontSize.xs, color: LM_TEXT_SEC, lineHeight: 17 },
  versionDate: { fontSize: 10, color: LM_TEXT_DIM, marginTop: 3 },
  latestChip: { backgroundColor: '#FF670015', borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: '#FF670035' },
  latestChipText: { fontSize: 9, fontWeight: '800', color: '#FF6700', letterSpacing: 0.7 },
  moreVersions: { fontSize: FontSize.xs, color: LM_TEXT_DIM, textAlign: 'center', paddingTop: 8 },
  modal: { flex: 1, backgroundColor: '#FFFFFF' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingBottom: Spacing.md, borderBottomWidth: 1, borderBottomColor: LM_BORDER },
  modalTitle: { fontSize: FontSize.base, fontWeight: '700', color: LM_TEXT },
  modalSendBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FF6700', borderRadius: Radius.md, paddingHorizontal: 14, paddingVertical: 8 },
  modalSendBtnText: { fontSize: FontSize.sm, fontWeight: '700', color: '#fff' },
  modalBody: { paddingHorizontal: Spacing.md, paddingTop: Spacing.md, paddingBottom: 48, gap: 14 },
  fieldLabel: { fontSize: FontSize.xs, fontWeight: '700', color: LM_TEXT_SEC, textTransform: 'uppercase', letterSpacing: 0.5 },
  bumpRow: { flexDirection: 'row', gap: 10 },
  bumpBtn: { flex: 1, backgroundColor: LM_SURFACE, borderRadius: Radius.md, padding: 12, borderWidth: 1, borderColor: LM_BORDER, gap: 4 },
  bumpBtnActive: { backgroundColor: '#FF6700', borderColor: '#FF6700' },
  bumpBtnText: { fontSize: FontSize.sm, fontWeight: '700', color: LM_TEXT },
  bumpBtnSub: { fontSize: 10, color: LM_TEXT_DIM },
  nextVersionPreview: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FF670010', borderRadius: Radius.md, padding: 12, borderWidth: 1, borderColor: '#FF670030' },
  nextVersionText: { fontSize: FontSize.sm, color: LM_TEXT },
  input: { backgroundColor: LM_SURFACE, borderRadius: Radius.md, borderWidth: 1, borderColor: LM_BORDER, paddingHorizontal: Spacing.md, height: 48, color: LM_TEXT, fontSize: FontSize.base },
  textArea: { backgroundColor: LM_SURFACE, borderRadius: Radius.md, borderWidth: 1, borderColor: LM_BORDER, padding: Spacing.md, color: LM_TEXT, fontSize: FontSize.base, minHeight: 180 },
  charCount: { fontSize: FontSize.xs, color: LM_TEXT_DIM, textAlign: 'right' },
  infoBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#FF670008', borderRadius: Radius.md, padding: 12, borderWidth: 1, borderColor: '#FF670025' },
  infoText: { flex: 1, fontSize: FontSize.xs, color: LM_TEXT_SEC, lineHeight: 18 },
});
