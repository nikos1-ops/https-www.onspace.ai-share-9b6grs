# Drive Smart — Google Play Store Metadata

Complete reference for filling out the Google Play Console store listing, data safety form, and release configuration.

---

## 1. App Identity

| Field | Value |
|-------|-------|
| **App Name (50 chars)** | `Drive Smart – Driving Instructor App` |
| **Package Name** | `com.drivesmart.instructorapp` |
| **Default Language** | English (United Kingdom) |
| **App or Game** | App |
| **Free or Paid** | Free (with subscription) |
| **Category** | Education |
| **Tags** | scheduling, education, productivity |
| **Content Rating** | Everyone |
| **Target Age** | Adults (18+) |

---

## 2. Store Listing

### Short Description (80 chars max)
```
Schedule lessons, manage pupils, track payments & optimise your routes.
```

### Full Description (4000 chars max — paste verbatim)
```
Drive Smart is the ultimate app for professional driving instructors. Manage every aspect of your teaching business from one powerful, beautifully designed app.

🗓 SMART LESSON SCHEDULING
AI-powered weekly scheduling fits lessons around your availability and your pupils' preferences. Drag to reorder, detect conflicts instantly, and confirm your week with one tap.

⚡ FILL GAP LESSONS INSTANTLY
Broadcast a gap in your diary to all your pupils at once. The first to tap "Claim" gets the slot — automatically added to your diary. Stop losing income to cancelled lessons.

👥 PUPIL MANAGEMENT
Manage up to 50 pupils with complete profiles, progress tracking across all DSA categories, theory test status, and test dates. All in one place.

💳 PAYMENTS & EARNINGS
Track lesson payments, see weekly earnings at a glance, and charge cards automatically 48 hours before each lesson via Stripe. No more chasing payments.

🗺 ROUTE OPTIMISATION
See driving times between lesson locations using real road data. Plan your day to minimise dead miles and maximise lessons.

🔔 INSTANT NOTIFICATIONS
Pupils check in, confirm payments, and send messages — you get instant push notifications so nothing falls through the cracks.

📱 PUPIL APP INCLUDED
Your pupils get their own companion app to view their lessons, set availability, message you, confirm payments, and track their own progress — all for free.

WHO IS DRIVE SMART FOR?
Drive Smart is built for UK ADIs (Approved Driving Instructors) and trainee PDIs who want a professional, modern tool to run their business — not a spreadsheet.

WHAT'S INCLUDED IN THE FREE TRIAL?
Everything. The full app for 7 days — no credit card required. After the trial, continue with a monthly subscription.

PRIVACY & SECURITY
All data is encrypted in transit and at rest. Your pupils' data never leaves the Drive Smart platform. Full GDPR-compliant data deletion available in Settings.

Contact: support@drivesmartapp.co.uk
Website: https://drivesmartapp.co.uk
Privacy Policy: https://drivesmartapp.co.uk/privacy
```

---

## 3. Screenshots & Graphics

### Required Sizes (Phone)
| Type | Size | Notes |
|------|------|-------|
| Phone screenshots | min 2, max 8 | 1080×1920 or 1440×2560 recommended |
| Feature Graphic | 1024×500px | `assets/screenshots/feature-graphic.png` |
| App Icon | 512×512px PNG | Derived from `assets/images/drive-smart-icon.jpg` |

### Recommended Screenshot Order
| # | Screen | Caption |
|---|--------|---------|
| 1 | Dashboard | "Your Week, Perfectly Planned" |
| 2 | Diary — weekly view | "Smart Lesson Scheduling" |
| 3 | Pupils list | "Manage All Your Pupils" |
| 4 | Gap lesson broadcast | "Fill Gap Lessons Instantly" |
| 5 | Pupil login | "Free App for Your Pupils" |
| 6 | Notifications | "Never Miss a Thing" |

### Promo Video (Optional but Recommended)
- Length: 30–120 seconds (30s ideal for Play Store)
- Format: MP4, minimum 1080p
- Script outline:
  1. 0–5s: App icon + "Drive Smart" name card
  2. 5–15s: Dashboard → Weekly Diary drag-reorder
  3. 15–22s: Smart Schedule running → route map
  4. 22–27s: Gap lesson broadcast → pupil claims slot
  5. 27–30s: Pupil app login → lessons visible → CTA

---

## 4. Contact Details (Play Console)

| Field | Value |
|-------|-------|
| **Email** | support@drivesmartapp.co.uk |
| **Website** | https://drivesmartapp.co.uk |
| **Phone** | (optional — can leave blank) |
| **Privacy Policy URL** | https://drivesmartapp.co.uk/privacy |

---

## 5. Content Rating Questionnaire

Answer as follows in the Google Play content rating questionnaire:

| Question | Answer |
|----------|--------|
| Violence | None |
| Sexual content | None |
| Profanity | None |
| Controlled substances | None |
| Location sharing | No (addresses stored, not live GPS) |
| Personal/financial info | Yes — email, payment info |
| Digital purchases | Yes — subscription |
| User-generated content | Yes — messages between instructor/pupils |

**Expected rating:** Everyone (E)

---

## 6. Data Safety Form

Complete the Google Play Data Safety section as follows.

### Does your app collect or share any of the required data types?
**Yes.**

---

### Data Collected and Shared

#### Personal Info
| Data Type | Collected | Shared | Purpose | Optional? |
|-----------|-----------|--------|---------|-----------|
| Name | Yes | No | Account management, pupil records | No |
| Email address | Yes | No | Authentication, account recovery | No |

#### Financial Info
| Data Type | Collected | Shared | Purpose | Optional? |
|-----------|-----------|--------|---------|-----------|
| Payment info | Yes | Yes (Stripe only) | Lesson payment processing | No |
| Purchase history | Yes | No | Payment tracking within app | No |

#### Location
| Data Type | Collected | Shared | Purpose | Optional? |
|-----------|-----------|--------|---------|-----------|
| Approximate location | No | No | — | — |
| Precise location | No | No | — | — |

> **Note:** Drive Smart does NOT collect device GPS. Lesson addresses are manually entered by the instructor and stored as text. Routing calculations are performed using stored postcodes/addresses via Nominatim — no device location permission is used on Android.

#### App Activity
| Data Type | Collected | Shared | Purpose | Optional? |
|-----------|-----------|--------|---------|-----------|
| App interactions | Yes | No | Crash reporting, app improvement | Yes |

#### App Info and Performance
| Data Type | Collected | Shared | Purpose | Optional? |
|-----------|-----------|--------|---------|-----------|
| Crash logs | Yes | No | Bug fixing | No |

---

### Data Security Answers

| Question | Answer |
|----------|--------|
| Is all user data encrypted in transit? | Yes |
| Do you provide a way for users to request data deletion? | Yes — Settings → Delete Account |
| Does the app follow Families Policy? | No |

---

## 7. In-App Products / Subscriptions

### Creating the Subscription in Google Play Console

1. Go to **Monetize → Products → Subscriptions**
2. Click **Create subscription**
3. Fill in:
   - **Product ID:** `drivesmart_pro_monthly`
   - **Name:** Drive Smart Pro
   - **Description:** Full access to Drive Smart — smart scheduling, pupil management, payments & route optimisation.
4. Add a **Base Plan:**
   - Billing period: Monthly
   - Price: £9.99/month (then set regional pricing)
   - Grace period: 3 days
5. Add a **Free Trial offer:**
   - Duration: 7 days
   - Eligibility: New subscribers only
6. **Activate** the subscription

### Linking to RevenueCat
1. In RevenueCat Dashboard → Apps → Drive Smart (Android)
2. Products → Add Product → paste `drivesmart_pro_monthly`
3. Attach to Entitlement `drivesmart_pro`

---

## 8. Release Track Strategy

| Track | Purpose | Who Has Access |
|-------|---------|----------------|
| Internal Testing | First build validation | Up to 100 internal testers (your team) |
| Closed Testing (Alpha) | Pre-launch QA | Named testers (invite by email) |
| Open Testing (Beta) | Public beta — opt-in | Any Play Store user |
| Production | Public release | All users |

### Recommended Rollout
1. Upload AAB → Internal Testing
2. After passing internal QA → promote to Closed Testing (invite 10–20 beta testers)
3. After 48–72h with no critical crashes → promote to Production with **10% staged rollout**
4. Monitor Android Vitals (crash rate, ANR rate) for 24h
5. If crash rate < 1%, promote to **100% rollout**

---

## 9. Android Build Commands

```bash
# Build Android App Bundle (AAB) for Play Store
eas build --profile production --platform android

# Submit AAB directly to Google Play (internal track)
eas submit --profile production --platform android

# Build APK for direct install testing (preview profile)
eas build --profile preview --platform android
```

### Google Service Account Setup (for eas submit)
Required for automated Play Store submissions via `eas submit`:

1. Go to [Google Play Console](https://play.google.com/console) → Setup → API access
2. Link to a Google Cloud Project
3. Create a Service Account with **Release Manager** role
4. Download the JSON key
5. Save as `google-service-account.json` in project root (git-ignored)
6. `eas.json` already references `"serviceAccountKeyPath": "./google-service-account.json"`

---

## 10. Android App Signing

EAS Build manages Android signing automatically via **EAS-managed keystore**. The keystore is stored securely in EAS and used on every production build.

To verify:
```bash
eas credentials --platform android
```

**Important:** If you ever need to migrate away from EAS, export your keystore:
```bash
eas credentials --platform android
# Choose: Download keystore
```
Store the exported keystore + passwords in a secure location (password manager or encrypted backup).

---

## 11. Google Play Review Notes Template

Paste this into the Google Play Console review notes field:

```
Drive Smart is a lesson scheduling and pupil management app for UK driving instructors.

REVIEWER INSTRUCTIONS:
1. Tap "Sign In as Instructor" on the login screen
2. Email: reviewer@drivesmart-demo.com
3. Password: DriveSmart2024!

The account is pre-loaded with 5 demo pupils, 10 scheduled lessons, and 3 sample messages.

To test the Pupil app:
1. Sign out (Settings → Sign Out)
2. Tap "Sign In as Pupil"
3. Email: emma.johnson@drivesmart-demo.com
4. PIN: 1234

SUBSCRIPTION: The app uses RevenueCat for subscriptions. The free trial is 7 days. No charge occurs during review.

LOCATION: The app does NOT request device location permissions. Lesson addresses are entered manually by the instructor.

PAYMENTS: Stripe integration is in live mode but no real charges are made during the review flow — the demo account has no payment method attached.

Support email: support@drivesmartapp.co.uk
Privacy policy: https://drivesmartapp.co.uk/privacy
```

---

## 12. Android Vitals Targets (Post-Launch)

Monitor these in Play Console → Android Vitals:

| Metric | Target | Action if Exceeded |
|--------|--------|-------------------|
| Crash rate | < 1% | Hotfix + OTA update |
| ANR rate | < 0.47% | Profile JS thread, reduce main-thread work |
| Slow rendering | < 25% | Optimise FlatList, reduce re-renders |
| Excessive wakeups | < 10/hour | Review background polling intervals |
| Excessive background battery | — | Review location and network polling |
