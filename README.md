# Drive Smart

[![EAS Build & OTA Update](https://github.com/nikos1-ops/drive-smart-1/actions/workflows/eas-build.yml/badge.svg?branch=main)](https://github.com/nikos1-ops/drive-smart-1/actions/workflows/eas-build.yml)
[![Expo SDK](https://img.shields.io/badge/Expo-SDK%2052-000020?logo=expo&logoColor=white)](https://expo.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Platform](https://img.shields.io/badge/Platform-iOS%20%7C%20Android-FF6700)](https://reactnative.dev)

A production-ready multi-tenant driving instructor management platform built with React Native and Expo. Drive Smart enables instructors to manage pupils, schedule lessons with AI-powered route optimisation, process Stripe payments, communicate via in-app messaging, and export weekly summaries as PDFs — all from a single cross-platform app.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Setup Instructions](#setup-instructions)
- [Environment Variables](#environment-variables)
- [Running Locally](#running-locally)
- [EAS Build Commands](#eas-build-commands)
- [OTA Updates](#ota-updates)
- [GitHub Actions CI/CD](#github-actions-cicd)
- [Backend — OnSpace Cloud / Supabase](#backend)
- [Edge Functions](#edge-functions)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

Drive Smart solves the daily scheduling headaches faced by independent driving instructors in the UK. The app combines availability-first VRPTW (Vehicle Routing Problem with Time Windows) scheduling, real-time travel time estimation, and automated Stripe payment collection into a single platform. Pupils get their own companion app to view lessons, acknowledge schedules, make payments, and message their instructor.

---

## Features

### Instructor App

| Feature | Description |
|---|---|
| **Smart Schedule (VRPTW)** | AI-powered lesson scheduling that respects pupil availability windows, working hours, travel buffers, and distance optimisation — generates a full week's diary in one tap |
| **Weekly Diary** | Collapsible day tabs with lesson count, total hours, and drive time badges; list view with drag-to-reorder; weekly calendar grid with long-press drag-to-reschedule and 15-min snapping |
| **Travel Time Estimation** | Three-layer fallback: Google Maps → OSRM → Haversine (×1.85 road factor for UK valley roads); Nominatim address-primary geocoding cache |
| **Cascade Lesson Shifting** | When a lesson time/date changes, all subsequent lessons on the same day shift by the same delta with live preview and optional undo |
| **Overlapping Lesson Support** | Force-save overlapping lessons with override; side-by-side display in calendar grid; amber warning badges in list and pupil-detail views |
| **Per-Lesson Rate Overrides** | Override a pupil's default hourly rate for any individual lesson; annotated in PDF export with `*custom rate` |
| **PDF Week Summary Export** | Generates a printable HTML/PDF report per week: pupil names, lesson times, drive distances, total hours, earnings breakdown (paid/unpaid/custom-rate) |
| **Stripe Auto-Charge** | 48-hour pre-lesson automatic payment collection via saved card; charge-lesson edge function with idempotency |
| **Pupil Management** | Full CRUD: contact details, licence number, lesson rate, balance, progress tracking across 24 DSA competency categories, availability windows |
| **In-App Messaging** | Direct messages and broadcast messages to all pupils; gap-lesson offer messages; read receipts |
| **Push Notifications** | 48h and 24h lesson reminders; new message alerts; schedule confirmation requests |
| **Dashboard** | Weekly earnings forecast (paid / outstanding), pupil balance summary, lesson count, custom-rate indicator, payments tab |
| **OTA Updates** | Expo Updates with silent background download and automatic reload; production/preview/development channels |
| **PDF & Share** | `expo-print` + `expo-sharing` for week summary PDFs |
| **Dark / Light Mode** | Full theme switching (Drive Smart white/orange ↔ Olympus dark) |

### Pupil App

| Feature | Description |
|---|---|
| **My Lessons** | View upcoming and past lessons, acknowledge schedule, check-in on lesson day |
| **Availability Editor** | Set recurring weekly slots, specific dates, and blackout dates; instructor can lock editing |
| **Progress Tracker** | Visual progress across 24 DSA driving competency categories updated by instructor |
| **Messages** | Send and receive messages from instructor; delete own messages |
| **Notifications** | In-app notification centre for lesson changes, reminders, and instructor messages |
| **Payment** | Save card via Stripe Setup Intent; confirm payment; view balance |
| **Terms Acceptance** | Versioned terms of service with acceptance tracking |

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | [React Native](https://reactnative.dev) + [Expo SDK 52](https://expo.dev) |
| **Language** | TypeScript 5.x (strict mode) |
| **Routing** | [Expo Router](https://docs.expo.dev/router/introduction/) (file-based, App Groups) |
| **Backend** | [OnSpace Cloud](https://onspace.ai) / [Supabase](https://supabase.com) — PostgreSQL + RLS + Edge Functions |
| **Auth** | Supabase Auth (OTP + Password hybrid) |
| **Payments** | [Stripe React Native SDK](https://stripe.com/docs/payments/accept-a-payment?platform=react-native) + Supabase Edge Functions |
| **Push Notifications** | [Expo Notifications](https://docs.expo.dev/push-notifications/overview/) + Expo Push Service |
| **Maps** | `react-native-maps` (iOS/Android) |
| **Routing/Travel** | Google Maps Distance Matrix API → OSRM → Haversine fallback |
| **Geocoding** | Nominatim (OpenStreetMap) with address-primary LRU cache |
| **PDF Export** | `expo-print` + `expo-sharing` |
| **Animations** | `react-native-reanimated` ~3.17.5 |
| **Drag & Drop** | `react-native-draggable-flatlist` |
| **OTA Updates** | [Expo Updates](https://docs.expo.dev/versions/latest/sdk/updates/) via EAS Update |
| **CI/CD** | GitHub Actions + [EAS Build](https://docs.expo.dev/build/introduction/) |
| **State Management** | React Context (PupilsContext, AuthContext, ThemeContext, SubscriptionContext) |
| **Image Display** | `expo-image` |
| **Icons** | `@expo/vector-icons` |

---

## Project Structure

```
drive-smart/
├── app/
│   ├── (instructor)/          # Instructor route group
│   │   ├── (tabs)/            # Bottom tab navigator
│   │   │   ├── dashboard.tsx  # Earnings overview & quick stats
│   │   │   ├── diary.tsx      # Weekly scheduling — core screen (~3,000 lines)
│   │   │   ├── messages.tsx   # Messaging centre
│   │   │   ├── notifications.tsx
│   │   │   ├── pupils.tsx     # Pupil list & management
│   │   │   └── settings.tsx   # Working hours, buffers, cache, version info
│   │   ├── lesson-detail.tsx  # Per-lesson rate override, notes, payment
│   │   ├── lesson-form.tsx    # Create/edit lesson with conflict detection
│   │   ├── pupil-detail.tsx   # Pupil profile, lessons, overlap warnings
│   │   └── pupil-form.tsx     # Add/edit pupil
│   ├── (pupil)/               # Pupil companion route group
│   │   └── (tabs)/
│   │       ├── my-lessons.tsx
│   │       ├── availability.tsx
│   │       ├── progress.tsx
│   │       └── messages.tsx
│   ├── _layout.tsx            # Root layout (providers + OTA checker)
│   ├── index.tsx              # Role-based entry router
│   ├── login.tsx              # Instructor auth
│   └── pupil-login.tsx        # Pupil PIN login
├── components/
│   ├── feature/               # Domain-specific components
│   │   ├── WeeklyCalendarGrid.tsx
│   │   ├── EditLessonTimeModal.tsx
│   │   ├── GapAnalysisModal.tsx
│   │   └── ...
│   └── ui/                    # Generic UI primitives
├── contexts/                  # Global state (Auth, Pupils, Theme, Subscription)
├── hooks/                     # Consumer hooks (useAuth, usePupils, etc.)
├── services/                  # Data layer (Supabase, geocoding, routing, scheduler)
├── supabase/functions/        # Deno edge functions (deployed to Supabase)
├── constants/
│   ├── theme.ts               # Color tokens (light + dark), spacing, typography
│   └── config.ts              # App-wide constants
├── types/index.ts             # Shared TypeScript interfaces
├── .github/workflows/
│   └── eas-build.yml          # CI/CD: OTA update + native build pipeline
├── app.json                   # Expo config (EAS Update, permissions, splash)
└── eas.json                   # EAS Build profiles (development/preview/production)
```

---

## Prerequisites

- [Node.js](https://nodejs.org) ≥ 20.x
- [npm](https://npmjs.com) ≥ 10.x
- [Expo CLI](https://docs.expo.dev/more/expo-cli/): `npm install -g expo-cli`
- [EAS CLI](https://docs.expo.dev/build/setup/): `npm install -g eas-cli`
- Expo account: [expo.dev](https://expo.dev) (free)
- Supabase project (or OnSpace Cloud backend)
- iOS: Xcode 15+ / macOS (for simulator)
- Android: Android Studio + emulator or physical device

---

## Setup Instructions

### 1. Clone the repository

```bash
git clone https://github.com/nikos1-ops/drive-smart-1.git
cd drive-smart-1
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Copy the example env file and fill in your credentials:

```bash
cp .env.example .env
```

Edit `.env` with your values (see [Environment Variables](#environment-variables) below).

### 4. Link your Expo project

```bash
eas login
eas project:info   # Verify project is linked, or run: eas init
```

### 5. Start the development server

```bash
npx expo start
```

Press `i` for iOS simulator, `a` for Android emulator, or scan the QR code with [Expo Go](https://expo.dev/go).

---

## Environment Variables

Create a `.env` file in the project root. **Never commit this file.**

```env
# Supabase / OnSpace Cloud
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Stripe (publishable key — safe for client)
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...

# Google Maps (for travel time API — iOS/Android only)
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=AIza...
```

> **Server-side secrets** (Stripe secret key, Supabase service role key, RevenueCat API key) are stored as EAS Secrets and injected into edge functions at runtime — never in the client bundle. Configure them at:
> `eas secret:create --scope project --name STRIPE_SECRET_KEY --value sk_live_...`

---

## Running Locally

```bash
# Start Expo dev server
npx expo start

# iOS simulator
npx expo run:ios

# Android emulator
npx expo run:android

# Clear cache and restart
npx expo start --clear
```

---

## EAS Build Commands

### Development build (debug client)

```bash
eas build --platform all --profile development
```

### Preview build (internal distribution — TestFlight / internal Play)

```bash
eas build --platform all --profile preview
```

### Production build (App Store + Google Play)

```bash
eas build --platform all --profile production
```

### Production build with automatic store submission

```bash
eas build --platform all --profile production --auto-submit
```

### List recent builds

```bash
eas build:list
```

### Submit existing build to stores

```bash
eas submit --platform ios --profile production
eas submit --platform android --profile production
```

---

## OTA Updates

Drive Smart uses [Expo Updates](https://docs.expo.dev/versions/latest/sdk/updates/) for JavaScript-only hotfixes that don't require a native rebuild.

### Publish an OTA update

```bash
# Production channel (live users)
eas update --channel production --message 'Fix: diary crash on empty week'

# Preview channel (internal testers)
eas update --channel preview --message 'Test: new gap analysis modal'
```

### How it works

1. App opens → checks EAS for a new JS bundle (3-second timeout)
2. If available: downloads in background → reloads silently on next launch
3. If unavailable or timeout: uses cached bundle — app always starts

### What OTA updates **can** ship

- All TypeScript / TSX source changes
- `constants/`, `services/`, `hooks/`, `contexts/`, `components/` updates
- Bug fixes, UI changes, new screens

### What requires a native rebuild

- New native packages (`npm install` + linking)
- `app.json` permission or config changes
- New fonts or images added after the initial build
- `package.json` native dependency changes

---

## GitHub Actions CI/CD

The workflow at `.github/workflows/eas-build.yml` runs automatically on every push to `main`:

| Job | Trigger | What it does |
|---|---|---|
| **OTA Update** | Every push to `main` | Publishes JS bundle to production channel (~2 min) |
| **EAS Build** | Only when native files change (`app.json`, `package.json`, `assets/`, etc.) | Full iOS + Android build + auto-submit to App Store / Play Store (~20 min) |

### Required GitHub Secrets

Add these in `Settings → Secrets and variables → Actions`:

| Secret | Value |
|---|---|
| `EAS_TOKEN` | Expo access token from [expo.dev/accounts/.../settings/access-tokens](https://expo.dev) |

---

## Backend

Drive Smart uses **OnSpace Cloud** (Supabase-compatible) for all backend services:

- **PostgreSQL** with Row Level Security (multi-tenant isolation per `instructor_id`)
- **Auth** — OTP + password hybrid, JWT-based session management
- **Storage** — Pupil avatar uploads (`pupil-avatars` bucket, 5 MB limit)
- **Edge Functions** — Deno-based serverless functions (see below)

### Key database tables

| Table | Purpose |
|---|---|
| `pupils` | Pupil profiles, lesson rates, availability, Stripe IDs, progress |
| `lessons` | Scheduled lessons with `custom_rate`, `payment_status`, reminder flags |
| `messages` | Direct + broadcast messaging with read receipts |
| `notifications` | In-app notification log |
| `week_statuses` | Week confirmation state per instructor |
| `instructor_settings` | Working hours, buffer minutes, home address |
| `push_tokens` | Expo push tokens for pupils and instructors |

---

## Edge Functions

Deployed to Supabase Edge Functions (Deno runtime):

| Function | Purpose |
|---|---|
| `optimize-schedule` | VRPTW solver — generates availability-first lesson schedule |
| `travel-times` | Batch travel time calculations (Google Maps → OSRM → Haversine) |
| `charge-lesson` | Stripe auto-charge 48h before lesson |
| `setup-payment` | Stripe SetupIntent creation for card save |
| `save-payment-method` | Attaches payment method to Stripe customer |
| `lesson-reminders` | Sends 48h and 24h push reminders (cron-triggered) |
| `send-push` | Expo push notification dispatcher |
| `pupil-login` | PIN-based pupil authentication |
| `pupil-data` | Pupil-facing data endpoint (lessons, messages, notifications) |
| `pupil-update` | Pupil self-service updates (availability, profile) |
| `pupil-message` | Pupil → instructor message creation |
| `pupil-delete-message` | Pupil message deletion |
| `confirm-instructor` | Instructor account confirmation flow |

Deploy all functions:

```bash
supabase functions deploy --project-ref your-project-ref
```

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Commit with conventional commits: `git commit -m 'feat: add gap analysis export'`
4. Push and open a Pull Request against `main`
5. The GitHub Actions workflow will run automatically — all checks must pass before merge

---

## License

© 2024 Drive Smart. All rights reserved.

This codebase is proprietary. Unauthorised copying, distribution, or modification is prohibited.
