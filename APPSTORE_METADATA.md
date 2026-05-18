# Drive Smart — App Store Metadata

## App Identity

**App Name:** Drive Smart – Driving Instructor  
**Bundle ID (iOS):** com.drivesmart.instructorapp  
**Package (Android):** com.drivesmart.instructorapp  
**Category:** Education (primary) / Utilities (secondary)  
**Price:** Subscription (7-day free trial)  
**Content Rating:** 4+ (iOS) / Everyone (Android)

---

## Titles & Subtitles

### Apple App Store
- **Title (30 chars max):** `Drive Smart – Instructor`
- **Subtitle (30 chars max):** `Lesson scheduling & pupil mgmt`

### Google Play Store
- **Title (50 chars max):** `Drive Smart – Driving Instructor App`
- **Short Description (80 chars):** `Schedule lessons, manage pupils, track payments & optimise your routes.`

---

## Long Description

### Apple App Store / Google Play (Lead with benefits)

Drive Smart is the ultimate app for professional driving instructors. Manage every aspect of your teaching business from one powerful, beautifully designed app.

**SMART LESSON SCHEDULING**
AI-powered weekly scheduling fits lessons around your availability and your pupils' preferences. Drag to reorder, detect conflicts instantly, and confirm your week with one tap.

**FILL GAP LESSONS INSTANTLY**
Broadcast a gap in your diary to all your pupils at once. The first to tap "Claim" gets the slot — automatically added to your diary. Stop losing income to cancelled lessons.

**PUPIL MANAGEMENT**
Manage up to 50 pupils with complete profiles, progress tracking across all DSA categories, theory test status, and test dates. All in one place.

**PAYMENTS & EARNINGS**
Track lesson payments, see weekly earnings at a glance, and charge cards automatically 48 hours before each lesson via Stripe. No more chasing payments.

**ROUTE OPTIMISATION**
See driving times between lesson locations using real road data. Plan your day to minimise dead miles and maximise lessons.

**INSTANT NOTIFICATIONS**
Pupils check in, confirm payments, and send messages — you get instant push notifications so nothing falls through the cracks.

**PUPIL APP INCLUDED**
Your pupils get their own companion app to view their lessons, set availability, message you, confirm payments, and track their own progress — all for free.

**PREMIUM DARK DESIGN**
Built for professional instructors who want a premium, modern tool. Dark theme with red and gold branding — looks great day or night.

---

## Keywords

### Apple (100 characters total — comma-separated, no spaces after commas)
```
driving instructor,driving lessons,lesson scheduler,pupil management,driving school,smart schedule
```

### Google Play (weave naturally into description)
- driving instructor app
- driving lessons scheduler  
- pupil management app
- lesson booking app
- driving school software
- smart driving instructor
- ADI app
- DVSA driving instructor

---

## Screenshots Order (Priority)

| # | Screen | Overlay Text | Device |
|---|--------|-------------|--------|
| 1 | Login / Sign In As | *none — strong branding* | 6.5" iPhone |
| 2 | Dashboard | "Smart Scheduling" | 6.5" iPhone |
| 3 | Pupils list | "Manage All Your Pupils" | 6.5" iPhone |
| 4 | Gap Lesson messages | "Fill Gap Lessons Instantly" | 6.5" iPhone |
| 5 | Diary weekly view | "Your Week, Perfectly Planned" | 6.5" iPhone |
| 6 | Pupil login | "Free App for Your Pupils" | 6.5" iPhone |
| 7 | Notifications | "Never Miss a Thing" | 6.5" iPhone |
| 8 | Settings / earnings | "Track Every Penny" | 6.5" iPhone |

### Generated Screenshot Files
- `assets/screenshots/login-appstore-hd.png` — Sign In As screen (no overlay)
- `assets/screenshots/pupil-login-appstore-hd.png` — Pupil login (no overlay)
- `assets/screenshots/dashboard-appstore-new.png` — Dashboard (no overlay)
- `assets/screenshots/ss-appstore-dashboard-overlay.png` — Dashboard with "Smart Scheduling" overlay
- `assets/screenshots/ss-appstore-pupils-overlay.png` — Pupils with "Manage All Your Pupils" overlay
- `assets/screenshots/ss-appstore-gap-lesson-overlay.png` — Messages with "Fill Gap Lessons Instantly" overlay

---

## App Icon Variants
- `assets/images/drive-smart-icon.jpg` — Production icon (current)
- `assets/images/icon-variant-strong-glow.png` — Strong gold glow variant

---

## Privacy Policy Requirements
Sections required (use Termly or similar):
- Data collected: name, email, location (lesson routing), payment info
- Third-party services: Supabase (database), Stripe (payments), Expo (push notifications), RevenueCat (subscriptions)
- Data retention and deletion (GDPR Article 17 — already implemented in app)
- Contact email for data requests

Suggested URL: `https://drivesmartapp.co.uk/privacy`

---

## Review Credentials (Required for App Store submission)
Provide the credentials below to Apple/Google reviewers. All data is pre-seeded in the database — no manual setup needed.

### Instructor Account (tap "Sign In as Instructor")
| Field | Value |
|-------|-------|
| Email | `reviewer@drivesmart-demo.com` |
| Password | `DriveSmart2024!` |

The instructor account is pre-loaded with 5 demo pupils, 10 lessons across the current and next week, and 3 sample messages (including a gap lesson broadcast).

### Pupil Accounts (tap "Sign In as Pupil")
All 5 pupils are linked to the reviewer instructor above. Use any of the following to test the pupil-side app:

| Pupil Name | Email | PIN | Status |
|------------|-------|-----|--------|
| Emma Johnson | `emma.johnson@drivesmart-demo.com` | `1234` | Active — 2 lessons/week, roundabout focus |
| James Smith | `james.smith@drivesmart-demo.com` | `2345` | Test booked — mock test stage |
| Sophie Williams | `sophie.williams@drivesmart-demo.com` | `3456` | Active — early learner |
| Ryan Davies | `ryan.davies@drivesmart-demo.com` | `4567` | Active — 2-hour intensive sessions |
| Charlotte Evans | `charlotte.evans@drivesmart-demo.com` | `5678` | Active — fast progress |

**Reviewer flow suggestion:**
1. Log in as instructor → browse the Weekly Diary, Pupils list, Messages, and Dashboard
2. Sign out → tap "Sign In as Pupil" → use Emma Johnson's credentials to see upcoming lessons, messages, and DSA progress
3. Sign out as pupil → log back in as instructor to see the full workflow

---

## Subscription Setup

### RevenueCat Product IDs
- **Monthly:** `drivesmart_pro_monthly`
- **Annual (if added):** `drivesmart_pro_annual`
- **Free Trial:** 7 days (configured in App Store Connect / Google Play Console)
- **Entitlement:** `drivesmart_pro`

### App Store Connect Setup
1. Go to App Store Connect → My Apps → Drive Smart
2. Features → In-App Purchases → Create Subscription Group: "Drive Smart Pro"
3. Add product: Monthly Auto-Renewable, £9.99/month (suggested), 7-day free trial
4. Submit for review alongside first app submission

### Google Play Console Setup
1. Monetize → Products → Subscriptions
2. Create subscription: `drivesmart_pro_monthly`
3. Set base plan, free trial period (7 days), and regional pricing

---

## Localization Priority
1. 🇬🇧 English (UK) — primary
2. 🇺🇸 English (US) — change "£" references, "driving instructor" → "driving teacher"
3. 🇦🇺 English (AU) — similar to UK
4. 🇩🇪 German — large ADI market

---

## A/B Testing Ideas (App Store Connect Product Page Optimization)
- Test: Login screen vs Dashboard as first screenshot
- Test: "Smart Scheduling" vs "AI-Powered Scheduling" overlay text
- Test: Subtitle "Lesson scheduling & pupil mgmt" vs "For professional ADIs"

---

## ASO Checklist
- [ ] All screenshots uploaded (6.5" iPhone required, 5.5" optional, iPad 12.9" for Apple)
- [ ] App icon uploaded at 1024×1024px PNG (no alpha)
- [ ] Privacy policy URL added
- [ ] Age rating questionnaire completed
- [ ] Review credentials added to App Review Information
- [ ] Subscription product created and linked
- [ ] Export compliance answered (No encryption beyond HTTPS)
- [ ] Content rights confirmed
- [ ] First build uploaded via EAS or Xcode
