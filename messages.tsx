import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Pressable, SectionList,
  Modal, TextInput, ScrollView, KeyboardAvoidingView, Platform,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { usePupils } from '@/hooks/usePupils';
import { useAlert } from '@/template';
import { Colors, Spacing, FontSize, Radius, Shadow } from '@/constants/theme';
import { Message, GapLessonData } from '@/types';
import { LinearGradient } from 'expo-linear-gradient';

const NAVY = '#0F172A';
const GOLD = '#FF6700';
const RED = '#EF4444';
const GREEN = '#10B981';
const PURPLE = '#00C4FF';

// ── Helpers ───────────────────────────────────────────────────────────────────

function getTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatDateDisplay(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Message Templates ─────────────────────────────────────────────────────────

const MESSAGE_TEMPLATES = [
  { icon: 'notifications' as const, label: 'Theory reminder', body: "Don't forget your theory test is coming up! Make sure you have been revising with the Highway Code and mock tests. Let me know if you need any advice." },
  { icon: 'directions-car' as const, label: 'Test day prep', body: 'Your test is coming up! Make sure you have a good night of sleep, eat well beforehand, and aim to arrive at the test centre 10 minutes early. You have got this!' },
  { icon: 'payment' as const, label: 'Payment reminder', body: 'This is a friendly reminder that payment is outstanding for your recent lessons. Please transfer the amount and confirm in the app. Thank you!' },
  { icon: 'event-busy' as const, label: 'Cancellation policy', body: 'Please remember that cancellations within 48 hours of a lesson may be subject to a charge. If you need to rearrange, please let me know as soon as possible.' },
  { icon: 'star' as const, label: 'Well done!', body: 'Just wanted to say — great progress in your last lesson! Keep practising what we worked on and you will be test-ready very soon.' },
  { icon: 'info' as const, label: 'Lesson update', body: 'I wanted to let you know that your upcoming lesson details may have changed. Please check your My Lessons tab in the app for the latest schedule.' },
];

// ── Context menu (long-press delete) ─────────────────────────────────────────

interface ContextMenuProps {
  visible: boolean;
  position: { x: number; y: number };
  onDelete: () => void;
  onClose: () => void;
}

function MessageContextMenu({ visible, position, onDelete, onClose }: ContextMenuProps) {
  if (!visible) return null;
  return (
    <Pressable style={ctxStyles.overlay} onPress={onClose}>
      <View style={[ctxStyles.menu, { top: Math.min(position.y, 520), left: Math.max(16, Math.min(position.x - 80, 260)) }]}>
        <Pressable style={ctxStyles.item} onPress={() => { onClose(); onDelete(); }}>
          <MaterialIcons name="delete-outline" size={18} color={RED} />
          <Text style={ctxStyles.itemText}>Delete message</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

const ctxStyles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 },
  menu: {
    position: 'absolute', backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder, minWidth: 180,
    ...Shadow.md, elevation: 12,
  },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 14 },
  itemText: { fontSize: FontSize.base, fontWeight: '600', color: RED },
});

// ── Main screen ───────────────────────────────────────────────────────────────

type ComposeMode = 'none' | 'broadcast' | 'gap_lesson';

export default function InstructorMessagesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { showAlert } = useAlert();
  const { messages, pupils, sendBroadcast, sendGapLesson, deleteMessage, reload } = usePupils();

  const [localRead, setLocalRead] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await new Promise<void>(resolve => { reloadRef.current(); setTimeout(resolve, 800); });
    setRefreshing(false);
  };
  // Poll for new messages every 30 s so instructor sees pupil replies without restart
  const reloadRef = useRef(reload);
  useEffect(() => { reloadRef.current = reload; }, [reload]);
  useEffect(() => {
    const id = setInterval(() => reloadRef.current(), 30_000);
    return () => clearInterval(id);
  }, []);

  const [composeMode, setComposeMode] = useState<ComposeMode>('none');
  const [showTemplates, setShowTemplates] = useState(false);

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState<{ msgId: string; x: number; y: number } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ── Compose state ─────────────────────────────────────────────────────────
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [toAll, setToAll] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  // Gap lesson fields
  const [gapDate, setGapDate] = useState('');
  const [gapTime, setGapTime] = useState('');
  const [gapDuration, setGapDuration] = useState('60');
  const [gapSnapTime, setGapSnapTime] = useState('');

  // ── Sort messages — most recent activity (reply or original) first ─────────
  const allSorted = useMemo(
    () => [...messages].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [messages]
  );

  const topLevel = useMemo(() => {
    const top = allSorted.filter(m => !m.parentId);
    // Re-sort by most recent activity (replies bubble conversation to top)
    return [...top].sort((a, b) => {
      const aReplies = allSorted.filter(m => m.parentId === a.id).map(m => m.createdAt);
      const bReplies = allSorted.filter(m => m.parentId === b.id).map(m => m.createdAt);
      const aLatest = aReplies.concat(a.createdAt).sort().at(-1) ?? a.createdAt;
      const bLatest = bReplies.concat(b.createdAt).sort().at(-1) ?? b.createdAt;
      return bLatest.localeCompare(aLatest);
    });
  }, [allSorted]);

  const fromPupils = useMemo(() => topLevel.filter(m => !m.fromInstructor), [topLevel]);
  const fromInstructor = useMemo(() => topLevel.filter(m => m.fromInstructor), [topLevel]);
  const unreadFromPupils = fromPupils.filter(m => !localRead.has(m.id)).length;

  // ── Helpers ───────────────────────────────────────────────────────────────
  function getSenderName(msg: Message): string {
    const subjectMatch = msg.subject.match(/^(?:Message|Reply) from (.+)$/i);
    if (subjectMatch) return subjectMatch[1];
    return 'Pupil';
  }

  function getPupilIdFromMessage(msg: Message): string | null {
    const name = getSenderName(msg);
    const parts = name.trim().toLowerCase().split(' ');
    const match = pupils.find(p =>
      p.firstName.toLowerCase() === parts[0] &&
      p.lastName.toLowerCase() === parts.slice(1).join(' ')
    );
    return match?.id ?? null;
  }

  function getRecipientLabel(msg: Message): string {
    if (msg.recipientIds.includes('ALL')) return 'All Pupils';
    return msg.recipientIds.map(id => {
      const p = pupils.find(pu => pu.id === id);
      return p ? `${p.firstName} ${p.lastName}` : id;
    }).join(', ');
  }

  function getReplyCount(msgId: string): number {
    return allSorted.filter(m => m.parentId === msgId).length;
  }

  const getReplies = useCallback((msgId: string): Message[] =>
    allSorted.filter(m => m.parentId === msgId),
  [allSorted]);

  const togglePupil = (id: string) =>
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);

  const resetCompose = () => {
    setSubject(''); setBody(''); setToAll(true); setSelectedIds([]);
    setGapDate(''); setGapTime(''); setGapDuration('60'); setGapSnapTime('');
    setSending(false); setShowTemplates(false);
  };

  const openCompose = (mode: ComposeMode) => {
    resetCompose();
    setComposeMode(mode);
    if (mode === 'gap_lesson') setSubject('Gap Lesson Available – First Come, First Served');
  };

  const closeCompose = () => { setComposeMode('none'); resetCompose(); };

  const handleSend = async () => {
    if (!body.trim()) { showAlert('Missing message', 'Please write a message body.'); return; }
    if (!toAll && selectedIds.length === 0) { showAlert('No recipients', 'Select at least one pupil or choose All.'); return; }

    // For gap lessons, only broadcast to ACTIVE pupils to ensure data isolation
    const activePupilIds = pupils.filter(p => p.status === 'active').map(p => p.id);
    const recipientIds = toAll
      ? ['ALL']
      : selectedIds;

    if (composeMode === 'gap_lesson') {
      if (!gapDate.trim() || !gapTime.trim()) {
        showAlert('Missing details', 'Please enter the date and start time for the gap lesson.');
        return;
      }
      const dur = parseInt(gapDuration, 10);
      if (isNaN(dur) || dur < 30 || dur > 240) {
        showAlert('Invalid duration', 'Duration must be between 30 and 240 minutes.');
        return;
      }
      const gapData: GapLessonData = {
        date: gapDate.trim(),
        startTime: gapTime.trim(),
        duration: dur,
        snapTime: gapSnapTime.trim() || undefined,
        notes: body.trim(),
      };
      setSending(true);
      try {
        await sendGapLesson(
          subject.trim() || 'Gap Lesson Available',
          body.trim(),
          recipientIds,
          gapData,
        );
        closeCompose();
        const count = toAll ? activePupilIds.length : selectedIds.length;
        showAlert('Gap Lesson Broadcast', `Offer sent to ${count} active pupil${count !== 1 ? 's' : ''}. You will be notified the instant someone claims it.`);
      } catch (e: any) {
        showAlert('Error', e?.message ?? 'Failed to send.');
      }
      setSending(false);
      return;
    }

    if (composeMode === 'broadcast') {
      if (!subject.trim()) { showAlert('Missing subject', 'Please add a subject.'); return; }
      setSending(true);
      try {
        await sendBroadcast(subject.trim(), body.trim(), recipientIds);
        closeCompose();
        showAlert('Broadcast sent', `Message delivered to ${recipientIds.includes('ALL') ? 'all pupils' : `${selectedIds.length} pupil(s)`}.`);
      } catch (e: any) {
        showAlert('Error', e?.message ?? 'Failed to send.');
      }
      setSending(false);
    }
  };

  const handleOpenFromPupil = (msg: Message) => {
    setLocalRead(prev => new Set([...prev, msg.id]));
    router.push({ pathname: '/(instructor)/message-detail', params: { msgId: msg.id } });
  };

  const handleQuickReply = (msg: Message) => {
    const pupilId = getPupilIdFromMessage(msg);
    router.push({
      pathname: '/(instructor)/compose-message',
      params: {
        replyToPupilId: pupilId ?? '',
        replySubject: msg.subject.startsWith('Re:') ? msg.subject : `Re: ${msg.subject}`,
      },
    });
  };

  const handleLongPress = (msg: Message, event: any) => {
    const { pageY, pageX } = event.nativeEvent;
    setCtxMenu({ msgId: msg.id, x: pageX, y: pageY });
  };

  const handleDeleteConfirm = (msgId: string) => {
    showAlert(
      'Delete message?',
      'This cannot be undone. The message will be removed for both you and the pupil.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeletingId(msgId);
            try { await deleteMessage(msgId); }
            catch (e: any) { showAlert('Error', e?.message ?? 'Failed to delete message.'); }
            setDeletingId(null);
          },
        },
      ]
    );
  };

  const sections = [
    ...(fromPupils.length > 0 ? [{ key: 'pupils', data: fromPupils }] : []),
    ...(fromInstructor.length > 0 ? [{ key: 'sent', data: fromInstructor }] : []),
  ];

  const allEmpty = topLevel.length === 0;

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.title}>Messages</Text>
            {unreadFromPupils > 0 && (
              <View style={styles.unreadPill}>
                <View style={styles.unreadPillDot} />
                <Text style={styles.unreadSubtitle}>{unreadFromPupils} unread</Text>
              </View>
            )}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Pressable
              style={styles.historyBtn}
              onPress={() => router.push('/(instructor)/broadcast-history')}
            >
              <MaterialIcons name="history" size={14} color={Colors.textSecondary} />
              <Text style={styles.historyBtnText}>History</Text>
            </Pressable>
            <Pressable
              style={styles.directBtn}
              onPress={() => router.push('/(instructor)/compose-message')}
            >
              <MaterialIcons name="edit" size={15} color={NAVY} />
              <Text style={styles.directBtnText}>Direct</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.actionRow}>
          <Pressable
            style={[styles.actionBtn, { flex: 1, shadowColor: '#FF6700', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.30, shadowRadius: 8, elevation: 6 }]}
            onPress={() => openCompose('broadcast')}
          >
            <LinearGradient colors={['#FF6700', '#E05500']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.actionBtnGrad}>
              <MaterialIcons name="campaign" size={16} color="#FFFFFF" />
              <Text style={[styles.actionBtnText, { color: '#FFFFFF' }]}>Broadcast</Text>
            </LinearGradient>
          </Pressable>
          <Pressable
            style={[styles.actionBtn, { flex: 1, shadowColor: '#28A745', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.80, shadowRadius: 14, elevation: 10 }]}
            onPress={() => openCompose('gap_lesson')}
          >
            <LinearGradient colors={[GREEN, '#1a7a33']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.actionBtnGrad}>
              <MaterialIcons name="event-available" size={16} color="#fff" />
              <Text style={[styles.actionBtnText, { color: '#fff' }]}>Gap Lesson</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </View>

      {/* ── List ───────────────────────────────────────────────────────────── */}
      {allEmpty ? (
        <View style={styles.empty}>
          <MaterialIcons name="inbox" size={52} color="#00C4FF" />
          <Text style={styles.emptyText}>No messages yet</Text>
          <Text style={styles.emptyHint}>Use Broadcast or Gap Lesson to message your pupils, or tap Direct to message one pupil.</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={m => m.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={GOLD}
              colors={[GOLD]}
            />
          }
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{
            paddingHorizontal: Spacing.md,
            paddingBottom: insets.bottom + 90,
            paddingTop: 8,
            gap: 4,
          }}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              {section.key === 'pupils' ? (
                <View style={styles.sectionLabelRow}>
                  <View style={[styles.sectionDot, { backgroundColor: RED }]} />
                  <Text style={[styles.sectionTitle, { color: RED }]}>From Pupils</Text>
                  {unreadFromPupils > 0 && (
                    <View style={[styles.badgePill, { backgroundColor: RED }]}>
                      <Text style={styles.badgePillText}>{unreadFromPupils}</Text>
                    </View>
                  )}
                </View>
              ) : (
                <View style={styles.sectionLabelRow}>
                  <View style={[styles.sectionDot, { backgroundColor: GOLD }]} />
                  <Text style={[styles.sectionTitle, { color: GOLD }]}>Sent</Text>
                </View>
              )}
            </View>
          )}
          renderItem={({ item, section }) =>
            section.key === 'pupils'
              ? <FromPupilCard
                  msg={item}
                  senderName={getSenderName(item)}
                  isUnread={!localRead.has(item.id)}
                  timeAgo={getTimeAgo(item.createdAt)}
                  replyCount={getReplyCount(item.id)}
                  isDeleting={deletingId === item.id}
                  onOpen={() => handleOpenFromPupil(item)}
                  onReply={() => handleQuickReply(item)}
                  onLongPress={(e) => handleLongPress(item, e)}
                  onDelete={() => handleDeleteConfirm(item.id)}
                />
              : <SentCard
                  msg={item}
                  recipientLabel={getRecipientLabel(item)}
                  timeAgo={getTimeAgo(item.createdAt)}
                  replyCount={getReplyCount(item.id)}
                  replies={getReplies(item.id)}
                  isDeleting={deletingId === item.id}
                  onOpen={() => router.push({ pathname: '/(instructor)/message-detail', params: { msgId: item.id } })}
                  onLongPress={(e) => handleLongPress(item, e)}
                  onDelete={() => handleDeleteConfirm(item.id)}
                />
          }
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          SectionSeparatorComponent={() => <View style={{ height: 16 }} />}
        />
      )}

      {/* ── Context Menu (long-press) ─────────────────────────────────────── */}
      <MessageContextMenu
        visible={ctxMenu !== null}
        position={{ x: ctxMenu?.x ?? 0, y: ctxMenu?.y ?? 0 }}
        onDelete={() => { if (ctxMenu) handleDeleteConfirm(ctxMenu.msgId); }}
        onClose={() => setCtxMenu(null)}
      />

      {/* ── Compose Modal ─────────────────────────────────────────────────── */}
      <Modal
        visible={composeMode !== 'none'}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeCompose}
      >
        <KeyboardAvoidingView
          style={{ flex: 1, backgroundColor: Colors.background }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={[modal.header, { paddingTop: 20 }]}>
            <Pressable onPress={closeCompose} hitSlop={8}>
              <MaterialIcons name="close" size={22} color={Colors.textPrimary} />
            </Pressable>
            <View style={modal.titleRow}>
              <MaterialIcons
                name={composeMode === 'gap_lesson' ? 'event-available' : 'campaign'}
                size={18}
                color={composeMode === 'gap_lesson' ? GREEN : GOLD}
              />
              <Text style={modal.title}>
                {composeMode === 'gap_lesson' ? 'Create Gap Lesson' : 'Broadcast Message'}
              </Text>
            </View>
            <Pressable
              style={[modal.sendBtn, sending && { opacity: 0.6 }]}
              onPress={handleSend}
              disabled={sending}
            >
              {sending
                ? <ActivityIndicator size="small" color="#fff" />
                : <MaterialIcons name="send" size={16} color="#fff" />}
              <Text style={modal.sendBtnText}>{sending ? 'Sending…' : 'Send'}</Text>
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={modal.body}
            keyboardShouldPersistTaps="handled"
          >
            {/* Gap lesson details */}
            {composeMode === 'gap_lesson' && (
              <View style={modal.gapCard}>
                <View style={modal.gapCardHeader}>
                  <MaterialIcons name="flash-on" size={16} color={GREEN} />
                  <Text style={modal.gapCardTitle}>Gap Lesson Details — First Come, First Served</Text>
                </View>
                <View style={modal.gapRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={modal.fieldLabel}>Date (YYYY-MM-DD)</Text>
                    <TextInput style={modal.input} value={gapDate} onChangeText={setGapDate}
                      placeholder="2025-05-10" placeholderTextColor={Colors.textTertiary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={modal.fieldLabel}>Start Time (HH:MM)</Text>
                    <TextInput style={modal.input} value={gapTime} onChangeText={setGapTime}
                      placeholder="10:00" placeholderTextColor={Colors.textTertiary} />
                  </View>
                </View>
                <View style={modal.gapRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={modal.fieldLabel}>Duration (minutes)</Text>
                    <TextInput style={modal.input} value={gapDuration} onChangeText={setGapDuration}
                      placeholder="60" keyboardType="number-pad" placeholderTextColor={Colors.textTertiary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={modal.fieldLabel}>Snap Time (optional)</Text>
                    <TextInput style={modal.input} value={gapSnapTime} onChangeText={setGapSnapTime}
                      placeholder="10:15" placeholderTextColor={Colors.textTertiary} />
                  </View>
                </View>
                <View style={modal.gapInfo}>
                  <MaterialIcons name="bolt" size={13} color={GREEN} />
                  <Text style={modal.gapInfoText}>
                    The first pupil to tap "Claim This Lesson" wins the slot — the button auto-greys for everyone else instantly.
                  </Text>
                </View>
              </View>
            )}

            {/* Recipients */}
            <Text style={modal.fieldLabel}>Recipients</Text>
            <View style={modal.recipientToggle}>
              <Pressable
                style={[modal.togBtn, toAll && modal.togBtnActive]}
                onPress={() => { setToAll(true); setSelectedIds([]); }}
              >
                <MaterialIcons name="group" size={16} color={toAll ? '#fff' : Colors.textSecondary} />
                <Text style={[modal.togText, toAll && modal.togTextActive]}>
                  {composeMode === 'gap_lesson' ? 'All Active Pupils' : 'All Pupils'}
                </Text>
              </Pressable>
              <Pressable
                style={[modal.togBtn, !toAll && modal.togBtnActive]}
                onPress={() => setToAll(false)}
              >
                <MaterialIcons name="checklist" size={16} color={!toAll ? '#fff' : Colors.textSecondary} />
                <Text style={[modal.togText, !toAll && modal.togTextActive]}>Select</Text>
              </Pressable>
            </View>

            {!toAll && (
              <View style={modal.pupilList}>
                {pupils.map(p => {
                  const selected = selectedIds.includes(p.id);
                  return (
                    <Pressable
                      key={p.id}
                      style={[modal.pupilItem, selected && modal.pupilItemSelected]}
                      onPress={() => togglePupil(p.id)}
                    >
                      <View style={[modal.pupilAvatar, selected && { backgroundColor: NAVY + '30' }]}>
                        <Text style={[modal.pupilAvatarText, selected && { color: NAVY }]}>
                          {p.firstName[0]}{p.lastName[0]}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[modal.pupilName, selected && { color: NAVY, fontWeight: '700' }]}>
                          {p.firstName} {p.lastName}
                        </Text>
                        {p.status !== 'active' && (
                          <Text style={modal.pupilStatusWarning}>{p.status}</Text>
                        )}
                      </View>
                      <MaterialIcons
                        name={selected ? 'check-circle' : 'radio-button-unchecked'}
                        size={20}
                        color={selected ? NAVY : Colors.textTertiary}
                      />
                    </Pressable>
                  );
                })}
              </View>
            )}

            {/* Subject */}
            <Text style={modal.fieldLabel}>Subject</Text>
            <TextInput
              style={modal.input}
              value={subject}
              onChangeText={setSubject}
              placeholder={composeMode === 'gap_lesson' ? 'Gap Lesson Available — First Come, First Served' : 'e.g. Important Update'}
              placeholderTextColor={Colors.textTertiary}
            />

            {/* Message body with optional templates */}
            <View style={modal.messageLabelRow}>
              <Text style={modal.fieldLabel}>
                {composeMode === 'gap_lesson' ? 'Message / Additional Notes' : 'Message'}
              </Text>
              {composeMode === 'broadcast' && (
                <Pressable style={modal.templatesToggle} onPress={() => setShowTemplates(v => !v)}>
                  <MaterialIcons name="auto-fix-high" size={14} color={GOLD} />
                  <Text style={modal.templatesToggleText}>
                    {showTemplates ? 'Hide templates' : 'Use template'}
                  </Text>
                </Pressable>
              )}
            </View>

            {showTemplates && composeMode === 'broadcast' && (
              <View style={modal.templatesGrid}>
                {MESSAGE_TEMPLATES.map(t => (
                  <Pressable
                    key={t.label}
                    style={modal.templateChip}
                    onPress={() => { setBody(t.body); setShowTemplates(false); }}
                  >
                    <MaterialIcons name={t.icon} size={14} color={GOLD} />
                    <Text style={modal.templateChipText}>{t.label}</Text>
                  </Pressable>
                ))}
              </View>
            )}

            <TextInput
              style={modal.textArea}
              value={body}
              onChangeText={setBody}
              placeholder={
                composeMode === 'gap_lesson'
                  ? 'e.g. I have a gap in my diary — tap Claim to take this slot!'
                  : 'Type your broadcast message here…'
              }
              placeholderTextColor={Colors.textTertiary}
              multiline
              textAlignVertical="top"
            />

            {/* Summary / info box */}
            <View style={modal.summary}>
              <MaterialIcons
                name={composeMode === 'gap_lesson' ? 'flash-on' : 'info-outline'}
                size={14}
                color={composeMode === 'gap_lesson' ? GREEN : GOLD}
              />
              <Text style={modal.summaryText}>
                {composeMode === 'gap_lesson'
                  ? 'The first pupil to tap "Claim" is automatically added to your diary and you receive an instant push notification. All other pupils see "Already Taken" immediately.'
                  : `Message will be delivered to ${toAll ? 'all your pupils' : `${selectedIds.length} selected pupil(s)`}. Each pupil receives a push notification.`}
              </Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ── From-Pupil card ───────────────────────────────────────────────────────────

function FromPupilCard({
  msg, senderName, isUnread, timeAgo, replyCount, isDeleting, onOpen, onReply, onLongPress, onDelete,
}: {
  msg: Message; senderName: string; isUnread: boolean; timeAgo: string;
  replyCount: number; isDeleting: boolean;
  onOpen: () => void; onReply: () => void;
  onLongPress: (e: any) => void; onDelete: () => void;
}) {
  const [tapTrash, setTapTrash] = useState(false);
  const initials = senderName.split(' ').map(w => w[0] ?? '').join('').slice(0, 2).toUpperCase();

  return (
    <Pressable
      style={[styles.card, isUnread && styles.cardUnread, isDeleting && { opacity: 0.5 }]}
      onPress={() => { if (tapTrash) { setTapTrash(false); return; } onOpen(); }}
      onLongPress={onLongPress}
      delayLongPress={400}
    >
      {isUnread && <View style={styles.unreadBar} />}
      <View style={styles.cardInner}>
        <View style={styles.avatarWrap}>
          <View style={[styles.avatar, {
            backgroundColor: isUnread ? RED + '20' : PURPLE + '20',
            borderColor: isUnread ? RED + '50' : PURPLE + '40',
          }]}>
            {isDeleting
              ? <ActivityIndicator size="small" color={isUnread ? RED : PURPLE} />
              : <Text style={[styles.avatarInitials, { color: isUnread ? RED : PURPLE }]}>{initials}</Text>
            }
          </View>
          {isUnread && <View style={[styles.unreadDot, { backgroundColor: RED }]} />}
        </View>
        <View style={styles.cardContent}>
          <View style={styles.cardTopRow}>
            <View style={[styles.fromBadge, {
              backgroundColor: isUnread ? RED + '15' : PURPLE + '15',
              borderColor: isUnread ? RED + '40' : PURPLE + '30',
            }]}>
              <MaterialIcons name="person" size={10} color={isUnread ? RED : PURPLE} />
              <Text style={[styles.fromBadgeText, { color: isUnread ? RED : PURPLE }]}>
                {isUnread ? 'UNREAD' : 'PUPIL'}
              </Text>
            </View>
            <View style={styles.cardTopRight}>
              <Text style={styles.cardTime}>{timeAgo}</Text>
              <Pressable
                hitSlop={10}
                onPress={(e) => { e.stopPropagation(); setTapTrash(true); onDelete(); }}
                style={styles.trashBtn}
              >
                <MaterialIcons name="delete-outline" size={16} color={Colors.textTertiary} />
              </Pressable>
            </View>
          </View>
          <Text style={[styles.cardSender, isUnread && { color: RED }]}>{senderName}</Text>
          {msg.subject ? (
            <Text style={[styles.cardSubject, isUnread && styles.cardSubjectUnread]} numberOfLines={1}>
              {msg.subject}
            </Text>
          ) : null}
          <Text style={styles.cardPreview} numberOfLines={2}>{msg.body}</Text>
          <View style={styles.cardFooter}>
            <Pressable style={[styles.replyBtn, isUnread && { borderColor: RED + '40', backgroundColor: RED + '10' }]}
              onPress={(e) => { e.stopPropagation(); onReply(); }} hitSlop={6}>
              <MaterialIcons name="reply" size={13} color={isUnread ? RED : PURPLE} />
              <Text style={[styles.replyBtnText, isUnread && { color: RED }]}>Quick Reply</Text>
            </Pressable>
            {replyCount > 0 && (
              <View style={styles.replyCountBadge}>
                <MaterialIcons name="forum" size={11} color={Colors.textTertiary} />
                <Text style={styles.replyCountText}>{replyCount} {replyCount === 1 ? 'reply' : 'replies'}</Text>
              </View>
            )}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

// ── Sent card ─────────────────────────────────────────────────────────────────

function SentCard({
  msg, recipientLabel, timeAgo, replyCount, replies, isDeleting, onOpen, onLongPress, onDelete,
}: {
  msg: Message; recipientLabel: string; timeAgo: string;
  replyCount: number; replies: Message[]; isDeleting: boolean;
  onOpen: () => void; onLongPress: (e: any) => void; onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const typeColors: Record<string, [string, string]> = {
    direct: [Colors.primary + '18', Colors.primary],
    broadcast: [GOLD + '20', GOLD],
    gap_lesson: [GREEN + '20', GREEN],
  };
  const [bg, accent] = typeColors[msg.messageType ?? 'direct'] ?? typeColors.direct;
  const typeIcon: Record<string, string> = { direct: 'send', broadcast: 'campaign', gap_lesson: 'event-available' };
  const typeLabel: Record<string, string> = { direct: 'SENT', broadcast: 'BROADCAST', gap_lesson: 'GAP LESSON' };
  const icon = typeIcon[msg.messageType ?? 'direct'] ?? 'send';
  const label = typeLabel[msg.messageType ?? 'direct'] ?? 'SENT';
  const acceptedCount = msg.acceptedBy?.length ?? 0;
  // Highlight gap lessons that have been claimed
  const claimed = msg.messageType === 'gap_lesson' && acceptedCount > 0;

  return (
    <View style={[
      styles.card,
      { borderColor: accent + '50' },
      claimed && { borderColor: GREEN + '80', borderWidth: 2 },
      isDeleting && { opacity: 0.5 },
    ]}>
      <Pressable onPress={onOpen} onLongPress={onLongPress} delayLongPress={400}>
        <View style={styles.cardInner}>
          <View style={[styles.avatar, { backgroundColor: bg, borderColor: accent + '40' }]}>
            {isDeleting
              ? <ActivityIndicator size="small" color={accent} />
              : <MaterialIcons name={icon as any} size={18} color={accent} />
            }
          </View>
          <View style={styles.cardContent}>
            <View style={styles.cardTopRow}>
              <View style={[styles.fromBadge, { backgroundColor: bg, borderColor: accent + '40' }]}>
                <MaterialIcons name={icon as any} size={10} color={accent} />
                <Text style={[styles.fromBadgeText, { color: accent }]}>{label}</Text>
              </View>
              <View style={styles.cardTopRight}>
                <Text style={styles.cardTime}>{timeAgo}</Text>
                <Pressable hitSlop={10} onPress={(e) => { e.stopPropagation(); onDelete(); }} style={styles.trashBtn}>
                  <MaterialIcons name="delete-outline" size={16} color={Colors.textTertiary} />
                </Pressable>
              </View>
            </View>
            <Text style={styles.cardSender} numberOfLines={1}>To: {recipientLabel}</Text>
            {msg.subject ? <Text style={styles.cardSubject} numberOfLines={1}>{msg.subject}</Text> : null}
            <Text style={styles.cardPreview} numberOfLines={2}>{msg.body}</Text>

            {msg.messageType === 'gap_lesson' && msg.gapLessonData && (
              <View style={[gapStyles.pill, { borderColor: GREEN + '50', backgroundColor: claimed ? GREEN + '18' : GREEN + '10' }]}>
                <MaterialIcons name={claimed ? 'check-circle' : 'event'} size={13} color={GREEN} />
                <Text style={gapStyles.pillText}>
                  {formatDateDisplay(msg.gapLessonData.date)} · {msg.gapLessonData.startTime} · {msg.gapLessonData.duration} min
                </Text>
                {claimed ? (
                  <View style={gapStyles.claimedBadge}>
                    <MaterialIcons name="flash-on" size={11} color={GREEN} />
                    <Text style={gapStyles.claimedText}>CLAIMED</Text>
                  </View>
                ) : (
                  <View style={gapStyles.openBadge}>
                    <Text style={gapStyles.openText}>OPEN</Text>
                  </View>
                )}
              </View>
            )}

            <View style={styles.cardFooter}>
              <View style={styles.readRow}>
                <MaterialIcons name="done-all" size={13} color={msg.readBy.length > 0 ? Colors.success : Colors.textTertiary} />
                <Text style={[styles.readText, { color: msg.readBy.length > 0 ? Colors.success : Colors.textTertiary }]}>
                  {msg.readBy.length > 0 ? `Read by ${msg.readBy.length}` : 'Not read yet'}
                </Text>
              </View>
              {replyCount > 0 && (
                <Pressable
                  style={styles.replyCountBadge}
                  onPress={(e) => { e.stopPropagation(); setExpanded(v => !v); }}
                >
                  <MaterialIcons name="forum" size={11} color={RED} />
                  <Text style={[styles.replyCountText, { color: RED }]}>{replyCount} {replyCount === 1 ? 'reply' : 'replies'}</Text>
                  <MaterialIcons name={expanded ? 'expand-less' : 'expand-more'} size={14} color={RED} />
                </Pressable>
              )}
            </View>
          </View>
        </View>
      </Pressable>

      {expanded && replies.map(reply => (
        <View key={reply.id} style={styles.inlineReply}>
          <View style={styles.inlineReplyLine} />
          <View style={{ flex: 1 }}>
            <View style={styles.inlineReplyHeader}>
              <MaterialIcons name="person" size={12} color={RED} />
              <Text style={[styles.inlineReplySender, { color: RED }]}>
                {reply.subject?.match(/^Re: Message from (.+)$/i)?.[1] ?? 'Pupil'}
              </Text>
              <Text style={styles.cardTime}>{getTimeAgo(reply.createdAt)}</Text>
            </View>
            <Text style={styles.cardPreview} numberOfLines={3}>{reply.body}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: Spacing.md,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerTop: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    marginBottom: 12,
  },
  title: { fontSize: FontSize.xl, fontWeight: '800', color: '#FF6700' },
  unreadPill: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  unreadPillDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: RED },
  unreadSubtitle: { fontSize: FontSize.xs, color: RED, fontWeight: '700' },
  historyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#FAFBFC', borderRadius: Radius.md,
    paddingHorizontal: 10, paddingVertical: 8,
    borderWidth: 1, borderColor: '#E2E8F0',
  },
  historyBtnText: { fontSize: FontSize.xs, fontWeight: '700', color: '#64748B' },
  directBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#FF6700', borderRadius: Radius.md,
    paddingHorizontal: 12, paddingVertical: 8, alignSelf: 'flex-start',
    shadowColor: '#FF6700', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.30, shadowRadius: 8, elevation: 6,
  },
  directBtnText: { fontSize: FontSize.xs, fontWeight: '800', color: '#FFFFFF' },

  actionRow: { flexDirection: 'row', gap: 10 },
  actionBtn: { borderRadius: Radius.md },
  actionBtnGrad: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 7, paddingVertical: 11, paddingHorizontal: 16, borderRadius: Radius.md,
  },
  actionBtnText: { fontSize: FontSize.sm, fontWeight: '800', color: NAVY },

  sectionHeader: { paddingBottom: 8 },
  sectionLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionDot: { width: 8, height: 8, borderRadius: 4 },
  sectionTitle: { fontSize: FontSize.xs, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },
  badgePill: { borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  badgePillText: { fontSize: 10, fontWeight: '800', color: '#fff' },

  card: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder, overflow: 'hidden', ...Shadow.sm,
  },
  cardUnread: { borderColor: RED + '45', backgroundColor: RED + '04' },
  unreadBar: { height: 3, backgroundColor: RED },
  cardInner: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, padding: Spacing.md },
  avatarWrap: { position: 'relative' },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1.5,
  },
  avatarInitials: { fontSize: FontSize.sm, fontWeight: '800' },
  unreadDot: {
    position: 'absolute', bottom: 0, right: 0,
    width: 13, height: 13, borderRadius: 7, borderWidth: 2, borderColor: Colors.surface,
  },
  cardContent: { flex: 1, gap: 4 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTopRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fromBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1,
  },
  fromBadgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.7 },
  cardTime: { fontSize: 10, color: Colors.textTertiary },
  trashBtn: { padding: 2 },
  cardSender: { fontSize: FontSize.base, fontWeight: '700', color: Colors.textPrimary },
  cardSubject: { fontSize: FontSize.sm, fontWeight: '500', color: Colors.textSecondary },
  cardSubjectUnread: { fontWeight: '700', color: Colors.textPrimary },
  cardPreview: { fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 17 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },

  replyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: PURPLE + '12', borderRadius: Radius.full,
    paddingHorizontal: 12, paddingVertical: 5,
    borderWidth: 1, borderColor: PURPLE + '35',
  },
  replyBtnText: { fontSize: FontSize.xs, fontWeight: '700', color: PURPLE },
  replyCountBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  replyCountText: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textTertiary },

  readRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  readText: { fontSize: 11, fontWeight: '600' },

  inlineReply: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    paddingLeft: 58, paddingRight: Spacing.md, paddingBottom: 12,
  },
  inlineReplyLine: {
    width: 2, alignSelf: 'stretch', backgroundColor: RED + '40', borderRadius: 1, marginTop: 2,
  },
  inlineReplyHeader: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 3 },
  inlineReplySender: { fontSize: FontSize.xs, fontWeight: '700', flex: 1 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32, backgroundColor: '#FAFBFC' },
  emptyText: { fontSize: FontSize.lg, fontWeight: '700', color: '#0F172A' },
  emptyHint: { fontSize: FontSize.sm, color: '#64748B', textAlign: 'center', lineHeight: 20 },
});

const gapStyles = StyleSheet.create({
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: Radius.md, paddingHorizontal: 10, paddingVertical: 7,
    borderWidth: 1, marginTop: 6, flexWrap: 'wrap',
  },
  pillText: { fontSize: FontSize.xs, fontWeight: '700', color: GREEN, flex: 1 },
  claimedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: GREEN + '20', borderRadius: Radius.full,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  claimedText: { fontSize: 9, fontWeight: '800', color: GREEN, letterSpacing: 0.5 },
  openBadge: {
    backgroundColor: '#88888820', borderRadius: Radius.full,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  openText: { fontSize: 9, fontWeight: '800', color: '#888', letterSpacing: 0.5 },
});

const modal = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingBottom: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: FontSize.base, fontWeight: '700', color: Colors.textPrimary },
  sendBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FF6700', borderRadius: Radius.md, paddingHorizontal: 14, paddingVertical: 8,
  },
  sendBtnText: { fontSize: FontSize.sm, fontWeight: '700', color: '#fff' },
  body: { paddingHorizontal: Spacing.md, paddingTop: Spacing.md, paddingBottom: 48, gap: 14 },

  gapCard: {
    backgroundColor: GREEN + '08', borderRadius: Radius.lg,
    borderWidth: 1, borderColor: GREEN + '35', padding: Spacing.md, gap: 12,
  },
  gapCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  gapCardTitle: { fontSize: FontSize.sm, fontWeight: '700', color: GREEN, flex: 1 },
  gapRow: { flexDirection: 'row', gap: 12 },
  gapInfo: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    backgroundColor: GREEN + '10', borderRadius: Radius.sm, padding: 8,
  },
  gapInfoText: { flex: 1, fontSize: FontSize.xs, color: GREEN, lineHeight: 16 },

  fieldLabel: {
    fontSize: FontSize.xs, fontWeight: '700', color: Colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  input: {
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
    paddingHorizontal: Spacing.md, height: 48,
    color: Colors.textPrimary, fontSize: FontSize.base,
  },
  textArea: {
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
    padding: Spacing.md, color: Colors.textPrimary,
    fontSize: FontSize.base, minHeight: 160,
  },
  recipientToggle: {
    flexDirection: 'row', backgroundColor: Colors.surface,
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.surfaceBorder, overflow: 'hidden',
  },
  togBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 12,
  },
  togBtnActive: { backgroundColor: '#FF6700' },
  togText: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: '600' },
  togTextActive: { color: '#fff' },

  pupilList: { gap: 8 },
  pupilItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  pupilItemSelected: { borderColor: '#FF6700', backgroundColor: '#FF670010' },
  pupilAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#FF670020', alignItems: 'center', justifyContent: 'center',
  },
  pupilAvatarText: { fontSize: FontSize.sm, fontWeight: '700', color: '#FF6700' },
  pupilName: { fontSize: FontSize.base, color: Colors.textPrimary, fontWeight: '500' },
  pupilStatusWarning: { fontSize: 10, color: Colors.warning, fontWeight: '600', textTransform: 'uppercase' },

  messageLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  templatesToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: GOLD + '15', borderRadius: Radius.full,
    paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: GOLD + '35',
  },
  templatesToggleText: { fontSize: FontSize.xs, fontWeight: '700', color: GOLD },
  templatesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  templateChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: GOLD + '12', borderRadius: Radius.full,
    paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 1, borderColor: GOLD + '35',
  },
  templateChipText: { fontSize: FontSize.xs, fontWeight: '700', color: GOLD },

  summary: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    padding: 12, borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  summaryText: { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 17 },
});
