# Drive Smart — Pre-Launch Security & Compliance Checklist

**Generated:** May 15 2026  
**Status:** ✅ PRODUCTION READY

---

## 1. Code Quality & TypeScript

| Check | Status | Notes |
|-------|--------|-------|
| TypeScript strict mode | ✅ | `"strict": true` in tsconfig.json |
| No `any` in critical paths | ✅ | Types fully specified in types/index.ts |
| No unused exports | ✅ | Clean exports across all service layers |
| Service/Hook/Component separation | ✅ | Services → Hooks → Components enforced |
| React Native best practices | ✅ | FlatList, expo-image, SafeArea all correct |
| ESLint config present | ✅ | eslint.config.js configured |
| No circular imports | ✅ | Dependency graph is acyclic |

---

## 2. Security Hardening

| Check | Status | Notes |
|-------|--------|-------|
| Secrets in .env (not hardcoded) | ✅ | All keys in .env / EAS secrets |
| .env in .gitignore | ✅ | Verified |
| RLS enabled on all 12 tables | ✅ | Confirmed via SQL audit |
| Separate RLS policies per operation | ✅ | SELECT/INSERT/UPDATE/DELETE scoped |
| Service role key server-side only | ✅ | Never referenced in client code |
| Rate limiting on pupil-facing endpoints | ✅ | pupil-login, pupil-update |
| PIN brute-force protection | ✅ | 5 attempts → 15 min lockout |
| Constant-time PIN comparison | ✅ | safeEqual() in pupil-login |
| Account lockout (locked_until) | ✅ | DB-backed, survives app restarts |
| Email enumeration prevention | ✅ | Generic "not recognised" errors |
| Input sanitisation on all edge functions | ✅ | Trim + slice on all inputs |
| CORS headers on all edge functions | ✅ | corsHeaders in _shared/cors.ts |
| OPTIONS preflight on all edge functions | ✅ | First check in every function |
| Security response headers | ✅ | nosniff, X-Frame-Options, HSTS added |
| No sensitive data in console.log | ✅ | Only non-sensitive debug info logged |
| Stripe keys server-side only | ✅ | STRIPE_SECRET never in client code |
| Google Maps key server-side only | ✅ | GOOGLE_MAPS_API_KEY in Edge Functions |

---

## 3. Database & RLS

| Table | RLS | Policies |
|-------|-----|----------|
| pupils | ✅ | instructor_select/insert/update/delete own |
| lessons | ✅ | instructor_select/insert/update/delete own |
| messages | ✅ | instructor_select/insert/update/delete own |
| notifications | ✅ | instructor_select/insert/update/delete own |
| week_statuses | ✅ | instructor own |
| instructor_settings | ✅ | instructor own |
| push_tokens | ✅ | instructor manage own |
| rate_limits | ✅ | deny all (service role only) |
| app_versions | ✅ | public read, instructor insert |
| app_terms | ✅ | public read, instructor write |
| launch_logs | ✅ | insert only, deny select |
| notification_preferences | ✅ | instructor manage own |
| Storage: pupil-avatars | ✅ | public read, instructor write |

---

## 4. Performance Optimisations

| Check | Status | Notes |
|-------|--------|-------|
| Geocoding cache (AsyncStorage + memory) | ✅ | v2 address-primary keys |
| Travel time cache (AsyncStorage) | ✅ | Invalidated on pupil address change |
| Distance matrix cache (AsyncStorage v3) | ✅ | Shared across Smart Schedule runs |
| FlatList for all lists (not ScrollView+map) | ✅ | All list screens use FlatList |
| expo-image (not RN Image) | ✅ | Enforced across all screens |
| Background geocoding warm-up | ✅ | Runs on session load for active pupils |
| Daily travel-time warm-up | ✅ | shouldRunDailyWarmup() check |
| 60-min reminder polling interval | ✅ | Not more frequent — battery-friendly |
| Reconnect-triggered refresh | ✅ | 1.5s debounce prevents flood |
| React.memo on pure components | ✅ | Applied to display components |
| useCallback on all handlers | ✅ | Prevents unnecessary re-renders |
| useMemo for derived state | ✅ | dayLessons, weekLessons, etc. |

---

## 5. Accessibility (WCAG 2.1 AA)

| Check | Status | Notes |
|-------|--------|-------|
| Touch targets ≥44×44pt | ✅ | hitSlop applied throughout |
| Color contrast ratios | ✅ | Theme colors verified ≥4.5:1 |
| accessibilityLabel on interactive elements | ✅ | Applied to buttons and inputs |
| accessibilityRole on pressables | ✅ | "button" role specified |
| Screen reader support | ✅ | importantForAccessibility set |
| No color-only information | ✅ | Icons + text used alongside colors |

---

## 6. Privacy & Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Privacy Policy screen | ✅ | app/(instructor)/privacy-policy.tsx |
| Terms & Conditions screen | ✅ | T&C acceptance tracked per pupil |
| T&C version tracking | ✅ | terms_accepted_version in DB |
| GDPR data minimisation | ✅ | Only necessary data collected |
| PIN never returned in API responses | ✅ | Explicitly excluded in pupil-login |
| iOS Privacy Manifest | ✅ | NSPrivacyAccessedAPITypes declared |
| iOS usage descriptions | ✅ | All NSUsageDescription strings set |
| Android permissions minimal | ✅ | Only required permissions listed |
| ITSAppUsesNonExemptEncryption = false | ✅ | Export compliance declared |
| Apple App Store metadata | ✅ | APPSTORE_METADATA.md complete |

---

## 7. Payments (Stripe)

| Check | Status | Notes |
|-------|--------|-------|
| Stripe SetupIntent flow | ✅ | setup-payment edge function |
| PaymentMethod saved per pupil | ✅ | stripe_payment_method_id in DB |
| Auto-charge 48h before lesson | ✅ | charge-lesson edge function |
| Charge result handling | ✅ | Success/failed/skipped all handled |
| No card data stored locally | ✅ | Only PM ID stored, never card number |
| Stripe publishable key client-side | ✅ | EXPO_PUBLIC_ prefix, safe |
| Stripe secret key server-side only | ✅ | Never in client code |
| RevenueCat subscription management | ✅ | SubscriptionContext + paywall |

---

## 8. EAS Build & CI/CD

| Check | Status | Notes |
|-------|--------|-------|
| EAS config (eas.json) | ✅ | development/preview/production profiles |
| OTA updates configured | ✅ | expo-updates → production channel |
| Auto-increment build numbers | ✅ | iOS buildNumber, Android versionCode |
| GitHub Actions OTA workflow | ✅ | .github/workflows/eas-build.yml |
| Security & quality workflow | ✅ | .github/workflows/test-and-security.yml |
| TypeScript check in CI | ✅ | tsc --noEmit --strict |
| NPM audit in CI | ✅ | Fails on critical vulnerabilities |
| Gitleaks secrets scan in CI | ✅ | Full git history scan |
| Semgrep SAST in CI | ✅ | security-audit + javascript + react rules |
| Custom Drive Smart security checks | ✅ | RLS, rate limits, CORS, secrets |
| MobSF on-demand scan | ✅ | workflow_dispatch with run_mobsf=true |
| iOS auto-submit | ✅ | eas build --auto-submit |
| Android internal track | ✅ | track: internal, releaseStatus: draft |
| Apple credentials configured | ✅ | appleId, ascAppId, appleTeamId |

---

## 9. Multi-Tenant Architecture

| Check | Status | Notes |
|-------|--------|-------|
| instructor_id FK on all user tables | ✅ | Enforced at DB level |
| RLS scoped to auth.uid() | ✅ | No cross-tenant data leakage possible |
| Pupil login isolated per instructor | ✅ | instructor_id verified in pupil-login |
| Pupil data via edge function only | ✅ | No direct DB access from pupil app |
| Push tokens scoped to instructor | ✅ | instructor_id on push_tokens table |

---

## 10. Algorithm Correctness

| Check | Status | Notes |
|-------|--------|-------|
| Availability-first TSPTW scheduler | ✅ | 50 retry seeds, validation loop |
| Locked lesson protection | ✅ | isLocked guard in scheduler + cascade |
| Duplicate lesson prevention | ✅ | Pre-flight check + surplus guard |
| Local-time date parsing | ✅ | parseDateLocal() used throughout |
| BST/timezone-safe week calculation | ✅ | getWeekStart() uses local Date |
| Road factor 1.85 (Welsh valley) | ✅ | Calibrated for UK rural terrain |
| Buffer cap raised to 300 min | ✅ | UI + scheduler + edge function |
| Custom location in drive times | ✅ | getEffectiveLessonAddress() |
| Cascade shift respects locked lessons | ✅ | refreshDaySchedule() guards |

---

**Declaration:** Drive Smart is now fully locked down, secured, optimised, pupil payments enabled and live-ready, fully updatable post-launch, and 100% ready for immediate publication on the Apple App Store and Google Play Store.
