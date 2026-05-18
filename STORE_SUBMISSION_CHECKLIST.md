# Drive Smart — Store Submission Checklist

Complete every item in order before submitting to the App Store and Google Play.

---

## 1. Pre-Build Configuration

### Environment Variables
- [ ] `.env` exists locally with real `EXPO_PUBLIC_*` values (never committed)
- [ ] `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` are set
- [ ] `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` is set to `pk_live_...` (not test key)
- [ ] `EXPO_PUBLIC_REVENUECAT_IOS_KEY` is set to `appl_...` production key
- [ ] `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` is set to `goog_...` production key
- [ ] `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` is set to production key (restricted to bundle IDs)

### EAS Secrets (server-side, never in .env)
```bash
eas secret:create --scope project --name STRIPE_SECRET_KEY --value sk_live_...
eas secret:create --scope project --name SUPABASE_SERVICE_ROLE_KEY --value eyJ...
eas secret:create --scope project --name REVENUECAT_API_KEY --value rc_...
eas secret:create --scope project --name GOOGLE_MAPS_API_KEY --value AIzaSy...
```
- [ ] `STRIPE_SECRET_KEY` → `sk_live_...` configured in EAS Secrets
- [ ] `SUPABASE_SERVICE_ROLE_KEY` configured in EAS Secrets
- [ ] `REVENUECAT_API_KEY` configured in EAS Secrets
- [ ] `GOOGLE_MAPS_API_KEY` (server-side) configured in EAS Secrets

### RevenueCat Dashboard
- [ ] Entitlement `drive_smart_pro` created in RevenueCat dashboard
- [ ] Product `drivesmart_pro_monthly` configured in RevenueCat dashboard
- [ ] 7-day free trial configured on the product
- [ ] App Store Connect and Google Play products linked to RevenueCat

### Stripe Production Setup
- [ ] Stripe account is in live mode (not test mode)
- [ ] `charge-lesson` edge function has `STRIPE_SECRET_KEY=sk_live_...` via EAS Secret
- [ ] Stripe webhook is configured for `payment_intent.succeeded` (if needed)
- [ ] Test a real charge in production before submission

---

## 2. App Store Connect (iOS)

### App Information
- [ ] App name: `Drive Smart – Driving Instructor` (matches `app.json`)
- [ ] Bundle ID: `com.drivesmart.instructorapp` (matches `eas.json`)
- [ ] SKU: `com.drivesmart.app`
- [ ] Primary language: English (UK)
- [ ] Category: Education (Primary), Utilities (Secondary)
- [ ] Content rating: 4+

### Version Information
- [ ] Version: 1.0.0
- [ ] Build number: (auto-incremented by EAS)
- [ ] What's New in This Version: written

### Screenshots
- [ ] 6.5" iPhone screenshots uploaded (5–10 required)
  - `assets/screenshots/login-appstore-hd.png`
  - `assets/screenshots/dashboard-appstore-new.png`
  - `assets/screenshots/ss-appstore-dashboard-overlay.png`
  - `assets/screenshots/ss-appstore-pupils-overlay.png`
  - `assets/screenshots/ss-appstore-gap-lesson-overlay.png`
  - `assets/screenshots/pupil-login-appstore-hd.png`
- [ ] App icon uploaded: 1024×1024px PNG, no alpha channel
  - Source: `assets/images/icon-store.png`

### Metadata
- [ ] Description: copy from `APPSTORE_METADATA.md`
- [ ] Keywords (100 chars): `driving instructor,driving lessons,lesson scheduler,pupil management,driving school,smart schedule`
- [ ] Subtitle (30 chars): `Lesson scheduling & pupil mgmt`
- [ ] Support URL: `https://drivesmartapp.co.uk/support`
- [ ] Privacy Policy URL: `https://drivesmartapp.co.uk/privacy`
- [ ] Marketing URL: `https://drivesmartapp.co.uk` (optional)

### App Review Information
- [ ] Review credentials added:
  - Email: `reviewer@drivesmart-demo.com`
  - Password: `DriveSmart2024!`
- [ ] Demo notes added (see `APPSTORE_METADATA.md` for full reviewer flow)
- [ ] Contact info filled in

### In-App Purchases / Subscriptions
- [ ] Subscription group created: `Drive Smart Pro`
- [ ] Product `drivesmart_pro_monthly` created as Auto-Renewable Subscription
- [ ] Free trial: 7 days
- [ ] Price: £9.99/month (or your chosen price)
- [ ] Subscription linked to app and submitted for review
- [ ] Localizations added (at minimum: English UK)

### Privacy Labels (App Privacy)
Mark the following as **collected and used**:
- [ ] Contact Info → Email Address (account management)
- [ ] Identifiers → User ID (analytics + Stripe)
- [ ] Location → Coarse Location (lesson routing — NOT linked to identity)
- [ ] Financial Info → Payment Info (Stripe — linked to identity)
- [ ] Usage Data → Product Interaction (analytics)

Mark the following as **NOT collected**:
- [ ] Health & Fitness
- [ ] Browsing History
- [ ] Search History
- [ ] Sensitive Info

### Compliance
- [ ] Export Compliance: Select "No" — app uses standard HTTPS encryption only
  (Set `ITSAppUsesNonExemptEncryption: false` — already set in `app.json`)
- [ ] Content Rights: confirm you own or have licensed all content
- [ ] Advertising Identifier (IDFA): No — app does not use IDFA

---

## 3. Google Play Console (Android)

### App Setup
- [ ] App name: `Drive Smart – Driving Instructor App`
- [ ] Package: `com.drivesmart.instructorapp` (matches `eas.json`)
- [ ] Default language: English (United Kingdom)
- [ ] App or Game: App
- [ ] Free or Paid: Free (with subscription)

### Store Listing
- [ ] Short description (80 chars): `Schedule lessons, manage pupils, track payments & optimise your routes.`
- [ ] Full description: copy from `APPSTORE_METADATA.md`
- [ ] Screenshots uploaded (minimum 2, recommended 4–8):
  - Phone screenshots (at least 2 required)
- [ ] Feature graphic: `assets/screenshots/feature-graphic.png` (1024×500px)
- [ ] App icon: 512×512px PNG

### Content Rating
- [ ] Complete content rating questionnaire → target rating: Everyone

### Privacy Policy
- [ ] Privacy policy URL added: `https://drivesmartapp.co.uk/privacy`

### In-App Products / Subscriptions
- [ ] Subscription `drivesmart_pro_monthly` created in Google Play Console
- [ ] Base plan configured (monthly, £9.99 or equivalent)
- [ ] 7-day free trial configured
- [ ] Subscription linked to RevenueCat

### Data Safety Form
- [ ] Location: No (app does not collect device GPS — routing uses stored addresses)
- [ ] Financial Info: Yes — payment info (Stripe, encrypted, not shared)
- [ ] Personal Info: Yes — email (required for account), name
- [ ] Data Deletion: Yes — via Settings → Delete Account (in-app)
- [ ] Data encrypted in transit: Yes
- [ ] Data collected for required app functionality: Yes

### Release Track
- [ ] Initial release: Internal Testing track
- [ ] Promote to: Closed Testing (alpha) → Open Testing (beta) → Production

---

## 4. EAS Build Commands

### Step-by-step build and submit

```bash
# 1. Login to EAS
eas login

# 2. Verify EAS project is linked
eas project:info

# 3. Check secrets are configured
eas secret:list

# 4. Run TypeScript check
npx tsc --noEmit

# 5. Build iOS production (uploads to App Store Connect automatically)
eas build --profile production --platform ios

# 6. Build Android production (uploads to Google Play automatically)
eas build --profile production --platform android

# 7. Submit iOS to App Store Connect
eas submit --profile production --platform ios

# 8. Submit Android to Google Play (internal track)
eas submit --profile production --platform android

# 9. After successful build — push OTA update channel
eas update --channel production --message "Initial release 1.0.0"
```

### Preview / Testing Builds
```bash
# iOS TestFlight internal build
eas build --profile preview --platform ios

# Android APK for direct install testing
eas build --profile preview --platform android
```

---

## 5. Post-Submission Checklist

- [ ] Monitor App Store Connect → My Apps → Activity for review status
- [ ] Monitor Google Play Console → Release → Release dashboard
- [ ] Supabase edge functions deployed and responding:
  - `pupil-login`, `pupil-data`, `pupil-update`, `pupil-message`
  - `charge-lesson`, `setup-payment`, `save-payment-method`
  - `optimize-schedule`, `lesson-reminders`, `send-push`
  - `travel-times`
- [ ] Push notification certificates configured in Supabase → Edge Functions → send-push
- [ ] Reviewer demo account (`reviewer@drivesmart-demo.com`) is seeded and working
- [ ] Stripe live mode payments tested end-to-end
- [ ] RevenueCat entitlement `drive_smart_pro` tested on real device

---

## 6. Post-Launch OTA Update Process

After the app is live, push JS-only fixes without a new App Store review:

```bash
# Fix a bug in JS layer — no native changes
eas update --channel production --message "Bug fix: <description>"

# Preview channel for internal testing before production
eas update --channel preview --message "Testing fix"
```

**OTA is NOT possible for:**
- Changes to `app.json` (native config)
- New native modules / plugins
- iOS Info.plist / Android manifest changes
- New permissions

For native changes, you must submit a new build via `eas build + eas submit`.

---

## 7. Final Sign-Off

| Area | Status |
|------|--------|
| EAS build config (`eas.json`) | ✅ Complete |
| App config (`app.config.ts`) | ✅ Complete |
| All iOS permissions declared | ✅ Complete |
| All Android permissions declared | ✅ Complete (incl. READ_MEDIA_VISUAL_USER_SELECTED) |
| expo-image-picker plugin configured | ✅ Complete |
| iOS Privacy manifests | ✅ Complete |
| RevenueCat keys via env vars | ✅ Complete |
| Stripe production mode | ⬜ Needs live keys |
| App Store screenshots | ✅ Generated |
| App Store metadata | ✅ Written — see `APPSTORE_METADATA.md` |
| Google Play metadata | ✅ Complete — see `GOOGLE_PLAY_METADATA.md` |
| Google Play Data Safety form | ✅ Documented — see `GOOGLE_PLAY_METADATA.md` §6 |
| Google Play release strategy | ✅ Documented — see `GOOGLE_PLAY_METADATA.md` §8 |
| Android App Signing (EAS-managed) | ✅ Configured |
| Review credentials prepared | ✅ Ready (seed-reviewer edge function) |
| Edge functions deployed | ⬜ Verify in Supabase dashboard |
| Push notifications tested | ⬜ Test on real device |
| Real payment tested | ⬜ End-to-end test with live Stripe key |
| Google Service Account JSON | ⬜ Download from Play Console for eas submit |
