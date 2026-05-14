import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Modal, Dimensions, Linking, RefreshControl, Animated,
} from 'react-native';
import DraggableFlatList, { ScaleDecorator, RenderItemParams } from '@/components/ui/DraggableFlatList';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import DayRouteMap from '@/components/feature/DayRouteMap';
import FixAllConflictsModal from '@/components/feature/FixAllConflictsModal';
import WeeklyCalendarGrid from '@/components/feature/WeeklyCalendarGrid';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { usePupils } from '@/hooks/usePupils';
import { useAlert } from '@/template';
import { Colors, Spacing, FontSize, Radius, Shadow } from '@/constants/theme';
import {
  trafficSeverity, severityColor, isRushHour, rushHourLabel,
  formatTrafficLabel, DEFAULT_TRAFFIC_PREFS, loadTrafficPrefs,
  TrafficPrefs,
} from '@/services/trafficService';
import EditLessonTimeModal from '@/components/feature/EditLessonTimeModal';
import LessonNotesModal from '@/components/feature/LessonNotesModal';
import { getWeekStart, addDays, formatDate, generateId } from '@/services/pupilService';
import {
  suggestWeekScheduleFull,
  suggestWeekScheduleWithExtension,
  getZoneBuffer,
  getPostcodeDistrict,
  AvailabilitySuggestion,
  BestFitSuggestion,
  suggestionToLesson,
  ScheduleResult,
  setSchedulerStatusCallback,
  getLastComputedMatrix,
  refreshDaySchedule,
} from '@/services/schedulerService';
import { setPreviewSuggestions } from '@/services/schedulePreviewStore';
import { getCoordinatesForPupils } from '@/services/geocodingService';
import { formatDuration, formatDistance, getDrivingMatrix, getDrivingMatrixGoogle } from '@/services/routingService';
import {
  buildTravelCacheKey,
  getCachedTravelTimes,
  setCachedTravelTimes,
  invalidateTravelCache,
  shouldRunDailyWarmup,
  markWarmupComplete,
  PersistedTravelSegment,
  TravelDataSource,
} from '@/services/travelTimeCache';
import { Lesson, Pupil } from '@/types';

const ZONE_COLORS = [Colors.zone1, Colors.zone2, Colors.zone3, Colors.zone4, Colors.zone5];
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_NAMES_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const BUFFER_STEPS = [0, 5, 10, 15, 20, 25, 30, 45, 60];

type ViewMode = 'list' | 'calendar';

interface TravelSegment {
  durationSeconds: number;
  distanceMeters: number;
  isEstimated?: boolean;
  source?: TravelDataSource;
}

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const haversine = sinLat * sinLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return 2 * R * Math.asin(Math.sqrt(haversine));
}

function estimateDriveMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  return Math.round(haversineMeters(a, b) * 1.35);
}

function estimateDriveSecs(distanceMeters: number): number {
  return Math.round(distanceMeters / 13.0);
}

function getEndTime(startTime: string, duration: number): string {
  const [h, m] = startTime.split(':').map(Number);
  const total = h * 60 + m + duration;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function toMinsLocal(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function fromMinsLocal(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function snapUp15(mins: number): number {
  const rem = mins % 15;
  return rem === 0 ? mins : mins + (15 - rem);
}

function formatTimeAmPm(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const period = h >= 12 ? 'pm' : 'am';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')}${period}`;
}

function formatMinsSaved(mins: number): string {
  if (mins <= 0) return '0 min';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// ─── Availability conflict audit ─────────────────────────────────────────────

/**
 * Returns true if the lesson falls OUTSIDE the pupil's availability windows.
 * Only flags a conflict when the pupil HAS availability set for that day.
 * Lessons on days with no availability set are not flagged (pupil may be flexible).
 */
function isLessonOutsideAvailability(lesson: Lesson, pupil: Pupil): boolean {
  if (!pupil) return false;

  // Check blackout dates first — lesson on a blackout day is always a conflict.
  if (pupil.availability?.blackoutDates?.includes(lesson.date)) return true;

  // Use midday timestamp to avoid DST boundary issues with getDay().
  const d = new Date(lesson.date + 'T12:00:00');
  const dayRaw = d.getDay(); // 0=Sun
  const dayIndex = dayRaw === 0 ? 6 : dayRaw - 1; // Mon-first index
  const dayName = DAY_NAMES_FULL[dayIndex];

  // Check specificDates override first
  const specific = pupil.availability?.specificDates?.find(s => s.date === lesson.date);
  if (specific) {
    const wStart = toMinsLocal(specific.startTime);
    const wEnd = toMinsLocal(specific.endTime);
    const lStart = toMinsLocal(lesson.startTime);
    const lEnd = lStart + lesson.duration;
    return lStart < wStart || lEnd > wEnd;
  }

  // Check recurring slots
  const slots = pupil.availability?.recurringSlots?.filter(s => s.day === dayName) ?? [];
  if (slots.length === 0) return false; // no availability set → do not flag

  const lStart = toMinsLocal(lesson.startTime);
  const lEnd = lStart + lesson.duration;

  // Merge windows
  const windows = slots
    .map(s => ({ start: toMinsLocal(s.startTime), end: toMinsLocal(s.endTime) }))
    .sort((a, b) => a.start - b.start)
    .reduce((acc: Array<{ start: number; end: number }>, w) => {
      if (acc.length === 0) return [{ ...w }];
      const last = acc[acc.length - 1];
      if (w.start <= last.end) { last.end = Math.max(last.end, w.end); return acc; }
      return [...acc, { ...w }];
    }, []);

  // Lesson must fall entirely within at least one merged window
  return !windows.some(w => lStart >= w.start && lEnd <= w.end);
}

// ─── Compress Day Algorithm ──────────────────────────────────────────────────

export interface CompressedLesson {
  lesson: Lesson;
  oldStart: string;
  newStart: string;
  changed: boolean;
}

export interface CompressResult {
  compressedLessons: CompressedLesson[];
  oldSpanStart: string;
  oldSpanEnd: string;
  newSpanStart: string;
  newSpanEnd: string;
  savedMins: number;
  feasible: boolean;
  reason?: string;
}

function computeCompressedTimes(
  orderedLessons: Lesson[],
  travelTimes: Record<string, TravelSegment | null>,
  pupils: Pupil[],
  instructorAvailability: any,
  selectedDayIndex: number,
  weekDates: string[],
  sameZoneBuffer: number,
  diffZoneBuffer: number,
  postDriveBuffer: number,
  firstStart: number,
): { startTimes: number[]; feasible: boolean } {
  const startTimes: number[] = [];
  let cursor = firstStart;

  for (let i = 0; i < orderedLessons.length; i++) {
    const lesson = orderedLessons[i];
    const pupil = pupils.find(p => p.id === lesson.pupilId);
    const dateStr = weekDates[selectedDayIndex];
    const dayName = DAY_NAMES_FULL[selectedDayIndex];
    const dayAvail = instructorAvailability?.[dayName];
    const instrEnd = dayAvail ? toMinsLocal(dayAvail.endTime) : 22 * 60;

    let start: number;
    if (i === 0) {
      start = firstStart;
    } else {
      const prevLesson = orderedLessons[i - 1];
      const prevPupil = pupils.find(p => p.id === prevLesson.pupilId);
      const travelKey = `${prevLesson.id}->${lesson.id}`;
      const travelSeg = travelTimes[travelKey];
      const driveMins = travelSeg ? Math.ceil(travelSeg.durationSeconds / 60) : 0;
      const customBuf = prevLesson.customBuffer;
      const zoneCalcBuf = getZoneBuffer(prevPupil?.postcode ?? '', pupil?.postcode ?? '', sameZoneBuffer, diffZoneBuffer);
      const effectiveBuf = customBuf !== undefined ? customBuf : Math.max(zoneCalcBuf, postDriveBuffer);
      const arrival = cursor + driveMins + effectiveBuf;
      start = snapUp15(arrival);
    }

    if (start + lesson.duration > instrEnd) return { startTimes: [], feasible: false };

    if (pupil) {
      // Use the same Mon-first index that DAY_NAMES_FULL uses throughout the diary.
      // getDay(): 0=Sun, so map Sun=6, Mon=0..Sat=5.
      const dowRaw = new Date(dateStr + 'T12:00:00').getDay(); // midday avoids DST boundary
      const dayIndex2 = dowRaw === 0 ? 6 : dowRaw - 1;
      const dayName2 = DAY_NAMES_FULL[dayIndex2];
      const slots = pupil.availability?.recurringSlots?.filter(s => s.day === dayName2) ?? [];
      const specificSlot = pupil.availability?.specificDates?.find(s => s.date === dateStr);
      const windows = specificSlot
        ? [{ start: toMinsLocal(specificSlot.startTime), end: toMinsLocal(specificSlot.endTime) }]
        : slots.map(s => ({ start: toMinsLocal(s.startTime), end: toMinsLocal(s.endTime) }));
      const merged = windows.sort((a, b) => a.start - b.start).reduce((acc: typeof windows, w) => {
        if (acc.length === 0) return [{ ...w }];
        const last = acc[acc.length - 1];
        if (w.start <= last.end) { last.end = Math.max(last.end, w.end); return acc; }
        return [...acc, { ...w }];
      }, []);
      const fits = merged.length === 0 || merged.some(w => start >= w.start && start + lesson.duration <= w.end);
      if (!fits) return { startTimes: [], feasible: false };
    }

    startTimes.push(start);
    cursor = start + lesson.duration;
  }
  return { startTimes, feasible: true };
}

function runCompressDay(
  orderedLessons: Lesson[],
  travelTimes: Record<string, TravelSegment | null>,
  pupils: Pupil[],
  instructorAvailability: any,
  selectedDayIndex: number,
  weekDates: string[],
  sameZoneBuffer: number,
  diffZoneBuffer: number,
  postDriveBuffer: number,
): CompressResult {
  if (orderedLessons.length < 2) {
    return {
      compressedLessons: [],
      oldSpanStart: '', oldSpanEnd: '', newSpanStart: '', newSpanEnd: '',
      savedMins: 0, feasible: false, reason: 'Need at least 2 lessons to compress',
    };
  }

  const dayName = DAY_NAMES_FULL[selectedDayIndex];
  const dayAvail = instructorAvailability?.[dayName];
  const instrStart = dayAvail ? toMinsLocal(dayAvail.startTime) : 6 * 60;
  const instrEnd = dayAvail ? toMinsLocal(dayAvail.endTime) : 22 * 60;

  const currentStarts = orderedLessons.map(l => toMinsLocal(l.startTime));
  const oldSpanStart = fromMinsLocal(Math.min(...currentStarts));
  const lastLesson = orderedLessons[orderedLessons.length - 1];
  const oldSpanEnd = getEndTime(lastLesson.startTime, lastLesson.duration);
  const oldTotalSpan = toMinsLocal(oldSpanEnd) - toMinsLocal(oldSpanStart);

  const { startTimes: minTimes, feasible: minFeasible } = computeCompressedTimes(
    orderedLessons, travelTimes, pupils, instructorAvailability,
    selectedDayIndex, weekDates, sameZoneBuffer, diffZoneBuffer, postDriveBuffer, instrStart,
  );

  if (!minFeasible || minTimes.length === 0) {
    return {
      compressedLessons: [], oldSpanStart, oldSpanEnd, newSpanStart: '', newSpanEnd: '',
      savedMins: 0, feasible: false, reason: 'Could not compress — pupil availability constraints prevent tightening',
    };
  }

  const lastNewStart = minTimes[minTimes.length - 1];
  const minSpanEnd = lastNewStart + orderedLessons[orderedLessons.length - 1].duration;
  const minSpanDuration = minSpanEnd - minTimes[0];

  let latestValidStart = minTimes[0];
  const maxFirstStart = instrEnd - minSpanDuration;

  if (maxFirstStart > instrStart) {
    for (let candidate = snapUp15(maxFirstStart); candidate >= minTimes[0]; candidate -= 15) {
      const { startTimes, feasible } = computeCompressedTimes(
        orderedLessons, travelTimes, pupils, instructorAvailability,
        selectedDayIndex, weekDates, sameZoneBuffer, diffZoneBuffer, postDriveBuffer, candidate,
      );
      if (feasible && startTimes.length === orderedLessons.length) {
        latestValidStart = candidate;
        break;
      }
    }
  }

  const { startTimes: finalTimes, feasible: finalFeasible } = computeCompressedTimes(
    orderedLessons, travelTimes, pupils, instructorAvailability,
    selectedDayIndex, weekDates, sameZoneBuffer, diffZoneBuffer, postDriveBuffer, latestValidStart,
  );

  if (!finalFeasible || finalTimes.length === 0) {
    return {
      compressedLessons: [], oldSpanStart, oldSpanEnd, newSpanStart: '', newSpanEnd: '',
      savedMins: 0, feasible: false, reason: 'Compression not possible with current availability constraints',
    };
  }

  const newSpanStart = fromMinsLocal(finalTimes[0]);
  const newSpanEnd = getEndTime(fromMinsLocal(finalTimes[finalTimes.length - 1]), orderedLessons[orderedLessons.length - 1].duration);
  const newTotalSpan = toMinsLocal(newSpanEnd) - finalTimes[0];
  const savedMins = oldTotalSpan - newTotalSpan;

  const compressedLessons: CompressedLesson[] = orderedLessons.map((lesson, i) => ({
    lesson,
    oldStart: lesson.startTime,
    newStart: fromMinsLocal(finalTimes[i]),
    changed: lesson.startTime !== fromMinsLocal(finalTimes[i]),
  }));

  return {
    compressedLessons,
    oldSpanStart, oldSpanEnd, newSpanStart, newSpanEnd,
    savedMins, feasible: savedMins > 0,
    reason: savedMins <= 0 ? 'Your day is already as compact as possible' : undefined,
  };
}

// ─── Compress Day Modal ──────────────────────────────────────────────────────

interface CompressDayModalProps {
  visible: boolean;
  result: CompressResult | null;
  onApply: (compressed: CompressedLesson[]) => Promise<void>;
  onClose: () => void;
}

function CompressDayModal({ visible, result, onApply, onClose }: CompressDayModalProps) {
  const insets = useSafeAreaInsets();
  const [applying, setApplying] = useState(false);

  if (!result) return null;

  const handleApply = async () => {
    setApplying(true);
    await onApply(result.compressedLessons);
    setApplying(false);
    onClose();
  };

  const changedCount = result.compressedLessons.filter(c => c.changed).length;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={cdStyles.backdrop}>
        <View style={[cdStyles.sheet, { paddingBottom: insets.bottom + 20 }]}>
          <View style={cdStyles.handle} />

          <View style={cdStyles.header}>
            <View style={cdStyles.headerIcon}>
              <MaterialIcons name="compress" size={20} color={Colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={cdStyles.title}>Compress My Day</Text>
              <Text style={cdStyles.subtitle}>Smart schedule tightening</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12}>
              <MaterialIcons name="close" size={20} color={Colors.textTertiary} />
            </Pressable>
          </View>

          {!result.feasible ? (
            <View style={cdStyles.notFeasible}>
              <MaterialIcons name="check-circle" size={36} color={Colors.success} />
              <Text style={cdStyles.notFeasibleTitle}>Already Optimal</Text>
              <Text style={cdStyles.notFeasibleBody}>{result.reason ?? 'Your day is already as compact as possible given drive times and pupil availability.'}</Text>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 12, padding: 16 }}>
              <View style={cdStyles.summaryCard}>
                <View style={cdStyles.summaryRow}>
                  <View style={cdStyles.summaryBlock}>
                    <Text style={cdStyles.summaryLabel}>Currently</Text>
                    <Text style={cdStyles.summaryTime}>{formatTimeAmPm(result.oldSpanStart)} – {formatTimeAmPm(result.oldSpanEnd)}</Text>
                  </View>
                  <MaterialIcons name="arrow-forward" size={20} color={Colors.primary} />
                  <View style={cdStyles.summaryBlock}>
                    <Text style={[cdStyles.summaryLabel, { color: Colors.success }]}>Compressed</Text>
                    <Text style={[cdStyles.summaryTime, { color: Colors.success }]}>{formatTimeAmPm(result.newSpanStart)} – {formatTimeAmPm(result.newSpanEnd)}</Text>
                  </View>
                </View>
                <View style={cdStyles.savedBadge}>
                  <MaterialIcons name="schedule" size={14} color={Colors.primary} />
                  <Text style={cdStyles.savedBadgeText}>Saves {formatMinsSaved(result.savedMins)}</Text>
                </View>
              </View>

              <View style={cdStyles.section}>
                <Text style={cdStyles.sectionTitle}>Lesson Rescheduling ({changedCount} change{changedCount !== 1 ? 's' : ''})</Text>
                {result.compressedLessons.map((item, i) => {
                  const endOld = getEndTime(item.oldStart, item.lesson.duration);
                  const endNew = getEndTime(item.newStart, item.lesson.duration);
                  return (
                    <View key={item.lesson.id} style={[cdStyles.lessonRow, item.changed && cdStyles.lessonRowChanged]}>
                      <View style={[cdStyles.lessonNum, { backgroundColor: item.changed ? Colors.primary : Colors.surfaceElevated }]}>
                        <Text style={[cdStyles.lessonNumText, { color: item.changed ? Colors.textInverse : Colors.textTertiary }]}>{i + 1}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={cdStyles.lessonName} numberOfLines={1}>
                          {item.changed ? (
                            <>
                              <Text style={{ textDecorationLine: 'line-through', color: Colors.textTertiary }}>{item.oldStart}–{endOld}</Text>
                              {'  →  '}
                              <Text style={{ color: Colors.success, fontWeight: '700' }}>{item.newStart}–{endNew}</Text>
                            </>
                          ) : (
                            <Text style={{ color: Colors.textSecondary }}>{item.oldStart}–{endOld} (unchanged)</Text>
                          )}
                        </Text>
                      </View>
                      {item.changed && (
                        <View style={cdStyles.shiftBadge}>
                          <Text style={cdStyles.shiftBadgeText}>
                            {toMinsLocal(item.newStart) - toMinsLocal(item.oldStart) > 0
                              ? `+${toMinsLocal(item.newStart) - toMinsLocal(item.oldStart)}m`
                              : `${toMinsLocal(item.newStart) - toMinsLocal(item.oldStart)}m`}
                          </Text>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>

              <View style={cdStyles.infoBox}>
                <MaterialIcons name="info-outline" size={14} color={Colors.info} />
                <Text style={cdStyles.infoText}>
                  Drive times and buffers are preserved. Each lesson stays within the pupil's allowed time window.
                  {result.savedMins >= 60 ? ` You gain ${formatMinsSaved(result.savedMins)} back in your day.` : ''}
                </Text>
              </View>
            </ScrollView>
          )}

          <View style={cdStyles.footer}>
            <Pressable style={cdStyles.cancelBtn} onPress={onClose} disabled={applying}>
              <Text style={cdStyles.cancelBtnText}>{result.feasible ? 'Keep Current' : 'Close'}</Text>
            </Pressable>
            {result.feasible && (
              <Pressable
                style={[cdStyles.applyBtn, applying && { opacity: 0.5 }]}
                onPress={handleApply}
                disabled={applying}
              >
                {applying
                  ? <ActivityIndicator size="small" color={Colors.textInverse} />
                  : <MaterialIcons name="check" size={16} color={Colors.textInverse} />}
                <Text style={cdStyles.applyBtnText}>{applying ? 'Applying...' : `Apply Changes`}</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const cdStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderWidth: 1, borderColor: Colors.surfaceBorder, paddingTop: 8, maxHeight: '88%',
  },
  handle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.textTertiary + '60',
    alignSelf: 'center', marginBottom: 4,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  headerIcon: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: Colors.primary + '20', alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary },
  subtitle: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 1 },
  summaryCard: {
    backgroundColor: Colors.primary + '08', borderRadius: Radius.lg,
    padding: Spacing.md, borderWidth: 1.5, borderColor: Colors.primary + '30',
    gap: 10,
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  summaryBlock: { flex: 1, alignItems: 'center', gap: 3 },
  summaryLabel: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.7 },
  summaryTime: { fontSize: FontSize.base, fontWeight: '800', color: Colors.textPrimary, textAlign: 'center' },
  savedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center',
    backgroundColor: Colors.primary + '18', borderRadius: Radius.full,
    paddingHorizontal: 14, paddingVertical: 7,
    borderWidth: 1, borderColor: Colors.primary + '45',
    alignSelf: 'center',
  },
  savedBadgeText: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.primary },
  section: {
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.surfaceBorder, overflow: 'hidden',
  },
  sectionTitle: {
    fontSize: FontSize.xs, fontWeight: '700', color: Colors.textTertiary,
    textTransform: 'uppercase', letterSpacing: 0.8,
    paddingHorizontal: Spacing.md, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
    backgroundColor: Colors.surfaceElevated,
  },
  lessonRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: Spacing.md, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder + '60',
  },
  lessonRowChanged: { backgroundColor: Colors.primary + '06' },
  lessonNum: {
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  lessonNumText: { fontSize: 11, fontWeight: '800' },
  lessonName: { fontSize: FontSize.sm, color: Colors.textPrimary, flexWrap: 'wrap' },
  shiftBadge: {
    backgroundColor: Colors.success + '20', borderRadius: Radius.full,
    paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: Colors.success + '50',
  },
  shiftBadgeText: { fontSize: 10, fontWeight: '700', color: Colors.success },
  infoBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: Colors.info + '10', borderRadius: Radius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.info + '35',
  },
  infoText: { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 17 },
  notFeasible: {
    alignItems: 'center', gap: 12, padding: 32, paddingTop: 24,
  },
  notFeasibleTitle: { fontSize: FontSize.base, fontWeight: '700', color: Colors.textPrimary },
  notFeasibleBody: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  footer: {
    flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingTop: 14,
    borderTopWidth: 1, borderTopColor: Colors.surfaceBorder,
  },
  cancelBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, borderRadius: Radius.lg,
    backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  cancelBtnText: { fontSize: FontSize.base, fontWeight: '600', color: Colors.textSecondary },
  applyBtn: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 14, borderRadius: Radius.lg, backgroundColor: Colors.primary,
  },
  applyBtnText: { fontSize: FontSize.base, fontWeight: '700', color: Colors.textInverse },
});

// ─── Buffer editor modal ──────────────────────────────────────────────────────

interface BufferEditorModalProps {
  visible: boolean;
  lesson: Lesson | null;
  pupilName: string;
  currentBuffer: number;
  isCustom: boolean;
  onSave: (lessonId: string, buffer: number | undefined) => void;
  onClose: () => void;
}

function BufferEditorModal({ visible, lesson, pupilName, currentBuffer, isCustom, onSave, onClose }: BufferEditorModalProps) {
  const insets = useSafeAreaInsets();
  const [value, setValue] = useState(currentBuffer);

  useEffect(() => {
    if (visible) setValue(currentBuffer);
  }, [visible, currentBuffer]);

  if (!lesson) return null;

  const handleStep = (dir: 1 | -1) => {
    const idx = BUFFER_STEPS.indexOf(value);
    if (idx === -1) {
      const nearest = BUFFER_STEPS.reduce((prev, curr) =>
        Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev
      );
      setValue(nearest);
      return;
    }
    const next = idx + dir;
    if (next >= 0 && next < BUFFER_STEPS.length) setValue(BUFFER_STEPS[next]);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={beStyles.backdrop}>
        <View style={[beStyles.sheet, { paddingBottom: insets.bottom + 20 }]}>
          <View style={beStyles.handle} />
          <View style={beStyles.header}>
            <View style={beStyles.headerIcon}>
              <MaterialIcons name="schedule" size={20} color={Colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={beStyles.title}>Buffer After Drive</Text>
              <Text style={beStyles.subtitle}>{pupilName} · {lesson.date} at {lesson.startTime}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12}>
              <MaterialIcons name="close" size={20} color={Colors.textTertiary} />
            </Pressable>
          </View>

          <Text style={beStyles.desc}>
            Extra time to hold after the drive — before this next lesson starts.
            The scheduler snaps the start to the nearest 15-minute slot automatically.
            Use this buffer for preparation time, payment collection, or unexpected delays.
            Overrides the zone-calculated default for this lesson segment only.
          </Text>

          <View style={beStyles.stepperRow}>
            <Pressable
              style={[beStyles.stepBtn, value === BUFFER_STEPS[0] && { opacity: 0.35 }]}
              onPress={() => handleStep(-1)}
              disabled={value === BUFFER_STEPS[0]}
            >
              <MaterialIcons name="remove" size={22} color={Colors.primary} />
            </Pressable>
            <View style={beStyles.valueBox}>
              <Text style={beStyles.valueText}>{value}</Text>
              <Text style={beStyles.valueUnit}>min</Text>
            </View>
            <Pressable
              style={[beStyles.stepBtn, value === BUFFER_STEPS[BUFFER_STEPS.length - 1] && { opacity: 0.35 }]}
              onPress={() => handleStep(1)}
              disabled={value === BUFFER_STEPS[BUFFER_STEPS.length - 1]}
            >
              <MaterialIcons name="add" size={22} color={Colors.primary} />
            </Pressable>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 46 }}
            contentContainerStyle={{ paddingHorizontal: 20, gap: 8, alignItems: 'center' }}>
            {BUFFER_STEPS.map(v => (
              <Pressable
                key={v}
                style={[beStyles.quickChip, value === v && beStyles.quickChipActive]}
                onPress={() => setValue(v)}
              >
                <Text style={[beStyles.quickChipText, value === v && beStyles.quickChipTextActive]}>
                  {v === 0 ? 'None' : `${v}m`}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <View style={beStyles.footer}>
            {isCustom && (
              <Pressable style={beStyles.resetBtn} onPress={() => { onSave(lesson.id, undefined); onClose(); }}>
                <MaterialIcons name="refresh" size={15} color={Colors.textSecondary} />
                <Text style={beStyles.resetBtnText}>Reset to Default</Text>
              </Pressable>
            )}
            <Pressable style={beStyles.cancelBtn} onPress={onClose}>
              <Text style={beStyles.cancelBtnText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={beStyles.saveBtn}
              onPress={() => { onSave(lesson.id, value); onClose(); }}
            >
              <MaterialIcons name="check" size={16} color={Colors.textInverse} />
              <Text style={beStyles.saveBtnText}>Save</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const beStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderWidth: 1, borderColor: Colors.surfaceBorder, paddingTop: 8, gap: 16,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.textTertiary + '60',
    alignSelf: 'center', marginBottom: 4,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingBottom: 4,
  },
  headerIcon: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: Colors.primary + '20', alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary },
  subtitle: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  desc: {
    fontSize: FontSize.xs, color: Colors.textTertiary, lineHeight: 17,
    paddingHorizontal: 20, fontStyle: 'italic',
  },
  stepperRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24,
    paddingHorizontal: 20,
  },
  stepBtn: {
    width: 52, height: 52, borderRadius: 26, borderWidth: 2, borderColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primary + '15',
  },
  valueBox: { alignItems: 'center', minWidth: 80 },
  valueText: { fontSize: 40, fontWeight: '800', color: Colors.textPrimary, lineHeight: 46 },
  valueUnit: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: '600' },
  quickChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  quickChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  quickChipText: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textSecondary },
  quickChipTextActive: { color: Colors.textInverse },
  footer: {
    flexDirection: 'row', gap: 8, paddingHorizontal: 20,
    paddingTop: 8, borderTopWidth: 1, borderTopColor: Colors.surfaceBorder,
  },
  resetBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 12, borderRadius: Radius.md,
    backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  resetBtnText: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textSecondary },
  cancelBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, borderRadius: Radius.lg,
    backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  cancelBtnText: { fontSize: FontSize.base, fontWeight: '600', color: Colors.textSecondary },
  saveBtn: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 14, borderRadius: Radius.lg, backgroundColor: Colors.primary,
  },
  saveBtnText: { fontSize: FontSize.base, fontWeight: '700', color: Colors.textInverse },
});

// ─── Lesson select + delete modal ─────────────────────────────────────────────

interface LessonSelectModalProps {
  visible: boolean;
  onClose: () => void;
  lessons: Lesson[];
  pupils: Pupil[];
  onDelete: (ids: string[]) => Promise<void>;
}

type StatusFilter = 'all' | 'unpaid' | 'unacknowledged' | 'completed';

const STATUS_CHIPS: { key: StatusFilter; label: string; icon: string; color: string }[] = [
  { key: 'all',            label: 'All',            icon: 'list',            color: Colors.primary },
  { key: 'unpaid',         label: 'Unpaid',         icon: 'money-off',       color: Colors.error },
  { key: 'unacknowledged', label: 'Unacknowledged', icon: 'pending-actions', color: Colors.warning },
  { key: 'completed',      label: 'Completed',      icon: 'check-circle',    color: Colors.success },
];

function matchesStatus(lesson: Lesson, status: StatusFilter): boolean {
  if (status === 'all') return true;
  if (status === 'unpaid') return lesson.paymentStatus === 'unpaid';
  if (status === 'unacknowledged') return !Boolean(lesson.pupilAcknowledged);
  if (status === 'completed') return lesson.status === 'completed';
  return true;
}

function LessonSelectModal({ visible, onClose, lessons, pupils, onDelete }: LessonSelectModalProps) {
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [filterPupilId, setFilterPupilId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const byPupil = useMemo(() => {
    const map = new Map<string, { pupil: Pupil | undefined; lessons: Lesson[] }>();
    for (const l of lessons) {
      if (!map.has(l.pupilId)) {
        map.set(l.pupilId, { pupil: pupils.find(p => p.id === l.pupilId), lessons: [] });
      }
      map.get(l.pupilId)!.lessons.push(l);
    }
    for (const entry of map.values()) {
      entry.lessons.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
    }
    return map;
  }, [lessons, pupils]);

  const filteredLessons = useMemo(() => {
    return lessons.filter(l =>
      (filterPupilId === null || l.pupilId === filterPupilId) &&
      matchesStatus(l, statusFilter)
    );
  }, [lessons, filterPupilId, statusFilter]);

  const filteredLessonIds = useMemo(() => filteredLessons.map(l => l.id), [filteredLessons]);

  const visiblePupilIds = useMemo(() => {
    const ids = new Set(filteredLessons.map(l => l.pupilId));
    return Array.from(ids);
  }, [filteredLessons]);

  const statusCounts = useMemo(() => ({
    all:            lessons.length,
    unpaid:         lessons.filter(l => l.paymentStatus === 'unpaid').length,
    unacknowledged: lessons.filter(l => !Boolean(l.pupilAcknowledged)).length,
    completed:      lessons.filter(l => l.status === 'completed').length,
  }), [lessons]);

  useEffect(() => {
    if (!visible) { setSelected(new Set()); setFilterPupilId(null); setStatusFilter('all'); }
  }, [visible]);

  const handleStatusChip = (key: StatusFilter) => {
    setStatusFilter(key);
    const matchingIds = lessons
      .filter(l => (filterPupilId === null || l.pupilId === filterPupilId) && matchesStatus(l, key))
      .map(l => l.id);
    setSelected(new Set(matchingIds));
  };

  const toggleLesson = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const togglePupil = (pupilId: string) => {
    const ids = filteredLessons.filter(l => l.pupilId === pupilId).map(l => l.id);
    const allIn = ids.every(id => selected.has(id));
    setSelected(prev => {
      const next = new Set(prev);
      allIn ? ids.forEach(id => next.delete(id)) : ids.forEach(id => next.add(id));
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === filteredLessonIds.length && filteredLessonIds.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredLessonIds));
    }
  };

  const handleDelete = async () => {
    if (selected.size === 0) return;
    setDeleting(true);
    await onDelete(Array.from(selected));
    setDeleting(false);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={lsStyles.backdrop}>
        <View style={[lsStyles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={lsStyles.header}>
            <Pressable onPress={onClose} hitSlop={12}>
              <MaterialIcons name="close" size={22} color={Colors.textPrimary} />
            </Pressable>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={lsStyles.title}>Select Lessons to Delete</Text>
              <Text style={lsStyles.subtitle}>
                {lessons.length} lesson{lessons.length !== 1 ? 's' : ''} this week
                {selected.size > 0 ? ` · ${selected.size} selected` : ''}
              </Text>
            </View>
            <Pressable onPress={toggleAll} style={lsStyles.selectAllBtn}>
              <MaterialIcons
                name={selected.size === filteredLessonIds.length && filteredLessonIds.length > 0 ? 'deselect' : 'select-all'}
                size={16}
                color={Colors.error}
              />
              <Text style={lsStyles.selectAllText}>
                {selected.size === filteredLessonIds.length && filteredLessonIds.length > 0 ? 'None' : 'All'}
              </Text>
            </Pressable>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={lsStyles.statusBar}
            contentContainerStyle={lsStyles.statusBarContent}
          >
            {STATUS_CHIPS.map(chip => {
              const count = statusCounts[chip.key];
              const active = statusFilter === chip.key;
              if (chip.key !== 'all' && count === 0) return null;
              return (
                <Pressable
                  key={chip.key}
                  style={[
                    lsStyles.statusChip,
                    active && { backgroundColor: chip.color, borderColor: chip.color },
                  ]}
                  onPress={() => handleStatusChip(chip.key)}
                >
                  <MaterialIcons
                    name={chip.icon as any}
                    size={13}
                    color={active ? Colors.textInverse : chip.color}
                  />
                  <Text style={[lsStyles.statusChipText, { color: active ? Colors.textInverse : chip.color }]}>
                    {chip.label}
                  </Text>
                  <View style={[lsStyles.statusChipBadge, { backgroundColor: active ? 'rgba(255,255,255,0.25)' : chip.color + '22' }]}>
                    <Text style={[lsStyles.statusChipBadgeText, { color: active ? Colors.textInverse : chip.color }]}>
                      {count}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>

          {byPupil.size > 1 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={lsStyles.filterBar}
              contentContainerStyle={lsStyles.filterBarContent}
            >
              <Pressable
                style={[lsStyles.filterChip, !filterPupilId && lsStyles.filterChipActive]}
                onPress={() => setFilterPupilId(null)}
              >
                <Text style={[lsStyles.filterChipText, !filterPupilId && lsStyles.filterChipTextActive]}>
                  All Pupils
                </Text>
              </Pressable>
              {Array.from(byPupil.entries()).map(([pupilId, { pupil }]) => (
                <Pressable
                  key={pupilId}
                  style={[lsStyles.filterChip, filterPupilId === pupilId && lsStyles.filterChipActive]}
                  onPress={() => setFilterPupilId(filterPupilId === pupilId ? null : pupilId)}
                >
                  <Text style={[lsStyles.filterChipText, filterPupilId === pupilId && lsStyles.filterChipTextActive]}>
                    {pupil ? `${pupil.firstName} ${pupil.lastName}` : 'Unknown'}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}

          <ScrollView style={lsStyles.list} showsVerticalScrollIndicator={false}>
            {visiblePupilIds.map(pupilId => {
              const entry = byPupil.get(pupilId);
              if (!entry) return null;
              const { pupil } = entry;
              const pLessons = filteredLessons.filter(l => l.pupilId === pupilId);
              if (pLessons.length === 0) return null;
              const ids = pLessons.map(l => l.id);
              const allIn = ids.every(id => selected.has(id));
              const someIn = ids.some(id => selected.has(id));
              const selCount = ids.filter(id => selected.has(id)).length;

              return (
                <View key={pupilId} style={lsStyles.pupilSection}>
                  <Pressable style={lsStyles.pupilHeader} onPress={() => togglePupil(pupilId)}>
                    <MaterialIcons
                      name={allIn ? 'check-box' : someIn ? 'indeterminate-check-box' : 'check-box-outline-blank'}
                      size={22}
                      color={allIn || someIn ? Colors.error : Colors.textTertiary}
                    />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={lsStyles.pupilName}>
                        {pupil ? `${pupil.firstName} ${pupil.lastName}` : 'Unknown'}
                      </Text>
                      <Text style={lsStyles.pupilSub}>
                        {selCount}/{pLessons.length} selected
                        {pupil?.postcode ? ` · ${pupil.postcode}` : ''}
                      </Text>
                    </View>
                    <View style={[lsStyles.badge, { backgroundColor: Colors.error + '18' }]}>
                      <Text style={[lsStyles.badgeText, { color: Colors.error }]}>{pLessons.length}</Text>
                    </View>
                  </Pressable>

                  {pLessons.map(lesson => {
                    const isSelected = selected.has(lesson.id);
                    const endMin = (() => {
                      const [h, m] = lesson.startTime.split(':').map(Number);
                      return h * 60 + m + lesson.duration;
                    })();
                    const endTime = `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;
                    const dayLabel = (() => {
                      const d = new Date(lesson.date);
                      return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
                    })();

                    return (
                      <Pressable
                        key={lesson.id}
                        style={[lsStyles.lessonRow, isSelected && lsStyles.lessonRowSelected]}
                        onPress={() => toggleLesson(lesson.id)}
                      >
                        <MaterialIcons
                          name={isSelected ? 'check-box' : 'check-box-outline-blank'}
                          size={20}
                          color={isSelected ? Colors.error : Colors.textTertiary}
                        />
                        <View style={{ flex: 1, marginLeft: 10 }}>
                          <Text style={lsStyles.lessonDate}>
                            {dayLabel} {lesson.date.slice(8)} · {lesson.startTime}–{endTime}
                          </Text>
                          <View style={{ flexDirection: 'row', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
                            {!lesson.pupilAcknowledged && (
                              <Text style={[lsStyles.lessonFlag, { color: Colors.warning }]}>Unacknowledged</Text>
                            )}
                            {lesson.paymentStatus === 'unpaid' && (
                              <Text style={[lsStyles.lessonFlag, { color: Colors.error }]}>Unpaid</Text>
                            )}
                            {lesson.paymentStatus === 'paid' && (
                              <Text style={[lsStyles.lessonFlag, { color: Colors.success }]}>Paid</Text>
                            )}
                            {lesson.status === 'completed' && (
                              <Text style={[lsStyles.lessonFlag, { color: Colors.info }]}>Completed</Text>
                            )}
                          </View>
                        </View>
                        <Text style={lsStyles.lessonDur}>{lesson.duration}m</Text>
                      </Pressable>
                    );
                  })}
                </View>
              );
            })}

            {filteredLessons.length === 0 && (
              <View style={{ alignItems: 'center', padding: 32, gap: 8 }}>
                <MaterialIcons name="event-available" size={36} color={Colors.textTertiary} />
                <Text style={{ color: Colors.textTertiary, fontSize: FontSize.sm }}>No lessons this week</Text>
              </View>
            )}
          </ScrollView>

          <View style={lsStyles.footer}>
            <Pressable style={lsStyles.cancelBtn} onPress={onClose} disabled={deleting}>
              <Text style={lsStyles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[lsStyles.deleteBtn, (selected.size === 0 || deleting) && { opacity: 0.45 }]}
              onPress={handleDelete}
              disabled={selected.size === 0 || deleting}
            >
              {deleting
                ? <ActivityIndicator size="small" color={Colors.textInverse} />
                : <MaterialIcons name="delete" size={18} color={Colors.textInverse} />}
              <Text style={lsStyles.deleteBtnText}>
                {deleting ? 'Deleting...' : `Delete ${selected.size} Lesson${selected.size !== 1 ? 's' : ''}`}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const lsStyles = StyleSheet.create({
  statusBar: { maxHeight: 52, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder },
  statusBarContent: { paddingHorizontal: Spacing.md, paddingVertical: 10, gap: 8, alignItems: 'center', flexDirection: 'row' },
  statusChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.full,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  statusChipText: { fontSize: FontSize.xs, fontWeight: '700' },
  statusChipBadge: { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1, minWidth: 18, alignItems: 'center' },
  statusChipBadgeText: { fontSize: 10, fontWeight: '800' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: '90%', borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingTop: 20, paddingBottom: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  title: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary },
  subtitle: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  selectAllBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.error + '18', borderRadius: Radius.md,
    paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: Colors.error + '40',
  },
  selectAllText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.error },
  filterBar: { maxHeight: 48, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder },
  filterBarContent: { paddingHorizontal: Spacing.md, paddingVertical: 8, gap: 8, alignItems: 'center' },
  filterChip: {
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: Radius.full,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterChipText: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textSecondary },
  filterChipTextActive: { color: Colors.textInverse },
  list: { flex: 1, paddingHorizontal: Spacing.md, paddingTop: Spacing.sm },
  pupilSection: {
    marginBottom: 12, borderRadius: Radius.md,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.surfaceBorder,
    overflow: 'hidden',
  },
  pupilHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: 12,
    backgroundColor: Colors.surfaceElevated,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  pupilName: { fontSize: FontSize.base, fontWeight: '700', color: Colors.textPrimary },
  pupilSub: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  badge: { borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontSize: FontSize.xs, fontWeight: '700' },
  lessonRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder + '60',
  },
  lessonRowSelected: { backgroundColor: Colors.error + '10' },
  lessonDate: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textPrimary },
  lessonFlag: { fontSize: 10, fontWeight: '700' },
  lessonDur: { fontSize: FontSize.xs, color: Colors.textTertiary, marginLeft: 8 },
  footer: {
    flexDirection: 'row', gap: Spacing.sm,
    paddingHorizontal: Spacing.md, paddingTop: Spacing.md,
    borderTopWidth: 1, borderTopColor: Colors.surfaceBorder,
  },
  cancelBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, borderRadius: Radius.lg,
    backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  cancelText: { fontSize: FontSize.base, fontWeight: '600', color: Colors.textSecondary },
  deleteBtn: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, borderRadius: Radius.lg, backgroundColor: Colors.error,
  },
  deleteBtnText: { fontSize: FontSize.base, fontWeight: '700', color: Colors.textInverse },
});

// ─── Unacknowledged delete modal ──────────────────────────────────────────────

interface UnackModalProps {
  visible: boolean;
  onClose: () => void;
  lessons: Lesson[];
  pupils: Pupil[];
  onDelete: (ids: string[]) => Promise<void>;
}

function UnackDeleteModal({ visible, onClose, lessons, pupils, onDelete }: UnackModalProps) {
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const byPupil = useMemo(() => {
    const map = new Map<string, { pupil: Pupil | undefined; lessons: Lesson[] }>();
    for (const l of lessons) {
      if (Boolean(l.pupilAcknowledged)) continue;
      if (!map.has(l.pupilId)) {
        map.set(l.pupilId, { pupil: pupils.find(p => p.id === l.pupilId), lessons: [] });
      }
      map.get(l.pupilId)!.lessons.push(l);
    }
    return map;
  }, [lessons, pupils]);

  const allUnackIds = useMemo(
    () => lessons.filter(l => !Boolean(l.pupilAcknowledged)).map(l => l.id),
    [lessons],
  );

  useEffect(() => {
    if (visible && allUnackIds.length > 0) setSelected(new Set(allUnackIds));
  }, [visible, allUnackIds.join(',')]);

  const togglePupil = (pupilId: string) => {
    const entry = byPupil.get(pupilId);
    if (!entry) return;
    const ids = entry.lessons.map(l => l.id);
    const allIn = ids.every(id => selected.has(id));
    setSelected(prev => {
      const next = new Set(prev);
      if (allIn) ids.forEach(id => next.delete(id));
      else ids.forEach(id => next.add(id));
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === allUnackIds.length) setSelected(new Set());
    else setSelected(new Set(allUnackIds));
  };

  const handleDelete = async () => {
    if (selected.size === 0) return;
    setDeleting(true);
    await onDelete(Array.from(selected));
    setDeleting(false);
    onClose();
  };

  const unackCount = allUnackIds.length;

  if (unackCount === 0) {
    return (
      <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
        <View style={modalStyles.backdrop}>
          <View style={[modalStyles.sheet, { paddingBottom: insets.bottom + 16, padding: 24, alignItems: 'center', gap: 12 }]}>
            <MaterialIcons name="check-circle" size={40} color={Colors.success} />
            <Text style={modalStyles.title}>All lessons acknowledged</Text>
            <Text style={[modalStyles.subtitle, { textAlign: 'center' }]}>No lessons are currently waiting for pupil acknowledgement.</Text>
            <Pressable style={[modalStyles.cancelBtn, { width: '100%', marginTop: 8 }]} onPress={onClose}>
              <Text style={modalStyles.cancelText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={modalStyles.backdrop}>
        <View style={[modalStyles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={modalStyles.header}>
            <Pressable onPress={onClose} hitSlop={12}>
              <MaterialIcons name="close" size={22} color={Colors.textPrimary} />
            </Pressable>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={modalStyles.title}>Delete Unacknowledged</Text>
              <Text style={modalStyles.subtitle}>{unackCount} lesson{unackCount !== 1 ? 's' : ''} across this week</Text>
            </View>
            <Pressable onPress={toggleAll} style={modalStyles.selectAllBtn}>
              <MaterialIcons
                name={selected.size === allUnackIds.length ? 'deselect' : 'select-all'}
                size={16}
                color={Colors.warning}
              />
              <Text style={modalStyles.selectAllText}>
                {selected.size === allUnackIds.length ? 'None' : 'All'}
              </Text>
            </Pressable>
          </View>

          <ScrollView style={modalStyles.list} showsVerticalScrollIndicator={false}>
            {Array.from(byPupil.entries()).map(([pupilId, { pupil, lessons: pLessons }]) => {
              const ids = pLessons.map(l => l.id);
              const allIn = ids.every(id => selected.has(id));
              const someIn = ids.some(id => selected.has(id));
              return (
                <Pressable key={pupilId} style={modalStyles.pupilRow} onPress={() => togglePupil(pupilId)}>
                  <MaterialIcons
                    name={allIn ? 'check-box' : someIn ? 'indeterminate-check-box' : 'check-box-outline-blank'}
                    size={22}
                    color={allIn || someIn ? Colors.warning : Colors.textTertiary}
                  />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={modalStyles.pupilName}>
                      {pupil ? `${pupil.firstName} ${pupil.lastName}` : 'Unknown'}
                    </Text>
                    <Text style={modalStyles.pupilSub}>
                      {pLessons.length} lesson{pLessons.length !== 1 ? 's' : ''} · {pupil?.postcode ?? ''}
                    </Text>
                    {pLessons.map(l => (
                      <Text key={l.id} style={modalStyles.lessonLine}>
                        {l.date} at {l.startTime} ({l.duration} min)
                      </Text>
                    ))}
                  </View>
                  <View style={[modalStyles.badge, { backgroundColor: Colors.warning + '20' }]}>
                    <Text style={[modalStyles.badgeText, { color: Colors.warning }]}>{ids.filter(id => selected.has(id)).length}/{ids.length}</Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={modalStyles.footer}>
            <Pressable style={modalStyles.cancelBtn} onPress={onClose} disabled={deleting}>
              <Text style={modalStyles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[modalStyles.deleteBtn, (selected.size === 0 || deleting) && { opacity: 0.45 }]}
              onPress={handleDelete}
              disabled={selected.size === 0 || deleting}
            >
              {deleting ? (
                <ActivityIndicator size="small" color={Colors.textInverse} />
              ) : (
                <MaterialIcons name="delete" size={18} color={Colors.textInverse} />
              )}
              <Text style={modalStyles.deleteBtnText}>
                {deleting ? 'Deleting...' : `Delete ${selected.size} Lesson${selected.size !== 1 ? 's' : ''}`}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Schedule Result Modal ────────────────────────────────────────────────────

interface ScheduleResultModalProps {
  visible: boolean;
  result: ScheduleResult;
  onClose: () => void;
  onPreview: (suggestions: any[], unscheduled: any[]) => void;
  onExtend: (hours: number) => Promise<void>;
  onApplyAvailTweak: (s: AvailabilitySuggestion) => Promise<void>;
  onApplyAllTweaks: () => Promise<void>;
  onForceFit: (s: BestFitSuggestion) => Promise<void>;
}

function ScheduleResultModal({ visible, result, onClose, onPreview, onExtend, onApplyAvailTweak, onApplyAllTweaks, onForceFit }: ScheduleResultModalProps) {
  const insets = useSafeAreaInsets();
  const [extending, setExtending] = useState(false);
  const [applyingKey, setApplyingKey] = useState<string | null>(null);
  const [applyingAll, setApplyingAll] = useState(false);
  const [applyingForceFit, setApplyingForceFit] = useState<string | null>(null);
  const [showBestFit, setShowBestFit] = useState(false);

  const { unscheduled, extraHoursNeeded, dayExtensionNeeded, availabilitySuggestions, bestFitSuggestions } = result;
  const hasDayExt = Object.keys(dayExtensionNeeded).length > 0;
  const hasAvailSugg = availabilitySuggestions.length > 0;
  const hasBestFit = bestFitSuggestions.length > 0;

  const getTweakKey = (s: AvailabilitySuggestion) => `${s.pupilId}-${s.day}-${s.minutesShift}-${s.direction}`;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={srStyles.backdrop}>
        <View style={[srStyles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={srStyles.header}>
            <View style={srStyles.headerIcon}>
              <MaterialIcons name="warning" size={22} color={Colors.warning} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={srStyles.title}>{unscheduled.length} pupil{unscheduled.length !== 1 ? 's' : ''} could not be fitted</Text>
              <Text style={srStyles.subtitle}>The scheduler tried all day orderings — see options below</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12}>
              <MaterialIcons name="close" size={20} color={Colors.textTertiary} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 12, padding: 16 }}>
            <View style={srStyles.section}>
              <Text style={srStyles.sectionTitle}>Could Not Be Scheduled</Text>
              {unscheduled.map(u => (
                <View key={u.pupilId} style={srStyles.pupilRow}>
                  <MaterialIcons name="person-off" size={16} color={Colors.warning} />
                  <View style={{ flex: 1 }}>
                    <Text style={srStyles.pupilName}>{u.pupilName}</Text>
                    <Text style={srStyles.pupilReason}>{u.reason}</Text>
                  </View>
                </View>
              ))}
            </View>

            {hasDayExt && (
              <View style={srStyles.section}>
                <Text style={srStyles.sectionTitle}>Day Extensions That Would Help</Text>
                {Object.entries(dayExtensionNeeded).map(([day, mins]) => (
                  <View key={day} style={srStyles.extRow}>
                    <MaterialIcons name="more-time" size={14} color={Colors.info} />
                    <Text style={srStyles.extText}>Working <Text style={{ fontWeight: '700' }}>{mins} min longer on {day}</Text> would allow at least one more lesson</Text>
                  </View>
                ))}
              </View>
            )}

            {hasAvailSugg && (
              <View style={srStyles.tweakSection}>
                {/* Section header */}
                <View style={srStyles.tweakSectionHeader}>
                  <View style={srStyles.tweakSectionIconWrap}>
                    <MaterialIcons name="tips-and-updates" size={16} color={Colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={srStyles.tweakSectionTitle}>Availability Tweaks</Text>
                    <Text style={srStyles.tweakSectionSub}>
                      {availabilitySuggestions.length} small adjustment{availabilitySuggestions.length !== 1 ? 's' : ''} that unlock a lesson slot
                      {' — apply each, then the diary reschedules automatically'}
                    </Text>
                  </View>
                </View>

                {/* One card per suggestion — always visible, no toggle */}
                {availabilitySuggestions.map((s, i) => {
                  const tweakKey = getTweakKey(s);
                  const isApplying = applyingKey === tweakKey;
                  const isBlocked = applyingKey !== null && !isApplying;
                  const endMins = (() => {
                    const [h, m] = s.proposedSlotTime.split(':').map(Number);
                    return h * 60 + m + s.proposedDuration;
                  })();
                  const endTime = `${String(Math.floor(endMins / 60)).padStart(2, '0')}:${String(endMins % 60).padStart(2, '0')}`;
                  return (
                    <View key={i} style={[
                      srStyles.tweakCard,
                      i < availabilitySuggestions.length - 1 && { marginBottom: 10 },
                    ]}>
                      {/* Pupil + direction */}
                      <View style={srStyles.tweakCardHeader}>
                        <View style={srStyles.tweakCardIconWrap}>
                          <MaterialIcons
                            name={s.direction === 'earlier' ? 'arrow-upward' : 'arrow-downward'}
                            size={13}
                            color={Colors.primary}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={srStyles.tweakCardPupil}>{s.pupilName}</Text>
                          <Text style={srStyles.tweakCardDay}>{s.day} · shifts {s.minutesShift} min {s.direction}</Text>
                        </View>
                        {isApplying && <ActivityIndicator size="small" color={Colors.primary} />}
                      </View>

                      {/* Availability window before → after */}
                      <View style={srStyles.tweakWindowRow}>
                        <View style={srStyles.tweakWindowBox}>
                          <Text style={srStyles.tweakWindowLabel}>Current</Text>
                          <Text style={srStyles.tweakWindowTime}>{s.currentWindow.replace('-', '–')}</Text>
                        </View>
                        <MaterialIcons name="arrow-forward" size={14} color={Colors.primary} />
                        <View style={[srStyles.tweakWindowBox, srStyles.tweakWindowBoxNew]}>
                          <Text style={[srStyles.tweakWindowLabel, { color: Colors.primary }]}>After</Text>
                          <Text style={[srStyles.tweakWindowTime, { color: Colors.primary }]}>{s.suggestedStart}–{s.suggestedEnd}</Text>
                        </View>
                      </View>

                      {/* Proposed lesson slot */}
                      <View style={srStyles.tweakSlotRow}>
                        <MaterialIcons name="school" size={13} color={Colors.success} />
                        <Text style={srStyles.tweakSlotText}>
                          {'Lesson slot: '}
                          <Text style={{ fontWeight: '700', color: Colors.success }}>{s.proposedSlotTime}–{endTime}</Text>
                          {'  '}<Text style={srStyles.tweakSlotDur}>({s.proposedDuration} min)</Text>
                        </Text>
                      </View>

                      {/* Single action button */}
                      <Pressable
                        style={[srStyles.tweakApplyBtn, (isApplying || isBlocked) && { opacity: 0.45 }]}
                        disabled={isApplying || isBlocked}
                        onPress={async () => {
                          setApplyingKey(tweakKey);
                          await onApplyAvailTweak(s);
                          setApplyingKey(null);
                        }}
                      >
                        {isApplying
                          ? <ActivityIndicator size="small" color={Colors.navy} />
                          : <MaterialIcons name="check" size={14} color={Colors.navy} />}
                        <Text style={srStyles.tweakApplyBtnText}>
                          {isApplying ? 'Applying & Rescheduling...' : 'Apply Tweak & Reschedule'}
                        </Text>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            )}

            {hasBestFit && (
              <View style={srStyles.section}>
                <Pressable style={srStyles.suggToggle} onPress={() => setShowBestFit(v => !v)}>
                  <MaterialIcons name="event-note" size={16} color={Colors.secondary} />
                  <Text style={[srStyles.suggToggleText, { color: Colors.secondary }]}>
                    {bestFitSuggestions.length} best-fit slot{bestFitSuggestions.length !== 1 ? 's' : ''} available (needs pupil agreement)
                  </Text>
                  <MaterialIcons name={showBestFit ? 'expand-less' : 'expand-more'} size={18} color={Colors.secondary} />
                </Pressable>

                {showBestFit && bestFitSuggestions.map((s, i) => {
                  const key = `${s.pupilId}-${s.date}`;
                  const isApplying = applyingForceFit === key;
                  return (
                    <View key={i} style={srStyles.bestFitRow}>
                      <View style={srStyles.bestFitIconWrap}>
                        <MaterialIcons name="event-note" size={14} color={Colors.secondary} />
                      </View>
                      <View style={{ flex: 1, gap: 3 }}>
                        <Text style={srStyles.suggPupil}>{s.pupilName}</Text>
                        <View style={srStyles.bestFitTimeRow}>
                          <Text style={srStyles.bestFitDay}>{s.dayName}</Text>
                          <Text style={srStyles.bestFitSep}>·</Text>
                          <Text style={srStyles.bestFitTime}>{s.startTime}–{s.endTime}</Text>
                          <Text style={srStyles.bestFitDur}>({s.duration}m)</Text>
                        </View>
                        {s.overlapMins > 0 ? (
                          <View style={srStyles.bestFitWarningRow}>
                            <MaterialIcons name="info-outline" size={11} color={Colors.warning} />
                            <Text style={srStyles.bestFitWarningText}>
                              {s.overlapMins}m outside pupil's current availability — needs their agreement
                            </Text>
                          </View>
                        ) : (
                          <View style={srStyles.bestFitWarningRow}>
                            <MaterialIcons name="check-circle-outline" size={11} color={Colors.success} />
                            <Text style={[srStyles.bestFitWarningText, { color: Colors.success }]}>
                              Within instructor hours — pupil availability not set for this time
                            </Text>
                          </View>
                        )}
                        {s.instrEndOverflow > 0 && (
                          <View style={srStyles.bestFitWarningRow}>
                            <MaterialIcons name="schedule" size={11} color={Colors.error} />
                            <Text style={[srStyles.bestFitWarningText, { color: Colors.error }]}>
                              Runs {s.instrEndOverflow}m past your working day end
                            </Text>
                          </View>
                        )}
                        <Pressable
                          style={[srStyles.forceFitBtn, isApplying && { opacity: 0.5 }]}
                          disabled={isApplying || applyingForceFit !== null}
                          onPress={async () => {
                            setApplyingForceFit(key);
                            await onForceFit(s);
                            setApplyingForceFit(null);
                          }}
                        >
                          {isApplying
                            ? <ActivityIndicator size="small" color={Colors.textInverse} />
                            : <MaterialIcons name="add-circle-outline" size={13} color={Colors.textInverse} />}
                          <Text style={srStyles.forceFitBtnText}>
                            {isApplying ? 'Adding...' : 'Force Fit to Diary'}
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {result.suggestions.length > 0 && (
              <Pressable style={srStyles.previewBtn} onPress={() => onPreview(result.suggestions, result.unscheduled)}>
                <MaterialIcons name="check-circle" size={16} color={Colors.success} />
                <Text style={srStyles.previewBtnText}>Add {result.suggestions.length} Scheduled Lesson{result.suggestions.length !== 1 ? 's' : ''} to Diary</Text>
              </Pressable>
            )}
            {hasAvailSugg && availabilitySuggestions.length > 1 && (
              <Pressable style={[srStyles.applyAllBtn, (applyingAll || applyingKey !== null) && { opacity: 0.5 }]} disabled={applyingAll || applyingKey !== null}
                onPress={async () => { setApplyingAll(true); await onApplyAllTweaks(); setApplyingAll(false); }}>
                {applyingAll ? <ActivityIndicator size="small" color={Colors.textInverse} /> : <MaterialIcons name="auto-fix-high" size={16} color={Colors.textInverse} />}
                <Text style={srStyles.applyAllBtnText}>{applyingAll ? 'Applying...' : `Apply All ${availabilitySuggestions.length} Tweaks at Once & Reschedule`}</Text>
              </Pressable>
            )}
            {extraHoursNeeded > 0 && (
              <Pressable style={[srStyles.extendBtn, extending && { opacity: 0.5 }]} disabled={extending}
                onPress={async () => { setExtending(true); await onExtend(extraHoursNeeded); setExtending(false); }}>
                <MaterialIcons name="more-time" size={16} color={Colors.textInverse} />
                <Text style={srStyles.extendBtnText}>{extending ? 'Rescheduling...' : `Add ${extraHoursNeeded}h & Retry`}</Text>
              </Pressable>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const srStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: Colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85%', borderWidth: 1, borderColor: Colors.surfaceBorder },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: Spacing.md, paddingTop: 20, paddingBottom: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder },
  headerIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.warning + '20', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: FontSize.base, fontWeight: '700', color: Colors.textPrimary },
  subtitle: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  section: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.md, gap: 8, borderWidth: 1, borderColor: Colors.surfaceBorder },
  sectionTitle: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  pupilRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 4 },
  pupilName: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.textPrimary },
  pupilReason: { fontSize: FontSize.xs, color: Colors.warning, marginTop: 2 },
  extRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 4 },
  extText: { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 18 },
  // Availability tweak cards
  tweakSection: {
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    padding: Spacing.md, gap: 12,
    borderWidth: 1.5, borderColor: Colors.primary + '45',
  },
  tweakSectionHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  tweakSectionIconWrap: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: Colors.primary + '20', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  tweakSectionTitle: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.primary },
  tweakSectionSub: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2, lineHeight: 16 },
  tweakCard: {
    backgroundColor: Colors.background, borderRadius: Radius.md,
    padding: 12, gap: 10,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  tweakCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tweakCardIconWrap: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: Colors.primary + '20', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  tweakCardPupil: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.textPrimary },
  tweakCardDay: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 1 },
  tweakWindowRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tweakWindowBox: {
    flex: 1, backgroundColor: Colors.surfaceElevated, borderRadius: Radius.sm,
    padding: 8, alignItems: 'center', borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  tweakWindowBoxNew: { borderColor: Colors.primary + '60', backgroundColor: Colors.primary + '0C' },
  tweakWindowLabel: { fontSize: 9, fontWeight: '600', color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2 },
  tweakWindowTime: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textPrimary },
  tweakSlotRow: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: Colors.success + '10', borderRadius: Radius.sm,
    paddingHorizontal: 10, paddingVertical: 8,
    borderWidth: 1, borderColor: Colors.success + '35',
  },
  tweakSlotText: { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary },
  tweakSlotDur: { color: Colors.textTertiary },
  tweakApplyBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    backgroundColor: Colors.primary, borderRadius: Radius.md,
    paddingVertical: 11, paddingHorizontal: 14,
  },
  tweakApplyBtnText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.navy },
  // Legacy styles kept for best-fit section
  suggToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  suggToggleText: { flex: 1, fontSize: FontSize.sm, fontWeight: '600', color: Colors.primary },
  suggPupil: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.textPrimary },
  previewBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: Radius.lg, backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: Colors.success + '60' },
  previewBtnText: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.success },
  applyAllBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: Radius.lg, backgroundColor: Colors.info },
  applyAllBtnText: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.textInverse },
  extendBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: Radius.lg, backgroundColor: Colors.primary },
  extendBtnText: { fontSize: FontSize.base, fontWeight: '700', color: Colors.textInverse },
  bestFitRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: Colors.surfaceBorder },
  bestFitIconWrap: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.secondary + '20', alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  bestFitTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  bestFitDay: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textPrimary },
  bestFitSep: { fontSize: FontSize.xs, color: Colors.textTertiary },
  bestFitTime: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.secondary },
  bestFitDur: { fontSize: FontSize.xs, color: Colors.textTertiary },
  bestFitWarningRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
  bestFitWarningText: { flex: 1, fontSize: 10, color: Colors.warning, lineHeight: 15 },
  forceFitBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.secondary, borderRadius: Radius.sm, paddingHorizontal: 10, paddingVertical: 6, marginTop: 4, alignSelf: 'flex-start' },
  forceFitBtnText: { fontSize: 11, fontWeight: '700', color: Colors.textInverse },
});

// ─── Gap Analysis Modal ───────────────────────────────────────────────────────

interface GapInfo {
  gapMins: number;
  prevEnd: string;
  lessonStart: string;
  canShift: boolean;
  shiftMins: number;
  shiftablePupils: Array<{ name: string; from: string; to: string }>;
  inAvailWindow: boolean;
}

interface GapAnalysisModalProps {
  visible: boolean;
  gapInfo: GapInfo | null;
  lesson: Lesson | null;
  pupil: Pupil | null;
  weekDates: string[];
  onClose: () => void;
  onAccept: () => void;
  onApplyShift: (shiftMins: number) => Promise<void>;
  onReschedule: () => Promise<void>;
}

function GapAnalysisModal({ visible, gapInfo, lesson, pupil, weekDates, onClose, onAccept, onApplyShift, onReschedule }: GapAnalysisModalProps) {
  const insets = useSafeAreaInsets();
  const [doingShift, setDoingShift] = useState(false);
  const [doingResched, setDoingResched] = useState(false);

  if (!gapInfo || !lesson || !pupil) return null;

  const { gapMins, prevEnd, lessonStart, canShift, shiftMins, shiftablePupils, inAvailWindow } = gapInfo;
  const hasGap = gapMins > 0;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={gaStyles.backdrop}>
        <View style={[gaStyles.sheet, { paddingBottom: insets.bottom + 20 }]}>
          <View style={gaStyles.handle} />
          <View style={gaStyles.header}>
            <View style={[gaStyles.headerIcon, { backgroundColor: hasGap ? Colors.warning + '20' : Colors.success + '20' }]}>
              <MaterialIcons name={hasGap ? 'schedule' : 'check-circle'} size={22} color={hasGap ? Colors.warning : Colors.success} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={gaStyles.title}>{hasGap ? `${gapMins} min gap before lesson` : 'Lesson rescheduled'}</Text>
              <Text style={gaStyles.subtitle}>{pupil.firstName} {pupil.lastName} · now at {lessonStart}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12}><MaterialIcons name="close" size={20} color={Colors.textTertiary} /></Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 14, padding: 20 }}>
            {/* Timeline card */}
            <View style={gaStyles.timeCard}>
              <View style={gaStyles.timeRow}>
                <View style={gaStyles.timeBlock}>
                  <Text style={gaStyles.timeBlockLabel}>Previous ends</Text>
                  <Text style={gaStyles.timeBlockVal}>{prevEnd}</Text>
                </View>
                <MaterialIcons name="arrow-forward" size={16} color={Colors.textTertiary} />
                {hasGap && (
                  <View style={gaStyles.gapBadge}>
                    <MaterialIcons name="hourglass-empty" size={12} color={Colors.warning} />
                    <Text style={gaStyles.gapBadgeText}>{gapMins} min</Text>
                  </View>
                )}
                <MaterialIcons name="arrow-forward" size={16} color={Colors.textTertiary} />
                <View style={gaStyles.timeBlock}>
                  <Text style={gaStyles.timeBlockLabel}>{pupil.firstName}'s lesson</Text>
                  <Text style={[gaStyles.timeBlockVal, { color: Colors.primary }]}>{lessonStart}</Text>
                </View>
              </View>
              {!inAvailWindow && (
                <View style={gaStyles.outsideRow}>
                  <MaterialIcons name="info-outline" size={13} color={Colors.warning} />
                  <Text style={gaStyles.outsideText}>{lessonStart} is outside {pupil.firstName}'s usual window. Consider updating availability.</Text>
                </View>
              )}
            </View>

            {!hasGap && (
              <View style={gaStyles.noGapRow}>
                <MaterialIcons name="check-circle" size={16} color={Colors.success} />
                <Text style={gaStyles.noGapText}>No idle gap — lesson fits perfectly. Optionally re-optimise the full week around this new time.</Text>
              </View>
            )}

            {/* Option: shift day later */}
            {hasGap && canShift && (
              <View style={gaStyles.optionCard}>
                <View style={gaStyles.optionHead}>
                  <View style={[gaStyles.optionIcon, { backgroundColor: Colors.primary + '20' }]}>
                    <MaterialIcons name="alarm" size={18} color={Colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={gaStyles.optionTitle}>Start {shiftMins} min later this morning</Text>
                    <Text style={gaStyles.optionSub}>Slide earlier lessons forward to close the gap — all pupils still fit their windows</Text>
                  </View>
                </View>
                {shiftablePupils.map((sp, i) => (
                  <View key={i} style={gaStyles.shiftRow}>
                    <MaterialIcons name="person" size={12} color={Colors.textTertiary} />
                    <Text style={gaStyles.shiftName}>{sp.name}</Text>
                    <Text style={gaStyles.shiftFrom}>{sp.from}</Text>
                    <MaterialIcons name="arrow-forward" size={11} color={Colors.primary} />
                    <Text style={gaStyles.shiftTo}>{sp.to}</Text>
                  </View>
                ))}
                <Pressable style={[gaStyles.optBtn, doingShift && { opacity: 0.5 }]}
                  onPress={async () => { setDoingShift(true); await onApplyShift(shiftMins); setDoingShift(false); }}
                  disabled={doingShift || doingResched}
                >
                  {doingShift ? <ActivityIndicator size="small" color={Colors.navy} /> : <MaterialIcons name="arrow-downward" size={14} color={Colors.navy} />}
                  <Text style={gaStyles.optBtnText}>{doingShift ? 'Applying…' : `Start ${shiftMins} min later`}</Text>
                </Pressable>
              </View>
            )}

            {/* Option: re-run Smart Schedule */}
            <View style={gaStyles.optionCard}>
              <View style={gaStyles.optionHead}>
                <View style={[gaStyles.optionIcon, { backgroundColor: Colors.success + '20' }]}>
                  <MaterialIcons name="auto-fix-high" size={18} color={Colors.success} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={gaStyles.optionTitle}>Re-run Smart Schedule</Text>
                  <Text style={gaStyles.optionSub}>Re-optimise the full week around this new lesson time, minimising total drive distance</Text>
                </View>
              </View>
              <Pressable style={[gaStyles.optBtn, { backgroundColor: Colors.success }, doingResched && { opacity: 0.5 }]}
                onPress={async () => { setDoingResched(true); await onReschedule(); setDoingResched(false); }}
                disabled={doingResched || doingShift}
              >
                {doingResched ? <ActivityIndicator size="small" color={Colors.textInverse} /> : <MaterialIcons name="star" size={14} color={Colors.textInverse} />}
                <Text style={[gaStyles.optBtnText, { color: Colors.textInverse }]}>{doingResched ? 'Rescheduling…' : 'Re-run Smart Schedule'}</Text>
              </Pressable>
            </View>

            {/* Option: accept gap */}
            {hasGap && (
              <View style={gaStyles.optionCard}>
                <View style={gaStyles.optionHead}>
                  <View style={[gaStyles.optionIcon, { backgroundColor: Colors.textTertiary + '18' }]}>
                    <MaterialIcons name="check" size={18} color={Colors.textTertiary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={gaStyles.optionTitle}>Accept the {gapMins} min gap</Text>
                    <Text style={gaStyles.optionSub}>Keep the diary as-is — the idle time before {pupil.firstName}'s lesson is fine</Text>
                  </View>
                </View>
                <Pressable style={[gaStyles.optBtn, { backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: Colors.surfaceBorder }]} onPress={onAccept}>
                  <MaterialIcons name="check" size={14} color={Colors.textSecondary} />
                  <Text style={[gaStyles.optBtnText, { color: Colors.textSecondary }]}>Proceed with gap</Text>
                </Pressable>
              </View>
            )}

            {/* No gap accept */}
            {!hasGap && (
              <Pressable style={[gaStyles.optBtn, { backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: Colors.surfaceBorder }]} onPress={onAccept}>
                <Text style={[gaStyles.optBtnText, { color: Colors.textSecondary }]}>Keep diary as-is</Text>
              </Pressable>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const gaStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: Colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: Colors.surfaceBorder, paddingTop: 8, maxHeight: '88%' },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.textTertiary + '60', alignSelf: 'center', marginBottom: 4 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder },
  headerIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary },
  subtitle: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  timeCard: { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.surfaceBorder, gap: 10 },
  timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  timeBlock: { flex: 1, alignItems: 'center', gap: 3 },
  timeBlockLabel: { fontSize: 9, fontWeight: '600', color: Colors.textTertiary, textTransform: 'uppercase', textAlign: 'center' },
  timeBlockVal: { fontSize: FontSize.md, fontWeight: '800', color: Colors.textPrimary, textAlign: 'center' },
  gapBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.warning + '22', borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: Colors.warning + '55' },
  gapBadgeText: { fontSize: 11, fontWeight: '700', color: Colors.warning },
  outsideRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: Colors.warning + '10', borderRadius: Radius.sm, padding: 8, borderWidth: 1, borderColor: Colors.warning + '35' },
  outsideText: { flex: 1, fontSize: FontSize.xs, color: Colors.warning, lineHeight: 16 },
  noGapRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: Colors.success + '10', borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1, borderColor: Colors.success + '40' },
  noGapText: { flex: 1, fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20 },
  optionCard: { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.surfaceBorder, gap: 10 },
  optionHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  optionIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  optionTitle: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.textPrimary },
  optionSub: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 3, lineHeight: 17 },
  shiftRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 4 },
  shiftName: { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: '600' },
  shiftFrom: { fontSize: FontSize.xs, color: Colors.textTertiary, textDecorationLine: 'line-through' },
  shiftTo: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: '700' },
  optBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: 12 },
  optBtnText: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.navy },
});

// ─── Working Hours Editor Modal ─────────────────────────────────────────────

const WH_DAY_TIMES: string[] = [];
for (let h = 0; h < 24; h++) {
  for (const m of [0, 15, 30, 45]) {
    WH_DAY_TIMES.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }
}

function WHTimePicker({ label, value, onChange, accent }: { label: string; value: string; onChange: (v: string) => void; accent: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const ref = useRef<React.ElementRef<typeof Pressable>>(null);
  const scrH = Dimensions.get('window').height;
  const dropH = Math.min(220, scrH * 0.35);
  const onOpen = () => {
    if (open) { setOpen(false); return; }
    (ref.current as any)?.measure?.(
      (_: number, __: number, w: number, h: number, px: number, py: number) =>
        { setPos({ x: px, y: py, w, h }); setOpen(true); }
    );
  };
  const flipUp = pos ? pos.y + pos.h + dropH > scrH - 60 : false;
  return (
    <View style={{ flex: 1, gap: 3 }}>
      <Text style={{ fontSize: 9, fontWeight: '700', color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</Text>
      <Pressable ref={ref}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.surfaceElevated, borderRadius: Radius.sm, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: open ? accent : Colors.surfaceBorder }}
        onPress={onOpen}
      >
        <Text style={{ fontSize: FontSize.sm, fontWeight: '700', color: open ? accent : Colors.textPrimary }}>{value}</Text>
        <MaterialIcons name={open ? 'expand-less' : 'expand-more'} size={14} color={open ? accent : Colors.textTertiary} />
      </Pressable>
      {open && pos && (
        <Modal visible transparent animationType="none" onRequestClose={() => setOpen(false)}>
          <Pressable style={{ flex: 1 }} onPress={() => setOpen(false)}>
            <View style={[{ position: 'absolute', left: pos.x, width: pos.w, backgroundColor: Colors.background, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.surfaceBorder, maxHeight: dropH, ...Shadow.md },
              flipUp ? { bottom: scrH - pos.y + 4 } : { top: pos.y + pos.h + 4 }]}>
              <ScrollView showsVerticalScrollIndicator={false} nestedScrollEnabled>
                {WH_DAY_TIMES.map(t => (
                  <Pressable key={t}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder + '60', backgroundColor: value === t ? accent + '18' : 'transparent' }}
                    onPress={() => { onChange(t); setOpen(false); }}
                  >
                    <Text style={{ fontSize: FontSize.sm, color: value === t ? accent : Colors.textPrimary, fontWeight: value === t ? '700' : '400' }}>{t}</Text>
                    {value === t && <MaterialIcons name="check" size={13} color={accent} />}
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          </Pressable>
        </Modal>
      )}
    </View>
  );
}

interface WorkingHoursEditorModalProps {
  visible: boolean;
  currentAvailability: any;
  weekLessons: Lesson[];
  onSave: (updated: any) => Promise<void>;
  onClose: () => void;
}

function WorkingHoursEditorModal({ visible, currentAvailability, weekLessons, onSave, onClose }: WorkingHoursEditorModalProps) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<any>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) setDraft(JSON.parse(JSON.stringify(currentAvailability)));
  }, [visible]);

  const setDay = (day: string, patch: any) => {
    setDraft((d: any) => ({ ...d, [day]: { ...d[day], ...patch } }));
  };

  const conflicts = useMemo(() => {
    const result: Array<{ day: string; reason: string }> = [];
    for (const lesson of weekLessons) {
      const d = new Date(lesson.date + 'T12:00:00'); // midday avoids DST boundary
      const dayRaw = d.getDay();
      const dayName = DAY_NAMES_FULL[dayRaw === 0 ? 6 : dayRaw - 1];
      const dayDraft = draft[dayName];
      if (!dayDraft) continue;
      const lStart = toMinsLocal(lesson.startTime);
      const lEnd = lStart + lesson.duration;
      if (!dayDraft.enabled) {
        result.push({ day: dayName, reason: `Lesson at ${lesson.startTime} — day now disabled` });
      } else if (lStart < toMinsLocal(dayDraft.startTime) || lEnd > toMinsLocal(dayDraft.endTime)) {
        result.push({ day: dayName, reason: `Lesson at ${lesson.startTime} outside ${dayDraft.startTime}–${dayDraft.endTime}` });
      }
    }
    return result;
  }, [draft, weekLessons]);

  const handleSave = async () => {
    setSaving(true);
    await onSave(draft);
    setSaving(false);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={whStyles.backdrop}>
        <View style={[whStyles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={whStyles.handle} />
          <View style={whStyles.header}>
            <View style={whStyles.headerIcon}><MaterialIcons name="access-time" size={20} color={Colors.primary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={whStyles.title}>Edit Working Hours</Text>
              <Text style={whStyles.subtitle}>Saves & triggers a pre-schedule analysis</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12}><MaterialIcons name="close" size={20} color={Colors.textTertiary} /></Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 10, padding: 16 }}>
            {conflicts.length > 0 && (
              <View style={whStyles.conflictBanner}>
                <MaterialIcons name="warning" size={14} color={Colors.warning} />
                <View style={{ flex: 1 }}>
                  <Text style={whStyles.conflictBannerTitle}>{conflicts.length} existing lesson{conflicts.length !== 1 ? 's' : ''} may be affected</Text>
                  {conflicts.slice(0, 3).map((c, i) => <Text key={i} style={whStyles.conflictBannerItem}>• {c.day}: {c.reason}</Text>)}
                </View>
              </View>
            )}
            {DAY_NAMES_FULL.map(day => {
              const d = draft[day] ?? { enabled: true, startTime: '08:00', endTime: '18:00' };
              return (
                <View key={day} style={[whStyles.dayCard, !d.enabled && whStyles.dayCardOff]}>
                  <View style={whStyles.dayCardHeader}>
                    <Pressable style={[whStyles.toggle, d.enabled && { backgroundColor: Colors.success }]} onPress={() => setDay(day, { enabled: !d.enabled })}>
                      <View style={[whStyles.toggleThumb, d.enabled && whStyles.toggleThumbOn]} />
                    </Pressable>
                    <Text style={[whStyles.dayName, !d.enabled && { color: Colors.textTertiary }]}>{day.slice(0, 3)}</Text>
                    <Text style={[whStyles.dayFull, !d.enabled && { opacity: 0.5 }]}>{day.slice(3)}</Text>
                    <View style={{ flex: 1 }} />
                    {d.enabled ? <Text style={whStyles.daySpan}>{d.startTime} – {d.endTime}</Text> : <View style={whStyles.offBadge}><Text style={whStyles.offBadgeText}>Off</Text></View>}
                  </View>
                  <View style={[whStyles.dayCardBody, !d.enabled && { opacity: 0.3 }]} pointerEvents={d.enabled ? 'auto' : 'none'}>
                    <WHTimePicker label="Start" value={d.startTime} onChange={v => setDay(day, { startTime: v })} accent={Colors.success} />
                    <Text style={whStyles.timeSep}>→</Text>
                    <WHTimePicker label="End" value={d.endTime} onChange={v => setDay(day, { endTime: v })} accent={Colors.error} />
                  </View>
                </View>
              );
            })}
            <View style={whStyles.infoBox}>
              <MaterialIcons name="info-outline" size={13} color={Colors.info} />
              <Text style={whStyles.infoText}>After saving, a Pre-Schedule Analysis will show available slots and offer to shift any lessons that fall outside your new hours.</Text>
            </View>
          </ScrollView>
          <View style={whStyles.footer}>
            <Pressable style={whStyles.cancelBtn} onPress={onClose} disabled={saving}>
              <Text style={whStyles.cancelBtnText}>Cancel</Text>
            </Pressable>
            <Pressable style={[whStyles.saveBtn, saving && { opacity: 0.5 }]} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator size="small" color={Colors.navy} /> : <MaterialIcons name="check" size={16} color={Colors.navy} />}
              <Text style={whStyles.saveBtnText}>{saving ? 'Saving…' : 'Save & Analyse'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const whStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: Colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: Colors.surfaceBorder, paddingTop: 8, maxHeight: '92%' },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.textTertiary + '60', alignSelf: 'center', marginBottom: 4 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder },
  headerIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.primary + '20', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary },
  subtitle: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  conflictBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: Colors.warning + '12', borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1.5, borderColor: Colors.warning + '45' },
  conflictBannerTitle: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.warning, marginBottom: 3 },
  conflictBannerItem: { fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 17 },
  dayCard: { backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.surfaceBorder, overflow: 'hidden' },
  dayCardOff: { backgroundColor: Colors.surfaceElevated },
  dayCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder },
  dayName: { fontSize: FontSize.sm, fontWeight: '800', color: Colors.textPrimary },
  dayFull: { fontSize: FontSize.sm, color: Colors.textSecondary },
  offBadge: { backgroundColor: Colors.surfaceBorder, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  offBadgeText: { fontSize: 10, fontWeight: '700', color: Colors.textTertiary },
  daySpan: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: '700' },
  dayCardBody: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 14, paddingVertical: 10 },
  timeSep: { fontSize: FontSize.xs, color: Colors.textTertiary, paddingTop: 22 },
  toggle: { width: 40, height: 22, borderRadius: 11, backgroundColor: Colors.surfaceBorder, justifyContent: 'center', paddingHorizontal: 2 },
  toggleThumb: { width: 18, height: 18, borderRadius: 9, backgroundColor: Colors.textTertiary, alignSelf: 'flex-start' },
  toggleThumbOn: { alignSelf: 'flex-end', backgroundColor: Colors.textInverse },
  infoBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: Colors.info + '10', borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1, borderColor: Colors.info + '35' },
  infoText: { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 17 },
  footer: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingTop: 14, borderTopWidth: 1, borderTopColor: Colors.surfaceBorder },
  cancelBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 13, borderRadius: Radius.lg, backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: Colors.surfaceBorder },
  cancelBtnText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textSecondary },
  saveBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13, borderRadius: Radius.lg, backgroundColor: Colors.primary },
  saveBtnText: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.navy },
});

// ─── Pre-Schedule Analysis Modal ─────────────────────────────────────────────

interface PreScheduleAnalysisModalProps {
  visible: boolean;
  affectedLessons: Array<{ lesson: Lesson; issue: string; suggestedTime?: string }>;
  availableSlots: Array<{ date: string; dayName: string; startTime: string; endTime: string; durationMins: number; hasEnoughForLesson: boolean }>;
  weekDates: string[];
  newAvailability: any;
  onClose: () => void;
  onShiftLessons: (updates: Array<{ lesson: Lesson; newStartTime: string }>) => Promise<void>;
  onRunFullWeek: () => Promise<void>;
  onRunDay: (dateStr: string) => Promise<void>;
}

function PreScheduleAnalysisModal({ visible, affectedLessons, availableSlots, weekDates, newAvailability, onClose, onShiftLessons, onRunFullWeek, onRunDay }: PreScheduleAnalysisModalProps) {
  const insets = useSafeAreaInsets();
  const [shifting, setShifting] = useState(false);
  const [runningWeek, setRunningWeek] = useState(false);
  const [runningDay, setRunningDay] = useState<string | null>(null);
  const [selDay, setSelDay] = useState(0);

  const daySlots = useMemo(() => {
    const date = weekDates[selDay];
    return availableSlots.filter(s => s.date === date);
  }, [availableSlots, weekDates, selDay]);

  const hasAffected = affectedLessons.length > 0;
  const shiftable = affectedLessons.filter(a => a.suggestedTime);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={psStyles.backdrop}>
        <View style={[psStyles.sheet, { paddingBottom: insets.bottom + 20 }]}>
          <View style={psStyles.handle} />
          <View style={psStyles.header}>
            <View style={[psStyles.headerIcon, { backgroundColor: hasAffected ? Colors.warning + '20' : Colors.success + '20' }]}>
              <MaterialIcons name={hasAffected ? 'warning' : 'check-circle'} size={22} color={hasAffected ? Colors.warning : Colors.success} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={psStyles.title}>Pre-Schedule Analysis</Text>
              <Text style={psStyles.subtitle}>{hasAffected ? `${affectedLessons.length} lesson${affectedLessons.length !== 1 ? 's' : ''} affected` : 'Hours updated — no conflicts'}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12}><MaterialIcons name="close" size={20} color={Colors.textTertiary} /></Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 14, padding: 20 }}>
            {hasAffected && (
              <View style={psStyles.section}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <MaterialIcons name="event-busy" size={14} color={Colors.warning} />
                  <Text style={[psStyles.sectionTitle, { color: Colors.warning }]}>Lessons Outside New Hours</Text>
                </View>
                {affectedLessons.map((a, i) => (
                  <View key={i} style={psStyles.affectedRow}>
                    <View style={[psStyles.affectedIcon, { backgroundColor: Colors.warning + '18' }]}>
                      <MaterialIcons name="schedule" size={14} color={Colors.warning} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={psStyles.affectedTime}>{a.lesson.date} · {a.lesson.startTime} ({a.lesson.duration}m)</Text>
                      <Text style={psStyles.affectedReason}>{a.issue === 'day_disabled' ? 'Day disabled' : 'Outside hours'}{a.suggestedTime ? ` → shift to ${a.suggestedTime}` : ' → no slot available'}</Text>
                    </View>
                    {a.suggestedTime && (
                      <View style={psStyles.sugBadge}><Text style={psStyles.sugBadgeText}>{a.suggestedTime}</Text></View>
                    )}
                  </View>
                ))}
                {shiftable.length > 0 && (
                  <Pressable
                    style={[psStyles.actionBtn, { backgroundColor: Colors.warning + '15', borderColor: Colors.warning + '50' }, shifting && { opacity: 0.5 }]}
                    onPress={async () => { setShifting(true); await onShiftLessons(shiftable.map(a => ({ lesson: a.lesson, newStartTime: a.suggestedTime! }))); setShifting(false); }}
                    disabled={shifting || runningWeek || runningDay !== null}
                  >
                    {shifting ? <ActivityIndicator size="small" color={Colors.warning} /> : <MaterialIcons name="swap-horiz" size={16} color={Colors.warning} />}
                    <Text style={[psStyles.actionBtnText, { color: Colors.warning }]}>{shifting ? 'Shifting…' : `Shift ${shiftable.length} Lesson${shiftable.length !== 1 ? 's' : ''} to New Hours Only`}</Text>
                  </Pressable>
                )}
              </View>
            )}
            <View style={psStyles.section}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <MaterialIcons name="event-available" size={14} color={Colors.success} />
                <Text style={[psStyles.sectionTitle, { color: Colors.success }]}>Available Slots Preview</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 4 }}>
                {weekDates.map((date, i) => {
                  const dn = DAY_NAMES_FULL[new Date(date).getDay() === 0 ? 6 : new Date(date).getDay() - 1];
                  const enabled = newAvailability?.[dn]?.enabled !== false;
                  const slotCount = availableSlots.filter(s => s.date === date && s.hasEnoughForLesson).length;
                  const active = selDay === i;
                  return (
                    <Pressable key={date} style={[psStyles.dayChip, active && { backgroundColor: Colors.primary, borderColor: Colors.primary }, !enabled && { opacity: 0.3 }]} onPress={() => setSelDay(i)} disabled={!enabled}>
                      <Text style={[psStyles.dayChipLabel, active && { color: Colors.textInverse }]}>{DAY_LABELS[i]}</Text>
                      {slotCount > 0 && <View style={[psStyles.dayChipBadge, active && { backgroundColor: 'rgba(255,255,255,0.25)' }]}><Text style={[psStyles.dayChipBadgeText, active && { color: Colors.textInverse }]}>{slotCount}</Text></View>}
                    </Pressable>
                  );
                })}
              </ScrollView>
              {daySlots.length === 0 ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }}>
                  <MaterialIcons name="block" size={14} color={Colors.textTertiary} />
                  <Text style={{ fontSize: FontSize.sm, color: Colors.textTertiary }}>No available slots on this day</Text>
                </View>
              ) : (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {daySlots.map((slot, i) => (
                    <View key={i} style={[
                      psStyles.slotChip,
                      slot.hasEnoughForLesson ? { backgroundColor: Colors.success + '18', borderColor: Colors.success + '50' } : { backgroundColor: Colors.surfaceElevated, borderColor: Colors.surfaceBorder },
                    ]}>
                      <Text style={[psStyles.slotChipText, slot.hasEnoughForLesson && { color: Colors.success, fontWeight: '700' }]}>{slot.startTime}–{slot.endTime}</Text>
                      <Text style={{ fontSize: 10, color: Colors.textTertiary }}>{slot.durationMins}m</Text>
                    </View>
                  ))}
                </View>
              )}
              <Pressable
                style={[psStyles.actionBtn, { backgroundColor: Colors.info + '12', borderColor: Colors.info + '45' }, runningDay !== null && { opacity: 0.5 }]}
                onPress={async () => { const date = weekDates[selDay]; setRunningDay(date); await onRunDay(date); setRunningDay(null); }}
                disabled={runningDay !== null || runningWeek || shifting}
              >
                {runningDay !== null ? <ActivityIndicator size="small" color={Colors.info} /> : <MaterialIcons name="calendar-today" size={15} color={Colors.info} />}
                <Text style={[psStyles.actionBtnText, { color: Colors.info }]}>{runningDay !== null ? 'Running…' : `Preview This Day (${DAY_LABELS[selDay]})`}</Text>
              </Pressable>
            </View>
            <View style={psStyles.fullWeekCard}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.success + '18', alignItems: 'center', justifyContent: 'center' }}>
                  <MaterialIcons name="auto-fix-high" size={20} color={Colors.success} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: FontSize.base, fontWeight: '700', color: Colors.textPrimary }}>Full Week Re-Schedule</Text>
                  <Text style={{ fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 3, lineHeight: 17 }}>Re-optimise all lessons within the new working hours</Text>
                </View>
              </View>
              <Pressable
                style={[psStyles.actionBtn, { backgroundColor: Colors.success, borderColor: Colors.success }, runningWeek && { opacity: 0.5 }]}
                onPress={async () => { setRunningWeek(true); await onRunFullWeek(); setRunningWeek(false); }}
                disabled={runningWeek || runningDay !== null || shifting}
              >
                {runningWeek ? <ActivityIndicator size="small" color={Colors.textInverse} /> : <MaterialIcons name="star" size={15} color={Colors.textInverse} />}
                <Text style={[psStyles.actionBtnText, { color: Colors.textInverse }]}>{runningWeek ? 'Rescheduling…' : 'Run Full Week Smart Schedule'}</Text>
              </Pressable>
            </View>
            <Pressable style={{ alignItems: 'center', paddingVertical: 12, borderRadius: Radius.md, backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: Colors.surfaceBorder }} onPress={onClose}>
              <Text style={{ fontSize: FontSize.sm, fontWeight: '600', color: Colors.textSecondary }}>Close — handle manually</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const psStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: Colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: Colors.surfaceBorder, paddingTop: 8, maxHeight: '90%' },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.textTertiary + '60', alignSelf: 'center', marginBottom: 4 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder },
  headerIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary },
  subtitle: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  section: { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.surfaceBorder, gap: 10 },
  sectionTitle: { fontSize: FontSize.xs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  affectedRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 4 },
  affectedIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 },
  affectedTime: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.textPrimary },
  affectedReason: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2, lineHeight: 16 },
  sugBadge: { backgroundColor: Colors.success + '20', borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: Colors.success + '50' },
  sugBadgeText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.success },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: Radius.md, borderWidth: 1.5 },
  actionBtnText: { fontSize: FontSize.sm, fontWeight: '700' },
  dayChip: { alignItems: 'center', paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radius.md, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.surfaceBorder, flexDirection: 'row', gap: 5 },
  dayChipLabel: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textSecondary },
  dayChipBadge: { backgroundColor: Colors.success + '25', borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1 },
  dayChipBadgeText: { fontSize: 9, fontWeight: '800', color: Colors.success },
  slotChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.sm, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1 },
  slotChipText: { fontSize: FontSize.xs, color: Colors.textSecondary },
  fullWeekCard: { backgroundColor: Colors.success + '06', borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1.5, borderColor: Colors.success + '35', gap: 12 },
});

// ─── Availability Conflict Modal ─────────────────────────────────────────────

interface AvailabilityConflictModalProps {
  visible: boolean;
  lesson: Lesson | null;
  pupil: Pupil | null;
  onClose: () => void;
  onDelete: () => Promise<void>;
  onDeleteAndReschedule: () => Promise<void>;
  onEditTime: () => void;
}

function AvailabilityConflictModal({ visible, lesson, pupil, onClose, onDelete, onDeleteAndReschedule, onEditTime }: AvailabilityConflictModalProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [acting, setActing] = useState<'delete' | 'reschedule' | null>(null);

  if (!lesson || !pupil) return null;

  const d = new Date(lesson.date + 'T12:00:00'); // midday avoids DST boundary
  const dayRaw = d.getDay(); // 0=Sun
  const dayIndex = dayRaw === 0 ? 6 : dayRaw - 1;
  const dayName = DAY_NAMES_FULL[dayIndex];

  const lStart = toMinsLocal(lesson.startTime);
  const lEnd = lStart + lesson.duration;
  const lEndStr = fromMinsLocal(lEnd);

  // Build the pupil's windows for this day
  const specific = pupil.availability?.specificDates?.find(s => s.date === lesson.date);
  const slots = specific
    ? [{ startTime: specific.startTime, endTime: specific.endTime, day: dayName }]
    : (pupil.availability?.recurringSlots?.filter(s => s.day === dayName) ?? []);

  const windows = slots
    .map(s => ({ start: toMinsLocal(s.startTime), end: toMinsLocal(s.endTime) }))
    .sort((a, b) => a.start - b.start)
    .reduce((acc: Array<{ start: number; end: number }>, w) => {
      if (acc.length === 0) return [{ ...w }];
      const last = acc[acc.length - 1];
      if (w.start <= last.end) { last.end = Math.max(last.end, w.end); return acc; }
      return [...acc, { ...w }];
    }, []);

  const lessonFits = windows.some(w => lStart >= w.start && lEnd <= w.end);

  const handleDelete = async () => {
    setActing('delete');
    await onDelete();
    setActing(null);
  };

  const handleDeleteAndReschedule = async () => {
    setActing('reschedule');
    await onDeleteAndReschedule();
    setActing(null);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={acStyles.backdrop}>
        <View style={[acStyles.sheet, { paddingBottom: insets.bottom + 20 }]}>
          <View style={acStyles.handle} />

          {/* Header */}
          <View style={acStyles.header}>
            <View style={acStyles.headerIcon}>
              <MaterialIcons name="event-busy" size={22} color="#FF3B30" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={acStyles.title}>Availability Conflict</Text>
              <Text style={acStyles.subtitle}>
                {pupil.firstName} {pupil.lastName} · {dayName}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12}>
              <MaterialIcons name="close" size={20} color={Colors.textTertiary} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 14, padding: 20 }}>

            {/* Lesson time card */}
            <View style={acStyles.lessonCard}>
              <View style={acStyles.cardRow}>
                <View style={[acStyles.cardIconWrap, { backgroundColor: '#FF3B3020' }]}>
                  <MaterialIcons name="schedule" size={18} color="#FF3B30" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={acStyles.cardLabel}>Scheduled Lesson</Text>
                  <Text style={acStyles.cardTime}>
                    {lesson.startTime} – {lEndStr}
                    <Text style={acStyles.cardDur}>{'  '}{lesson.duration} min</Text>
                  </Text>
                </View>
                <View style={acStyles.conflictBadge}>
                  <MaterialIcons name="warning" size={11} color="#FF3B30" />
                  <Text style={acStyles.conflictBadgeText}>Outside window</Text>
                </View>
              </View>
            </View>

            {/* Pupil's availability windows for this day */}
            <View style={acStyles.section}>
              <Text style={acStyles.sectionTitle}>
                {pupil.firstName}'s availability on {dayName}
              </Text>
              {windows.length === 0 ? (
                <View style={acStyles.noWindowRow}>
                  <MaterialIcons name="block" size={16} color={Colors.textTertiary} />
                  <Text style={acStyles.noWindowText}>No availability set for this day</Text>
                </View>
              ) : (
                windows.map((w, i) => {
                  const overlaps = lStart < w.end && lEnd > w.start;
                  const fits = lStart >= w.start && lEnd <= w.end;
                  return (
                    <View key={i} style={[acStyles.windowRow, fits && acStyles.windowRowFit]}>
                      <View style={[acStyles.windowDot, { backgroundColor: fits ? Colors.success : overlaps ? Colors.warning : Colors.textTertiary }]} />
                      <Text style={acStyles.windowTime}>
                        {fromMinsLocal(w.start)} – {fromMinsLocal(w.end)}
                      </Text>
                      <Text style={[acStyles.windowSpan, { color: Colors.textTertiary }]}>
                        ({w.end - w.start} min)
                      </Text>
                      {fits && (
                        <View style={acStyles.fitsChip}>
                          <MaterialIcons name="check" size={10} color={Colors.success} />
                          <Text style={acStyles.fitsChipText}>Lesson fits</Text>
                        </View>
                      )}
                    </View>
                  );
                })
              )}
            </View>

            {/* Visual timeline */}
            <View style={acStyles.section}>
              <Text style={acStyles.sectionTitle}>Timeline comparison</Text>
              <View style={acStyles.timeline}>
                {/* Availability bands */}
                {windows.map((w, i) => {
                  const timelineStart = Math.min(lStart - 30, windows.length > 0 ? windows[0].start : lStart);
                  const timelineEnd = Math.max(lEnd + 30, windows.length > 0 ? windows[windows.length - 1].end : lEnd);
                  const span = Math.max(timelineEnd - timelineStart, 60);
                  const left = ((w.start - timelineStart) / span) * 100;
                  const width = ((w.end - w.start) / span) * 100;
                  return (
                    <View key={i} style={[acStyles.timelineBand, {
                      left: `${Math.max(0, left)}%`,
                      width: `${Math.min(100 - Math.max(0, left), width)}%`,
                      backgroundColor: Colors.success + '30',
                      borderColor: Colors.success + '70',
                    }]} />
                  );
                })}
                {/* Lesson band */}
                {(() => {
                  const timelineStart = Math.min(lStart - 30, windows.length > 0 ? windows[0].start : lStart);
                  const timelineEnd = Math.max(lEnd + 30, windows.length > 0 ? windows[windows.length - 1].end : lEnd);
                  const span = Math.max(timelineEnd - timelineStart, 60);
                  const left = ((lStart - timelineStart) / span) * 100;
                  const width = ((lEnd - lStart) / span) * 100;
                  return (
                    <View style={[acStyles.timelineBand, acStyles.timelineLessonBand, {
                      left: `${Math.max(0, left)}%`,
                      width: `${Math.min(100 - Math.max(0, left), width)}%`,
                    }]} />
                  );
                })()}
                {/* Labels */}
                <View style={acStyles.timelineLabels}>
                  <View style={[acStyles.timelineLabelDot, { backgroundColor: Colors.success }]} />
                  <Text style={[acStyles.timelineLabelText, { color: Colors.success }]}>Availability</Text>
                  <View style={[acStyles.timelineLabelDot, { backgroundColor: '#FF3B30', marginLeft: 12 }]} />
                  <Text style={[acStyles.timelineLabelText, { color: '#FF3B30' }]}>Lesson</Text>
                </View>
              </View>
            </View>

            {/* Info box */}
            <View style={acStyles.infoBox}>
              <MaterialIcons name="info-outline" size={14} color={Colors.info} />
              <Text style={acStyles.infoText}>
                {windows.length === 0
                  ? `${pupil.firstName} has no availability set for ${dayName}. Delete this lesson and update their availability, then re-run Smart Schedule.`
                  : `This lesson runs ${lesson.startTime}–${lEndStr} but ${pupil.firstName}'s ${dayName} windows are ${windows.map(w => `${fromMinsLocal(w.start)}–${fromMinsLocal(w.end)}`).join(', ')}. Delete and reschedule to fit within a valid slot.`
                }
              </Text>
            </View>

          </ScrollView>

          {/* Shortcut action buttons */}
          <View style={acStyles.shortcutRow}>
            <Pressable
              style={acStyles.shortcutBtn}
              onPress={() => { onClose(); router.push({ pathname: '/(instructor)/pupil-detail', params: { pupilId: pupil.id, initialTab: 'availability' } }); }}
              disabled={acting !== null}
            >
              <MaterialIcons name="event-available" size={14} color={Colors.info} />
              <Text style={[acStyles.shortcutBtnText, { color: Colors.info }]}>Edit Availability</Text>
            </Pressable>
            <Pressable
              style={[acStyles.shortcutBtn, { backgroundColor: Colors.primary + '10', borderColor: Colors.primary + '40' }]}
              onPress={() => { onClose(); onEditTime(); }}
              disabled={acting !== null}
            >
              <MaterialIcons name="edit-calendar" size={14} color={Colors.primary} />
              <Text style={[acStyles.shortcutBtnText, { color: Colors.primary }]}>Edit Time</Text>
            </Pressable>
          </View>

          {/* Footer actions */}
          <View style={acStyles.footer}>
            <Pressable style={acStyles.cancelBtn} onPress={onClose} disabled={acting !== null}>
              <Text style={acStyles.cancelBtnText}>Keep</Text>
            </Pressable>
            <Pressable
              style={[acStyles.deleteBtn, acting !== null && { opacity: 0.5 }]}
              onPress={handleDelete}
              disabled={acting !== null}
            >
              {acting === 'delete'
                ? <ActivityIndicator size="small" color={Colors.textInverse} />
                : <MaterialIcons name="delete" size={16} color={Colors.textInverse} />}
              <Text style={acStyles.deleteBtnText}>Delete</Text>
            </Pressable>
            <Pressable
              style={[acStyles.rescheduleBtn, acting !== null && { opacity: 0.5 }]}
              onPress={handleDeleteAndReschedule}
              disabled={acting !== null}
            >
              {acting === 'reschedule'
                ? <ActivityIndicator size="small" color={Colors.navy} />
                : <MaterialIcons name="auto-fix-high" size={16} color={Colors.navy} />}
              <Text style={acStyles.rescheduleBtnText}>
                {acting === 'reschedule' ? 'Working...' : 'Delete & Reschedule'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const acStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderWidth: 1, borderColor: Colors.surfaceBorder, paddingTop: 8, maxHeight: '88%',
  },
  handle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.textTertiary + '60',
    alignSelf: 'center', marginBottom: 4,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  headerIcon: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: '#FF3B3018', alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary },
  subtitle: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  lessonCard: {
    backgroundColor: '#FF3B3008', borderRadius: Radius.lg,
    padding: Spacing.md, borderWidth: 1.5, borderColor: '#FF3B3030',
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardIconWrap: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  cardLabel: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 3 },
  cardTime: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.textPrimary },
  cardDur: { fontSize: FontSize.sm, fontWeight: '400', color: Colors.textSecondary },
  conflictBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#FF3B3018', borderRadius: Radius.full,
    paddingHorizontal: 8, paddingVertical: 5,
    borderWidth: 1, borderColor: '#FF3B3040',
  },
  conflictBadgeText: { fontSize: 10, fontWeight: '700', color: '#FF3B30' },
  section: {
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    padding: Spacing.md, gap: 8, borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  sectionTitle: {
    fontSize: FontSize.xs, fontWeight: '700', color: Colors.textTertiary,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 2,
  },
  noWindowRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 4,
  },
  noWindowText: { fontSize: FontSize.sm, color: Colors.textTertiary },
  windowRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 6, paddingHorizontal: 10,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  windowRowFit: { backgroundColor: Colors.success + '10', borderColor: Colors.success + '40' },
  windowDot: { width: 8, height: 8, borderRadius: 4 },
  windowTime: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.textPrimary, flex: 1 },
  windowSpan: { fontSize: FontSize.xs },
  fitsChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: Colors.success + '20', borderRadius: Radius.full,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  fitsChipText: { fontSize: 9, fontWeight: '700', color: Colors.success },
  timeline: {
    height: 52, backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.surfaceBorder,
    position: 'relative', overflow: 'hidden',
    marginBottom: 4,
  },
  timelineBand: {
    position: 'absolute', top: 8, height: 24,
    borderWidth: 1, borderRadius: 4,
  },
  timelineLessonBand: {
    backgroundColor: '#FF3B3030', borderColor: '#FF3B3070',
    top: 16, height: 20, zIndex: 2,
  },
  timelineLabels: {
    position: 'absolute', bottom: 4, left: 8,
    flexDirection: 'row', alignItems: 'center', gap: 4,
  },
  timelineLabelDot: { width: 8, height: 8, borderRadius: 4 },
  timelineLabelText: { fontSize: 9, fontWeight: '600' },
  infoBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: Colors.info + '10', borderRadius: Radius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.info + '35',
  },
  infoText: { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 17 },
  footer: {
    flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingTop: 14,
    borderTopWidth: 1, borderTopColor: Colors.surfaceBorder,
  },
  cancelBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 13, borderRadius: Radius.lg,
    backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  cancelBtnText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textSecondary },
  deleteBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 13, borderRadius: Radius.lg, backgroundColor: Colors.error,
  },
  deleteBtnText: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.textInverse },
  rescheduleBtn: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 13, borderRadius: Radius.lg, backgroundColor: Colors.primary,
  },
  rescheduleBtnText: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.navy },
  shortcutRow: {
    flexDirection: 'row', gap: 8, marginHorizontal: 20, marginBottom: 10,
  },
  shortcutBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: Colors.info + '10', borderRadius: Radius.md,
    paddingHorizontal: 10, paddingVertical: 11,
    borderWidth: 1, borderColor: Colors.info + '40',
  },
  shortcutBtnText: { fontSize: FontSize.xs, fontWeight: '700' },
});

// ─── Main diary screen ─────────────────────────────────────────────────────────

export default function DiaryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    pupils, lessons, addOrUpdateLesson, addOrUpdatePupil, removeLesson,
    instructorAvailability, bufferMinutes, sameZoneBuffer, diffZoneBuffer, postDriveBuffer, homeAddress,
    lessonBufferBefore, lessonBufferAfter, lessonBuffersEnabled,
    confirmWeek, isWeekConfirmed, unreadNotificationCount, saveInstructorAvailability,
    trafficPrefs: contextTrafficPrefs,
  } = usePupils();

  // Traffic prefs — resolved from context (already loaded from AsyncStorage at boot)
  const effectiveTrafficPrefs: TrafficPrefs = contextTrafficPrefs ?? DEFAULT_TRAFFIC_PREFS;
  const { showAlert } = useAlert();

  const [weekOffset, setWeekOffset] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [scheduleStatus, setScheduleStatus] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [selectedDay, setSelectedDay] = useState(0);
  const [showMap, setShowMap] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [pendingScheduleResult, setPendingScheduleResult] = useState<ScheduleResult | null>(null);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [calendarFitMode, setCalendarFitMode] = useState(true);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showUnackModal, setShowUnackModal] = useState(false);
  const [showLessonSelectModal, setShowLessonSelectModal] = useState(false);
  const [bufferEditLesson, setBufferEditLesson] = useState<Lesson | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [compressResult, setCompressResult] = useState<CompressResult | null>(null);
  const [showCompressModal, setShowCompressModal] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [conflictLesson, setConflictLesson] = useState<Lesson | null>(null);
  const [editTimeLesson, setEditTimeLesson] = useState<Lesson | null>(null);
  const [pendingGapInfo, setPendingGapInfo] = useState<GapInfo | null>(null);
  const [pendingGapLesson, setPendingGapLesson] = useState<Lesson | null>(null);
  const [showFixAllModal, setShowFixAllModal] = useState(false);
  const [showWorkingHoursEditor, setShowWorkingHoursEditor] = useState(false);
  const [showPreScheduleAnalysis, setShowPreScheduleAnalysis] = useState(false);
  const [preScheduleAffected, setPreScheduleAffected] = useState<Array<{ lesson: Lesson; issue: string; suggestedTime?: string }>>([]);
  const [preScheduleSlots, setPreScheduleSlots] = useState<Array<{ date: string; dayName: string; startTime: string; endTime: string; durationMins: number; hasEnoughForLesson: boolean }>>([]);
  const [preScheduleNewAvail, setPreScheduleNewAvail] = useState<any>(null);
  const [showOverflowMenu, setShowOverflowMenu] = useState(false);
  const [notesLesson, setNotesLesson] = useState<Lesson | null>(null);
  // Collapsible header for calendar view
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const collapseAnim = useRef(new Animated.Value(0)).current;
  // Local-only toggle for buffer band visibility — does NOT affect saved lessonBuffersEnabled
  const [showBufferBands, setShowBufferBands] = useState(lessonBuffersEnabled);

  // Working Hours helpers
  const buildAndShowPreSchedule = useCallback((newAvail: any, currentLessons: Lesson[], currentWeekStart: string) => {
    const affected: Array<{ lesson: Lesson; issue: string; suggestedTime?: string }> = [];
    for (const lesson of currentLessons) {
      const d = new Date(lesson.date + 'T12:00:00'); // midday avoids DST boundary
      const dayRaw = d.getDay();
      const dayName = DAY_NAMES_FULL[dayRaw === 0 ? 6 : dayRaw - 1];
      const dayAvail = newAvail[dayName];
      if (!dayAvail) continue;
      const lStart = toMinsLocal(lesson.startTime);
      const lEnd = lStart + lesson.duration;
      const iStart = toMinsLocal(dayAvail.startTime);
      const iEnd = toMinsLocal(dayAvail.endTime);
      if (!dayAvail.enabled) {
        affected.push({ lesson, issue: 'day_disabled' });
      } else if (lStart < iStart || lEnd > iEnd) {
        const earliest = snapUp15(iStart);
        affected.push({ lesson, issue: 'outside_hours', suggestedTime: earliest + lesson.duration <= iEnd ? fromMinsLocal(earliest) : undefined });
      }
    }
    const slots: Array<{ date: string; dayName: string; startTime: string; endTime: string; durationMins: number; hasEnoughForLesson: boolean }> = [];
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const dateStr = addDays(currentWeekStart, dayOffset);
      const dayName = DAY_NAMES_FULL[dayOffset];
      const dayAvail = newAvail[dayName];
      if (!dayAvail?.enabled) continue;
      const instrStart = toMinsLocal(dayAvail.startTime);
      const instrEnd = toMinsLocal(dayAvail.endTime);
      const occupied = currentLessons
        .filter(l => l.date === dateStr && !affected.some(a => a.lesson.id === l.id))
        .map(l => ({ start: toMinsLocal(l.startTime), end: toMinsLocal(l.startTime) + l.duration }))
        .sort((a, b) => a.start - b.start);
      let cursor = instrStart;
      const blocks = [...occupied, { start: instrEnd, end: instrEnd }];
      for (const block of blocks) {
        const dur = block.start - cursor;
        if (dur >= 30) {
          const snapped = snapUp15(cursor);
          if (snapped + 30 <= block.start) {
            slots.push({ date: dateStr, dayName, startTime: fromMinsLocal(snapped), endTime: fromMinsLocal(block.start), durationMins: block.start - snapped, hasEnoughForLesson: block.start - snapped >= 60 });
          }
        }
        cursor = block.end;
      }
    }
    setPreScheduleAffected(affected);
    setPreScheduleSlots(slots);
    setPreScheduleNewAvail(newAvail);
    setShowPreScheduleAnalysis(true);
  }, []);

  // Ref so handleSaveWorkingHours can read the latest weekLessons/weekStart
  // without those values appearing in its dependency array before they are declared.
  const weekLessonsRef = React.useRef<Lesson[]>([]);
  const weekStartRef = React.useRef<string>('');

  const handleSaveWorkingHours = useCallback(async (newAvail: any) => {
    await saveInstructorAvailability(newAvail);
    setShowWorkingHoursEditor(false);
    buildAndShowPreSchedule(newAvail, weekLessonsRef.current, weekStartRef.current);
  }, [saveInstructorAvailability, buildAndShowPreSchedule]);

  const computeGapAnalysis = useCallback((updatedLesson: Lesson): GapInfo => {
    const dayDate = updatedLesson.date;
    const d = new Date(dayDate + 'T12:00:00'); // midday avoids DST boundary
    const dayRaw = d.getDay();
    const dayName = DAY_NAMES_FULL[dayRaw === 0 ? 6 : dayRaw - 1];
    const dayAvail = instructorAvailability?.[dayName];
    const instrStartMins = dayAvail ? toMinsLocal(dayAvail.startTime) : 8 * 60;
    const allDay = weekLessonsRef.current.filter(l => l.date === dayDate && l.id !== updatedLesson.id).concat([updatedLesson]).sort((a, b) => toMinsLocal(a.startTime) - toMinsLocal(b.startTime));
    const editedIdx = allDay.findIndex(l => l.id === updatedLesson.id);
    const prev = editedIdx > 0 ? allDay[editedIdx - 1] : null;
    const prevEndMins = prev ? toMinsLocal(prev.startTime) + prev.duration : instrStartMins;
    const lStart = toMinsLocal(updatedLesson.startTime);
    const gapMins = Math.max(0, lStart - prevEndMins);
    const pupilObj = pupils.find(p => p.id === updatedLesson.pupilId);
    const specific = pupilObj?.availability?.specificDates?.find(s => s.date === dayDate);
    // Use the same DST-safe day name derivation
    const rawSlots = specific
      ? [{ start: toMinsLocal(specific.startTime), end: toMinsLocal(specific.endTime) }]
      : (pupilObj?.availability?.recurringSlots?.filter(s => s.day === dayName) ?? []).map(s => ({ start: toMinsLocal(s.startTime), end: toMinsLocal(s.endTime) }));
    // Also honour blackout dates
    const isBlackout = pupilObj?.availability?.blackoutDates?.includes(dayDate) ?? false;
    const inAvailWindow = !isBlackout && (
      rawSlots.length === 0 || rawSlots.some(w => lStart >= w.start && lStart + updatedLesson.duration <= w.end)
    );
    let canShift = false;
    const shiftablePupils: GapInfo['shiftablePupils'] = [];
    if (gapMins > 0 && editedIdx > 0) {
      const preceding = allDay.slice(0, editedIdx);
      let lastEndM = instrStartMins; let feasible = true;
      for (const pl of preceding) {
        const pStart = toMinsLocal(pl.startTime);
        const newStart = snapUp15(pStart + gapMins);
        const newEnd = newStart + pl.duration;
        const pPupil = pupils.find(p => p.id === pl.pupilId);
        const pSpecific = pPupil?.availability?.specificDates?.find(s => s.date === dayDate);
        const pSlots = pSpecific ? [{ start: toMinsLocal(pSpecific.startTime), end: toMinsLocal(pSpecific.endTime) }] : (pPupil?.availability?.recurringSlots?.filter(s => s.day === dayName) ?? []).map(s => ({ start: toMinsLocal(s.startTime), end: toMinsLocal(s.endTime) }));
        const fits = pSlots.length === 0 || pSlots.some(w => newStart >= w.start && newEnd <= w.end);
        if (newStart < lastEndM || !fits || newEnd > lStart) { feasible = false; break; }
        lastEndM = newEnd;
        shiftablePupils.push({ name: pPupil ? `${pPupil.firstName} ${pPupil.lastName}` : 'Unknown', from: pl.startTime, to: fromMinsLocal(newStart) });
      }
      canShift = feasible && shiftablePupils.length > 0;
    }
    return { gapMins, prevEnd: prev ? fromMinsLocal(prevEndMins) : fromMinsLocal(instrStartMins), lessonStart: updatedLesson.startTime, canShift, shiftMins: gapMins, shiftablePupils, inAvailWindow };
  }, [pupils, instructorAvailability]);

  // ── Auto-snap banner──────────
  const [snapBannerCount, setSnapBannerCount] = useState(0);
  const snapBannerOpacity = useRef(new Animated.Value(0)).current;
  const snapBannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snapApplyingRef = useRef(false);
  const undoLessonRef = useRef<Lesson | null>(null);
  const [showUndoBar, setShowUndoBar] = useState(false);
  const undoBarOpacity = useRef(new Animated.Value(0)).current;
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSaveLessonBuffer = useCallback(async (lessonId: string, buffer: number | undefined) => {
    const lesson = lessons.find(l => l.id === lessonId);
    if (!lesson) return;
    await addOrUpdateLesson({ ...lesson, customBuffer: buffer });
  }, [lessons, addOrUpdateLesson]);

  const handleCompressDay = useCallback(() => {
    const ordered = localOrder.length > 0 ? localOrder : dayLessons;
    if (ordered.length < 2) {
      showAlert('Not Enough Lessons', 'You need at least 2 lessons to compress the day.');
      return;
    }
    setCompressing(true);
    setTimeout(() => {
      const result = runCompressDay(
        ordered, travelTimes, pupils, instructorAvailability,
        selectedDay, weekDates, sameZoneBuffer, diffZoneBuffer, postDriveBuffer,
      );
      setCompressResult(result);
      setShowCompressModal(true);
      setCompressing(false);
    }, 100);
  }, [localOrder, dayLessons, travelTimes, pupils, instructorAvailability, selectedDay, weekDates, sameZoneBuffer, diffZoneBuffer, postDriveBuffer, showAlert]);

  const handleApplyCompression = useCallback(async (compressed: CompressedLesson[]) => {
    const changed = compressed.filter(c => c.changed);
    if (changed.length === 0) return;
    const updated = compressed.map(c => ({ ...c.lesson, startTime: c.newStart }));
    setLocalOrder(updated);
    lastComputedKeyRef.current = '';
    setTravelTimes({});
    setHomeDriveSecsToday(null);
    await Promise.all(updated.map(l => addOrUpdateLesson(l)));
    showAlert('Day Compressed', `${changed.length} lesson${changed.length !== 1 ? 's' : ''} rescheduled. Recalculating drive times…`);
    setTimeout(() => fetchTravelTimesRef.current?.(updated, { force: true }), 300);
  }, [addOrUpdateLesson, showAlert]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  const handleDeleteSelected = useCallback(() => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    showAlert(
      `Delete ${count} lesson${count !== 1 ? 's' : ''}?`,
      'This will permanently remove the selected lessons.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: `Delete ${count}`, style: 'destructive',
          onPress: async () => {
            await Promise.all(Array.from(selectedIds).map(id => removeLesson(id)));
            exitSelectMode();
          },
        },
      ],
    );
  }, [selectedIds, removeLesson, exitSelectMode, showAlert]);

  const handleBulkDeleteUnack = useCallback(async (ids: string[]) => {
    await Promise.all(ids.map(id => removeLesson(id)));
  }, [removeLesson]);

  // Keep refs in sync so callbacks defined early can safely read these values
  const weekStart = useMemo(() => {
    const base = getWeekStart();
    const d = new Date(base);
    d.setDate(d.getDate() + weekOffset * 7);
    return d.toISOString().slice(0, 10);
  }, [weekOffset]);

  const weekDates = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const weekLessons = useMemo(() =>
    lessons.filter(l => l.weekStart === weekStart).sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [lessons, weekStart]);

  // Sync refs — safe to do here after declarations, before any render-time usage
  weekStartRef.current = weekStart;
  weekLessonsRef.current = weekLessons;

  const dayLessons = useMemo(() => {
    const date = weekDates[selectedDay];
    return weekLessons.filter(l => l.date === date);
  }, [weekLessons, weekDates, selectedDay]);

  const weekUnacknowledgedCount = weekLessons.filter(l => !l.pupilAcknowledged).length;
  const dayUnacknowledgedCount = dayLessons.filter(l => !l.pupilAcknowledged).length;

  const [localOrder, setLocalOrder] = useState<Lesson[]>([]);

  const dayLessonsKey = dayLessons.map(l => l.id + l.startTime).join(',');
  const localOrderKey = localOrder.map(l => l.id + l.startTime).join(',');

  useEffect(() => {
    setLocalOrder(dayLessons);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDay, weekStart, dayLessonsKey]);

  // Handle lesson reorder
  const handleDragEnd = useCallback(async ({ data }: { data: Lesson[] }) => {
    const activeList = localOrder.length > 0 ? localOrder : dayLessons;
    const sortedTimes = [...activeList]
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
      .map(l => l.startTime);
    const reordered = data.map((lesson, i) => ({
      ...lesson,
      startTime: sortedTimes[i] ?? lesson.startTime,
    }));
    const currentTravelSecs: Record<string, number | undefined> = {};
    for (const [key, seg] of Object.entries(travelTimes)) {
      if (seg) currentTravelSecs[key] = seg.durationSeconds;
    }
    const { lessons: cascaded, changed: cascadeChanges } = refreshDaySchedule(
      reordered,
      currentTravelSecs,
      pupils,
      sameZoneBuffer,
      diffZoneBuffer,
      postDriveBuffer,
    );

    const updated = cascaded;

    setLocalOrder(updated);
    lastComputedKeyRef.current = '';
    setTravelTimes({});
    setLoadingTravel(true);
    setTravelError(null);

    await Promise.all(updated.map(lesson => addOrUpdateLesson(lesson)));
    setTimeout(() => fetchTravelTimesRef.current?.(updated, { force: true }), 200);
  }, [localOrder, dayLessons, addOrUpdateLesson, travelTimes, pupils, sameZoneBuffer, diffZoneBuffer, postDriveBuffer]);



  useEffect(() => {
    exitSelectMode();
    setHomeDriveSecsToday(null);
  }, [selectedDay, weekOffset]);

  const fetchTravelTimesRef = React.useRef<((lessons: Lesson[], opts?: { force?: boolean }) => Promise<void>) | null>(null);
  const lastComputedKeyRef = React.useRef<string>('');

  const commitSuggestionsToLesson = useCallback(async (suggestions: ScheduleResult['suggestions']) => {
    await Promise.all(suggestions.map(s => addOrUpdateLesson(suggestionToLesson(s))));
    const todayDate = weekDates[selectedDay];
    const todayNew = suggestions
      .filter(s => s.date === todayDate)
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
      .map(s => suggestionToLesson(s));

    if (todayNew.length > 0) {
      lastComputedKeyRef.current = '';
      setTravelTimes({});
      setHomeDriveSecsToday(null);
      if (todayNew.length >= 2) {
        setLocalOrder(todayNew);
        setTimeout(() => fetchTravelTimesRef.current?.(todayNew, { force: true }), 300);
      } else {
        setLocalOrder(todayNew);
      }
    }
  }, [addOrUpdateLesson, weekDates, selectedDay]);

  const handleApplyAllTweaks = useCallback(async () => {
    if (!pendingScheduleResult) return;
    const { availabilitySuggestions } = pendingScheduleResult;
    if (availabilitySuggestions.length === 0) return;

    const byPupilMap = new Map<string, AvailabilitySuggestion>();
    for (const s of availabilitySuggestions) {
      if (!byPupilMap.has(s.pupilId)) byPupilMap.set(s.pupilId, s);
    }

    setShowScheduleModal(false);
    setPendingScheduleResult(null);
    setGenerating(true);

    let updatedPupils = [...pupils];
    for (const [, suggestion] of byPupilMap) {
      const pupil = updatedPupils.find(p => p.id === suggestion.pupilId);
      if (!pupil) continue;
      const dashIdx = suggestion.currentWindow.indexOf('-', 3);
      const wStart = suggestion.currentWindow.slice(0, dashIdx).trim();
      const wEnd = suggestion.currentWindow.slice(dashIdx + 1).trim();
      const updatedSlots = (pupil.availability?.recurringSlots ?? []).map(slot =>
        slot.day === suggestion.day && slot.startTime === wStart && slot.endTime === wEnd
          ? { ...slot, startTime: suggestion.suggestedStart, endTime: suggestion.suggestedEnd }
          : slot,
      );
      const updatedPupil = { ...pupil, availability: { ...pupil.availability, recurringSlots: updatedSlots } };
      await addOrUpdatePupil(updatedPupil);
      updatedPupils = updatedPupils.map(p => p.id === updatedPupil.id ? updatedPupil : p);
    }

    await new Promise(r => setTimeout(r, 400));
    try {
      // Remove ALL tweaked pupils' existing week lessons before rescheduling
      // to prevent duplicate lessons from being created.
      const tweakedPupilIds = new Set(byPupilMap.keys());
      const tweakedLessons = weekLessons.filter(l => tweakedPupilIds.has(l.pupilId));
      await Promise.all(tweakedLessons.map(l => removeLesson(l.id)));

      const lessonsExcludingTweaked = weekLessons.filter(l => !tweakedPupilIds.has(l.pupilId));
      const result = await suggestWeekScheduleFull(
        updatedPupils, lessonsExcludingTweaked, weekStart,
        instructorAvailability, sameZoneBuffer, diffZoneBuffer, postDriveBuffer, homeAddress,
        effectiveTrafficPrefs,
        lessonBuffersEnabled ? lessonBufferBefore : 0,
        lessonBuffersEnabled ? lessonBufferAfter : 0,
      );
      await commitSuggestionsToLesson(result.suggestions);
      setGenerating(false);
      if (result.unscheduled.length > 0) {
        setPendingScheduleResult(result);
        setShowScheduleModal(true);
        showAlert('Partially Scheduled', `${result.suggestions.length} lesson${result.suggestions.length !== 1 ? 's' : ''} added. ${result.unscheduled.length} pupil${result.unscheduled.length !== 1 ? 's' : ''} still could not be fitted.`);
      } else {
        showAlert('All Tweaks Applied', `All ${result.suggestions.length} lesson${result.suggestions.length !== 1 ? 's' : ''} have been rescheduled and added to your diary.`);
      }
    } catch { setGenerating(false); }
  }, [pendingScheduleResult, pupils, addOrUpdatePupil, weekLessons, weekStart, instructorAvailability, sameZoneBuffer, diffZoneBuffer, postDriveBuffer, homeAddress, lessonBuffersEnabled, lessonBufferBefore, lessonBufferAfter, effectiveTrafficPrefs, commitSuggestionsToLesson, removeLesson, showAlert]);

  const handleApplyAvailTweak = useCallback(async (suggestion: AvailabilitySuggestion) => {
    const pupil = pupils.find(p => p.id === suggestion.pupilId);
    if (!pupil) return;

    // Parse "HH:MM-HH:MM" — dash is always at position 5
    const dashIdx = suggestion.currentWindow.indexOf('-', 3);
    const wStart = suggestion.currentWindow.slice(0, dashIdx).trim();
    const wEnd = suggestion.currentWindow.slice(dashIdx + 1).trim();

    const updatedSlots = (pupil.availability?.recurringSlots ?? []).map(slot =>
      slot.day === suggestion.day && slot.startTime === wStart && slot.endTime === wEnd
        ? { ...slot, startTime: suggestion.suggestedStart, endTime: suggestion.suggestedEnd }
        : slot,
    );
    const updatedPupil = { ...pupil, availability: { ...pupil.availability, recurringSlots: updatedSlots } };
    await addOrUpdatePupil(updatedPupil);

    setShowScheduleModal(false);
    setPendingScheduleResult(null);
    setGenerating(true);
    await new Promise(r => setTimeout(r, 400));

    const updatedPupils = pupils.map(p => p.id === updatedPupil.id ? updatedPupil : p);
    try {
      // Remove the tweaked pupil's existing week lessons so the rescheduler
      // can place them fresh — prevents duplicate lesson entries.
      const tweakedLessons = weekLessons.filter(l => l.pupilId === suggestion.pupilId);
      await Promise.all(tweakedLessons.map(l => removeLesson(l.id)));

      const lessonsExcludingTweaked = weekLessons.filter(l => l.pupilId !== suggestion.pupilId);
      const result = await suggestWeekScheduleFull(
        updatedPupils, lessonsExcludingTweaked, weekStart,
        instructorAvailability, sameZoneBuffer, diffZoneBuffer, postDriveBuffer, homeAddress,
        effectiveTrafficPrefs,
        lessonBuffersEnabled ? lessonBufferBefore : 0,
        lessonBuffersEnabled ? lessonBufferAfter : 0,
      );
      await commitSuggestionsToLesson(result.suggestions);
      setGenerating(false);
      if (result.unscheduled.length > 0) {
        setPendingScheduleResult(result);
        setShowScheduleModal(true);
        showAlert('Partially Scheduled', `${result.suggestions.length} lesson${result.suggestions.length !== 1 ? 's' : ''} added. ${result.unscheduled.length} pupil${result.unscheduled.length !== 1 ? 's' : ''} still could not be fitted.`);
      } else {
        showAlert('Availability Tweak Applied', `All ${result.suggestions.length} lesson${result.suggestions.length !== 1 ? 's' : ''} have been scheduled and added to your diary.`);
      }
    } catch { setGenerating(false); }
  }, [pupils, addOrUpdatePupil, weekLessons, weekStart, instructorAvailability, sameZoneBuffer, diffZoneBuffer, postDriveBuffer, homeAddress, lessonBuffersEnabled, lessonBufferBefore, lessonBufferAfter, effectiveTrafficPrefs, commitSuggestionsToLesson, removeLesson, showAlert]);

  const handleForceFit = useCallback(async (s: BestFitSuggestion) => {
    const lesson = {
      id: generateId(),
      pupilId: s.pupilId,
      date: s.date,
      startTime: s.startTime,
      duration: s.duration,
      weekStart: s.weekStart,
      status: 'scheduled' as const,
      paymentStatus: 'unpaid' as const,
      pupilAcknowledged: false,
      pupilPaidConfirmed: false,
      pupilCheckedIn: false,
      weekConfirmed: false,
      paymentRequested: false,
      notes: '',
    };
    await addOrUpdateLesson(lesson);
    const todayDate = weekDates[selectedDay];
    if (s.date === todayDate) {
      lastComputedKeyRef.current = '';
      setTravelTimes({});
      setHomeDriveSecsToday(null);
    }
    showAlert('Lesson Added', `${s.pupilName} force-fitted on ${s.dayName} at ${s.startTime}. Remember to confirm this with the pupil.`);
  }, [addOrUpdateLesson, weekDates, selectedDay, showAlert]);

  const runAndPreview = useCallback((suggestions: any[], unscheduled: any[]) => {
    setPreviewSuggestions(suggestions, unscheduled);
    router.push('/(instructor)/schedule-preview');
  }, [router]);

  const handleSmartSchedule = useCallback(async () => {
    if (generating) return;
    setGenerating(true);
    setScheduleStatus('Starting\u2026');
    setSchedulerStatusCallback(setScheduleStatus);
    await new Promise(r => setTimeout(r, 200));
    try {
      const effBefore = lessonBuffersEnabled ? lessonBufferBefore : 0;
      const effAfter  = lessonBuffersEnabled ? lessonBufferAfter  : 0;
      const result = await suggestWeekScheduleFull(pupils, weekLessons, weekStart, instructorAvailability, sameZoneBuffer, diffZoneBuffer, postDriveBuffer, homeAddress, effectiveTrafficPrefs, effBefore, effAfter);
      setScheduleStatus(''); setSchedulerStatusCallback(null); setGenerating(false);
      if (result.unscheduled.length > 0) {
        setPendingScheduleResult(result); setShowScheduleModal(true);
      } else {
        setGenerating(true);
        await commitSuggestionsToLesson(result.suggestions);
        setGenerating(false);
        showAlert('All Lessons Scheduled', `${result.suggestions.length} lesson${result.suggestions.length !== 1 ? 's' : ''} have been added to your diary.`);
      }
    } catch {
      setScheduleStatus(''); setSchedulerStatusCallback(null); setGenerating(false);
      showAlert('Error', 'Failed to generate schedule. Please try again.');
    }
  }, [generating, pupils, weekLessons, weekStart, instructorAvailability, sameZoneBuffer, diffZoneBuffer, commitSuggestionsToLesson, showAlert]);

  // ── Travel times ──────────────────────────────────────────────────────────
  const [travelTimes, setTravelTimes] = useState<Record<string, TravelSegment | null>>({});
  const [homeDriveSecsToday, setHomeDriveSecsToday] = useState<number | null>(null);
  const homeDrivePerDayRef = React.useRef<Record<string, number>>({});
  const [loadingTravel, setLoadingTravel] = useState(false);
  const [travelError, setTravelError] = useState<string | null>(null);

  const fetchHomeDriveTime = useCallback(async (firstLesson: Lesson, force?: boolean) => {
    if (!homeAddress) { setHomeDriveSecsToday(null); return; }
    const todayDate = firstLesson.date;
    const cached = homeDrivePerDayRef.current[todayDate];
    if (cached !== undefined && !force) { setHomeDriveSecsToday(cached); return; }
    try {
      const pupil = pupils.find(p => p.id === firstLesson.pupilId);
      if (!pupil) { setHomeDriveSecsToday(null); return; }
      const { getCoordinatesForPupils } = require('@/services/geocodingService');
      const homeCoord = await getCoordinatesForPupils([{ id: '__home__', address: homeAddress, postcode: '' }]);
      const pupilCoords = await getCoordinatesForPupils([{ id: pupil.id, address: pupil.address ?? '', postcode: pupil.postcode }]);
      const hc = homeCoord['__home__'];
      const pc = pupilCoords[pupil.id];
      if (!hc || !pc) { setHomeDriveSecsToday(null); return; }
      const matrix = await getDrivingMatrix([hc, pc]);
      const secs = matrix?.[0]?.[1] ?? null;
      if (secs !== null) {
        homeDrivePerDayRef.current[todayDate] = secs;
        setHomeDriveSecsToday(secs);
      } else {
        const R = 6_371_000;
        const toRad = (d: number) => (d * Math.PI) / 180;
        const dLat = toRad(pc.lat - hc.lat);
        const dLng = toRad(pc.lng - hc.lng);
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(hc.lat)) * Math.cos(toRad(pc.lat)) * Math.sin(dLng / 2) ** 2;
        const distM = 2 * R * Math.asin(Math.sqrt(a)) * 1.35;
        const fallbackSecs = Math.round(distM / 13.0);
        homeDrivePerDayRef.current[todayDate] = fallbackSecs;
        setHomeDriveSecsToday(fallbackSecs);
      }
    } catch {
      setHomeDriveSecsToday(null);
    }
  }, [homeAddress, pupils]);

  const fetchTravelTimes = useCallback(async (orderedLessons: Lesson[], opts?: { force?: boolean }) => {
    if (orderedLessons.length < 2) { setTravelTimes({}); setTravelError(null); setHomeDriveSecsToday(null); return; }

    const todayDate = weekDates[selectedDay] ?? orderedLessons[0]?.date ?? '';
    const cacheKey = buildTravelCacheKey(todayDate, orderedLessons);
    if (!opts?.force && lastComputedKeyRef.current === cacheKey) return;

    const persisted = await getCachedTravelTimes(cacheKey);
    if (persisted && !opts?.force) {
      setTravelTimes(persisted as Record<string, TravelSegment | null>);
      setTravelError(null);
      setLoadingTravel(false);
      lastComputedKeyRef.current = cacheKey;
      return;
    }

    setLoadingTravel(true);
    setTravelError(null);

    const cachedMx = getLastComputedMatrix();
    let phase1HasAll = false;
    const phase1Source: TravelDataSource = 'google';
    if (cachedMx.matrix && cachedMx.idOrder.length >= 2) {
      const quickTimes: Record<string, TravelSegment | null> = {};
      let allFound = true;
      for (let i = 0; i < orderedLessons.length - 1; i++) {
        const fromId = orderedLessons[i].pupilId;
        const toId   = orderedLessons[i + 1].pupilId;
        const fi = cachedMx.idOrder.indexOf(fromId);
        const ti = cachedMx.idOrder.indexOf(toId);
        const key = `${orderedLessons[i].id}->${orderedLessons[i + 1].id}`;
        if (fi >= 0 && ti >= 0 && cachedMx.matrix![fi]?.[ti] != null) {
          const secs = cachedMx.matrix![fi][ti];
          quickTimes[key] = { durationSeconds: secs, distanceMeters: Math.round(secs * 13.0), source: phase1Source };
        } else {
          quickTimes[key] = null;
          allFound = false;
        }
      }
      setTravelTimes(quickTimes);
      phase1HasAll = allFound;
      if (allFound) setLoadingTravel(false);
    }

    try {
      const orderedPupils = orderedLessons
        .map(l => pupils.find(pp => pp.id === l.pupilId))
        .filter((p): p is Pupil => !!p);

      const uniquePupils = orderedPupils.filter(
        (p, i, arr) => arr.findIndex(pp => pp.id === p.id) === i,
      );

      if (uniquePupils.length < 2) {
        if (!phase1HasAll) setTravelError('Not enough pupils on this day to calculate drive times.');
        setLoadingTravel(false);
        return;
      }

      const coordMap = await getCoordinatesForPupils(
        uniquePupils.map(p => ({ id: p.id, address: p.address ?? '', postcode: p.postcode })),
      );

      const orderedCoords = orderedLessons.map(l => {
        const pupil = pupils.find(pp => pp.id === l.pupilId);
        return pupil ? (coordMap[pupil.id] ?? null) : null;
      });

      const allResolved = orderedCoords.every(c => c !== null);
      if (!allResolved) {
        if (!phase1HasAll) {
          setTravelError('Some pupils have unrecognised postcodes. Add valid UK postcodes to show drive times.');
        }
        setLoadingTravel(false);
        return;
      }

      let osrmSucceeded = false;
      try {
        // Tier 1: Google Maps via edge function (live traffic)
        const googleResult = await getDrivingMatrixGoogle(orderedCoords as Array<{ lat: number; lng: number }>);
        const matrix = googleResult?.matrix ?? await getDrivingMatrix(orderedCoords as Array<{ lat: number; lng: number }>);
        const resolvedSource: TravelDataSource = googleResult?.source === 'google' ? 'google' : 'osrm';
        if (matrix) {
          const liveTimes: Record<string, TravelSegment | null> = {};
          for (let i = 0; i < orderedLessons.length - 1; i++) {
            const key = `${orderedLessons[i].id}->${orderedLessons[i + 1].id}`;
            const secs = matrix[i]?.[i + 1];
            if (secs != null) {
              liveTimes[key] = { durationSeconds: secs, distanceMeters: Math.round(secs * 13.0), source: resolvedSource };
            } else {
              liveTimes[key] = null;
            }
          }
          setTravelTimes(liveTimes);
          setTravelError(null);
          osrmSucceeded = true;
          setCachedTravelTimes(cacheKey, liveTimes).catch(() => {});
          lastComputedKeyRef.current = cacheKey;
        }
      } catch {}

      if (!osrmSucceeded && !phase1HasAll) {
        const estimatedTimes: Record<string, TravelSegment | null> = {};
        let anyEstimate = false;
        for (let i = 0; i < orderedLessons.length - 1; i++) {
          const key = `${orderedLessons[i].id}->${orderedLessons[i + 1].id}`;
          const from = orderedCoords[i];
          const to   = orderedCoords[i + 1];
          if (from && to) {
            const distM = estimateDriveMeters(from as { lat: number; lng: number }, to as { lat: number; lng: number });
            estimatedTimes[key] = { durationSeconds: estimateDriveSecs(distM), distanceMeters: distM, isEstimated: true, source: 'haversine' as TravelDataSource };
            anyEstimate = true;
          } else {
            estimatedTimes[key] = null;
          }
        }
        if (anyEstimate) {
          setTravelTimes(estimatedTimes);
          setTravelError('Route server unavailable — showing straight-line estimates (Est.).');
          setCachedTravelTimes(cacheKey, estimatedTimes).catch(() => {});
          lastComputedKeyRef.current = cacheKey;
        } else if (!phase1HasAll) {
          setTravelError('Route server unavailable and coordinates not resolved.');
        }
      }
    } catch (err) {
      if (!phase1HasAll) {
        setTravelError('Drive time calculation failed. Will retry automatically.');
      }
    }

    if (orderedLessons.length > 0) {
      fetchHomeDriveTime(orderedLessons[0], opts?.force);
    }
    setLoadingTravel(false);
  }, [pupils, fetchHomeDriveTime]);

  React.useEffect(() => { fetchTravelTimesRef.current = fetchTravelTimes; }, [fetchTravelTimes]);

  useEffect(() => {
    if (viewMode === 'list') {
      const ordered = localOrder.length > 0 ? localOrder : dayLessons;
      fetchTravelTimes(ordered);
    }
  }, [viewMode, selectedDay, weekStart, localOrderKey]);

  // ── Auto-snap: after travel times resolve, move any lesson whose scheduled
  // start time is earlier than the snap time calculated from the previous
  // lesson's end + cached drive time + buffer. Saves to DB and shows banner.
  useEffect(() => {
    if (loadingTravel) return;
    const ordered = localOrder.length > 0 ? localOrder : dayLessons;
    if (ordered.length < 2 || Object.keys(travelTimes).length === 0) return;
    if (snapApplyingRef.current) return;

    const toUpdate: Lesson[] = [];
    for (let i = 1; i < ordered.length; i++) {
      const prev = ordered[i - 1];
      const curr = ordered[i];
      const travelKey = `${prev.id}->${curr.id}`;
      const seg = travelTimes[travelKey];
      if (!seg) continue;

      const prevEndMins = toMinsLocal(prev.startTime) + prev.duration;
      const driveMins = Math.ceil(seg.durationSeconds / 60);
      const prevPupil = pupils.find(p => p.id === prev.pupilId);
      const currPupil = pupils.find(p => p.id === curr.pupilId);
      const zoneCalcBuf = getZoneBuffer(prevPupil?.postcode ?? '', currPupil?.postcode ?? '', sameZoneBuffer, diffZoneBuffer);
      const effectiveBuf = prev.customBuffer !== undefined ? prev.customBuffer : Math.max(zoneCalcBuf, postDriveBuffer);
      const arrivalMins = prevEndMins + driveMins + effectiveBuf;
      const requiredStart = snapUp15(arrivalMins);
      const currentStart = toMinsLocal(curr.startTime);

      if (requiredStart !== currentStart) {
        toUpdate.push({ ...curr, startTime: fromMinsLocal(requiredStart) });
      }
    }

    if (toUpdate.length === 0) return;

    snapApplyingRef.current = true;
    const applySnapUpdates = async () => {
      const updatedOrdered = ordered.map(l => {
        const u = toUpdate.find(x => x.id === l.id);
        return u ?? l;
      });
      setLocalOrder(updatedOrdered);
      try {
        await Promise.all(toUpdate.map(l => addOrUpdateLesson(l)));
      } finally {
        snapApplyingRef.current = false;
      }

      // Show banner
      if (snapBannerTimerRef.current) clearTimeout(snapBannerTimerRef.current);
      setSnapBannerCount(toUpdate.length);
      snapBannerOpacity.setValue(0);
      Animated.sequence([
        Animated.timing(snapBannerOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.delay(2800),
        Animated.timing(snapBannerOpacity, { toValue: 0, duration: 380, useNativeDriver: true }),
      ]).start(() => setSnapBannerCount(0));
      snapBannerTimerRef.current = setTimeout(() => setSnapBannerCount(0), 3600);
    };
    applySnapUpdates();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [travelTimes, loadingTravel]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const run = await shouldRunDailyWarmup();
      if (!run || cancelled) return;
      await new Promise(r => setTimeout(r, 2000));
      if (cancelled) return;
      const todayStr = new Date().toISOString().slice(0, 10);
      const todayLessons = lessons
        .filter(l => l.date === todayStr)
        .sort((a, b) => a.startTime.localeCompare(b.startTime));
      if (todayLessons.length >= 2) {
        const key = buildTravelCacheKey(todayStr, todayLessons);
        const already = await getCachedTravelTimes(key);
        if (!already && !cancelled) {
          await fetchTravelTimes(todayLessons);
        }
      }
      if (!cancelled) await markWarmupComplete();
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dayRouteSummary = useMemo(() => {
    if (localOrder.length < 2) return null;
    let totalSecs = 0, totalMeters = 0;
    let hasData = false;
    for (let i = 1; i < localOrder.length; i++) {
      const seg = travelTimes[`${localOrder[i - 1].id}->${localOrder[i].id}`];
      if (seg) { totalSecs += seg.durationSeconds; totalMeters += seg.distanceMeters; hasData = true; }
    }
    return { totalSecs, totalMeters, hasData };
  }, [localOrder, travelTimes]);

  const allPrefixes = useMemo(() => {
    const prefixes = new Set(pupils.map(p => p.postcode.replace(/\s+/, '').toUpperCase().match(/^[A-Z]{1,2}/)?.[0] ?? 'XX'));
    return Array.from(prefixes);
  }, [pupils]);

  const getLessonZone = (lesson: Lesson) => {
    const pupil = pupils.find(p => p.id === lesson.pupilId);
    if (!pupil) return 0;
    const prefix = pupil.postcode.replace(/\s+/, '').toUpperCase().match(/^[A-Z]{1,2}/)?.[0] ?? 'XX';
    return allPrefixes.indexOf(prefix) % 5;
  };

  const [screenHeight, setScreenHeight] = useState(() => Dimensions.get('window').height);
  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => setScreenHeight(window.height));
    return () => sub?.remove();
  }, []);

  const weekConfirmed = isWeekConfirmed(weekStart);

  // ── Overflow menu handler (shared between collapsed + expanded header) ───
  const handleOverflowMenu = useCallback(() => {
    const hasConflicts = weekLessons.some(l => { const p = pupils.find(pp => pp.id === l.pupilId); return p ? isLessonOutsideAvailability(l, p) : false; });
    const conflictCount = weekLessons.filter(l => { const p = pupils.find(pp => pp.id === l.pupilId); return p ? isLessonOutsideAvailability(l, p) : false; }).length;
    const btns: any[] = [
      { text: 'Working Hours', onPress: () => setShowWorkingHoursEditor(true) },
      ...(weekLessons.length > 0 ? [{ text: 'Select Lessons', onPress: () => setShowLessonSelectModal(true) }] : []),
      ...(weekUnacknowledgedCount > 0 ? [{ text: `Unacknowledged (${weekUnacknowledgedCount})`, onPress: () => setShowUnackModal(true) }] : []),
      ...(hasConflicts ? [{ text: `Fix All Conflicts (${conflictCount})`, style: 'destructive' as const, onPress: () => setShowFixAllModal(true) }] : []),
      { text: 'Cancel', style: 'cancel' as const },
    ];
    showAlert('Diary Options', undefined, btns);
  }, [weekLessons, pupils, weekUnacknowledgedCount, showAlert]);

  // ── Toggle collapse ───────────────────────────────────────────────────────
  const toggleHeaderCollapse = useCallback(() => {
    setHeaderCollapsed(v => !v);
  }, []);

  // Auto-expand when switching to list view
  useEffect(() => {
    if (viewMode === 'list') setHeaderCollapsed(false);
  }, [viewMode]);

  const handleConfirmWeek = () => {
    if (weekLessons.length === 0) { showAlert('No lessons', 'There are no lessons to confirm for this week.'); return; }
    showAlert(
      'Confirm Weekly Diary?',
      `This will finalise ${weekLessons.length} lesson${weekLessons.length !== 1 ? 's' : ''} and send payment requests to all ${new Set(weekLessons.map(l => l.pupilId)).size} pupils.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm & Notify', style: 'default',
          onPress: async () => {
            setConfirming(true);
            await confirmWeek(weekStart);
            setConfirming(false);
            showAlert('Week Confirmed', 'All pupils have been notified with their lesson times and payment requests.');
          },
        },
      ],
    );
  };

  const handleLessonMove = useCallback(async (lessonId: string, newDate: string, newStartTime: string) => {
    const lesson = lessons.find(l => l.id === lessonId);
    if (!lesson) return;
    const targetDate = new Date(newDate);
    const dayOfWeek = targetDate.getDay();
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const newWeekStart = new Date(targetDate);
    newWeekStart.setDate(targetDate.getDate() + diff);
    await addOrUpdateLesson({ ...lesson, date: newDate, startTime: newStartTime, weekStart: newWeekStart.toISOString().slice(0, 10) });
  }, [lessons, addOrUpdateLesson]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    const ordered = localOrder.length > 0 ? localOrder : dayLessons;
    const todayDate = weekDates[selectedDay] ?? ordered[0]?.date ?? '';
    const staleKey = buildTravelCacheKey(todayDate, ordered);
    await invalidateTravelCache(staleKey);
    lastComputedKeyRef.current = '';
    setTravelTimes({});
    setTravelError(null);
    await fetchTravelTimes(ordered, { force: true });
    setRefreshing(false);
  }, [localOrder, dayLessons, weekDates, selectedDay, fetchTravelTimes]);

  const totalHours = weekLessons.reduce((s, l) => s + l.duration / 60, 0);

  // ── Render a single lesson card (used by DraggableFlatList) ────────────────
  const renderLessonCard = useCallback((lesson: Lesson, idx: number, drag?: () => void, isActive?: boolean) => {
    const pupil = pupils.find(p => p.id === lesson.pupilId);
    const zone = getLessonZone(lesson);
    const zoneColor = ZONE_COLORS[zone];
    const activeList = localOrder.length > 0 ? localOrder : dayLessons;
    const prevLesson = activeList[idx - 1];
    const travelKey = prevLesson ? `${prevLesson.id}->${lesson.id}` : null;
    const travelSeg = travelKey ? travelTimes[travelKey] : null;
    const isSelected = selectedIds.has(lesson.id);
    const availConflict = pupil ? isLessonOutsideAvailability(lesson, pupil) : false;
    const prevPupil = prevLesson ? pupils.find(p => p.id === prevLesson.pupilId) : undefined;
    const zoneCalcBuffer = getZoneBuffer(prevPupil?.postcode ?? '', pupil?.postcode ?? '', sameZoneBuffer, diffZoneBuffer);
    const effectiveBuffer = prevLesson?.customBuffer !== undefined ? prevLesson.customBuffer : Math.max(zoneCalcBuffer, postDriveBuffer);
    const hasCustomBuffer = prevLesson?.customBuffer !== undefined;

    const prevEndMins = prevLesson ? (() => { const [h, m] = prevLesson.startTime.split(':').map(Number); return h * 60 + m + prevLesson.duration; })() : 0;
    const thisStartMins = (() => { const [h, m] = lesson.startTime.split(':').map(Number); return h * 60 + m; })();
    const driveMinutes = travelSeg ? Math.ceil(travelSeg.durationSeconds / 60) : null;
    const arrivalMins = driveMinutes !== null && prevLesson ? prevEndMins + driveMinutes : null;
    const snapMins = arrivalMins !== null ? (() => { const rem = arrivalMins % 15; return rem === 0 ? arrivalMins : arrivalMins + (15 - rem); })() : null;
    const snapGap = snapMins !== null ? snapMins - (arrivalMins ?? snapMins) : 0;
    const showSnapInfo = driveMinutes !== null && snapMins !== null && idx > 0;

    let gapInfo: { text: string; sameDistrict: boolean } | null = null;
    if (prevLesson && idx > 0) {
      const gap = thisStartMins - prevEndMins;
      if (gap < effectiveBuffer) {
        const sameDistrict = getPostcodeDistrict(prevPupil?.postcode ?? '') === getPostcodeDistrict(pupil?.postcode ?? '');
        gapInfo = {
          text: gap <= 0
            ? `Overlap! Need ${effectiveBuffer}m — ${sameDistrict ? 'same district' : 'diff district'}`
            : `Only ${gap}m gap — need ${effectiveBuffer}m — ${sameDistrict ? 'same district' : 'diff district'}`,
          sameDistrict,
        };
      }
    }

    const openDirections = () => {
      if (!prevPupil || !pupil) return;
      const from = `${prevPupil.address ?? ''}, ${prevPupil.postcode}`.trim().replace(/^,\s*/, '');
      const to = `${pupil.address ?? ''}, ${pupil.postcode}`.trim().replace(/^,\s*/, '');
      const encodedFrom = encodeURIComponent(from);
      const encodedTo = encodeURIComponent(to);
      const appUrl = `comgooglemaps://?saddr=${encodedFrom}&daddr=${encodedTo}&directionsmode=driving`;
      const webUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodedFrom}&destination=${encodedTo}&travelmode=driving`;
      Linking.canOpenURL(appUrl).then(s => Linking.openURL(s ? appUrl : webUrl)).catch(() => Linking.openURL(webUrl));
    };

    return (
      <View key={lesson.id}>
        {/* ── From Home travel card (first lesson) ── */}
        {idx === 0 && !selectMode && homeAddress && homeDriveSecsToday != null && (
          <View style={styles.travelBlock}>
            <View style={[styles.travelCard, { backgroundColor: Colors.primary + '10', borderColor: Colors.primary + '40' }]}>
              <View style={styles.travelCardLeft}>
                <View style={[styles.travelCardIcon, { backgroundColor: Colors.primary + '22' }]}>
                  <MaterialIcons name="home" size={18} color={Colors.primary} />
                </View>
                <View style={styles.travelCardInfo}>
                  <View style={styles.travelCardMainRow}>
                    <MaterialIcons name="directions-car" size={11} color={Colors.primary} style={{ marginRight: 2 }} />
                    <Text style={[styles.travelCardDuration, { color: Colors.primary }]}>{formatDuration(homeDriveSecsToday)}</Text>
                    <Text style={[styles.travelCardSep, { color: Colors.primary + '70' }]}> · </Text>
                    <Text style={[styles.travelCardDistance, { color: Colors.primary + 'CC' }]}>{formatDistance(Math.round(homeDriveSecsToday * 13.0))}</Text>
                    <Text style={[styles.travelCardSep, { color: Colors.primary + '70' }]}> from home</Text>
                  </View>
                  <Text style={[styles.travelCardRoute, { color: Colors.primary + 'AA' }]} numberOfLines={1}>{homeAddress}</Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* ── Between-lesson travel card ── */}
        {idx > 0 && !selectMode && (
          <View style={styles.travelBlock}>
            <View style={styles.travelCard}>
              <View style={styles.travelCardLeft}>
                <View style={styles.travelCardIcon}>
                  <MaterialIcons name="directions-car" size={18} color={Colors.info} />
                </View>
                <View style={styles.travelCardInfo}>
                  {loadingTravel ? (
                    <Text style={styles.travelCardLoading}>Calculating route…</Text>
                  ) : travelSeg ? (
                    <>
                      <View style={styles.travelCardMainRow}>
                        {travelSeg.isEstimated && (
                          <Text style={styles.travelCardEst}>Est. </Text>
                        )}
                        <MaterialIcons name="directions-car" size={11} color={Colors.info} style={{ marginRight: 2 }} />
                        <Text style={styles.travelCardDuration}>{formatDuration(travelSeg.durationSeconds)}</Text>
                        <Text style={styles.travelCardSep}> · </Text>
                        <Text style={styles.travelCardDistance}>{formatDistance(travelSeg.distanceMeters)}</Text>
                        {travelSeg.source === 'google' && (
                          <View style={[styles.sourceBadge, { backgroundColor: Colors.success + '22', borderColor: Colors.success + '55' }]}>
                            <MaterialIcons name="signal-cellular-alt" size={9} color={Colors.success} />
                            <Text style={[styles.sourceBadgeText, { color: Colors.success }]}>Live Traffic</Text>
                          </View>
                        )}
                        {travelSeg.source === 'osrm' && (
                          <View style={[styles.sourceBadge, { backgroundColor: Colors.warning + '22', borderColor: Colors.warning + '55' }]}>
                            <MaterialIcons name="alt-route" size={9} color={Colors.warning} />
                            <Text style={[styles.sourceBadgeText, { color: Colors.warning }]}>Route Est.</Text>
                          </View>
                        )}
                        {(travelSeg.source === 'haversine' || (!travelSeg.source && travelSeg.isEstimated)) && (
                          <View style={[styles.sourceBadge, { backgroundColor: Colors.textTertiary + '22', borderColor: Colors.textTertiary + '45' }]}>
                            <MaterialIcons name="straighten" size={9} color={Colors.textTertiary} />
                            <Text style={[styles.sourceBadgeText, { color: Colors.textTertiary }]}>Distance Est.</Text>
                          </View>
                        )}
                      </View>
                      {effectiveBuffer > 0 && (
                        <View style={styles.travelBreakdownRow}>
                          <MaterialIcons name="schedule" size={11} color={hasCustomBuffer ? Colors.warning : Colors.primary} />
                          <Text style={[styles.travelBreakdownText, hasCustomBuffer && { color: Colors.warning }]}>
                            {`+${effectiveBuffer}m buffer${hasCustomBuffer ? ' (custom)' : ''}`}
                          </Text>
                        </View>
                      )}
                      {showSnapInfo && snapMins !== null && (
                        <View style={styles.travelSnapRow}>
                          <MaterialIcons name="arrow-forward" size={11} color={Colors.success} />
                          <Text style={styles.travelSnapText}>
                            {`Arrives `}
                            <Text style={{ fontWeight: '700', color: Colors.textPrimary }}>
                              {`${String(Math.floor((arrivalMins ?? 0) / 60)).padStart(2, '0')}:${String((arrivalMins ?? 0) % 60).padStart(2, '0')}`}
                            </Text>
                            {snapGap > 0 ? (
                              <Text>{` → snaps to `}<Text style={{ fontWeight: '700', color: Colors.success }}>{`${String(Math.floor(snapMins / 60)).padStart(2, '0')}:${String(snapMins % 60).padStart(2, '0')}`}</Text></Text>
                            ) : (
                              <Text style={{ color: Colors.success }}>{` · on the quarter`}</Text>
                            )}
                          </Text>
                        </View>
                      )}
                      <Text style={styles.travelCardRoute} numberOfLines={1}>
                        {prevPupil ? `${prevPupil.firstName} ${prevPupil.lastName}` : '?'}{' → '}{pupil ? `${pupil.firstName} ${pupil.lastName}` : '?'}
                      </Text>
                    </>
                  ) : (
                    <Text style={styles.travelCardNoData}>Calculating drive time…</Text>
                  )}
                </View>
              </View>
              <View style={styles.travelCardRight}>
                {prevPupil && pupil && (
                  <Pressable style={styles.goBtn} onPress={openDirections} hitSlop={6}>
                    <MaterialIcons name="navigation" size={14} color={Colors.textInverse} />
                    <Text style={styles.goBtnText}>Go</Text>
                  </Pressable>
                )}
                <Pressable
                  style={[styles.bufferChip, hasCustomBuffer && styles.bufferChipCustom]}
                  onPress={() => setBufferEditLesson(prevLesson)}
                  hitSlop={6}
                >
                  <MaterialIcons name="add-alarm" size={11} color={hasCustomBuffer ? Colors.warning : Colors.primary} />
                  <Text style={[styles.bufferChipText, hasCustomBuffer && { color: Colors.warning }]}>
                    {hasCustomBuffer ? `${effectiveBuffer}m buffer*` : `+${effectiveBuffer}m`}
                  </Text>
                </Pressable>
              </View>
            </View>
            {gapInfo && (
              <View style={[styles.gapWarnRow, { backgroundColor: (gapInfo.sameDistrict ? Colors.warning : Colors.error) + '15', borderColor: (gapInfo.sameDistrict ? Colors.warning : Colors.error) + '45' }]}>
                <MaterialIcons name="warning" size={13} color={gapInfo.sameDistrict ? Colors.warning : Colors.error} />
                <Text style={[styles.gapWarnText, { color: gapInfo.sameDistrict ? Colors.warning : Colors.error }]}>{gapInfo.text}</Text>
              </View>
            )}
          </View>
        )}

        {/* ── Buffer Before band ── */}
        {showBufferBands && lessonBufferBefore > 0 && !selectMode && (
          <View style={bufferBandStyles.beforeBand}>
            <View style={bufferBandStyles.bandLine} />
            <View style={bufferBandStyles.bandContent}>
              <MaterialIcons name="schedule" size={10} color="#94A3B8" />
              <Text style={bufferBandStyles.bandText}>{lessonBufferBefore}m prep</Text>
            </View>
            <View style={bufferBandStyles.bandLine} />
          </View>
        )}
        {/* ── Lesson card ── */}
        <Pressable
          style={[
            styles.lessonCard,
            { borderLeftColor: zoneColor, borderLeftWidth: 4 },
            isSelected && styles.lessonCardSelected,
            isActive && styles.lessonCardDragActive,
            availConflict && styles.lessonCardConflict,
          ]}
          onPress={() => {
            if (selectMode) { toggleSelect(lesson.id); return; }
            router.push({ pathname: '/(instructor)/lesson-detail', params: { lessonId: lesson.id } });
          }}
          onLongPress={() => { if (!selectMode) setNotesLesson(lesson); }}
          delayLongPress={500}
        >
          {/* Left control: checkbox (select mode) OR drag handle */}
          {selectMode ? (
            <Pressable onPress={() => toggleSelect(lesson.id)} style={styles.checkboxWrap} hitSlop={8}>
              <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                {isSelected && <MaterialIcons name="check" size={14} color={Colors.textInverse} />}
              </View>
            </Pressable>
          ) : (
            <Pressable
              onLongPress={drag}
              delayLongPress={500}
              hitSlop={4}
              style={styles.dragHandle}
            >
              <MaterialIcons name="drag-indicator" size={20} color={Colors.textTertiary} />
            </Pressable>
          )}

          <View style={styles.timeCol}>
            <Text style={styles.lessonStart}>{lesson.startTime}</Text>
            <Text style={styles.lessonEnd}>{getEndTime(lesson.startTime, lesson.duration)}</Text>
            <Text style={styles.lessonDuration}>{lesson.duration}m</Text>
            {idx > 0 && snapMins !== null && (
              <View style={styles.etaChip}>
                <Text style={styles.etaChipText}>Snap {fromMinsLocal(snapMins)}</Text>
              </View>
            )}
          </View>

          <View style={styles.lessonDetails}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={styles.lessonPupil}>{pupil ? `${pupil.firstName} ${pupil.lastName}` : 'Unknown'}</Text>
              {!selectMode && (
                <Pressable
                  style={diaryNotes.notesBtnDiary}
                  onPress={() => setNotesLesson(lesson)}
                  hitSlop={8}
                >
                  <MaterialIcons
                    name={lesson.notes?.trim() ? 'edit-note' : 'note-add'}
                    size={15}
                    color={lesson.notes?.trim() ? Colors.primary : Colors.textTertiary}
                  />
                </Pressable>
              )}
            </View>
            <View style={styles.lessonMeta}>
              <MaterialIcons name="location-on" size={12} color={zoneColor} />
              <Text style={[styles.lessonPostcode, { color: zoneColor }]}>{pupil?.postcode ?? ''}</Text>
              {pupil?.postcode && (
                <View style={[styles.districtChip, { backgroundColor: zoneColor + '20' }]}>
                  <Text style={[styles.districtChipText, { color: zoneColor }]}>{getPostcodeDistrict(pupil.postcode)}</Text>
                </View>
              )}
              <Pressable
                style={[styles.lessonBufferChip, lesson.customBuffer !== undefined && styles.lessonBufferChipCustom]}
                onPress={() => setBufferEditLesson(lesson)}
                hitSlop={6}
              >
                <MaterialIcons name="schedule" size={10} color={lesson.customBuffer !== undefined ? Colors.warning : Colors.textTertiary} />
                <Text style={[styles.lessonBufferChipText, lesson.customBuffer !== undefined && { color: Colors.warning }]}>
                  {lesson.customBuffer !== undefined ? `${lesson.customBuffer}m*` : `${zoneCalcBuffer}m`}
                </Text>
              </Pressable>
            </View>
            <View style={styles.lessonFlags}>
              {availConflict && (
              <Pressable onPress={() => setConflictLesson(lesson)} hitSlop={4}>
                <FlagChip icon="event-busy" label="Outside Availability" color="#FF3B30" />
              </Pressable>
            )}
              {!lesson.pupilAcknowledged && <FlagChip icon="pending" label="Unacknowledged" color={Colors.warning} />}
              {lesson.paymentStatus === 'unpaid' && <FlagChip icon="money-off" label="Unpaid" color={Colors.error} />}
              {lesson.status === 'completed' && <FlagChip icon="check-circle" label="Done" color={Colors.success} />}
            </View>
          </View>

          {!selectMode && <MaterialIcons name="chevron-right" size={20} color={Colors.textTertiary} />}
        </Pressable>
        {/* ── Buffer After band ── */}
        {showBufferBands && lessonBufferAfter > 0 && !selectMode && (
          <View style={bufferBandStyles.afterBand}>
            <View style={bufferBandStyles.bandLine} />
            <View style={bufferBandStyles.bandContent}>
              <MaterialIcons name="timer-off" size={10} color="#94A3B8" />
              <Text style={bufferBandStyles.bandText}>{lessonBufferAfter}m wrap</Text>
            </View>
            <View style={bufferBandStyles.bandLine} />
          </View>
        )}
      </View>
    );
  }, [
    pupils, getLessonZone, router, travelTimes, loadingTravel, localOrder, dayLessons,
    selectMode, selectedIds, toggleSelect, sameZoneBuffer, diffZoneBuffer, postDriveBuffer,
    homeAddress, homeDriveSecsToday, lessonBufferBefore, lessonBufferAfter, showBufferBands,
  ]);

  // ── DraggableFlatList renderItem wrapper ─────────────────────────────────
  const renderDraggableItem = useCallback(
    ({ item, drag, isActive, getIndex }: RenderItemParams<Lesson>) => {
      const idx = getIndex() ?? 0;
      return (
        <ScaleDecorator activeScale={1.02}>
          {renderLessonCard(item, idx, drag, isActive)}
        </ScaleDecorator>
      );
    },
    [renderLessonCard],
  );

  const activeList = localOrder.length > 0 ? localOrder : dayLessons;

  // ── Snap banner overlay (rendered inside the screen view) ─────────────────
  const snapBannerVisible = snapBannerCount > 0;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <View style={{ flex: 1, backgroundColor: Colors.background }}>

      {/* ── Inline Notes Modal ── */}
      <LessonNotesModal
        visible={notesLesson !== null}
        lesson={notesLesson}
        pupilName={notesLesson ? (() => { const p = pupils.find(pp => pp.id === notesLesson.pupilId); return p ? `${p.firstName} ${p.lastName}` : 'Unknown'; })() : ''}
        onSave={async (notes) => {
          if (!notesLesson) return;
          await addOrUpdateLesson({ ...notesLesson, notes });
          setNotesLesson(prev => prev ? { ...prev, notes } : null);
        }}
        onClose={() => setNotesLesson(null)}
      />

      <FixAllConflictsModal
        visible={showFixAllModal}
        conflictLessons={weekLessons
          .map(l => ({ lesson: l, pupil: pupils.find(p => p.id === l.pupilId) }))
          .filter((x): x is { lesson: Lesson; pupil: Pupil } => !!x.pupil && isLessonOutsideAvailability(x.lesson, x.pupil))}
        onClose={() => setShowFixAllModal(false)}
        onDeleteAll={async () => {
          const conflicts = weekLessons
            .map(l => ({ lesson: l, pupil: pupils.find(p => p.id === l.pupilId) }))
            .filter((x): x is { lesson: Lesson; pupil: Pupil } => !!x.pupil && isLessonOutsideAvailability(x.lesson, x.pupil));
          const ids = conflicts.map(c => c.lesson.id);
          await Promise.all(ids.map(id => removeLesson(id)));
          setShowFixAllModal(false);
          setGenerating(true); setScheduleStatus('Rescheduling…'); setSchedulerStatusCallback(setScheduleStatus);
          await new Promise(r => setTimeout(r, 300));
          try {
            const remaining = weekLessons.filter(l => !ids.includes(l.id));
            const result = await suggestWeekScheduleFull(pupils, remaining, weekStart, instructorAvailability, sameZoneBuffer, diffZoneBuffer, postDriveBuffer, homeAddress, effectiveTrafficPrefs, lessonBuffersEnabled ? lessonBufferBefore : 0, lessonBuffersEnabled ? lessonBufferAfter : 0);
            setScheduleStatus(''); setSchedulerStatusCallback(null); setGenerating(false);
            if (result.unscheduled.length > 0) { setPendingScheduleResult(result); setShowScheduleModal(true); showAlert('Partially Scheduled', `${result.suggestions.length} lesson${result.suggestions.length !== 1 ? 's' : ''} added. ${result.unscheduled.length} could not be fitted.`); }
            else { await commitSuggestionsToLesson(result.suggestions); showAlert('All Conflicts Fixed', `${ids.length} conflict${ids.length !== 1 ? 's' : ''} removed and ${result.suggestions.length} rescheduled.`); }
          } catch { setScheduleStatus(''); setSchedulerStatusCallback(null); setGenerating(false); showAlert('Error', 'Failed to reschedule. Please try again.'); }
        }}
      />

      <CompressDayModal
        visible={showCompressModal}
        result={compressResult}
        onApply={handleApplyCompression}
        onClose={() => { setShowCompressModal(false); setCompressResult(null); }}
      />

      <AvailabilityConflictModal
        visible={conflictLesson !== null}
        lesson={conflictLesson}
        pupil={conflictLesson ? (pupils.find(p => p.id === conflictLesson.pupilId) ?? null) : null}
        onClose={() => setConflictLesson(null)}
        onDelete={async () => {
          if (!conflictLesson) return;
          await removeLesson(conflictLesson.id);
          setConflictLesson(null);
        }}
        onEditTime={() => {
          if (conflictLesson) { setEditTimeLesson(conflictLesson); setConflictLesson(null); }
        }}
        onDeleteAndReschedule={async () => {
          if (!conflictLesson) return;
          await removeLesson(conflictLesson.id);
          setConflictLesson(null);
          setGenerating(true);
          setScheduleStatus('Rescheduling…');
          setSchedulerStatusCallback(setScheduleStatus);
          await new Promise(r => setTimeout(r, 300));
          try {
            const effBefore = lessonBuffersEnabled ? lessonBufferBefore : 0;
            const effAfter  = lessonBuffersEnabled ? lessonBufferAfter  : 0;
            const lessonsWithout = weekLessons.filter(l => l.id !== conflictLesson.id);
            const result = await suggestWeekScheduleFull(
              pupils, lessonsWithout, weekStart,
              instructorAvailability, sameZoneBuffer, diffZoneBuffer, postDriveBuffer, homeAddress,
              effectiveTrafficPrefs, effBefore, effAfter,
            );
            setScheduleStatus(''); setSchedulerStatusCallback(null); setGenerating(false);
            if (result.unscheduled.length > 0) {
              setPendingScheduleResult(result); setShowScheduleModal(true);
            } else {
              await commitSuggestionsToLesson(result.suggestions);
              showAlert('Rescheduled', `${result.suggestions.length} lesson${result.suggestions.length !== 1 ? 's' : ''} added to your diary.`);
            }
          } catch {
            setScheduleStatus(''); setSchedulerStatusCallback(null); setGenerating(false);
            showAlert('Error', 'Failed to reschedule. Please try again.');
          }
        }}
      />

      <EditLessonTimeModal
        visible={editTimeLesson !== null}
        lesson={editTimeLesson}
        pupil={editTimeLesson ? (pupils.find(p => p.id === editTimeLesson.pupilId) ?? null) : null}
        weekDates={weekDates}
        instructorAvailability={instructorAvailability}
        allWeekLessons={weekLessons}
        onSaveTime={async (updated) => {
          undoLessonRef.current = weekLessons.find(l => l.id === updated.id) ?? null;
          await addOrUpdateLesson(updated);
          setEditTimeLesson(null); setConflictLesson(null);
          const ni = weekDates.indexOf(updated.date);
          if (ni >= 0) setSelectedDay(ni);
          const src=(localOrder.length>0?localOrder:weekLessons).filter(l=>l.date===updated.date).map(l=>l.id===updated.id?updated:l);
          const newOrd=(src.some(l=>l.id===updated.id)?src:[...src,updated]).sort((a,b)=>a.startTime.localeCompare(b.startTime));
          setLocalOrder(newOrd);
          lastComputedKeyRef.current='';setTravelTimes({});setHomeDriveSecsToday(null);
          setPendingGapInfo(computeGapAnalysis(updated));setPendingGapLesson(updated);
        }}
        onClose={() => setEditTimeLesson(null)}
      />

      <GapAnalysisModal
        visible={pendingGapInfo !== null && pendingGapLesson !== null}
        gapInfo={pendingGapInfo}
        lesson={pendingGapLesson}
        pupil={pendingGapLesson ? (pupils.find(p => p.id === pendingGapLesson.pupilId) ?? null) : null}
        weekDates={weekDates}
        onClose={() => { setPendingGapInfo(null); setPendingGapLesson(null); }}
        onAccept={() => {
          const sv = pendingGapLesson;
          setPendingGapInfo(null); setPendingGapLesson(null);
          if (sv) {
            const di=weekDates.indexOf(sv.date);
            if (di>=0) setSelectedDay(di);
            setLocalOrder(prev=>{const b=prev.filter(l=>l.date===sv.date).map(l=>l.id===sv.id?sv:l);return(b.some(l=>l.id===sv.id)?b:[...b,sv]).sort((a,b)=>a.startTime.localeCompare(b.startTime));});
            lastComputedKeyRef.current='';setTravelTimes({});
            setTimeout(()=>setLocalOrder(prev=>{fetchTravelTimesRef.current?.(prev,{force:true});return prev;}),300);
          }
          if(undoTimerRef.current)clearTimeout(undoTimerRef.current);setShowUndoBar(true);undoBarOpacity.setValue(0);Animated.timing(undoBarOpacity,{toValue:1,duration:220,useNativeDriver:true}).start();undoTimerRef.current=setTimeout(()=>Animated.timing(undoBarOpacity,{toValue:0,duration:380,useNativeDriver:true}).start(()=>{setShowUndoBar(false);undoLessonRef.current=null;}),5000);
        }}
        onApplyShift={async (shiftMins) => {
          if (!pendingGapLesson) return;
          const dayDate = pendingGapLesson.date;
          const d = new Date(dayDate);
          const dayName = DAY_NAMES_FULL[d.getDay() === 0 ? 6 : d.getDay() - 1];
          const allDay = weekLessons.filter(l => l.date === dayDate).sort((a, b) => toMinsLocal(a.startTime) - toMinsLocal(b.startTime));
          const editedIdx = allDay.findIndex(l => l.id === pendingGapLesson.id);
          const toShift = allDay.slice(0, editedIdx).map(l => ({ ...l, startTime: fromMinsLocal(snapUp15(toMinsLocal(l.startTime) + shiftMins)) }));
          await Promise.all(toShift.map(l => addOrUpdateLesson(l)));
          setPendingGapInfo(null); setPendingGapLesson(null);
          lastComputedKeyRef.current = '';
          setTravelTimes({});
          showAlert('Day Shifted', `${toShift.length} lesson${toShift.length !== 1 ? 's' : ''} moved ${shiftMins} min later. Gap closed.`);
          setTimeout(() => fetchTravelTimesRef.current?.(allDay, { force: true }), 300);
        }}
        onReschedule={async () => {
          setPendingGapInfo(null); setPendingGapLesson(null);
          setGenerating(true); setScheduleStatus('Rescheduling…');
          setSchedulerStatusCallback(setScheduleStatus);
          await new Promise(r => setTimeout(r, 300));
          try {
            const effBefore = lessonBuffersEnabled ? lessonBufferBefore : 0;
      const effAfter  = lessonBuffersEnabled ? lessonBufferAfter  : 0;
      const result = await suggestWeekScheduleFull(pupils, weekLessons, weekStart, instructorAvailability, sameZoneBuffer, diffZoneBuffer, postDriveBuffer, homeAddress, effectiveTrafficPrefs, effBefore, effAfter);
            setScheduleStatus(''); setSchedulerStatusCallback(null); setGenerating(false);
            if (result.unscheduled.length > 0) { setPendingScheduleResult(result); setShowScheduleModal(true); }
            else { await commitSuggestionsToLesson(result.suggestions); showAlert('Rescheduled', `${result.suggestions.length} lesson${result.suggestions.length !== 1 ? 's' : ''} re-optimised.`); }
          } catch { setScheduleStatus(''); setSchedulerStatusCallback(null); setGenerating(false); }
        }}
      />

      <BufferEditorModal
        visible={bufferEditLesson !== null}
        lesson={bufferEditLesson}
        pupilName={bufferEditLesson ? (() => { const p = pupils.find(pp => pp.id === bufferEditLesson.pupilId); return p ? `${p.firstName} ${p.lastName}` : 'Unknown'; })() : ''}
        currentBuffer={bufferEditLesson?.customBuffer ?? ((() => {
          const prevLessonInList = bufferEditLesson ? localOrder[localOrder.findIndex(l => l.id === bufferEditLesson.id) - 1] : undefined;
          const prev = pupils.find(pp => pp.id === prevLessonInList?.pupilId);
          const cur = pupils.find(pp => pp.id === bufferEditLesson?.pupilId);
          return getZoneBuffer(prev?.postcode ?? '', cur?.postcode ?? '', sameZoneBuffer, diffZoneBuffer);
        })())}
        isCustom={bufferEditLesson?.customBuffer !== undefined}
        onSave={handleSaveLessonBuffer}
        onClose={() => setBufferEditLesson(null)}
      />

      <LessonSelectModal visible={showLessonSelectModal} onClose={() => setShowLessonSelectModal(false)} lessons={weekLessons} pupils={pupils} onDelete={handleBulkDeleteUnack} />
      <UnackDeleteModal visible={showUnackModal} onClose={() => setShowUnackModal(false)} lessons={weekLessons.filter(l => !Boolean(l.pupilAcknowledged))} pupils={pupils} onDelete={handleBulkDeleteUnack} />

      <WorkingHoursEditorModal
        visible={showWorkingHoursEditor}
        currentAvailability={instructorAvailability}
        weekLessons={weekLessons}
        onSave={handleSaveWorkingHours}
        onClose={() => setShowWorkingHoursEditor(false)}
      />

      <PreScheduleAnalysisModal
        visible={showPreScheduleAnalysis}
        affectedLessons={preScheduleAffected}
        availableSlots={preScheduleSlots}
        weekDates={weekDates}
        newAvailability={preScheduleNewAvail}
        onClose={() => setShowPreScheduleAnalysis(false)}
        onShiftLessons={async (updates) => {
          await Promise.all(updates.map(({ lesson, newStartTime }) => addOrUpdateLesson({ ...lesson, startTime: newStartTime })));
          lastComputedKeyRef.current = ''; setTravelTimes({});
          setShowPreScheduleAnalysis(false);
          showAlert('Lessons Shifted', `${updates.length} lesson${updates.length !== 1 ? 's' : ''} moved to fit new hours.`);
        }}
        onRunFullWeek={async () => {
          setShowPreScheduleAnalysis(false);
          const affIds = preScheduleAffected.map(a => a.lesson.id);
          await Promise.all(affIds.map(id => removeLesson(id)));
          setGenerating(true); setScheduleStatus('Re-optimising…'); setSchedulerStatusCallback(setScheduleStatus);
          await new Promise(r => setTimeout(r, 300));
          try {
            const remaining = weekLessons.filter(l => !affIds.includes(l.id));
            const result = await suggestWeekScheduleFull(pupils, remaining, weekStart, instructorAvailability, sameZoneBuffer, diffZoneBuffer, postDriveBuffer, homeAddress, effectiveTrafficPrefs, lessonBuffersEnabled ? lessonBufferBefore : 0, lessonBuffersEnabled ? lessonBufferAfter : 0);
            setScheduleStatus(''); setSchedulerStatusCallback(null); setGenerating(false);
            if (result.unscheduled.length > 0) { setPendingScheduleResult(result); setShowScheduleModal(true); }
            else { await commitSuggestionsToLesson(result.suggestions); showAlert('Week Re-Optimised', `${result.suggestions.length} lesson${result.suggestions.length !== 1 ? 's' : ''} scheduled with new hours.`); }
          } catch { setScheduleStatus(''); setSchedulerStatusCallback(null); setGenerating(false); }
        }}
        onRunDay={async (dateStr) => {
          setShowPreScheduleAnalysis(false);
          const affDayIds = preScheduleAffected.filter(a => a.lesson.date === dateStr).map(a => a.lesson.id);
          await Promise.all(affDayIds.map(id => removeLesson(id)));
          const dayIdx = weekDates.indexOf(dateStr);
          if (dayIdx >= 0) setSelectedDay(dayIdx);
          await new Promise(r => setTimeout(r, 400));
          handleSmartSchedule();
        }}
      />

      {snapBannerVisible&&<Animated.View style={[snapBannerStyles.banner,{top:insets.top+8,opacity:snapBannerOpacity}]} pointerEvents="none"><MaterialIcons name="update" size={15} color={Colors.navy}/><Text style={snapBannerStyles.text}>{snapBannerCount===1?'1 lesson moved to snap time':`${snapBannerCount} lessons moved to snap times`}</Text></Animated.View>}
      {showUndoBar&&<Animated.View style={[snapBannerStyles.banner,{bottom:insets.bottom+88,opacity:undoBarOpacity}]}><Text style={[snapBannerStyles.text,{flex:1}]}>Time updated</Text><Pressable onPress={async()=>{const o=undoLessonRef.current;if(!o)return;undoLessonRef.current=null;setShowUndoBar(false);await addOrUpdateLesson(o);lastComputedKeyRef.current='';setTravelTimes({});}}><Text style={{fontWeight:'800',color:Colors.navy}}>Undo</Text></Pressable></Animated.View>}

      {pendingScheduleResult && (
        <ScheduleResultModal
          visible={showScheduleModal}
          result={pendingScheduleResult}
          onClose={() => { setShowScheduleModal(false); setPendingScheduleResult(null); }}
          onPreview={async (suggestions, unscheduled) => {
            setShowScheduleModal(false); setPendingScheduleResult(null);
            if (suggestions.length > 0) { setGenerating(true); await commitSuggestionsToLesson(suggestions); setGenerating(false); }
            if (unscheduled.length > 0) { runAndPreview([], unscheduled); } else { showAlert('All lessons added', `${suggestions.length} lessons have been added to your diary.`); }
          }}
          onApplyAvailTweak={handleApplyAvailTweak}
          onApplyAllTweaks={handleApplyAllTweaks}
          onForceFit={handleForceFit}
          onExtend={async (extra) => {
            setShowScheduleModal(false); setPendingScheduleResult(null); setGenerating(true);
            await new Promise(r => setTimeout(r, 400));
            try {
              const extended = await suggestWeekScheduleWithExtension(pupils, weekLessons, weekStart, instructorAvailability, sameZoneBuffer, diffZoneBuffer, extra);
              await commitSuggestionsToLesson(extended.suggestions);
              setGenerating(false);
              if (extended.unscheduled.length > 0) {
                setPendingScheduleResult(extended); setShowScheduleModal(true);
                showAlert('Partially Scheduled', `${extended.suggestions.length} lessons added. ${extended.unscheduled.length} still could not be fitted.`);
              } else {
                showAlert('All Lessons Scheduled', `${extended.suggestions.length} lesson${extended.suggestions.length !== 1 ? 's' : ''} added to your diary.`);
              }
            } catch { setGenerating(false); }
          }}
        />
      )}

      {/* ── Header: collapsed pill (calendar only) OR full header ───── */}
      {viewMode === 'calendar' && headerCollapsed ? (
        // ── Collapsed compact bar ──────────────────────────────────────────
        <View style={[styles.collapsedHeaderWrap, { paddingTop: insets.top + 6 }]}>
          <Pressable style={styles.collapsedPill} onPress={toggleHeaderCollapse} hitSlop={4}>
            <View style={{ flex: 1 }}>
              <View style={styles.collapsedTitleRow}>
                <Text style={styles.collapsedTitle}>Weekly Diary</Text>
                <Text style={styles.collapsedSep}> · </Text>
                <Text style={styles.collapsedDateRange} numberOfLines={1}>{formatDate(weekStart)} – {formatDate(addDays(weekStart, 6))}</Text>
              </View>
              <Text style={styles.collapsedStats}>{weekLessons.length} lessons · {totalHours.toFixed(1)} hrs</Text>
            </View>
            <MaterialIcons name="keyboard-arrow-down" size={22} color="#FF6700" style={{ marginLeft: 8 }} />
          </Pressable>
          {/* Confirm Week icon button */}
          <Pressable
            style={[
              styles.collapsedActionBtn,
              weekConfirmed && { backgroundColor: '#22C55E' },
              (confirming || weekLessons.length === 0) && { opacity: 0.4 },
            ]}
            onPress={handleConfirmWeek}
            disabled={confirming || weekLessons.length === 0}
            hitSlop={4}
          >
            {confirming
              ? <ActivityIndicator size="small" color="#FFFFFF" />
              : <MaterialIcons name={weekConfirmed ? 'verified' : 'how-to-reg'} size={18} color="#FFFFFF" />}
          </Pressable>
          {/* Smart Schedule icon button */}
          <Pressable
            style={[styles.collapsedActionBtn, styles.collapsedActionBtnGlow, generating && { opacity: 0.5 }]}
            onPress={handleSmartSchedule}
            disabled={generating}
            hitSlop={4}
          >
            {generating
              ? <ActivityIndicator size="small" color="#1C2537" />
              : <MaterialIcons name="auto-fix-high" size={18} color="#1C2537" />}
          </Pressable>
          <Pressable style={styles.overflowBtnHeader} onPress={handleOverflowMenu}>
            <MaterialIcons name="more-horiz" size={20} color="#FFFFFF" />
          </Pressable>
        </View>
      ) : (
        // ── Full header ───────────────────────────────────────────────────
        <>
          <View style={[styles.headerWrap, { paddingTop: insets.top + 2, backgroundColor: '#FFFFFF' }]}>
            <View style={styles.header}>
              <Pressable
                style={{ flex: 1 }}
                onPress={viewMode === 'calendar' ? toggleHeaderCollapse : undefined}
                hitSlop={viewMode === 'calendar' ? 8 : 0}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={styles.title}>Weekly Diary</Text>
                  {viewMode === 'calendar' && (
                    <MaterialIcons name="keyboard-arrow-up" size={18} color="#FF6700" style={{ marginTop: 2 }} />
                  )}
                </View>
                <Text style={styles.subtitle}>{formatDate(weekStart)} - {formatDate(addDays(weekStart, 6))}</Text>
              </Pressable>
              <View style={styles.headerActions}>
                <View style={styles.viewModeToggle}>
                  <Pressable style={[styles.viewModeBtn, viewMode === 'calendar' && styles.viewModeBtnActive]} onPress={() => setViewMode('calendar')}>
                    <MaterialIcons name="calendar-view-week" size={16} color={viewMode === 'calendar' ? '#FFFFFF' : '#00C4FF'} />
                  </Pressable>
                  <Pressable style={[styles.viewModeBtn, viewMode === 'list' && styles.viewModeBtnActive]} onPress={() => setViewMode('list')}>
                    <MaterialIcons name="format-list-bulleted" size={16} color={viewMode === 'list' ? '#FFFFFF' : '#00C4FF'} />
                  </Pressable>
                </View>
                <Pressable style={styles.weekNav} onPress={() => setWeekOffset(w => w - 1)}><MaterialIcons name="chevron-left" size={22} color="#00C4FF" /></Pressable>
                <Pressable style={styles.weekNav} onPress={() => setWeekOffset(0)}><MaterialIcons name="today" size={18} color="#00C4FF" /></Pressable>
                <Pressable style={styles.weekNav} onPress={() => setWeekOffset(w => w + 1)}><MaterialIcons name="chevron-right" size={22} color="#00C4FF" /></Pressable>
                <Pressable style={styles.overflowBtnHeader} onPress={handleOverflowMenu}>
                  <MaterialIcons name="more-horiz" size={20} color="#FFFFFF" />
                </Pressable>
              </View>
            </View>
          </View>

          {/* ── Stats + action bar ────────────────────────────────────────── */}
          <View style={styles.statsBar}>
            <View style={styles.statsRow}>
              <Text style={styles.statItem}><Text style={styles.statValue}>{weekLessons.length}</Text> lessons</Text>
              <Text style={styles.statDivider}>·</Text>
              <Text style={styles.statItem}><Text style={styles.statValue}>{totalHours.toFixed(1)}</Text> hrs</Text>
              <Text style={styles.statDivider}>·</Text>
              <Text style={styles.statItem}><Text style={styles.statValue}>{weekLessons.filter(l => l.paymentStatus === 'paid').length}</Text> paid</Text>
              {(() => {
                const conflictCount = weekLessons.filter(l => {
                  const p = pupils.find(pp => pp.id === l.pupilId);
                  return p ? isLessonOutsideAvailability(l, p) : false;
                }).length;
                return conflictCount > 0 ? (
                  <>
                    <Text style={styles.statDivider}>·</Text>
                    <Pressable onPress={() => setShowFixAllModal(true)} hitSlop={6}>
                      <Text style={[styles.statItem, { color: '#FF3B30' }]}>
                        <Text style={[styles.statValue, { color: '#FF3B30' }]}>{conflictCount}</Text> ⚠ avail
                      </Text>
                    </Pressable>
                  </>
                ) : null;
              })()}
              {sameZoneBuffer > 0 && (
                <>
                  <Text style={styles.statDivider}>·</Text>
                  <Text style={styles.statItem}>
                    <Text style={[styles.statValue, { color: Colors.primary }]}>{sameZoneBuffer}m</Text>{' / '}
                    <Text style={[styles.statValue, { color: Colors.warning }]}>{diffZoneBuffer}m</Text>{' gap'}
                  </Text>
                </>
              )}
            </View>
            <View style={styles.primaryBtnsRow}>
              <Pressable
                style={[styles.confirmWeekBtn, weekConfirmed && styles.confirmWeekBtnDone, (confirming || weekLessons.length === 0) && styles.scheduleBtnDisabled]}
                onPress={handleConfirmWeek}
                disabled={confirming || weekLessons.length === 0}
              >
                {confirming ? <ActivityIndicator size="small" color={Colors.textInverse} /> : <MaterialIcons name={weekConfirmed ? 'verified' : 'how-to-reg'} size={14} color={Colors.textInverse} />}
                <Text style={styles.scheduleBtnText}>{confirming ? 'Confirming...' : weekConfirmed ? 'Confirmed' : 'Confirm Week'}</Text>
              </Pressable>
              <Pressable style={[styles.scheduleBtn, styles.scheduleBtnGlow, generating && styles.scheduleBtnDisabled]} onPress={handleSmartSchedule} disabled={generating}>
                {generating ? (
                  <ActivityIndicator size="small" color={Colors.navy} />
                ) : (
                  <>
                    <MaterialIcons name="star" size={13} color={Colors.navy} style={{ opacity: 0.85 }} />
                    <MaterialIcons name="auto-fix-high" size={14} color={Colors.navy} />
                  </>
                )}
                <Text style={styles.scheduleBtnText}>{generating ? (scheduleStatus || 'Optimising...') : 'Smart Schedule'}</Text>
              </Pressable>
            </View>
          </View>
        </>
      )}

      {/* ── CALENDAR VIEW ─────────────────────────────────────────────── */}
      {viewMode === 'calendar' && (
        <View style={{ flex: 1 }}>
          <View style={styles.calendarLegend}>
            <View style={styles.calendarLegendItem}>
              <View style={[styles.calendarLegendDot, { backgroundColor: Colors.success }]} />
              <Text style={styles.calendarLegendText}>Paid</Text>
            </View>
            <View style={styles.calendarLegendItem}>
              <View style={[styles.calendarLegendDot, { backgroundColor: Colors.error }]} />
              <Text style={styles.calendarLegendText}>Unpaid</Text>
            </View>
            <View style={styles.calendarLegendItem}>
              <MaterialIcons name="directions-car" size={10} color={Colors.info} />
              <Text style={styles.calendarLegendText}>Drive time</Text>
            </View>
            <View style={{ flex: 1 }} />
            <Pressable style={styles.calendarFitToggle} onPress={() => setCalendarFitMode(v => !v)}>
              <MaterialIcons name={calendarFitMode ? 'unfold-more' : 'unfold-less'} size={12} color={Colors.primary} />
              <Text style={styles.calendarFitToggleText}>{calendarFitMode ? 'Scroll' : 'Fit'}</Text>
            </Pressable>
          </View>
          <WeeklyCalendarGrid
            weekDates={weekDates}
            lessons={weekLessons}
            pupils={pupils}
            instructorAvailability={instructorAvailability}
            bufferMinutes={bufferMinutes}
            sameZoneBuffer={sameZoneBuffer}
            diffZoneBuffer={diffZoneBuffer}
            availableHeight={calendarFitMode ? screenHeight - insets.top - insets.bottom - (headerCollapsed ? 72 : 220) : undefined}
            onLessonPress={(lesson) => router.push({ pathname: '/(instructor)/lesson-detail', params: { lessonId: lesson.id } })}
            onLessonMove={handleLessonMove}
            onAddLesson={(date, time) => router.push({ pathname: '/(instructor)/lesson-form', params: { date, time } })}
          />
        </View>
      )}

      {/* ── LIST VIEW ──────────────────────────────────────────────────── */}
      {viewMode === 'list' && (
        <View style={{ flex: 1 }}>
          {/* Day tabs */}
          <View style={styles.dayTabsWrapper}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayTabs}>
              {DAY_LABELS.map((label, i) => {
                const date = weekDates[i];
                const count = weekLessons.filter(l => l.date === date).length;
                const dayHours = weekLessons
                  .filter(l => l.date === date)
                  .reduce((sum, l) => sum + l.duration / 60, 0);
                const isToday = date === new Date().toISOString().slice(0, 10);
                return (
                  <Pressable key={i} style={[styles.dayTab, selectedDay === i && styles.dayTabActive]} onPress={() => setSelectedDay(i)}>
                    <Text style={[styles.dayTabLabel, selectedDay === i && styles.dayTabLabelActive, isToday && !( selectedDay === i) && styles.dayTabToday]}>{label}</Text>
                    {count > 0 ? (
                      <View style={[styles.dayBadge, selectedDay === i && styles.dayBadgeActive]}>
                        <Text style={styles.dayBadgeText}>{count} · {dayHours.toFixed(1)}h</Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {/* ── Select toolbar ── */}
          {selectMode && (
            <View style={styles.selectToolbar}>
              <Pressable style={styles.selectToolbarBtn} onPress={exitSelectMode}>
                <MaterialIcons name="close" size={18} color={Colors.textSecondary} />
                <Text style={styles.selectToolbarBtnText}>Cancel</Text>
              </Pressable>
              <Text style={styles.selectCount}>{selectedIds.size} selected</Text>
              <Pressable
                style={[styles.selectToolbarBtn, styles.selectToolbarBtnAll]}
                onPress={() => {
                  if (selectedIds.size === activeList.length) setSelectedIds(new Set());
                  else setSelectedIds(new Set(activeList.map(l => l.id)));
                }}
              >
                <MaterialIcons name="select-all" size={16} color={Colors.primary} />
                <Text style={[styles.selectToolbarBtnText, { color: Colors.primary }]}>
                  {selectedIds.size === activeList.length ? 'Deselect All' : 'Select All'}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.deleteSelectedBtn, selectedIds.size === 0 && { opacity: 0.4 }]}
                onPress={handleDeleteSelected}
                disabled={selectedIds.size === 0}
              >
                <MaterialIcons name="delete" size={16} color={Colors.textInverse} />
                <Text style={styles.deleteSelectedBtnText}>Delete{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}</Text>
              </Pressable>
            </View>
          )}

          {showMap && !selectMode && (
            <View style={styles.mapWrapper}>
              <DayRouteMap
                lessons={activeList}
                pupils={pupils}
                date={weekDates[selectedDay]}
                allPrefixes={allPrefixes}
                homeAddress={homeAddress}
                homeDriveSecsToday={homeDriveSecsToday}
              />
            </View>
          )}

          <DraggableFlatList
            data={activeList}
            keyExtractor={(item) => item.id}
            onDragEnd={handleDragEnd}
            renderItem={renderDraggableItem}
            activationDistance={8}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={Colors.primary}
                colors={[Colors.primary]}
                title="Pull to refresh drive times"
                titleColor={Colors.textSecondary}
              />
            }
            contentContainerStyle={{
              paddingHorizontal: Spacing.md,
              paddingBottom: insets.bottom + 100,
              paddingTop: Spacing.sm,
            }}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              <>
                {/* Compress My Day */}
                {activeList.length >= 2 && !selectMode && (
                  <Pressable
                    style={[styles.compressDayBtn, compressing && { opacity: 0.55 }, { marginBottom: Spacing.sm }]}
                    onPress={handleCompressDay}
                    disabled={compressing}
                  >
                    {compressing
                      ? <ActivityIndicator size="small" color={Colors.primary} />
                      : <MaterialIcons name="compress" size={14} color={Colors.primary} />}
                    <Text style={styles.compressDayBtnText}>
                      {compressing ? 'Analysing...' : 'Compress My Day'}
                    </Text>
                    <MaterialIcons name="chevron-right" size={14} color={Colors.primary + '80'} />
                  </Pressable>
                )}

                {/* List header */}
                <View style={[styles.listHeader, { marginBottom: 4 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.listDate}>{formatDate(weekDates[selectedDay])}</Text>
                    {activeList.length > 1 && !selectMode && (
                      <Text style={styles.listHint}>Drive times update automatically</Text>
                    )}
                    {activeList.length >= 2 && !selectMode && (
                      <View style={styles.dragHintRow}>
                        <MaterialIcons name="drag-indicator" size={12} color={Colors.textTertiary} />
                        <Text style={styles.dragHintText}>Hold grip icon to reorder</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.listHeaderActions}>
                    {!selectMode && (
                      <Pressable style={[styles.mapToggleBtn, showMap && styles.mapToggleBtnActive]} onPress={() => setShowMap(v => !v)}>
                        <MaterialIcons name="map" size={15} color={showMap ? Colors.textInverse : Colors.primary} />
                        <Text style={[styles.mapToggleText, showMap && styles.mapToggleTextActive]}>Map</Text>
                      </Pressable>
                    )}
                    {!selectMode && lessonBuffersEnabled && (lessonBufferBefore > 0 || lessonBufferAfter > 0) && (
                      <Pressable
                        style={[styles.mapToggleBtn, showBufferBands && styles.mapToggleBtnActive]}
                        onPress={() => setShowBufferBands(v => !v)}
                        hitSlop={6}
                      >
                        <MaterialIcons name="timer" size={14} color={showBufferBands ? Colors.textInverse : Colors.info} />
                        <Text style={[styles.mapToggleText, { color: showBufferBands ? Colors.textInverse : Colors.info }, showBufferBands && styles.mapToggleTextActive]}>Buffers</Text>
                      </Pressable>
                    )}
                    {!selectMode && (
                      <Pressable style={styles.addLessonBtn} onPress={() => router.push({ pathname: '/(instructor)/lesson-form', params: { date: weekDates[selectedDay] } })}>
                        <MaterialIcons name="add" size={18} color={Colors.primary} />
                        <Text style={styles.addLessonText}>Add</Text>
                      </Pressable>
                    )}
                    {dayUnacknowledgedCount > 0 && !selectMode && (
                      <Pressable style={styles.unackBtn}
                        onPress={() => { setSelectMode(true); setSelectedIds(new Set(dayLessons.filter(l => !l.pupilAcknowledged).map(l => l.id))); }}>
                        <MaterialIcons name="pending-actions" size={15} color={Colors.warning} />
                        <Text style={styles.unackBtnText}>{dayUnacknowledgedCount} unack</Text>
                      </Pressable>
                    )}
                  </View>
                </View>

                {/* Today's Route Summary */}
                {activeList.length >= 2 && !selectMode && (
                  <View style={[styles.routeSummaryCard, { marginBottom: Spacing.sm }]}>
                    <View style={styles.routeSummaryHeader}>
                      <View style={styles.routeSummaryCarIcon}>
                        <MaterialIcons name="directions-car" size={24} color={Colors.textPrimary} />
                      </View>
                      <Text style={styles.routeSummaryTitle}>Today's Route Summary</Text>
                      <View style={{ flex: 1 }} />
                      <Pressable style={styles.routeSummaryWrench} onPress={handleCompressDay} hitSlop={8}>
                        {compressing
                          ? <ActivityIndicator size="small" color="#fff" />
                          : <MaterialIcons name="build" size={16} color="#fff" />}
                      </Pressable>
                    </View>
                    {travelError && !loadingTravel && (
                      <View style={styles.routeErrorRow}>
                        <MaterialIcons name="warning" size={12} color={Colors.warning} />
                        <Text style={styles.routeErrorText}>{travelError}</Text>
                      </View>
                    )}
                    <View style={styles.routeStatsRow}>
                      <RouteStat icon="timer" value={dayRouteSummary?.hasData ? formatDuration(dayRouteSummary.totalSecs) : (loadingTravel ? '…' : '--')} label="Drive time" />
                      <View style={styles.routeStatsDivider} />
                      <RouteStat icon="route" value={dayRouteSummary?.hasData ? formatDistance(dayRouteSummary.totalMeters) : (loadingTravel ? '…' : '--')} label="Distance" />
                      <View style={styles.routeStatsDivider} />
                      <RouteStat icon="school" value={String(activeList.length)} label="Lessons" />
                      {lessonBuffersEnabled && (lessonBufferBefore + lessonBufferAfter) > 0 && activeList.length > 0 && (
                        <>
                          <View style={styles.routeStatsDivider} />
                          <RouteStat icon="hourglass-empty" value={formatMinsSaved((lessonBufferBefore + lessonBufferAfter) * activeList.length)} label="Buffer Time" />
                        </>
                      )}
                    </View>
                  </View>
                )}

                {/* Empty state */}
                {activeList.length === 0 && (
                  <View style={styles.empty}>
                    <MaterialIcons name="event-available" size={40} color={Colors.textTertiary} />
                    <Text style={styles.emptyText}>No lessons on this day</Text>
                    <Text style={styles.emptyHint}>Tap Smart Schedule to auto-fill from pupil availability{'\n'}and optimise by shortest driving distance</Text>
                    <Pressable style={[styles.scheduleBtn, styles.scheduleBtnGlow, { marginTop: 4 }]} onPress={handleSmartSchedule} disabled={generating}>
                      <MaterialIcons name="star" size={14} color={Colors.navy} style={{ opacity: 0.85 }} />
                      <MaterialIcons name="auto-fix-high" size={16} color={Colors.navy} />
                      <Text style={styles.scheduleBtnText}>Smart Schedule</Text>
                    </Pressable>
                  </View>
                )}
              </>
            }
          />

          {allPrefixes.length > 1 && !selectMode && (
            <View style={[styles.zoneLegend, { paddingBottom: insets.bottom + 80 }]}>
              {allPrefixes.slice(0, 5).map((prefix, i) => (
                <View key={prefix} style={styles.zoneItem}>
                  <View style={[styles.zoneDot, { backgroundColor: ZONE_COLORS[i % 5] }]} />
                  <Text style={styles.zoneLabel}>{prefix}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
    </GestureHandlerRootView>
  );
}

// Route stat item component
function RouteStat({ icon, value, label }: { icon: any; value: string; label: string }) {
  // Split "31 min" into num="31" unit="min", or pass through unsplit values
  const numMatch = value.match(/^([\d.]+)\s*(.*)$/);
  const numPart = numMatch ? numMatch[1] : value;
  const unitPart = numMatch ? numMatch[2] : '';
  return (
    <View style={rsStyles.wrap}>
      <MaterialIcons name={icon} size={26} color={Colors.textSecondary} />
      <View style={rsStyles.valueRow}>
        <Text style={rsStyles.value}>{numPart}</Text>
        {unitPart ? <Text style={rsStyles.unit}> {unitPart}</Text> : null}
      </View>
      <Text style={rsStyles.label}>{label}</Text>
    </View>
  );
}

const rsStyles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: 4 },
  valueRow: { flexDirection: 'row', alignItems: 'baseline' },
  value: { fontSize: 24, fontWeight: '800', color: Colors.textPrimary },
  unit: { fontSize: 14, fontWeight: '500', color: Colors.textSecondary },
  label: { fontSize: 13, color: Colors.textSecondary },
});

function FlagChip({ icon, label, color }: { icon: any; label: string; color: string }) {
  return (
    <View style={[flagStyles.chip, { backgroundColor: color + '20' }]}>
      <MaterialIcons name={icon} size={10} color={color} />
      <Text style={[flagStyles.text, { color }]}>{label}</Text>
    </View>
  );
}

const snapBannerStyles = StyleSheet.create({
  banner: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    paddingHorizontal: 16,
    paddingVertical: 9,
    zIndex: 999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 8,
  },
  text: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.navy,
  },
});

const bufferBandStyles = StyleSheet.create({
  beforeBand: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 4, marginBottom: -1, height: 22,
  },
  afterBand: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 4, marginTop: -1, height: 22,
  },
  bandLine: { flex: 1, height: 1, backgroundColor: '#E2E8F0' },
  bandContent: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: '#E2E8F0',
    marginHorizontal: 6,
  },
  bandText: {
    fontSize: 9, fontWeight: '600', color: '#94A3B8',
    letterSpacing: 0.2,
  },
});

const flagStyles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2 },
  text: { fontSize: 9, fontWeight: '600' },
});

const modalStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: Colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '80%', borderWidth: 1, borderColor: Colors.surfaceBorder },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingTop: 20, paddingBottom: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder },
  title: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary },
  subtitle: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  selectAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.warning + '18', borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: Colors.warning + '40' },
  selectAllText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.warning },
  list: { paddingHorizontal: Spacing.md, paddingTop: Spacing.sm },
  pupilRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder },
  pupilName: { fontSize: FontSize.base, fontWeight: '700', color: Colors.textPrimary },
  pupilSub: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2, marginBottom: 4 },
  lessonLine: { fontSize: FontSize.xs, color: Colors.textTertiary, marginTop: 2 },
  badge: { borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 4, alignSelf: 'flex-start', marginTop: 2 },
  badgeText: { fontSize: FontSize.xs, fontWeight: '700' },
  footer: { flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.surfaceBorder },
  cancelBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: Radius.lg, backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: Colors.surfaceBorder },
  cancelText: { fontSize: FontSize.base, fontWeight: '600', color: Colors.textSecondary },
  deleteBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: Radius.lg, backgroundColor: Colors.error },
  deleteBtnText: { fontSize: FontSize.base, fontWeight: '700', color: Colors.textInverse },
});

const styles = StyleSheet.create({
  // ── Collapsed header (calendar view) ────────────────────────────────────
  collapsedHeaderWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingBottom: 8,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    gap: 8,
  },
  collapsedPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  collapsedActionBtn: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: 'rgba(255,103,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E05500',
  },
  collapsedActionBtnGlow: {
    backgroundColor: '#FF6700',
    shadowColor: '#FF6700',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4,
  },
  collapsedTitleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'nowrap' },
  collapsedTitle: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  collapsedSep: { fontSize: 14, color: '#94A3B8' },
  collapsedDateRange: { fontSize: 13, color: '#64748B', fontWeight: '500', flex: 1 },
  collapsedStats: { fontSize: 12, color: '#64748B', marginTop: 2, fontWeight: '500' },
  // ── Full header ──────────────────────────────────────────────────────────
  headerWrap: { backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md },
  overflowBtnHeader: { width: 34, height: 34, borderRadius: 9, backgroundColor: '#FF6700', alignItems: 'center', justifyContent: 'center', shadowColor: '#FF6700', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 6, elevation: 4, marginLeft: 4 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: 5, backgroundColor: '#FFFFFF' },
  title: { fontSize: 22, fontWeight: '800', color: '#FF6700', letterSpacing: 0.3 },
  subtitle: { fontSize: FontSize.xs, color: '#64748B', marginTop: 1 },
  headerActions: { flexDirection: 'row', gap: 4, alignItems: 'center' },
  viewModeToggle: { flexDirection: 'row', backgroundColor: '#F1F5F9', borderRadius: Radius.sm, borderWidth: 1, borderColor: '#E2E8F0', overflow: 'hidden', marginRight: 4 },
  viewModeBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  viewModeBtnActive: { backgroundColor: '#FF6700' },
  weekNav: { width: 36, height: 36, borderRadius: Radius.sm, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  statsBar: { paddingHorizontal: Spacing.md, paddingTop: 4, paddingBottom: 5, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0', gap: 4 },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  actionBtnsRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  primaryBtnsRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statItem: { fontSize: FontSize.xs, color: '#64748B' },
  statValue: { fontWeight: '700', color: '#0F172A' },
  statDivider: { color: '#94A3B8' },
  fixAllBtn: { flexDirection:'row', alignItems:'center', gap:5, backgroundColor:'#FF3B30', borderRadius:Radius.md, paddingHorizontal:11, paddingVertical:8 },
  fixAllBtnText: { fontSize:FontSize.xs, fontWeight:'800', color:Colors.navy },
  hoursBtn: { flexDirection:'row', alignItems:'center', gap:5, backgroundColor:Colors.surfaceElevated, borderRadius:Radius.md, paddingHorizontal:10, paddingVertical:8, borderWidth:1, borderColor:Colors.surfaceBorder },
  hoursBtnText: { fontSize:FontSize.xs, fontWeight:'600', color:Colors.textSecondary },
  selectDeleteBtn: { flexDirection:'row', alignItems:'center', gap:5, backgroundColor:Colors.surfaceElevated, borderRadius:Radius.md, paddingHorizontal:10, paddingVertical:8, borderWidth:1, borderColor:Colors.surfaceBorder },
  selectDeleteBtnText: { fontSize:FontSize.xs, fontWeight:'600', color:Colors.textSecondary },
  overflowBtn: { width:36, height:36, borderRadius:Radius.md, alignItems:'center', justifyContent:'center', backgroundColor:'#F1F5F9', borderWidth:1, borderColor:'#E2E8F0' },
  scheduleBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#FF6700', borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 8, flex: 1, justifyContent: 'center', borderWidth: 1, borderColor: '#E05500' },
  scheduleBtnGlow: {
    shadowColor: '#FF6700',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
    borderWidth: 1.5,
    borderColor: '#E05500',
  },
  scheduleBtnDisabled: { opacity: 0.5 },
  scheduleBtnText: { fontSize: FontSize.xs, fontWeight: '800', color: '#FFFFFF' },
  confirmWeekBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: 'rgba(255,103,0,0.75)', flex: 1, justifyContent: 'center', borderWidth: 1, borderColor: '#E05500' },
  confirmWeekBtnDone: { backgroundColor: Colors.success },
  calendarLegend: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'nowrap', paddingHorizontal: Spacing.md, paddingVertical: 5, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  calendarLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  calendarLegendDot: { width: 8, height: 8, borderRadius: 4 },
  calendarLegendText: { fontSize: 9, color: '#64748B' },
  calendarFitToggle: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#FFF4EE', borderRadius: Radius.sm, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: '#FFD4B8' },
  calendarFitToggleText: { fontSize: 9, fontWeight: '700', color: '#FF6700' },

  routeSummaryCard: { width: '100%', backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 3, gap: 24 },
  routeSummaryHeader: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  routeSummaryCarIcon: { width: 46, height: 46, borderRadius: 999, backgroundColor: '#F5F5F5', alignItems: 'center', justifyContent: 'center' },
  routeSummaryTitle: { fontSize: 19, fontWeight: '600', color: '#222' },
  routeSummaryWrench: { width: 36, height: 36, borderRadius: 999, backgroundColor: '#6B46C1', alignItems: 'center', justifyContent: 'center' },
  routeErrorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  routeErrorText: { flex: 1, fontSize: FontSize.xs, color: Colors.warning },
  routeStatsRow: { flexDirection: 'row', alignItems: 'center' },
  routeStatsDivider: { width: 1, height: 52, backgroundColor: Colors.surfaceBorder },
travelBlock: { paddingVertical: 2, gap: 4 },
  travelCard: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: Colors.info + '12', borderRadius: Radius.md,
    paddingVertical: 12, paddingHorizontal: 14,
    borderWidth: 1, borderColor: Colors.info + '40',
    gap: 12,
  },
  travelCardLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  travelCardIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.info + '22', alignItems: 'center', justifyContent: 'center' },
  travelCardInfo: { flex: 1, gap: 3 },
  travelCardMainRow: { flexDirection: 'row', alignItems: 'baseline' },
  travelCardEst: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.warning, alignSelf: 'baseline' },
  travelCardDuration: { fontSize: FontSize.md, fontWeight: '800', color: Colors.info },
  travelCardSep: { fontSize: FontSize.sm, color: Colors.info + '70', marginHorizontal: 2 },
  travelCardDistance: { fontSize: FontSize.base, fontWeight: '700', color: Colors.info + 'CC' },
  travelCardRoute: { fontSize: FontSize.xs, color: Colors.textSecondary },
  travelBreakdownRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
  travelBreakdownText: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: '600' },
  travelSnapRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
  travelSnapText: { fontSize: FontSize.xs, color: Colors.textSecondary },
  travelCardLoading: { fontSize: FontSize.xs, color: Colors.info + '90' },
  travelCardNoData: { fontSize: FontSize.xs, color: Colors.textTertiary },
  travelCardRight: { alignItems: 'flex-end', gap: 6 },
  goBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.success, borderRadius: Radius.sm, paddingHorizontal: 14, paddingVertical: 8 },
  goBtnText: { fontSize: FontSize.xs, color: Colors.textInverse, fontWeight: '700' },
  sourceBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderRadius: Radius.full, borderWidth: 1,
    paddingHorizontal: 5, paddingVertical: 2, marginLeft: 6,
  },
  sourceBadgeText: { fontSize: 9, fontWeight: '700' },
  // Traffic-aware badge
  trafficBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderRadius: Radius.full, borderWidth: 1,
    paddingHorizontal: 5, paddingVertical: 2, marginLeft: 5,
  },
  trafficDot: { width: 7, height: 7, borderRadius: 3.5 },
  trafficBadgeText: { fontSize: 9, fontWeight: '700' },
  trafficRushRow: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2,
    backgroundColor: '#F59E0B18', borderRadius: Radius.sm,
    paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: '#F59E0B40',
  },
  trafficRushText: { fontSize: 9, fontWeight: '700', color: '#F59E0B' },
  gapWarnRow: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: Radius.sm, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1 },
  gapWarnText: { fontSize: FontSize.xs, fontWeight: '700', flex: 1, lineHeight: 17 },
  bufferChip: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.primary + '15', borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: Colors.primary + '30' },
  bufferChipCustom: { backgroundColor: Colors.warning + '18', borderColor: Colors.warning + '50' },
  bufferChipText: { fontSize: 9, color: Colors.primary, fontWeight: '600' },
  lessonBufferChip: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: Colors.surfaceElevated, borderRadius: Radius.full, paddingHorizontal: 5, paddingVertical: 2, borderWidth: 1, borderColor: Colors.surfaceBorder, marginLeft: 4 },
  lessonBufferChipCustom: { backgroundColor: Colors.warning + '18', borderColor: Colors.warning + '50' },
  lessonBufferChipText: { fontSize: 9, color: Colors.textTertiary, fontWeight: '600' },

  selectToolbar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: Spacing.md, paddingVertical: 10, backgroundColor: Colors.surfaceElevated, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder },
  selectToolbarBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.sm, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.surfaceBorder },
  selectToolbarBtnAll: { borderColor: Colors.primary + '50' },
  selectToolbarBtnText: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: '600' },
  selectCount: { flex: 1, textAlign: 'center', fontSize: FontSize.sm, fontWeight: '700', color: Colors.textPrimary },
  deleteSelectedBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.error, borderRadius: Radius.sm, paddingHorizontal: 12, paddingVertical: 7 },
  deleteSelectedBtnText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textInverse },

  dayTabsWrapper: { minHeight: 56 },
  dayTabs: { paddingHorizontal: Spacing.md, gap: 4, alignItems: 'center' },
  dayTab: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.full, backgroundColor: '#FAFBFC', borderWidth: 1, borderColor: '#E2E8F0', flexDirection: 'row', alignItems: 'center', gap: 6 },
  dayTabActive: { backgroundColor: '#FF6700', borderColor: '#E05500' },
  dayTabLabel: { fontSize: FontSize.sm, color: '#64748B', fontWeight: '500' },
  dayTabLabelActive: { color: '#FFFFFF', fontWeight: '700' },
  dayTabToday: { color: '#FF6700', fontWeight: '700' },
  dayBadge: { height: 18, borderRadius: 9, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  dayBadgeActive: { backgroundColor: '#E05500' },
  dayBadgeText: { fontSize: 9, fontWeight: '700', color: '#0F172A' },
  mapWrapper: { marginHorizontal: Spacing.md, marginBottom: Spacing.sm, height: 260, borderRadius: Radius.md, overflow: 'hidden' },
  compressDayBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FFF4EE', borderRadius: Radius.md,
    paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: '#FFD4B8',
  },
  compressDayBtnText: { flex: 1, fontSize: FontSize.sm, fontWeight: '700', color: '#FF6700' },
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  listDate: { fontSize: FontSize.sm, color: '#0F172A', fontWeight: '600' },
  listHint: { fontSize: 10, color: '#94A3B8', marginTop: 2 },
  dragHintRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  dragHintText: { fontSize: 10, color: Colors.textTertiary },
  listHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mapToggleBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.md, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#FF6700' },
  mapToggleBtnActive: { backgroundColor: '#FF6700' },
  mapToggleText: { fontSize: FontSize.xs, fontWeight: '700', color: '#FF6700' },
  mapToggleTextActive: { color: '#FFFFFF' },
  addLessonBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addLessonText: { fontSize: FontSize.sm, color: '#FF6700', fontWeight: '600' },
  unackBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.warning + '18', borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 5, borderWidth: 1, borderColor: Colors.warning + '40' },
  unackBtnText: { fontSize: FontSize.xs, color: Colors.warning, fontWeight: '700' },

  lessonCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.surfaceBorder, ...Shadow.sm,
  },
  lessonCardSelected: { borderColor: Colors.warning, backgroundColor: Colors.warning + '10' },
  lessonCardDragActive: {
    opacity: 0.9,
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '08',
    borderWidth: 2,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 10,
  },
  lessonCardConflict: {
    borderLeftColor: '#FF3B30',
    borderLeftWidth: 4,
    backgroundColor: '#FF3B3008',
  },
  checkboxWrap: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  checkbox: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: Colors.textTertiary, alignItems: 'center', justifyContent: 'center' },
  checkboxSelected: { backgroundColor: Colors.error, borderColor: Colors.error },
  dragHandle: { paddingHorizontal: 2, paddingVertical: 4, alignItems: 'center', justifyContent: 'center' },
  timeCol: { alignItems: 'center', minWidth: 44 },
  lessonStart: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.textPrimary },
  lessonEnd: { fontSize: 10, color: Colors.textSecondary },
  lessonDuration: { fontSize: 9, color: Colors.textTertiary },
  etaChip: {
    marginTop: 3, borderRadius: Radius.full,
    backgroundColor: Colors.success + '22', borderWidth: 1, borderColor: Colors.success + '55',
    paddingHorizontal: 4, paddingVertical: 2, alignItems: 'center',
  },
  etaChipText: { fontSize: 8, fontWeight: '800', color: Colors.success, letterSpacing: 0.2 },
  lessonDetails: { flex: 1, gap: 3 },
  lessonPupil: { fontSize: FontSize.base, fontWeight: '600', color: Colors.textPrimary },
  lessonMeta: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  lessonPostcode: { fontSize: FontSize.xs, fontWeight: '600' },
  districtChip: { borderRadius: Radius.sm, paddingHorizontal: 5, paddingVertical: 1, marginLeft: 2 },
  districtChipText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.3 },
  lessonFlags: { flexDirection: 'row', gap: 4, marginTop: 2, flexWrap: 'wrap' },
  empty: { alignItems: 'center', paddingTop: 48, gap: 8 },
  emptyText: { fontSize: FontSize.base, color: '#0F172A', fontWeight: '600' },
  emptyHint: { fontSize: FontSize.xs, color: '#64748B', textAlign: 'center', paddingHorizontal: 32 },
  zoneLegend: { flexDirection: 'row', gap: 12, paddingHorizontal: Spacing.md, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#E2E8F0', backgroundColor: '#FFFFFF' },
  zoneItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  zoneDot: { width: 8, height: 8, borderRadius: 4 },
  zoneLabel: { fontSize: 10, color: '#64748B' },
});
