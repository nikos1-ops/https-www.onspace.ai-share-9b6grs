import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, TextInput, Platform, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { usePupils } from '@/hooks/usePupils';
import { Spacing, FontSize, Radius } from '@/constants/theme';
import { Pupil } from '@/types';
import { getPupilCacheStatus } from '@/services/geocodingService';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { useAlert } from '@/template';
import { useAuth } from '@/hooks/useAuth';
import { getSupabaseClient } from '@/template';

// ─── Drive Smart Professional Light Mode Palette ─────────────────────────────
const BG        = '#FFFFFF';
const SURFACE   = '#FAFBFC';
const SURFACE2  = '#F1F5F9';
const BORDER    = '#E2E8F0';
const GOLD      = '#FF6700';
const GOLD_DIM  = '#E05500';
const RED       = '#FF6700';
const RED_DIM   = '#E05500';
const WHITE     = '#FFFFFF';
const GREY      = '#64748B';
const GREY_DIM  = '#CBD5E1';
const SUCCESS   = '#10B981';
const WARNING   = '#F59E0B';
const ERROR_CLR = '#EF4444';
const INFO      = '#00C4FF';

const STATUS_FILTERS = ['all', 'active', 'paused', 'test_booked', 'completed', 'locked'] as const;

// Avatar colours cycle — orange and blue alternating per Drive Smart brand
const AVATAR_PALETTE = ['#FF6700', '#00C4FF', '#FF6700', '#FF6700', '#00C4FF', '#FF6700', '#FF6700', '#00C4FF'];

function getAvatarColor(index: number): string {
  return AVATAR_PALETTE[index % AVATAR_PALETTE.length];
}

function isPinLocked(pupil: Pupil): boolean {
  if (!pupil.lockedUntil) return false;
  return new Date(pupil.lockedUntil) > new Date();
}

// ── CSV export helpers ────────────────────────────────────────────────────────

function escapeCsv(val: string | number | undefined | null): string {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function buildCsv(pupilList: Pupil[]): string {
  const headers = [
    'First Name', 'Last Name', 'Email', 'Phone',
    'Address', 'Postcode', 'Status', 'Lesson Rate (£)',
    'Balance (£)', 'Theory Status', 'Test Date',
    'Preferred Duration (min)', 'Lessons Per Week',
    'Licence Number', 'Date of Birth',
  ];

  const rows = pupilList.map(p => [
    escapeCsv(p.firstName),
    escapeCsv(p.lastName),
    escapeCsv(p.email),
    escapeCsv(p.phone),
    escapeCsv(p.address),
    escapeCsv(p.postcode),
    escapeCsv(p.status),
    escapeCsv(p.lessonRate),
    escapeCsv(p.balance),
    escapeCsv(p.theoryStatus),
    escapeCsv(p.testDate),
    escapeCsv(p.preferredDuration),
    escapeCsv(p.lessonsPerWeek),
    escapeCsv(p.licenceNumber),
    escapeCsv(p.dateOfBirth),
  ].join(','));

  return [headers.map(escapeCsv).join(','), ...rows].join('\n');
}

// ── CSV import parser ────────────────────────────────────────────────────────

function parseCsvRow(line: string): string[] {
  const fields: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else { inQuotes = false; }
      } else { cur += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { fields.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }
  }
  fields.push(cur.trim());
  return fields;
}

const IMPORT_COLUMNS = [
  'First Name', 'Last Name', 'Email', 'Phone',
  'Address', 'Postcode', 'Status', 'Lesson Rate (£)',
  'Balance (£)', 'Theory Status', 'Test Date',
  'Preferred Duration (min)', 'Lessons Per Week',
  'Licence Number', 'Date of Birth',
] as const;

function parseCsvImport(csv: string): Record<string, any>[] {
  const lines = csv.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length < 2) return [];

  const headerRow = parseCsvRow(lines[0]);
  const colIdx: Record<string, number> = {};
  headerRow.forEach((h, i) => { colIdx[h.trim()] = i; });

  // Require at minimum: first name and last name
  if (colIdx['First Name'] === undefined || colIdx['Last Name'] === undefined) return [];

  const results: Record<string, any>[] = [];
  for (let r = 1; r < lines.length; r++) {
    const fields = parseCsvRow(lines[r]);
    const firstName = fields[colIdx['First Name']] ?? '';
    const lastName = fields[colIdx['Last Name']] ?? '';
    if (!firstName && !lastName) continue;

    const lessonRateRaw = fields[colIdx['Lesson Rate (£)']] ?? '';
    const balanceRaw = fields[colIdx['Balance (£)']] ?? '';
    const durationRaw = fields[colIdx['Preferred Duration (min)']] ?? '';
    const lpwRaw = fields[colIdx['Lessons Per Week']] ?? '';

    results.push({
      first_name: firstName,
      last_name: lastName,
      email: fields[colIdx['Email']] ?? '',
      phone: fields[colIdx['Phone']] ?? '',
      address: fields[colIdx['Address']] ?? '',
      postcode: fields[colIdx['Postcode']] ?? '',
      status: ['active', 'paused', 'test_booked', 'completed'].includes(fields[colIdx['Status']])
        ? fields[colIdx['Status']] : 'active',
      lesson_rate: parseFloat(lessonRateRaw) || 35,
      balance: parseFloat(balanceRaw) || 0,
      theory_status: ['none', 'booked', 'passed'].includes(fields[colIdx['Theory Status']])
        ? fields[colIdx['Theory Status']] : 'none',
      test_date: fields[colIdx['Test Date']] ?? '',
      preferred_duration: parseInt(durationRaw, 10) || 60,
      lessons_per_week: parseInt(lpwRaw, 10) || 1,
      licence_number: fields[colIdx['Licence Number']] ?? '',
      date_of_birth: fields[colIdx['Date of Birth']] ?? '',
      theory_cert_number: '',
      stripe_customer_id: '',
      stripe_payment_method_id: '',
    });
  }
  return results;
}

export default function PupilsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { pupils } = usePupils();
  const { showAlert } = useAlert();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<typeof STATUS_FILTERS[number]>('all');
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const { instructorId } = useAuth();

  const [cacheRevision, setCacheRevision] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => setCacheRevision(r => r + 1), 300);
    return () => clearTimeout(timer);
  }, []);

  const lockedCount = useMemo(() => pupils.filter(isPinLocked).length, [pupils]);

  const filtered = useMemo(() => {
    return pupils.filter(p => {
      const name = `${p.firstName} ${p.lastName}`.toLowerCase();
      const matchSearch = !search || name.includes(search.toLowerCase()) || p.postcode.toLowerCase().includes(search.toLowerCase());
      const matchFilter =
        filter === 'all' ? true :
        filter === 'locked' ? isPinLocked(p) :
        p.status === filter;
      return matchSearch && matchFilter;
    }).sort((a, b) => a.lastName.localeCompare(b.lastName));
  }, [pupils, search, filter]);

  // ── CSV import handler ──────────────────────────────────────────────────────
  const handleImport = useCallback(async () => {
    if (!instructorId) {
      showAlert('Not signed in', 'Please sign in as an instructor to import pupils.');
      return;
    }

    let pickerResult: DocumentPicker.DocumentPickerResult;
    try {
      pickerResult = await DocumentPicker.getDocumentAsync({
        type: Platform.OS === 'ios' ? 'public.comma-separated-values-text' : 'text/csv',
        copyToCacheDirectory: true,
      });
    } catch {
      showAlert('Import Failed', 'Could not open file picker. Please try again.');
      return;
    }

    if (pickerResult.canceled || !pickerResult.assets?.length) return;

    const asset = pickerResult.assets[0];
    let csvText = '';
    try {
      csvText = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });
    } catch {
      showAlert('Import Failed', 'Could not read the selected file. Make sure it is a valid CSV.');
      return;
    }

    const parsed = parseCsvImport(csvText);
    if (parsed.length === 0) {
      showAlert('No Data Found', 'The CSV file contains no valid pupil rows. Make sure it matches the Drive Smart export format.');
      return;
    }

    showAlert(
      `Import ${parsed.length} Pupil${parsed.length !== 1 ? 's' : ''}?`,
      `Found ${parsed.length} pupil${parsed.length !== 1 ? 's' : ''} in the file:\n${parsed.slice(0, 5).map(p => `• ${p.first_name} ${p.last_name}`).join('\n')}${parsed.length > 5 ? `\n  …and ${parsed.length - 5} more` : ''}\n\nThey will be added as new pupils with Active status.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: `Import ${parsed.length}`,
          onPress: async () => {
            setImporting(true);
            try {
              const db = getSupabaseClient();
              const rows = parsed.map(p => ({
                ...p,
                instructor_id: instructorId,
                progress: {},
                availability: { recurringSlots: [], specificDates: [], blackoutDates: [] },
                status: p.status || 'active',
                balance: p.balance ?? 0,
                lesson_rate: p.lesson_rate ?? 35,
                preferred_duration: p.preferred_duration ?? 60,
                lessons_per_week: p.lessons_per_week ?? 1,
                pin: '0000',
                notes: '',
                theory_status: p.theory_status || 'none',
                test_date: p.test_date || '',
                availability_edit_allowed: true,
                avatar_url: '',
              }));
              const { error } = await db.from('pupils').insert(rows);
              setImporting(false);
              if (error) {
                showAlert('Import Failed', `Database error: ${error.message}`);
              } else {
                showAlert(
                  'Import Complete',
                  `Successfully imported ${rows.length} pupil${rows.length !== 1 ? 's' : ''}. They now appear in your pupils list with PIN 0000 — ask each pupil to set their own PIN via their profile.`,
                );
              }
            } catch (e: any) {
              setImporting(false);
              showAlert('Import Failed', e?.message ?? 'Unknown error during import.');
            }
          },
        },
      ],
    );
  }, [instructorId, showAlert]);

  // ── CSV export handler ──────────────────────────────────────────────────────
  const handleExport = useCallback(async () => {
    if (pupils.length === 0) {
      showAlert('No Pupils', 'Add at least one pupil before exporting.');
      return;
    }

    if (Platform.OS === 'web') {
      // Web: trigger a browser download
      const csv = buildCsv(pupils);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `drive-smart-pupils-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }

    setExporting(true);
    try {
      const csv = buildCsv(pupils);
      const fileName = `drive-smart-pupils-${new Date().toISOString().slice(0, 10)}.csv`;
      const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
      await FileSystem.writeAsStringAsync(fileUri, csv, { encoding: FileSystem.EncodingType.UTF8 });
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        showAlert('Export Saved', `CSV saved to: ${fileUri}`);
        return;
      }
      await Sharing.shareAsync(fileUri, {
        mimeType: 'text/csv',
        dialogTitle: 'Export Pupils CSV',
        UTI: 'public.comma-separated-values-text',
      });
    } catch (e: any) {
      showAlert('Export Failed', e?.message ?? 'Could not export pupils. Please try again.');
    } finally {
      setExporting(false);
    }
  }, [pupils, showAlert]);

  const activePupils = useMemo(() => pupils.filter(p => p.status === 'active'), [pupils]);
  const cachedCount = useMemo(
    () => activePupils.filter(p => getPupilCacheStatus(p.address ?? '', p.postcode) === 'cached').length,
    [activePupils, cacheRevision],
  );
  const allCached = cachedCount === activePupils.length && activePupils.length > 0;
  const noneCached = cachedCount === 0;

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      {/* ── Header ──────────────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Pupils</Text>
          {activePupils.length > 0 && (
            <View style={styles.cacheRow}>
              <MaterialIcons
                name={allCached ? 'location-on' : noneCached ? 'location-off' : 'location-searching'}
                size={11}
                color={allCached ? SUCCESS : noneCached ? WARNING : INFO}
              />
              <Text style={[styles.cacheSummary, { color: allCached ? SUCCESS : noneCached ? WARNING : INFO }]}>
                {allCached
                  ? 'All addresses cached'
                  : noneCached
                  ? 'No addresses cached — first Smart Schedule will be slow'
                  : `${cachedCount}/${activePupils.length} addresses cached`}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.headerBtns}>
          <Pressable
            style={[styles.iconBtn, importing && { opacity: 0.6 }]}
            onPress={handleImport}
            disabled={importing}
          >
            {importing
              ? <ActivityIndicator size="small" color={'#FF6700'} />
              : <MaterialIcons name="upload" size={18} color={'#FF6700'} />}
          </Pressable>
          <Pressable
            style={[styles.iconBtn, exporting && { opacity: 0.6 }]}
            onPress={handleExport}
            disabled={exporting}
          >
            {exporting
              ? <ActivityIndicator size="small" color={'#64748B'} />
              : <MaterialIcons name="download" size={18} color={'#64748B'} />}
          </Pressable>
          <Pressable style={styles.addBtn} onPress={() => router.push('/(instructor)/pupil-form')}>
            <MaterialIcons name="person-add" size={20} color={BG} />
            <Text style={styles.addBtnText}>Add</Text>
          </Pressable>
        </View>
      </View>

      {/* ── Search ──────────────────────────────────────────────────── */}
      <View style={styles.searchRow}>
        <MaterialIcons name="search" size={20} color={'#00C4FF'} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search name or postcode..."
          placeholderTextColor={GREY_DIM}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch('')} hitSlop={8}>
            <MaterialIcons name="close" size={18} color={'#94A3B8'} />
          </Pressable>
        )}
      </View>

      {/* ── Filter chips ────────────────────────────────────────────── */}
      <View style={styles.filterRow}>
        <FlatList
          horizontal
          data={STATUS_FILTERS as unknown as typeof STATUS_FILTERS[number][]}
          keyExtractor={i => i}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: Spacing.md, gap: 8 }}
          renderItem={({ item }) => {
            const isLockedChip = item === 'locked';
            const isActive = filter === item;
            return (
              <Pressable
                style={[
                  styles.chip,
                  isActive && (isLockedChip ? styles.chipActiveLocked : styles.chipActive),
                  !isActive && isLockedChip && styles.chipLocked,
                ]}
                onPress={() => setFilter(item as any)}
              >
                {isLockedChip && (
                  <MaterialIcons
                    name="lock"
                    size={11}
                    color={isActive ? WHITE : ERROR_CLR}
                  />
                )}
                <Text style={[
                  styles.chipText,
                  isActive && styles.chipTextActive,
                  !isActive && isLockedChip && { color: ERROR_CLR },
                ]}>
                  {item === 'all' ? 'All' : item === 'test_booked' ? 'Test Booked' : item.charAt(0).toUpperCase() + item.slice(1)}
                </Text>
                {isLockedChip && lockedCount > 0 && (
                  <View style={[
                    styles.chipBadge,
                    { backgroundColor: isActive ? 'rgba(255,255,255,0.25)' : ERROR_CLR + '28' },
                  ]}>
                    <Text style={[styles.chipBadgeText, { color: isActive ? WHITE : ERROR_CLR }]}>
                      {lockedCount}
                    </Text>
                  </View>
                )}
              </Pressable>
            );
          }}
        />
      </View>

      {/* ── Pupil list ──────────────────────────────────────────────── */}
      <FlatList
        data={filtered}
        keyExtractor={p => p.id}
        extraData={cacheRevision}
        contentContainerStyle={{
          paddingHorizontal: Spacing.md,
          paddingBottom: insets.bottom + 80,
          gap: Spacing.sm,
          paddingTop: 4,
        }}
        renderItem={({ item, index }) => (
          <PupilCard
            pupil={item}
            avatarColor={getAvatarColor(index)}
            onPress={() => router.push({ pathname: '/(instructor)/pupil-detail', params: { pupilId: item.id } })}
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <MaterialIcons name="person-search" size={52} color={GREY_DIM} />
            <Text style={styles.emptyText}>No pupils found</Text>
          </View>
        }
      />
    </View>
  );
}

// ─── Pupil card ───────────────────────────────────────────────────────────────

function PupilCard({
  pupil,
  avatarColor,
  onPress,
}: {
  pupil: Pupil;
  avatarColor: string;
  onPress: () => void;
}) {
  const progressKeys = Object.keys(pupil.progress);
  const avgProgress = progressKeys.length > 0
    ? progressKeys.reduce((s, k) => s + pupil.progress[k], 0) / progressKeys.length
    : 0;

  const statusDotColor: Record<string, string> = {
    active: SUCCESS,
    paused: WARNING,
    test_booked: INFO,
    completed: GREY_DIM,
  };

  const cacheStatus = getPupilCacheStatus(pupil.address ?? '', pupil.postcode);
  const isAvailLocked = pupil.availabilityEditAllowed === false;
  const isPinLockedNow = isPinLocked(pupil);

  const cacheBadge =
    cacheStatus === 'cached'
      ? { color: SUCCESS, icon: 'location-on' as const, label: 'Cached' }
      : cacheStatus === 'missing'
      ? { color: WARNING, icon: 'location-off' as const, label: 'Not cached' }
      : null;

  const balanceColor =
    pupil.balance < 0 ? ERROR_CLR :
    pupil.balance > 0 ? SUCCESS :
    GREY;

  return (
    <Pressable
      style={[styles.card, isAvailLocked && styles.cardAvailLocked]}
      onPress={onPress}
    >
      {/* Avatar */}
      <View style={styles.cardLeft}>
        <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
          <Text style={styles.avatarText}>
            {pupil.firstName[0]}{pupil.lastName[0]}
          </Text>
        </View>
        {/* Status dot */}
        <View style={[
          styles.statusDot,
          { backgroundColor: statusDotColor[pupil.status] ?? GREY_DIM },
        ]} />
        {/* Avail-lock badge */}
        {isAvailLocked && (
          <View style={styles.lockBadgeOverlay}>
            <MaterialIcons name="lock" size={8} color={WHITE} />
          </View>
        )}
      </View>

      {/* Info */}
      <View style={styles.cardInfo}>
        <View style={styles.nameRow}>
          <Text style={styles.cardName}>{pupil.firstName} {pupil.lastName}</Text>
          {isAvailLocked && (
            <View style={styles.lockChip}>
              <MaterialIcons name="lock" size={9} color={ERROR_CLR} />
              <Text style={styles.lockChipText}>Locked</Text>
            </View>
          )}
          {isPinLockedNow && (
            <View style={[styles.lockChip, styles.pinLockChip]}>
              <MaterialIcons name="no-accounts" size={9} color={WARNING} />
              <Text style={[styles.lockChipText, { color: WARNING }]}>PIN Locked</Text>
            </View>
          )}
        </View>
        <Text style={styles.cardSub}>{pupil.postcode} · {pupil.preferredDuration}min lessons</Text>
        {/* Progress bar in gold */}
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${(avgProgress / 5) * 100}%` }]} />
        </View>
      </View>

      {/* Right */}
      <View style={styles.cardRight}>
        {cacheBadge ? (
          <View style={[styles.cacheBadge, {
            backgroundColor: cacheBadge.color + '20',
            borderColor: cacheBadge.color + '50',
          }]}>
            <MaterialIcons name={cacheBadge.icon} size={10} color={cacheBadge.color} />
            <Text style={[styles.cacheBadgeText, { color: cacheBadge.color }]}>{cacheBadge.label}</Text>
          </View>
        ) : null}
        <Text style={[styles.balance, { color: balanceColor }]}>
          {pupil.balance < 0 ? `-£${Math.abs(pupil.balance)}` : pupil.balance > 0 ? `+£${pupil.balance}` : '£0'}
        </Text>
        <MaterialIcons name="chevron-right" size={20} color={'#CBD5E1'} />
      </View>
    </Pressable>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // ── Header ──
  headerBtns: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 2,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FF6700',
    letterSpacing: 0.3,
  },
  cacheRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  cacheSummary: {
    fontSize: 10,
    fontWeight: '600',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FF6700',
    borderRadius: Radius.md,
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginTop: 2,
    shadowColor: '#FF6700',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.30,
    shadowRadius: 8,
    elevation: 6,
  },
  addBtnText: {
    fontSize: FontSize.sm,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // ── Search ──
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F1F5F9',
    borderRadius: Radius.md,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.md,
    height: 46,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  searchInput: {
    flex: 1,
    color: '#0F172A',
    fontSize: FontSize.base,
  },

  // ── Filter chips ──
  filterRow: {
    marginBottom: Spacing.sm,
    height: 46,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: Radius.full,
    backgroundColor: '#FAFBFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  chipActive: {
    backgroundColor: '#FF6700',
    borderColor: '#FF6700',
    shadowColor: '#FF6700',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  chipActiveLocked: {
    backgroundColor: ERROR_CLR,
    borderColor: ERROR_CLR,
    shadowColor: ERROR_CLR,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  chipLocked: {
    borderColor: ERROR_CLR + '55',
  },
  chipBadge: {
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
    minWidth: 16,
    alignItems: 'center',
  },
  chipBadgeText: {
    fontSize: 9,
    fontWeight: '800',
  },
  chipText: {
    fontSize: FontSize.sm,
    color: '#64748B',
    fontWeight: '500',
  },
  chipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  // ── Pupil card ──
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: '#FAFBFC',
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardAvailLocked: {
    borderColor: ERROR_CLR + '50',
    borderLeftWidth: 3,
    borderLeftColor: ERROR_CLR,
  },
  cardLeft: {
    position: 'relative',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: FontSize.base,
    fontWeight: '800',
    color: WHITE,
    letterSpacing: 0.5,
  },
  lockBadgeOverlay: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: ERROR_CLR,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FAFBFC',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    position: 'absolute',
    bottom: 0,
    right: 0,
    borderWidth: 2,
    borderColor: '#FAFBFC',
  },

  // ── Card info ──
  cardInfo: {
    flex: 1,
    gap: 4,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  cardName: {
    fontSize: FontSize.base,
    fontWeight: '700',
    color: '#0F172A',
  },
  lockChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: ERROR_CLR + '15',
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: ERROR_CLR + '40',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  lockChipText: {
    fontSize: 9,
    fontWeight: '700',
    color: ERROR_CLR,
  },
  pinLockChip: {
    backgroundColor: WARNING + '15',
    borderColor: WARNING + '40',
  },
  cardSub: {
    fontSize: FontSize.xs,
    color: '#64748B',
  },
  progressBar: {
    height: 3,
    backgroundColor: '#E2E8F0',
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 4,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#FF6700',
    borderRadius: 2,
  },

  // ── Card right ──
  cardRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  cacheBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: Radius.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
  },
  cacheBadgeText: {
    fontSize: 9,
    fontWeight: '700',
  },
  balance: {
    fontSize: FontSize.sm,
    fontWeight: '800',
  },

  empty: {
    alignItems: 'center',
    paddingTop: 64,
    gap: 12,
  },
  emptyText: {
    fontSize: FontSize.base,
    color: '#94A3B8',
  },
});
