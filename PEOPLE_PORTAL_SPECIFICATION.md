# DRIVE SMART — People Portal
## Complete Product Specification
### Companion App for Pupils & Parents | iOS + Android

> **Version:** 1.0.0 — Production Ready  
> **Generated:** May 2026  
> **Status:** Implementation Ready — Hand-off Document  
> **Applies to:** Drive Smart People Portal (separate bundle from instructor app)

---

## TABLE OF CONTENTS

1. [Overview & Objectives](#1-overview--objectives)
2. [Roles, RBAC & Permissions](#2-roles-rbac--permissions)
3. [Parent Verification Workflow](#3-parent-verification-workflow)
4. [Trusted Parent Criteria & Comment Approval](#4-trusted-parent-criteria--comment-approval)
5. [Screen-by-Screen Specification](#5-screen-by-screen-specification)
6. [Detailed User Flows](#6-detailed-user-flows)
7. [Security, Privacy & GDPR](#7-security-privacy--gdpr)
8. [Notification Strategy](#8-notification-strategy)
9. [Technical Architecture](#9-technical-architecture)
10. [Implementation Phasing](#10-implementation-phasing)

---

## 1. Overview & Objectives

### 1.1 App Identity

| Attribute       | Detail                                                                 |
|-----------------|------------------------------------------------------------------------|
| **App Name**    | Drive Smart — People Portal                                            |
| **Tagline**     | *"Your Learning Journey, Together"*                                    |
| **Platforms**   | iOS 16+ · Android 10+ (React Native / Expo)                            |
| **Bundle IDs**  | `com.drivesmart.portal` (iOS) · `com.drivesmart.portal` (Android)      |
| **Architecture**| White-label ready — instructor branding injected at login              |
| **Themes**      | Light mode (default) · Dark mode (system-following + manual override)  |
| **Brand**       | Purple primary (`#7C3AED`) · White surfaces · Clean minimalist         |

### 1.2 Core Objectives

| Priority | Objective | Metric |
|----------|-----------|--------|
| P0 | Reduce instructor admin overhead | Admin tasks automated ≥ 40% |
| P0 | Empower pupils to own their learning journey | Reflection completion rate ≥ 60% |
| P1 | Enable verified parents to monitor and support progress | Parent activation rate ≥ 70% |
| P1 | Enable parents to set up surprise lessons | Surprise lesson bookings tracked |
| P2 | Increase lesson completion and payment punctuality | Payment on-time rate ≥ 85% |

### 1.3 Key Differentiators

- **Dual-role app in one binary**: Pupils and verified parents share the same app — role is determined at login. No separate parent app download.
- **Verified parent access**: Mandatory document/consent verification before parents gain any meaningful access. Not a simple invite-and-go.
- **Trusted parent system**: Two-tier parental access — Verified (moderated comments) vs Trusted (auto-approved comments) — controlled entirely by the instructor.
- **Surprise lesson setup**: Parents can arrange and pay for additional lessons visible to the instructor but hidden from the pupil's app until the instructor confirms.
- **DVSA-aligned progress**: Interactive 24-manoeuvre progress ring directly mapped to the UK DVSA driving test standard.
- **GPS journey replay**: Post-lesson route playback for self-reflection and parental visibility.

---

## 2. Roles, RBAC & Permissions

### 2.1 Role Definitions

| Role | Description | How Assigned |
|------|-------------|--------------|
| **Pupil** | The learner driver. Full control over own data, reflections, availability. | Instructor creates account; pupil sets PIN |
| **Verified Parent** | A parent/guardian who has completed the full verification workflow. Read-only on core data, moderated comments, full payment rights. | Invitation from instructor → completed verification |
| **Trusted Parent** | A Verified Parent granted elevated trust by the instructor. Comments auto-approved. Can arrange surprise lessons. | Instructor manually promotes after criteria met |
| **Instructor (Portal View)** | Read-only reference — instructors use the main Drive Smart app. No login to People Portal. | N/A |

### 2.2 Full Permissions Matrix

| Permission | Pupil | Verified Parent | Trusted Parent |
|------------|:-----:|:---------------:|:--------------:|
| View own/child's upcoming lessons | ✅ | ✅ | ✅ |
| View own/child's past lessons | ✅ | ✅ | ✅ |
| Download lesson receipts | ✅ | ✅ | ✅ |
| Check in on lesson day | ✅ | ❌ | ❌ |
| Edit own availability (recurring slots) | ✅ | ❌ | ❌ |
| Set blackout dates | ✅ | ❌ | ❌ |
| Request custom pick-up/drop-off | ✅ | ❌ | ❌ |
| Add reflections (own) | ✅ | ❌ | ❌ |
| Edit own reflections (within 24h) | ✅ | ❌ | ❌ |
| Mark reflection as private | ✅ | ❌ | ❌ |
| Add parent comment on reflection | ❌ | ✅ (pending) | ✅ (auto-approved) |
| View approved parent comments | ✅ | ✅ | ✅ |
| View rejected comments (own only) | N/A | ✅ | ✅ |
| Reply to own approved comment | ❌ | ✅ | ✅ |
| Make payments (card on file) | ✅ | ✅ | ✅ |
| Add/update card on file | ✅ | ✅ | ✅ |
| Arrange surprise lesson | ❌ | ❌ | ✅ |
| View GPS journey replay | ✅ | ✅* | ✅* |
| Share GPS replay externally | ✅* | ❌ | ❌ |
| Access 3D lesson videos | ✅ | ✅* | ✅* |
| View DVSA progress ring | ✅ | ✅ | ✅ |
| View instructor skill notes | ✅ | ✅ | ✅ |
| Refer a friend | ✅ | ❌ | ❌ |
| Download progress certificate | ✅ | ✅ | ✅ |
| Message instructor | ✅ | ❌ (view only) | ✅ (direct thread) |
| Manage notification preferences | ✅ | ✅ | ✅ |
| Change PIN / biometrics | ✅ | ✅ | ✅ |

> `*` = instructor must enable this feature toggle in Drive Smart dashboard first.

### 2.3 RBAC Enforcement Architecture

**Client-side (React Native):**
- Role stored in Supabase auth user metadata: `{ role: 'pupil' | 'parent', verificationStatus: 'unverified' | 'pending' | 'approved' | 'rejected', trustedParent: boolean }`
- `useAuth()` hook exposes `role`, `verificationStatus`, `isTrustedParent`
- All gated screens check role before rendering; guarded via `RoleGuard` component
- Gated UI elements use `PermissionGate` wrapper (renders null if insufficient role)

**Server-side (Supabase RLS + Edge Functions):**
```sql
-- Pupils can only access their own records
CREATE POLICY "pupil_own_data" ON lessons
  FOR SELECT TO authenticated
  USING (pupil_id = auth.uid());

-- Parents can access their linked child's records (after verification)
CREATE POLICY "parent_child_data" ON lessons
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM parent_pupil_links ppl
      WHERE ppl.parent_id = auth.uid()
        AND ppl.pupil_id = lessons.pupil_id
        AND ppl.verification_status = 'approved'
    )
  );
```
- Every sensitive edge function validates JWT claims before processing
- `trustedParent` flag stored in `parent_pupil_links.is_trusted` — never set by client

---

## 3. Parent Verification Workflow

### 3.1 Overview & State Machine

```
Instructor invites parent
        │
        ▼
[UNVERIFIED] ──────────────────────────────────────────────────────┐
Parent downloads app & enters code                                  │
        │                                                           │
        ▼                                                           │
[IN_PROGRESS] — Parent completes verification steps                 │
        │                                                           │
        ▼                                                           │
[PENDING_REVIEW] — Instructor notified                             │
        │                                                           │
   ┌────┴────┐                                                      │
   ▼         ▼                                                      │
[APPROVED] [REJECTED] ── Parent notified ── Re-submit option ───────┘
   │
   ▼
Full Verified Parent access granted
```

### 3.2 Step 1 — Instructor Initiates (Drive Smart Dashboard)

**Where:** Drive Smart main app → Pupil Detail → "Add Parent/Guardian"

**Instructor inputs:**
- Parent/guardian full name
- Relationship to pupil (Mother / Father / Legal Guardian / Other)
- Parent email address
- Parent mobile number (for OTP)
- Verification level: **Standard** (document required) or **Express** (instructor skips document, approves directly)

**System action:**
1. Creates `parent_invitation` record with unique `invite_code` (8-character alphanumeric, expires in 7 days)
2. Sends invitation via email AND SMS:

> **Email subject:** *"You've been invited to view [Pupil Name]'s driving lessons on Drive Smart"*
>
> **Email body:**
> *"Hi [Parent Name], [Instructor Name] has invited you to monitor [Pupil Name]'s driving progress on the Drive Smart app.*
> *Download the app and use your invitation code: **DS-XXXXXX***
> *[Download on App Store] [Download on Google Play]*
> *This code expires in 7 days."*

> **SMS:**  
> *"Drive Smart invite from [Instructor Name]. Download the app and enter code DS-XXXXXX to view [Pupil Name]'s lessons. Code expires in 7 days."*

### 3.3 Step 2 — Parent Downloads App & Enters Code

**Screen: "Welcome — Are you a learner or a parent/guardian?"**

Two large cards:
- 🎓 **I'm a Learner** → PIN login flow
- 👨‍👩‍👧 **I'm a Parent/Guardian** → Invitation code entry

**Invitation Code Entry screen:**
- Large, prominent input field (auto-formats as DS-XXXXXX)
- "I received a code by email or text" helper text
- Validation: checks code exists + not expired + not already used
- Error states:
  - "Code not found — check for typos" 
  - "Code has expired — ask your instructor to send a new one"
  - "This code has already been used"

**On valid code:**
- Pre-fills parent name and child's name from the invitation record
- Shows: "Welcome, [Parent Name]! You're setting up access to view [Child Name]'s lessons."
- Proceeds to Step 3

### 3.4 Step 3 — Identity & Verification

**Progress tracker (pinned at top throughout):**
```
① Phone Verify  ──  ② Document Upload  ──  ③ Review  ──  ④ Approved
     ●                    ○                   ○              ○
```

#### Sub-step 3a: Phone Number Verification (Always Required)

- Pre-filled phone number from invitation (editable)
- "Send verification code" button
- 6-digit OTP sent via SMS (expires in 10 minutes)
- OTP input with auto-submit on 6th digit
- Resend option after 60-second cooldown (max 3 resends)
- On success: phone number locked, step marked ✅

#### Sub-step 3b: Email Verification

- Pre-filled email from invitation
- Tap "Send email verification"
- Magic link or 6-digit code sent to email
- On click/entry: email verified ✅

#### Sub-step 3c: Document Upload (Standard verification only; skipped for Express)

**UI Copy:** *"To protect [Child Name]'s privacy, we need to confirm your relationship. Please upload one of the following:"*

**Document options (radio selector):**
- 📄 Child's birth certificate (showing your name as parent)
- 🛂 Child's passport (showing your name in guardian section)
- ⚖️ Court order confirming parental responsibility
- 📝 Signed digital consent form (pre-filled, sign with finger)

**Upload UI:**
- Large upload zone: "Take a photo" or "Upload from gallery"
- Camera permission request with explanation: *"We need camera access to photograph your document"*
- Preview thumbnail with "Retake" option
- File validation: JPEG/PNG/PDF, max 10MB, min 200 DPI for photos
- On upload: progress bar, then "Document uploaded securely ✓"

**Digital Consent Form (alternative to document):**
- Pre-filled: Parent name, pupil name, date, instructor name
- Signature canvas at bottom (finger/stylus draw)
- "Clear" and "Submit" buttons
- Generated as signed PDF

**Security notice (visible during upload):**
> 🔒 *"Your document is encrypted and stored securely. It will only be seen by your driving instructor. It will be automatically deleted after 7 years in line with GDPR."*

#### Sub-step 3d: Submission

- Review summary screen:
  - ✅ Phone verified: [number]
  - ✅ Email verified: [email]
  - ✅ Document uploaded: [type]
  - Child: [Pupil Name]
  - Instructor: [Instructor Name]
- "Submit for Review" button
- On submission: status → `PENDING_REVIEW`
- Screen: *"All done! [Instructor Name] will review your submission, usually within 24 hours. We'll notify you when your access is ready."*

### 3.5 Instructor Review Queue (Drive Smart Dashboard)

**Location:** Drive Smart main app → Notifications → "Pending Parent Verifications (N)"

**Review card shows:**
- Parent name, relationship, contact details
- Child's name
- Submission timestamp
- Document thumbnail (tap to view full size)
- Verification method used

**Instructor actions:**
- ✅ **Approve** — grants full Verified Parent access immediately
- ❌ **Reject** — with mandatory rejection reason (dropdown + optional note):
  - "Document unclear or unreadable"
  - "Document does not confirm stated relationship"
  - "Incorrect document type"
  - "Suspected fraudulent submission"
  - "Other" (free text)
- ⚡ **Express Approve** (Express verification mode only) — skips document review entirely, approves with one tap

**Push notification sent to instructor** when parent submits:
> *"[Parent Name] has submitted verification to access [Pupil Name]'s account. Tap to review."*

### 3.6 Step 4 — Parent Notified of Decision

**If Approved:**
> Push notification: *"Great news! Your access to [Child Name]'s lessons has been approved. Open Drive Smart to get started."*
>
> In-app: Welcome screen with "Verified Parent ✓" badge, brief tour of parent features

**If Rejected:**
> Push notification: *"Your verification request needs attention. Open Drive Smart for details."*
>
> In-app: Clear rejection reason, "Re-submit" button with guidance on what to fix
> 
> Note: parent can re-submit up to 3 times before instructor must manually reset

### 3.7 Verification Status Display

| Status | Pupil App shows | Parent App shows |
|--------|----------------|-----------------|
| Unverified | Nothing | Locked screen with "Complete verification to access" |
| Pending | "A parent is awaiting verification" notification | Step tracker, "Under review" |
| Approved | "Verified Parent: [Name]" in settings | "Verified Parent ✓" green badge |
| Rejected | Nothing | Red banner with rejection reason and re-submit CTA |
| Expired code | N/A | "Invitation expired — contact your instructor" |

### 3.8 Re-Verification & Code Refresh

- Instructor can revoke verification at any time from Drive Smart dashboard
- On revocation: parent sees "Access revoked — contact your instructor"
- Instructor can issue new invitation code if original expired (invalidates old code)
- Express upgrade path: instructor can upgrade Standard → Trusted without re-verification

---

## 4. Trusted Parent Criteria & Comment Approval

### 4.1 Trusted Parent Eligibility Criteria

All six criteria must be met before an instructor can promote to Trusted:

| # | Criterion | Threshold | Auto-checked? |
|---|-----------|-----------|---------------|
| 1 | Verification status | `approved` | ✅ System |
| 2 | Payment history | 0 failed/missed payments | ✅ System |
| 3 | Lesson attendance rate | ≥ 90% of booked lessons attended | ✅ System |
| 4 | No moderation flags | 0 rejected comments | ✅ System |
| 5 | Account age | ≥ 14 days since verification approved | ✅ System |
| 6 | Instructor manual approval | Instructor taps "Promote to Trusted" | ❌ Manual only |

**Drive Smart dashboard:** Pupil Detail → Parents tab → shows each parent's eligibility checklist. "Promote to Trusted" button is enabled only when criteria 1–5 are all met. Instructor must still manually confirm.

### 4.2 Comment Routing by Parent Type

```
Parent submits comment
         │
    ┌────┴─────┐
    │          │
Trusted?      Not Trusted
    │          │
    ▼          ▼
Auto-approved  → Moderation Queue
immediately       │
    │         ┌──┴──────────────┐
    │         ▼                 ▼
    │      Instructor        Instructor
    │      Approves          Rejects
    │         │                 │
    ▼         ▼                 ▼
Visible    Visible          Hidden from
on timeline on timeline     timeline
                            (author sees
                             "Rejected"
                              label)
```

### 4.3 Comment Lifecycle States

| State | Visible on timeline? | Shown to author? | Badge label |
|-------|---------------------|------------------|-------------|
| `draft` | ❌ | ✅ (editing) | — |
| `pending` | ❌ | ✅ | "Awaiting approval" |
| `approved` | ✅ | ✅ | "Verified Parent" |
| `auto_approved` | ✅ | ✅ | "Trusted Parent ✓" |
| `rejected` | ❌ | ✅ | "Not approved" + reason |

### 4.4 Instructor Moderation Interface (Drive Smart Dashboard)

**Location:** Drive Smart → Notifications → "Comments Pending Review (N)"

**Moderation card:**
- Parent name + "Verified Parent" / "Trusted Parent" badge
- Child name, lesson date the comment relates to
- Comment text (full)
- Timestamp
- Actions: ✅ Approve | ❌ Reject (with reason: "Inappropriate", "Inaccurate", "Irrelevant", "Other")

**Notifications:**
- Instructor: push when new comment pending (max 1 per hour batched)
- Parent: push when comment approved or rejected

### 4.5 Comment UI Labels

```
┌─────────────────────────────────────────────────────┐
│  👤 Sarah Mitchell                [Trusted Parent ✓] │
│  "Really proud of how Emma handled that roundabout   │
│   today! The instructor mentioned she's ready for    │
│   her test soon. We're so excited!"                  │
│                                          2h ago      │
│  ↩ Reply                                             │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│  👤 David Wilson               [Verified Parent]    │
│  "Great lesson update! Keep up the hard work, Jack"  │
│                                          Yesterday   │
│  ↩ Reply                                             │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│  👤 You (Mark Wilson)          [Awaiting approval]  │
│  "So proud of you, Jack. You'll nail the test!"      │
│  ⏳ Your comment is waiting for instructor approval  │
└─────────────────────────────────────────────────────┘
```

### 4.6 Revoking Trusted Status

Instructor can demote Trusted → Verified at any time:
- Future comments revert to pending queue
- Existing auto-approved comments remain visible (no retroactive removal)
- Parent receives notification: *"Your Trusted Parent status has been updated. Future comments will be reviewed before appearing."*

---

## 5. Screen-by-Screen Specification

### 5.1 Onboarding & Login

#### 5.1.1 Splash Screen
- Drive Smart logo (white) on purple gradient background (`#7C3AED` → `#5B21B6`)
- 1.5s display, transitions to role selection

#### 5.1.2 Role Selection Screen
```
┌─────────────────────────────────────┐
│        DRIVE SMART                  │
│    People Portal                    │
│                                     │
│   ┌─────────────────────────────┐   │
│   │  🎓  I'm a Learner          │   │
│   │  Log in with your PIN       │   │
│   └─────────────────────────────┘   │
│                                     │
│   ┌─────────────────────────────┐   │
│   │  👨‍👩‍👧  I'm a Parent/Guardian  │   │
│   │  I have an invitation code  │   │
│   └─────────────────────────────┘   │
│                                     │
│   Already logged in? Tap here       │
└─────────────────────────────────────┘
```

#### 5.1.3 Pupil Login Flow

**Step 1 — Phone number entry:**
- Field: mobile number (UK format, with +44 selector)
- "Continue" → verifies number exists in system
- Error: "Number not found — check with your instructor"

**Step 2 — PIN entry:**
- 4-digit PIN (set by instructor initially, pupil changes on first login)
- Circular PIN pad (purple accent on active)
- "Forgot PIN? Contact your instructor"
- On 5 failed attempts: 30-minute lockout with instructor notification

**First login — PIN change enforced:**
- "Set your own PIN" screen (new PIN + confirm PIN)
- Strength: any 4 digits (no sequential like 1234, no repeated like 1111)

**Biometric unlock (after first login):**
- "Use Face ID / Fingerprint for faster login?" sheet
- Stored locally (device Keychain/Keystore), never sent to server

#### 5.1.4 Parent Login Flow

**Returning parents:**
- Phone number → 6-digit OTP (SMS) → verified → home screen
- Biometric option after first session (7-day session, then re-verify)

**New parents:**
- "Enter your invitation code" → full verification flow (see §3)

#### 5.1.5 Pupil Onboarding Carousel (First Login Only)

**Slide 1:** "Your Lessons, Your Way" — illustration of calendar, text about seeing lessons + availability
**Slide 2:** "Track Your Progress" — illustration of DVSA ring, text about 24 skills
**Slide 3:** "Stay Connected" — illustration of messaging, text about staying in touch with instructor

**CTA:** "Let's Go →" → home screen

#### 5.1.6 Parent Onboarding Carousel (Post-Verification Only)

**Slide 1:** "Welcome, [Parent Name]!" — "You're now connected to [Child Name]'s learning journey"
**Slide 2:** "Monitor Progress" — read-only view of lessons and DVSA skills
**Slide 3:** "Support from Anywhere" — payment tools, message visibility, verified parent badge

---

### 5.2 Home / Dashboard

#### 5.2.1 Pupil Dashboard

**Layout (top to bottom):**

1. **Header bar:** "Good morning, [First Name] 👋" + notification bell (badge count) + settings gear
2. **Next Lesson hero card:**
   ```
   ┌──────────────────────────────────────────────────┐
   │  NEXT LESSON                    In 2 days 4h 12m │
   │                                                   │
   │  📅 Tuesday 20 May · 10:00 – 11:00 AM            │
   │  👨‍🏫 [Instructor Name]                            │
   │  📍 Pick up: 42 Oak Street, CF47 0AE             │
   │                                    [Map preview] │
   │                              [Check In] [Notes]  │
   └──────────────────────────────────────────────────┘
   ```
   - Countdown timer updates live
   - "Check In" button enabled only on lesson day (within 30 minutes before)
   - Map preview: static map tile of pickup location

3. **Quick actions row (horizontal scroll):**
   - 📊 My Progress | 💬 Messages | 📅 My Availability | 📚 Resources | 🔗 Refer a Friend

4. **Lesson Gap Alert (conditional):**
   - Shown if ≥ 14 days since last lesson without a future lesson booked
   ```
   ⚠️  No lessons booked for 2 weeks. 
   Check your availability is up to date!
   [Update Availability →]
   ```

5. **Weekly stats strip:**
   ```
   [ 2 lessons  |  2.0 hrs  |  85% theory score ]
   ```

6. **Learning Journey feed teaser (2 most recent entries):**
   - "First Lesson Completed ✓ · 3 days ago"
   - "Parallel Park · Competent ✓ · 1 week ago"
   - "View Full Journey →"

7. **Bottom tab bar:** Home | Lessons | Progress | Messages | More

#### 5.2.2 Parent Dashboard

**Layout (top to bottom):**

1. **Parent View Banner (always pinned, cannot be dismissed):**
   ```
   ┌──────────────────────────────────────────────────┐
   │  👨‍👩‍👧  PARENT VIEW — Emma Mitchell               │
   │  Verified Parent ✓  |  Switch Child ▾           │
   └──────────────────────────────────────────────────┘
   ```
   - Purple background, white text
   - "Switch Child" if parent is linked to multiple pupils

2. **Verification status banner (only if not fully approved):**
   ```
   🕐 Your verification is under review. 
   You'll have full access once approved.
   [Check Status →]
   ```

3. **Next Lesson hero card (read-only):**
   - Same card as pupil view but without Check In / Notes buttons
   - Shows "Private notes hidden" if pupil has private notes

4. **Progress summary:**
   ```
   ┌─────────────────────────────────┐
   │  Emma's Progress                │
   │  [DVSA ring — 14/24 skills]     │
   │  14 hours completed             │
   │  [View Full Progress →]         │
   └─────────────────────────────────┘
   ```

5. **Payment Due Alert (conditional):**
   ```
   💳 £35.00 outstanding for next lesson
   [Pay Now →]
   ```

6. **Recent Activity (approved items only):**
   - "Emma added a reflection · Yesterday"
   - "Lesson completed · 3 May"

7. **Quick actions:** View Lessons | Pay Balance | View Progress | Message Instructor

8. **Bottom tab bar:** Home | Lessons | Progress | Payments | More

---

### 5.3 My Lessons

#### 5.3.1 Tab Bar
- **Upcoming** (default) | **Past** | **All**
- Badge count on Upcoming tab

#### 5.3.2 Lesson Card

```
┌─────────────────────────────────────────────────────┐
│  Tue 20 May 2025                   [Scheduled] 🟣   │
│  10:00 – 11:00 AM  ·  60 minutes                    │
│  📍 42 Oak Street, CF47 0AE                         │
│  👨‍🏫 [Instructor Name]                               │
│                                                      │
│  [Unpaid 🔴]  [Unacknowledged ⚠️]  [Check In →]     │
└─────────────────────────────────────────────────────┘
```

**Status badges:**
- Scheduled (purple) | Completed (green) | Cancelled (red) | No Show (amber)

**Payment status:**
- Unpaid (red) | Partial (amber) | Paid (green) | Auto-charged (blue)

**Pupil actions on Upcoming card:**
- Tap → Lesson Detail screen
- "Check In" — only active on lesson day ±30 min
- "Add Notes" — pre-lesson notes for instructor

**Parent actions on Upcoming card:**
- Tap → Lesson Detail (read-only)
- "Pay" button if payment outstanding

#### 5.3.3 Lesson Detail Screen

**Sections:**
1. **Lesson info:** Date, time, duration, instructor, location
2. **Status:** Current status + payment status
3. **Map:** Static map of pickup location with "Get Directions" button
4. **Notes:** Pupil lesson notes (editable by pupil pre-lesson, read-only by parent)
5. **Instructor notes:** Any notes added by instructor post-lesson (visible to both)
6. **Check-in:** GPS-verified check-in button (pupil only, lesson day only)
7. **Payment:** Pay button (if unpaid), payment history for this lesson
8. **GPS Replay:** Available after lesson (if instructor has enabled) — "Play Route"
9. **Reflections:** Link to reflection for this lesson

**Parent view:**
- All sections read-only except Payment (fully interactive)
- Private notes section hidden completely
- "Add Parent Comment" button at bottom

#### 5.3.4 Filter & Sort Options

- Filter by: Status | Payment | Date Range | Instructor
- Sort by: Date (default) | Duration | Payment status
- Empty states:
  - Upcoming: *"No lessons coming up — your instructor will schedule soon"*
  - Past: *"No completed lessons yet — get started!"*

---

### 5.4 Progress & Syllabus

#### 5.4.1 DVSA Progress Ring

**Main ring:**
- Large circular ring (300pt diameter)
- Segments per skill: 24 total
- Colour per segment: Grey (Not Started) | Amber (In Progress) | Blue (Developing) | Green (Competent) | Dark Green (Mastered)
- Centre text: "14 / 24 Competent"
- Rotate ring to browse skills (interactive)

**Legend row:** ⬜ Not Started | 🟡 In Progress | 🔵 Developing | 🟢 Competent | 🌿 Mastered

#### 5.4.2 Skills Breakdown Grid

24 DVSA skills listed in accordion groups:

**Group 1: Controls & Safety**
1. Cockpit checks
2. Controls and instruments
3. Moving away safely
4. Safe normal stops
5. Emergency stop

**Group 2: Road Procedure**
6. Crossroads
7. Junctions (turning right/left)
8. Roundabouts
9. Pedestrian crossings
10. Dual carriageways

**Group 3: Manoeuvres**
11. Parallel parking
12. Bay parking (forward/reverse)
13. Pull up on the right
14. Reverse left/right
15. Turn in the road

**Group 4: Advanced**
16. Meeting traffic
17. Overtaking
18. Defensive driving
19. Night driving
20. Motorway driving

**Group 5: Independent Driving**
21. Following signs
22. Following satnav
23. Commentary driving
24. Eco-safe driving

**Each skill card (expanded):**
```
┌────────────────────────────────────────┐
│  🔵 Roundabouts         [Developing]  │
│  ─────────────────────────────────── │
│  DVSA Standard: Approach in correct   │
│  lane, give way to right, exit       │
│  correctly...                         │
│                                       │
│  Instructor notes: "Good at 2-lane   │
│  roundabouts. Practice mini ones."   │
│                                       │
│  Last practised: 20 May 2025         │
└────────────────────────────────────────┘
```

#### 5.4.3 Hours & Stats Panel

```
┌────────────────────────────────────────────────┐
│  📊 Your Learning Stats                        │
│                                                 │
│  Lessons completed:    14 lessons               │
│  Total hours:          16.5 hours               │
│  Average per week:     1.2 lessons              │
│                                                 │
│  UK average to pass:   ~47 hours                │
│  Your pace:            ██████░░░░  35% there   │
│                                                 │
│  Theory test: Booked for 15 June 2025          │
│  Mock score:  42 / 50 (84%) ✓                  │
└────────────────────────────────────────────────┘
```

#### 5.4.4 Progress Certificate

- Instructor can issue progress certificates from Drive Smart dashboard
- Pupil/parent can download: "Download Certificate PDF"
- Certificate includes: name, lessons completed, skills mastered, instructor signature, date

---

### 5.5 Reflections & Notes

#### 5.5.1 Reflections Timeline (Pupil View)

**Header:** "Lesson Reflections & Notes"

**Filter bar:** All | My Reflections | Lesson Notes | Parent Comments

**Timeline entry (pupil reflection):**
```
┌──────────────────────────────────────────────────────┐
│  📝 Your Reflection                    20 May 2025  │
│  Linked lesson: 10:00 AM · 60 min                   │
│  ──────────────────────────────────────────────────  │
│  "Really felt more confident on roundabouts today.   │
│  Still struggling with parallel park timing but     │
│  getting better. Mood: 😊"                           │
│                                                      │
│  Tags: #roundabouts #parking #confidence            │
│                                                      │
│  🔒 Private  ·  Edit  ·  Delete (22h left)         │
│                                                      │
│  💬 1 parent comment  ▼                             │
└──────────────────────────────────────────────────────┘
```

**Private toggle:** When enabled, entry shows with 🔒 icon and is hidden from parent view.

#### 5.5.2 Add Reflection Form (Pupil)

**Fields:**
1. **Linked lesson** (auto-selected to most recent, can change): dropdown
2. **How did it go?** Mood selector: 😞 😕 😐 😊 😄 (5 options, styled purple when selected)
3. **Reflection text:** Multiline input, max 1000 characters, character counter
4. **Skills practised today:** Multi-select chips from 24 DVSA skills
5. **Private?** Toggle: "Only you and your instructor can see this"
6. **Submit** button (purple, full width)

**Validation:** Minimum 20 characters for reflection text before submit enables.

#### 5.5.3 Parent Comment Flow (Verified/Trusted Parent)

**Entry point:** On any reflection timeline entry → "Add a Comment" button (only shown to verified parents)

**Comment input screen:**
```
┌──────────────────────────────────────────────────────┐
│  ← Add a Parent Comment                             │
│  ──────────────────────────────────────────────────  │
│  Commenting on Emma's reflection from 20 May        │
│                                                      │
│  ┌────────────────────────────────────────────────┐  │
│  │ Write your comment...                          │  │
│  │                                                │  │
│  │                                     0/500      │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  ℹ️ Comments are reviewed before appearing          │
│     (unless you are a Trusted Parent)               │
│                                                      │
│  [Post Comment]                                      │
└──────────────────────────────────────────────────────┘
```

**Post-submission states:**

*For Trusted Parent:*
```
✅ Comment posted!
Your comment is live on Emma's timeline.
```

*For Verified Parent:*
```
⏳ Comment submitted for review
[Instructor Name] will review your comment shortly.
You'll be notified when it's approved.
```

#### 5.5.4 Threaded Replies

Parents can reply to their own approved/auto-approved comments:
```
  Sarah Mitchell [Trusted Parent ✓]   2h ago
  "So proud of your progress, Emma!"
  
    ↩ Your reply:
    "Thanks Mum! 😊"
```

Replies from parent are also subject to same moderation rules as original comments.

---

### 5.6 Payments

#### 5.6.1 Balance Overview Card

```
┌──────────────────────────────────────────────────────┐
│  💳 Payment Overview                                │
│  ──────────────────────────────────────────────────  │
│  Outstanding:     £35.00        [Pay Now →]         │
│  Paid this month: £140.00                           │
│  Total paid:      £490.00                           │
│  Card on file:    Visa •••• 4242  [Update]         │
│                                                      │
│  Auto-charge: Enabled (48h before each lesson)     │
└──────────────────────────────────────────────────────┘
```

#### 5.6.2 Payment History List

**Columns:** Date | Lesson | Amount | Method | Status

```
┌───────────────────────────────────────────────────┐
│  20 May 2025 · 10:00 AM lesson                   │
│  £35.00 · Auto-charged · Visa ••4242  [Paid ✅]  │
│  [Receipt PDF]                                    │
├───────────────────────────────────────────────────┤
│  13 May 2025 · 10:00 AM lesson                   │
│  £35.00 · Manual payment in app  [Paid ✅]       │
│  [Receipt PDF]                                    │
└───────────────────────────────────────────────────┘
```

#### 5.6.3 In-App Payment Flow

1. Tap "Pay Now" on outstanding balance or specific lesson
2. **Amount screen:** Shows breakdown (lesson date, duration, rate, total)
3. **Payment method:** Card on file (default) | Add new card
4. **Confirm screen:** Summary, "Pay £35.00" purple button
5. **Processing:** Spinner with "Processing payment..."
6. **Success:** Green checkmark, "Payment of £35.00 confirmed! Receipt sent to [email]"
7. **Failure:** Error message with retry / contact instructor options

#### 5.6.4 Card Management

- Add card: Stripe card element (PCI-compliant, no card data on our servers)
- Update card: replace existing saved card
- Remove card: confirmation alert (note: auto-charge will be disabled)
- Parent: full card management rights — can add their own card to pay for child

#### 5.6.5 Auto-Charge Notifications

- Push notification 48h before auto-charge: *"£35.00 will be charged to your Visa ••4242 tomorrow for [Date] lesson. Tap if you need to update your card."*
- Push notification on charge success: *"£35.00 has been charged for [Date] lesson. Thank you!"*
- Push notification on charge failure: *"Payment failed for [Date] lesson. Please update your card before your lesson."*

---

### 5.7 Communication

#### 5.7.1 Messaging Screen

**Pupil:** Direct thread with instructor
```
┌──────────────────────────────────────────────────────┐
│  ← [Instructor Name]                    📞 🗂️     │
│  ──────────────────────────────────────────────────  │
│                                                      │
│    See you Tuesday at 10am! 👍        10:32 AM      │
│    [Read ✓✓]                                        │
│                                                      │
│  Hi! Will we be doing motorway                       │
│  driving this week?          10:35 AM [Sent ✓]     │
│                                                      │
│  ──────────────────────────────────────────────────  │
│  [Message input...]              [Send]             │
└──────────────────────────────────────────────────────┘
```

**Parent (Verified):** Read-only view of pupil's thread
- Banner: *"You can view messages between Emma and her instructor. Reply is not available."*
- No input field shown
- Can see instructor's messages and pupil's responses

**Parent (Trusted):** Direct message capability with instructor
- Separate thread: "[Parent Name] (Emma's parent)"
- Full messaging with instructor
- Instructor can disable at any time

#### 5.7.2 One-Tap Contact

If instructor has shared phone number:
- 📞 Call button in lesson detail and messaging header
- Tap → native phone dialler
- iOS: shows instructor name, falls back to number
- Android: same behaviour

#### 5.7.3 Message Delivery States
- Sent ✓ → Delivered ✓✓ → Read ✓✓ (blue ticks, Drive Smart driver style)
- "Instructor is typing..." indicator

---

### 5.8 Resources & Learning

#### 5.8.1 Resource Library

**Layout:** Grid of cards, categorised by instructor

**Categories (instructor-configurable):**
- 📋 Pre-Lesson Checklists
- 🎥 How-To Videos
- 📄 Theory Guides
- 🗺️ Local Hazard Guides
- 🏆 Test Preparation

**Resource card:**
```
┌───────────────────┐  ┌───────────────────┐
│  📄                │  │  🎥                │
│  Cockpit Drill    │  │  Parallel Park    │
│  Checklist        │  │  Masterclass      │
│  PDF · 2 pages    │  │  Video · 8 min    │
│  [View]           │  │  [Watch]          │
└───────────────────┘  └───────────────────┘
```

- PDFs: open in-app PDF viewer with pinch-zoom
- Videos: in-app video player (landscape support)
- Links: open in in-app browser

**Parent access:** Full library access after verification. 3D lesson videos behind verification gate.

#### 5.8.2 Theory Tools

**Highway Code Glossary:**
- Searchable A-Z glossary
- A-Z index strip on right edge (iOS-style)
- Each entry: term, definition, relevant road sign image

**Road Sign Quiz:**
- 20-question randomised quiz
- UK road signs multiple choice (4 options)
- Score at end, wrong answers explained
- High score tracking

**Mock Hazard Perception:**
- Uses Drive Smart's pre-loaded video clips
- Score out of 75 (like real HPT)
- Playback of missed hazards after completion

#### 5.8.3 3D Lesson Videos (Instructor-Unlocked)

- Immersive 360° / 3D drive-along videos for key manoeuvres
- Instructor enables per-pupil in Drive Smart dashboard
- Parent access: enabled after verification
- "Locked 🔒" placeholder shown until unlocked

---

### 5.9 Availability (Pupil Only)

#### 5.9.1 Weekly Availability Editor

```
┌──────────────────────────────────────────────────────┐
│  📅 My Availability                                 │
│  ──────────────────────────────────────────────────  │
│  Mon [──────▓▓▓▓▓▓▓▓──────]  9:00 – 17:00         │
│  Tue [──────▓▓▓▓▓▓▓▓──────]  9:00 – 17:00         │
│  Wed [○ Not available]                              │
│  Thu [──────▓▓▓▓▓▓▓▓──────]  9:00 – 17:00         │
│  Fri [──────▓▓────────────]  9:00 – 13:00          │
│  Sat [──▓▓▓▓▓▓──────────]  10:00 – 14:00          │
│  Sun [○ Not available]                              │
│                                                      │
│  [Save Availability]                                │
└──────────────────────────────────────────────────────┘
```

- Drag handles on time range bars to adjust
- Tap day name to toggle available / unavailable
- "+" button to add multiple slots per day (e.g., morning + evening)

#### 5.9.2 Blackout Dates

- Calendar view with tap-to-blackout dates
- Blackout dates shown with grey X overlay
- Add reason (optional): "Holiday", "Exam", "Work", "Other"

#### 5.9.3 Specific Date Overrides

- Tap any date → "Override this date's availability"
- Set different hours just for that date
- Useful for: earlier available on a school half-day, etc.

#### 5.9.4 Sync Status

```
✅ Availability synced with instructor · Last updated 20 May, 10:32 AM
```
- Pulls-to-refresh availability status
- "Instructor acknowledged" state when instructor has viewed latest availability

---

### 5.10 GPS Journey Replay

**Access:** Lesson Detail → "View Route Replay" button (only shown if instructor has GPS enabled AND data is available)

**Player screen:**
```
┌──────────────────────────────────────────────────────┐
│  [Map view — full screen]                           │
│  Route animating in real-time playback              │
│                                                      │
│  [▶️ Play]  [⏸ Pause]  [⏮ Restart]  [1x ▾ Speed]  │
│  ──────────────────────────────────────────────────  │
│  ████████████░░░░░░░░░░░░░░░░░░  32:14 / 1:00:00  │
│                                                      │
│  Speed:  28 mph  |  Duration: 32:14  |  Distance: 8.2 mi │
└──────────────────────────────────────────────────────┘
```

**Features:**
- Playback speed: 0.5x | 1x | 2x | 4x
- Colour-coded route: green (safe speed) | amber (near limit) | red (over limit)
- Tap annotations on map for turn events: "Roundabout — good approach", "Lane change"
- Speed profile graph below map (scrollable time axis)

**Share option (pupil only, if instructor-enabled):**
- Generate shareable link (24h expiry)
- "Share to WhatsApp / Messages" via native share sheet

**Parent view:** Same player, but share button hidden.

---

### 5.11 Refer a Friend

**Referral home screen:**
```
┌──────────────────────────────────────────────────────┐
│  🎁 Refer a Friend, Save on Lessons                 │
│                                                      │
│  Your code: DS-EMMA-4821                            │
│  [Copy]  [Share via WhatsApp]  [Share link]        │
│                                                      │
│  How it works:                                       │
│  1️⃣ Friend downloads Drive Smart                    │
│  2️⃣ They enter your code when registering           │
│  3️⃣ You both get a lesson discount!                 │
│                                                      │
│  Your referrals:                                     │
│  ● Jake Thompson · Registered · Lesson booked ✅    │
│  ○ Sophie Davis · Registered · Not yet booked       │
│  ○ Mike Chen · Sent · Not yet registered            │
└──────────────────────────────────────────────────────┘
```

**Referral states:** Sent | Registered | Lesson Booked | Reward Applied

**Reward display:** Instructor controls discount value (set in Drive Smart dashboard).

---

### 5.12 Learning Journey Feed

**Layout:** Full-screen vertical feed (Instagram/TikTok style, but professional)

**Feed card types:**

**Milestone card:**
```
┌──────────────────────────────────────────────────────┐
│  🏆  Milestone Achieved!              20 May 2025   │
│  ──────────────────────────────────────────────────  │
│  Emma completed her 10th lesson!                    │
│  Total hours: 10.5 hrs                              │
│                                          [Share →]  │
└──────────────────────────────────────────────────────┘
```

**Skill mastered card:**
```
┌──────────────────────────────────────────────────────┐
│  🎯  Skill Mastered: Parallel Parking  18 May 2025  │
│  ──────────────────────────────────────────────────  │
│  Instructor note: "Emma has consistently            │
│  demonstrated excellent parallel parking.           │
│  Ready for test standard."                          │
│                                          [Share →]  │
└──────────────────────────────────────────────────────┘
```

**Reflection summary card:**
```
┌──────────────────────────────────────────────────────┐
│  📝  Emma's Reflection                 15 May 2025  │
│  ──────────────────────────────────────────────────  │
│  Mood: 😊  · Skills: Roundabouts, Junctions       │
│  "Felt much more confident on the dual             │
│  carriageway today..."                              │
│                                                      │
│  💬 1 parent comment (approved)                    │
└──────────────────────────────────────────────────────┘
```

**Parent view:** Feed visible but private reflections hidden; only approved parent comments shown in reflection cards.

**Share milestone:** Native share sheet → WhatsApp, Instagram, copy link (image generated with Drive Smart branding)

---

### 5.13 Settings & Profile

#### 5.13.1 Pupil Settings

**Sections:**
1. **Profile:** Photo (tap to change), Name, Phone, Email (editable)
2. **Security:** Change PIN, Enable/disable biometric login, Active sessions list, "Sign out of all devices"
3. **Notifications:** Toggle per notification type (lesson reminders, payment, messages, progress)
4. **Appearance:** Light / Dark / System mode toggle
5. **Privacy:** GPS sharing (on/off), Social sharing (on/off), Data export request
6. **Language:** English (UK) (additional languages if instructor has enabled white-label)
7. **About:** App version, Privacy Policy, Terms of Service
8. **Sign Out:** Confirmation alert
9. **Delete Account:** Permanent deletion flow with 30-day grace period

#### 5.13.2 Parent Settings

**Additional section:**
- **My Children:** List of linked pupils, verification status for each, "Add another child" (requires new invitation code)
- **Re-verify:** If verification expired, re-submit option

**Verification status card:**
```
┌──────────────────────────────────────────────────────┐
│  Emma Mitchell                                       │
│  [Verified Parent ✓]                                 │
│  Verified since: 1 May 2025                         │
│  Trust level: Trusted Parent ✓                      │
│                                                      │
│  Document: Birth Certificate (verified)             │
│  Phone: ••••••6789 ✓                                │
└──────────────────────────────────────────────────────┘
```

---

## 6. Detailed User Flows

### 6.1 Parent Invitation → Verification → First Access → First Comment

```
INSTRUCTOR (Drive Smart)          PARENT (People Portal)
         │                                 │
         ▼                                 │
[Add Parent to pupil account]             │
[Enter: name, email, phone]               │
[Choose: Standard/Express]                │
         │                                 │
         ▼                                 │
[System sends email + SMS                 │
 with invite code DS-XXXXXX]              │
         │                                 │
         │         ←─── [Parent receives SMS/email]
         │                                 │
         │              [Downloads app]    │
         │                                 │
         │         ←─── [Enters invite code DS-XXXXXX]
         │                                 │
         │              [Phone OTP step]   │
         │         ←─── [OTP verified ✓]  │
         │                                 │
         │              [Email OTP step]   │
         │         ←─── [OTP verified ✓]  │
         │                                 │
         │              [Document upload   │
         │               or consent form]  │
         │         ←─── [Submitted]        │
         │                                 │
         ▼                                 │
[Instructor notified                       │
 "Parent verification pending"]            │
         │                                 │
[Reviews document]                         │
         │                                 │
    ┌────┴────┐                            │
    ▼         ▼                            │
[Approve]   [Reject]─── push notif ──→  [Parent: "Rejected. Re-submit?"]
    │
    ▼
[System updates role:
 verificationStatus = 'approved']
    │
    ├──── push notif ──────────────→  [Parent: "Access approved! ✓"]
    │                                         │
    │                                    [Opens app]
    │                                    [Parent dashboard]
    │                                    [Views Emma's lessons ✓]
    │                                    [Views DVSA progress ✓]
    │                                         │
    │                                    [Finds reflection]
    │                                    [Taps "Add a Comment"]
    │                                    [Types comment]
    │                                    [Taps "Post Comment"]
    │                                         │
    ▼                                         ▼
[Comment → moderation queue]         [Parent sees "Awaiting approval"]
    │
    ▼
[Instructor notified
 "1 comment pending review"]
    │
[Reviews comment]
    │
    ├── [Approve] ──────────────────→  [Parent push: "Comment approved ✓"]
    │                                  [Comment visible on timeline]
    │
    └── [Reject] ───────────────────→  [Parent push: "Comment not approved"]
                                       [Reason shown in app]
```

---

### 6.2 Pupil Lesson Day Flow

```
[Day before lesson]
       │
       ▼
PUSH: "Reminder: Lesson tomorrow at 10:00 AM with [Instructor]"
       │
[Day of lesson]
       │
       ▼
PUSH: "Today's lesson starts in 2 hours! 📍 42 Oak Street"
       │
       ▼ (30 min before lesson)
"Check In" button activates on lesson card
       │
       ▼
[Pupil taps Check In]
       │
[GPS verification: pupil within 500m of pickup location?]
   ┌───┴───┐
   ▼       ▼
Yes        No
   │       │
   │   [Manual check-in
   │    with confirmation]
   ▼       ▼
[Check-in confirmed → instructor notified]
       │
[During lesson]
[Instructor drives, GPS records route]
       │
[After lesson]
       │
       ▼
[Lesson status → Completed]
[GPS replay available (if enabled)]
PUSH: "Lesson complete! Add your reflection while it's fresh 📝"
       │
       ▼
[Pupil adds reflection]
[Skill tags, mood, text]
[Private toggle: off → parent can see]
       │
       ▼
[Reflection saved]
       │
       ▼ (if payment unpaid)
PUSH: "Don't forget: £35 due for today's lesson"
       │
       ▼
[Pupil / Parent pays via app]
[Card charged → receipt emailed]
```

---

### 6.3 Payment Flow (Manual In-App Payment)

```
[Outstanding balance detected]
       │
       ▼
[Payment due alert on dashboard]
       │
[Tap "Pay Now"]
       │
       ▼
[Payment amount screen]
  ┌────────────────────────┐
  │ Lesson: 20 May, 10 AM  │
  │ Duration: 60 min       │
  │ Rate: £35/hr           │
  │ Total: £35.00          │
  │                        │
  │ [Pay £35.00 →]         │
  └────────────────────────┘
       │
[Tap "Pay £35.00"]
       │
       ▼
[Payment method select]
  Card on file: Visa ••4242 (default)
  [+ Add new card]
       │
[Confirm payment]
       │
       ▼
[Stripe processes payment]
       │
   ┌───┴───┐
   ▼       ▼
Success   Failure
   │       │
   │   [Retry / Update card]
   ▼
[✅ Payment confirmed!]
[Lesson status → Paid]
[Receipt emailed to pupil + parent (if parent email on file)]
[Instructor notified in Drive Smart dashboard]
```

---

### 6.4 Comment Moderation Flow

```
[Parent writes comment on reflection]
              │
              ▼
         Is parent Trusted?
         ┌────┴────┐
         ▼         ▼
        Yes        No
         │          │
         ▼          ▼
    [Comment      [Comment
     auto-        status →
     approved]    PENDING]
         │          │
         │          ▼
         │    [Instructor notified
         │     in Drive Smart:
         │     "1 comment pending"]
         │          │
         │    [Instructor reviews]
         │          │
         │     ┌────┴────┐
         │     ▼         ▼
         │  [Approve]  [Reject]
         │     │         │
         ▼     ▼         ▼
    [Comment [Comment [Comment
     visible] visible] stays hidden]
         │     │         │
         │  [Parent:   [Parent:
         │   "Approved ✓"] "Not approved"
         │              + reason]
         ▼
[Comment shown on timeline with:
 - "Trusted Parent ✓" badge (auto-approved)
 - "Verified Parent" badge (manually approved)]
```

---

## 7. Security, Privacy & GDPR

### 7.1 Data Classification

| Data Type | Classification | Storage | Encryption | Retention |
|-----------|---------------|---------|------------|-----------|
| Lesson times/dates | Standard | PostgreSQL | At-rest (AES-256) | 7 years |
| Pupil personal data | Sensitive | PostgreSQL | At-rest + TLS transit | 7 years |
| Parent personal data | Sensitive | PostgreSQL | At-rest + TLS transit | 7 years |
| Verification documents | Highly Sensitive | Supabase Storage (private bucket) | At-rest (AES-256) + signed URLs | 7 years, auto-delete |
| Payment data | PCI Sensitive | Stripe only (never stored locally) | Stripe PCI compliance | Stripe manages |
| GPS route data | Sensitive | PostgreSQL (polyline) | At-rest | 1 year, then anonymised |
| Reflection text | Sensitive | PostgreSQL | At-rest | User controls deletion |
| Private reflection notes | Highly Sensitive | PostgreSQL | At-rest + column-level encryption | User controls deletion |
| Biometric templates | Device-local only | iOS Keychain / Android Keystore | Hardware-level | Never leaves device |
| Push tokens | Standard | PostgreSQL | At-rest | Deleted on sign-out |

### 7.2 Authentication Security

- **Session tokens:** JWT, 30-day expiry for pupils, 7-day for parents (more sensitive role)
- **Refresh tokens:** Rotated on each use, invalidated on sign-out
- **OTP rate limiting:** Max 3 OTP sends per 10 minutes per phone number; 30-minute cooldown after 5 failed attempts
- **PIN lockout:** 5 failed attempts → 30-minute lockout; instructor notified
- **Device binding:** Each device gets a unique device ID registered at login
- **Concurrent sessions:** Max 3 active sessions; "Sign out of all devices" option available

### 7.3 RBAC & Data Access Control

```
JWT structure:
{
  "sub": "user_uuid",
  "role": "pupil | parent",
  "pupil_id": "uuid (for pupils) | null",
  "parent_id": "uuid (for parents) | null",
  "verification_status": "approved | pending | ...",
  "is_trusted_parent": true | false,
  "linked_pupil_ids": ["uuid1", "uuid2"],  // for parents
  "exp": 1234567890
}
```

- All JWT claims set **server-side only** — never accepted from client
- `is_trusted_parent` and `verification_status` can only be changed by instructor service role
- RLS policies check JWT on every database query — no client bypass possible

### 7.4 Document Upload Security

- Upload endpoint validates: file type (JPEG/PNG/PDF only), file size (max 10MB), MIME type (server-side check, not extension)
- Server-side virus scan on every upload (ClamAV or equivalent)
- Documents stored in private Supabase Storage bucket: `verification-docs`
- Access via signed URLs only (expiry: 15 minutes) — no public access
- Access logged: every document view creates an audit log entry
- Documents are **never** accessible to the pupil — only instructor
- Auto-deletion policy: 7-year retention, then permanent deletion job

### 7.5 Privacy Notices

**At document upload, user sees full notice:**
> *"The document you upload will be stored securely and encrypted. It will only be visible to your driving instructor, [Instructor Name], for the purpose of verifying your relationship to [Child Name]. We will never share this document with third parties. You can request its deletion at any time by contacting your instructor. It will be automatically deleted after 7 years in line with UK GDPR."*

### 7.6 GDPR Rights Implementation

| Right | How Implemented |
|-------|----------------|
| Right to access | "Download my data" in Settings — generates JSON export within 72h |
| Right to erasure | "Delete account" — anonymises personal data, deletes documents, retains anonymised lesson statistics |
| Right to rectification | Profile editing in Settings |
| Right to portability | JSON data export includes all personal data |
| Right to restriction | Contact instructor — instructor can restrict processing from Drive Smart dashboard |
| Consent management | Explicit consent collected at registration for: notifications, data processing, sharing with parent |

### 7.7 Private Notes Encryption

Pupil "private" reflections:
- Stored with column-level encryption (pgcrypto)
- Encryption key derived from pupil's PIN (PBKDF2, 100,000 iterations)
- Key never stored server-side — derived fresh on each authenticated session
- If pupil forgets PIN, private notes are **permanently inaccessible** (by design — documented in help)
- Instructor and parents: completely unable to view private notes at any level

### 7.8 Moderation Safety

- Comment character limit: 500 characters
- Profanity filter: server-side screening on submission (flag if triggered, auto-reject extreme cases)
- Flagging: instructors can permanently ban a parent from commenting
- Audit log: every comment approval/rejection logged with instructor ID and timestamp

---

## 8. Notification Strategy

### 8.1 Notification Channels

| Channel | Platform | Use Case |
|---------|----------|----------|
| Push (Expo) | iOS + Android | Time-sensitive alerts |
| In-app | Both | Persistent notification centre |
| Email | Both | Receipts, verification, important updates |
| SMS | Both | OTP, critical payment failures |

### 8.2 Full Notification Matrix

| Trigger | Recipient | Channel | Timing | Example Copy |
|---------|-----------|---------|--------|--------------|
| Lesson scheduled by instructor | Pupil | Push + in-app | Immediate | "New lesson booked: Tue 20 May at 10:00 AM with [Instructor]" |
| Lesson scheduled by instructor | Parent (verified) | Push + in-app | Immediate | "Emma's lesson: Tue 20 May at 10:00 AM" |
| Lesson reminder | Pupil | Push | 24h before | "Tomorrow's lesson at 10:00 AM · 42 Oak Street" |
| Lesson reminder | Parent (verified) | Push | 24h before | "Emma's lesson is tomorrow at 10:00 AM" |
| Lesson cancelled | Pupil | Push + SMS | Immediate | "Lesson cancelled: 20 May at 10:00 AM. Contact instructor for details." |
| Lesson cancelled | Parent (verified) | Push | Immediate | "Emma's lesson on 20 May has been cancelled" |
| Auto-charge upcoming | Pupil/Parent | Push + email | 48h before | "£35 will be charged tomorrow for 20 May lesson" |
| Auto-charge success | Pupil/Parent | Push + email | On charge | "£35 charged successfully. Receipt attached." |
| Auto-charge failed | Pupil/Parent | Push + SMS + email | On failure | "⚠️ Payment failed. Update card before your lesson." |
| Payment received (manual) | Instructor | In-app | Immediate | (in Drive Smart) |
| Parent verification submitted | Instructor | Push (Drive Smart) | Immediate | "[Parent Name] awaiting verification for [Pupil Name]" |
| Parent verification approved | Parent | Push + email | On approval | "Access approved! View Emma's lessons now." |
| Parent verification rejected | Parent | Push + email | On rejection | "Verification needs attention. Open app for details." |
| Comment submitted (pending) | Instructor | In-app (Drive Smart) | Batched hourly | "1 parent comment awaiting review" |
| Comment approved | Parent | Push | On approval | "Your comment on Emma's reflection was approved ✓" |
| Comment rejected | Parent | Push | On rejection | "Your comment wasn't approved. Tap for details." |
| New instructor message | Pupil | Push | Immediate | "[Instructor]: See you tomorrow at 10! 👍" |
| New instructor message | Trusted Parent | Push | Immediate | "New message from [Instructor] about Emma" |
| Theory reminder | Pupil | Push | Weekly (if test booked) | "Theory test in 2 weeks — practice daily!" |
| GPS replay ready | Pupil | In-app | Post-lesson (1h) | "Your route from today's lesson is ready to replay" |
| Referral redeemed | Pupil | Push | On lesson booking | "Jake booked a lesson with your code! Discount applied." |
| Progress milestone | Pupil | Push | On milestone | "🏆 10 lessons completed! You're making great progress." |
| Skill mastered | Pupil | Push | When instructor marks mastered | "🎯 Parallel Parking — Mastered! Added to your journey." |

### 8.3 Notification Preferences

**Pupil can toggle individually:**
- Lesson reminders (default: ON, cannot fully disable — safety)
- Payment alerts (default: ON, cannot disable — contractual)
- New messages (default: ON)
- Progress updates (default: ON)
- Theory reminders (default: ON)
- Marketing / referral (default: OFF, opt-in)

**Parent can toggle individually:**
- Lesson reminders for child (default: ON)
- Payment alerts (default: ON)
- Comment status updates (default: ON)
- Progress milestones (default: ON)

**Quiet hours:** User can set do-not-disturb window (e.g., 10 PM – 8 AM). Non-urgent notifications queued until window ends.

---

## 9. Technical Architecture

### 9.1 Technology Stack

| Layer | Technology | Notes |
|-------|------------|-------|
| Mobile | React Native + Expo SDK 54 | Shared codebase iOS/Android/Web |
| Routing | Expo Router v3 | File-based routing |
| State | Supabase Auth + React Context | No Redux needed |
| Database | Supabase PostgreSQL | Compatible with existing Drive Smart DB |
| Realtime | Supabase Realtime | Messaging, comment status updates |
| File Storage | Supabase Storage | Verification docs, resources, GPS data |
| Payments | Stripe (existing Drive Smart integration) | Shared Stripe customer IDs |
| Notifications | Expo Notifications + send-push edge function | Existing infrastructure |
| Offline | AsyncStorage + sync queue | expo-sqlite for larger offline cache |
| Maps | react-native-maps | Lesson location, GPS replay |
| Video | expo-video | Resource videos, 3D lesson content |
| Biometrics | expo-local-authentication | PIN-linked biometric unlock |

### 9.2 Database Schema Extensions

```sql
-- Parent-pupil links with verification
CREATE TABLE parent_pupil_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid REFERENCES user_profiles(id) ON DELETE CASCADE,
  pupil_id uuid REFERENCES pupils(id) ON DELETE CASCADE,
  instructor_id uuid REFERENCES user_profiles(id) ON DELETE CASCADE,
  relationship text NOT NULL,
  verification_status text NOT NULL DEFAULT 'unverified',
  verification_method text, -- 'standard' | 'express'
  document_type text,
  document_storage_path text, -- private storage path
  invite_code text UNIQUE,
  invite_expires_at timestamptz,
  is_trusted boolean NOT NULL DEFAULT false,
  trusted_since timestamptz,
  verification_submitted_at timestamptz,
  verification_decided_at timestamptz,
  rejection_reason text,
  submit_attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(parent_id, pupil_id)
);

-- Reflections with privacy flag
CREATE TABLE lesson_reflections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pupil_id uuid REFERENCES pupils(id) ON DELETE CASCADE,
  lesson_id uuid REFERENCES lessons(id) ON DELETE SET NULL,
  instructor_id uuid NOT NULL,
  mood integer CHECK (mood BETWEEN 1 AND 5),
  content text NOT NULL,
  is_private boolean NOT NULL DEFAULT false,
  skill_tags jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Parent comments on reflections
CREATE TABLE reflection_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reflection_id uuid REFERENCES lesson_reflections(id) ON DELETE CASCADE,
  parent_link_id uuid REFERENCES parent_pupil_links(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES user_profiles(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (char_length(content) <= 500),
  status text NOT NULL DEFAULT 'pending', -- pending | approved | rejected | auto_approved
  rejection_reason text,
  parent_id_of_reply uuid REFERENCES reflection_comments(id) ON DELETE CASCADE,
  moderated_by uuid REFERENCES user_profiles(id),
  moderated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- GPS journey replay (polyline per lesson)
CREATE TABLE lesson_gps_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid REFERENCES lessons(id) ON DELETE CASCADE,
  instructor_id uuid NOT NULL,
  polyline jsonb NOT NULL, -- array of {lat, lng, speed, timestamp}
  distance_meters integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

### 9.3 Key Edge Functions

| Function | Purpose | Auth |
|----------|---------|------|
| `pupil-login` | Existing — PIN-based pupil auth | None (public) |
| `parent-invite` | Create + send invitation | Instructor service role |
| `parent-verify-submit` | Submit verification documents | Parent JWT |
| `parent-verify-decide` | Approve/reject verification | Instructor JWT |
| `moderate-comment` | Auto-route or queue comment | Parent JWT |
| `moderate-comment-decide` | Instructor approve/reject | Instructor JWT |
| `surprise-lesson` | Trusted parent arrange lesson | Trusted parent JWT |
| `export-user-data` | GDPR data export | Own JWT |
| `delete-account` | GDPR erasure | Own JWT |
| `referral-apply` | Apply referral code on registration | Public |

### 9.4 Realtime Subscriptions

```typescript
// Message thread
supabase
  .channel('messages')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'messages',
    filter: `instructor_id=eq.${instructorId}`
  }, handleNewMessage)
  .subscribe();

// Comment status updates (for parent)
supabase
  .channel('comment-status')
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'reflection_comments',
    filter: `parent_id=eq.${parentId}`
  }, handleCommentUpdate)
  .subscribe();

// Verification status (for parent pending verification)
supabase
  .channel('verification')
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'parent_pupil_links',
    filter: `parent_id=eq.${parentId}`
  }, handleVerificationUpdate)
  .subscribe();
```

### 9.5 Offline Support

| Feature | Offline Behaviour |
|---------|------------------|
| My Lessons | Cached AsyncStorage, shows "last synced" timestamp |
| Progress | Cached, read-only, refresh on reconnect |
| Reflections | Write to local queue, sync on reconnect |
| Payments | Block with "Internet required for payments" |
| Messaging | Show cached thread, block sending with notice |
| Availability | Edit offline, sync on reconnect with conflict detection |
| Verification | Block — requires online (security requirement) |
| GPS replay | Downloaded post-lesson, playable offline |

### 9.6 White-Label Configuration

Instructors can configure from Drive Smart dashboard:
- School name (replaces "Drive Smart" in portal)
- School logo (replaces Drive Smart logo)
- Primary accent colour (replaces purple `#7C3AED`)
- Instructor contact number visibility
- Feature toggles: GPS replay, 3D videos, referral, social sharing

Config delivered as JSON payload on login, applied to ThemeContext.

---

## 10. Implementation Phasing

### Phase 1 — MVP Core (Estimated: 6 weeks)

**Goal:** Pupils can log in, view lessons, see progress, pay, and message instructor.

| Feature | Screens | Priority |
|---------|---------|----------|
| Pupil login (PIN + OTP) | Login, Role select | P0 |
| Home dashboard (pupil) | Dashboard | P0 |
| My Lessons (view only) | Lessons list, Detail | P0 |
| DVSA Progress ring | Progress screen | P0 |
| In-app payments | Payment screen, Card management | P0 |
| Messaging (pupil ↔ instructor) | Messages screen | P0 |
| Notification centre | Notifications screen | P0 |
| Profile + Settings | Settings screen | P1 |
| Availability editor | Availability screen | P1 |
| GPS check-in on lesson day | Check-in button | P1 |

**Ship criteria:** ≥ 200 beta testers; 0 P0 bugs; Stripe payments processing in production.

---

### Phase 2 — Parent Portal (Estimated: 4 weeks)

**Goal:** Full parent role with verification, dashboard, and moderated comments.

| Feature | Screens | Priority |
|---------|---------|----------|
| Parent invitation code flow | Invitation entry | P0 |
| Phone + email OTP verification | Verification step 3a/3b | P0 |
| Document upload | Verification step 3c | P0 |
| Verification submission + status | Verification step 3d | P0 |
| Instructor review queue (Drive Smart) | (Drive Smart app) | P0 |
| Parent dashboard | Parent home | P0 |
| Parent lesson view (read-only) | Lessons (parent) | P0 |
| Parent payment screen | Payments (parent) | P0 |
| Parent comment on reflections | Reflections screen | P1 |
| Comment moderation queue (Drive Smart) | (Drive Smart app) | P1 |
| Trusted parent promotion (Drive Smart) | (Drive Smart app) | P1 |

---

### Phase 3 — Enhanced Features (Estimated: 4 weeks)

**Goal:** Engage and retain users with rich learning tools.

| Feature | Priority |
|---------|----------|
| GPS journey replay | P1 |
| Resource library (PDF + Video) | P1 |
| Theory tools (quiz, Highway Code) | P1 |
| Learning Journey feed | P2 |
| Refer a Friend | P2 |
| Surprise lesson (Trusted Parent) | P2 |
| 3D lesson videos | P2 |
| Progress certificate download | P2 |

---

### Phase 4 — Polish & Submission (Estimated: 2 weeks)

**Goal:** App Store and Google Play submission quality.

| Task | Priority |
|------|----------|
| Dark mode full implementation | P1 |
| Accessibility (VoiceOver / TalkBack) | P0 |
| Performance profiling (< 100ms interactions) | P1 |
| Offline mode UX polish | P1 |
| Onboarding carousels | P2 |
| App Store metadata (screenshots, description) | P0 |
| Privacy policy + terms in-app | P0 |
| GDPR consent flows | P0 |
| TestFlight + Firebase App Distribution beta | P0 |
| App Store Connect + Google Play Console submission | P0 |

---

## Appendix A: Copy & Microcopy Library

### Empty States

| Screen | Condition | Copy |
|--------|-----------|------|
| My Lessons → Upcoming | No lessons booked | "No upcoming lessons — your instructor will schedule soon. Make sure your availability is up to date." |
| My Lessons → Past | No completed lessons | "No completed lessons yet — your journey starts soon!" |
| Reflections | No reflections added | "No reflections yet. After your first lesson, jot down how it went!" |
| Learning Journey | No milestones | "Your journey begins with your first lesson. Keep going!" |
| Payments | No payment history | "No payments yet — they'll appear here after your first lesson." |
| Messages | New conversation | "Say hello to your instructor! Ask any questions before your first lesson." |

### Error States

| Error | Copy |
|-------|------|
| Network offline | "No internet connection. Some features are unavailable. Pull down to retry." |
| Payment failed | "Payment didn't go through. Please check your card details and try again, or contact your instructor." |
| OTP expired | "That code has expired. Tap Resend to get a new one." |
| Verification rejected | "Your verification wasn't approved. Your instructor has provided a reason below. You can re-submit with a clearer document." |
| Document upload failed | "Upload failed — file may be too large (max 10MB) or an unsupported format. Try JPEG, PNG, or PDF." |

### Action Button Labels

| Action | Label |
|--------|-------|
| Primary payment | "Pay £[amount]" |
| Check in | "Check In Now" |
| Submit verification | "Submit for Review" |
| Post parent comment | "Post Comment" |
| Download receipt | "Receipt PDF" |
| Share milestone | "Share Achievement" |
| Request GPS replay | "View Route Replay" |

---

## Appendix B: Accessibility Requirements

| Requirement | Standard | Implementation |
|-------------|----------|----------------|
| Colour contrast | WCAG 2.1 AA (4.5:1 minimum) | All text on backgrounds verified |
| Text scaling | Support up to 200% system text size | Dynamic font sizes with `accessibilitySize` |
| Screen reader | Full VoiceOver (iOS) + TalkBack (Android) | `accessibilityLabel` on all interactive elements |
| Touch targets | Minimum 44×44pt | All buttons, pills, and chips |
| Focus order | Logical reading order | TabIndex / AccessibilityOrder reviewed |
| Error identification | Not colour-alone | Error icons + text + colour |
| Language | `lang` attribute set | English (UK) locale |
| Motion | Respect `reduceMotion` | All animations check `AccessibilityInfo.isReduceMotionEnabled` |

---

*End of Specification — DRIVE SMART People Portal v1.0.0*  
*Generated by OnSpace AI · May 2026*
