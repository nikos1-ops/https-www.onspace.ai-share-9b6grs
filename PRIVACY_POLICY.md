# Drive Smart — Privacy Policy

**Last updated:** 15 May 2026  
**Effective date:** 15 May 2026  
**Version:** 1.0

**Published at:** https://drivesmartapp.co.uk/privacy  
**Contact:** support@drivesmartapp.co.uk

---

## 1. Who We Are

Drive Smart ("we", "us", "our") is a mobile application for professional driving instructors and their learner pupils, published by Drive Smart Ltd, United Kingdom. This Privacy Policy explains how we collect, use, store, and protect your personal data when you use the Drive Smart app ("the App").

We are committed to complying with the UK General Data Protection Regulation (UK GDPR), the Data Protection Act 2018, and all applicable data protection legislation.

---

## 2. Who This Policy Applies To

This policy applies to two types of users:

- **Instructors** — Approved Driving Instructors (ADIs) and trainee PDIs who create an account and manage their business via the app.
- **Pupils** — Learner drivers who access the companion pupil app using credentials provided by their instructor.

---

## 3. What Data We Collect

### 3.1 Instructor Account Data

| Data | Purpose | Legal Basis |
|------|---------|-------------|
| Email address | Account creation, authentication, account recovery | Contract (Article 6(1)(b) UK GDPR) |
| Password (hashed) | Secure authentication — never stored in plain text | Contract |
| Username / display name | Account identification within the app | Contract |
| Home address / postcode | Calculating home-to-first-lesson travel time for route optimisation | Contract |
| Working hours and availability | Smart scheduling and lesson conflict detection | Contract |

### 3.2 Pupil Record Data (entered by instructor)

Instructors enter pupil data on behalf of their pupils. The instructor is the data controller for this data; Drive Smart acts as a data processor.

| Data | Purpose |
|------|---------|
| Full name | Pupil identification |
| Email address | Pupil app login, lesson notifications |
| Phone number | Contact (optional, for instructor reference only) |
| Home address / postcode | Lesson pick-up/drop-off routing calculations |
| Date of birth | Instructor record-keeping |
| Driving licence number | Instructor record-keeping |
| Theory test status and certificate number | Progress tracking |
| Practical test date | Progress tracking, lesson planning |
| DSA category progress notes | Lesson progress tracking |
| Lesson rates and payment balance | Payment tracking |
| 4-digit PIN | Pupil app authentication (stored as plain text — not used for financial access) |

### 3.3 Lesson and Schedule Data

- Lesson dates, times, durations, and locations
- Lesson payment status and history
- Lesson notes entered by instructor or pupil
- Custom pick-up and drop-off addresses per lesson (when requested by pupil and approved by instructor)

### 3.4 Payment Data

- Stripe payment method (card last 4 digits, card type, expiry — **full card numbers are never stored by Drive Smart**)
- Stripe Customer ID and Payment Method ID (tokenised references only)
- Lesson payment status and charge history

All payment processing is handled by **Stripe**, which is PCI-DSS compliant. Drive Smart never handles or stores raw card data.

### 3.5 Message Data

- In-app messages between instructor and pupils
- Message content, timestamps, and read status
- Gap lesson broadcast data

### 3.6 Push Notification Data

- Expo push token (device identifier used to deliver push notifications)
- Notification content and delivery status

### 3.7 Technical and Usage Data

- App crash reports and error logs (anonymous, no personal data)
- App version, build number, and platform (iOS/Android)
- App launch timestamps (used for version analytics only)
- In-app subscription status via RevenueCat (entitlement, product ID, expiry)

---

## 4. What Data We Do NOT Collect

- **Device GPS or location** — Drive Smart does **not** request or collect your device's GPS location. Lesson routing is calculated using the text addresses you manually enter into the app.
- **Browsing history**
- **Contacts, calendar, or files** from your device
- **Advertising identifiers (IDFA/GAID)**
- **Biometric data**
- **Health or fitness data**

---

## 5. How We Use Your Data

| Purpose | Data Used | Legal Basis |
|---------|-----------|-------------|
| Providing the scheduling and lesson management service | Account, pupil, and lesson data | Contract |
| Calculating driving routes between lesson locations | Postcode and address data (text only) | Contract |
| Processing lesson payments via Stripe | Stripe token, payment status | Contract |
| Sending lesson reminders and notifications | Push token, lesson data | Contract |
| Delivering in-app messages between instructor and pupils | Message content | Contract |
| Managing RevenueCat subscription entitlements | Email, RevenueCat subscriber ID | Contract |
| Diagnosing crashes and improving app stability | Anonymous crash logs | Legitimate interests |
| Complying with legal obligations | Account data as required | Legal obligation |

---

## 6. Data Sharing and Third Parties

We share data only with the following trusted third-party services, each of which processes data on our behalf under appropriate data processing agreements:

| Third Party | Purpose | Data Shared | Location |
|-------------|---------|-------------|----------|
| **Supabase** | Database hosting, authentication, file storage | All app data (encrypted at rest) | EU / US (Standard Contractual Clauses) |
| **Stripe** | Payment processing | Email, Stripe customer/payment tokens | UK / EU / US (PCI-DSS compliant) |
| **Expo / EAS** | Push notifications, over-the-air app updates | Expo push token, app version | US |
| **RevenueCat** | Subscription management | Email, subscription entitlement | US |
| **Nominatim (OpenStreetMap)** | Address geocoding for route calculations | Lesson postcodes and addresses (anonymised queries) | EU |

We do **not** sell, rent, or trade your personal data to any third party for marketing purposes.

---

## 7. Data Retention

| Data Type | Retention Period |
|-----------|-----------------|
| Instructor account and settings | Until account deleted by user |
| Pupil records | Until deleted by instructor (cascades immediately) |
| Lesson history | Until deleted by instructor or account deletion |
| Messages | Until deleted by instructor or account deletion |
| Payment records (Stripe) | Per Stripe's retention policy (typically 7 years for financial records) |
| Push tokens | Deleted automatically when pupil or instructor account is deleted |
| Crash logs | 30 days (anonymous, auto-purged) |
| Lesson reminder logs | 7 days |

When an instructor deletes their account via **Settings → Delete Account**, all associated data (pupils, lessons, messages, notifications, settings, and push tokens) is permanently deleted from our database within 24 hours. This cannot be undone.

---

## 8. Your Rights Under UK GDPR

You have the following rights regarding your personal data:

| Right | How to Exercise |
|-------|----------------|
| **Right of access** — obtain a copy of your data | Email support@drivesmartapp.co.uk |
| **Right to rectification** — correct inaccurate data | Edit directly in-app or contact support |
| **Right to erasure** — delete your account and all data | Settings → Delete Account (in-app) |
| **Right to data portability** — receive your data in a structured format | Email support@drivesmartapp.co.uk |
| **Right to restrict processing** | Email support@drivesmartapp.co.uk |
| **Right to object** to processing based on legitimate interests | Email support@drivesmartapp.co.uk |

We will respond to all rights requests within **30 days**.

To verify your identity before processing a rights request, we may ask you to confirm your registered email address.

---

## 9. Data Security

We implement the following technical and organisational measures to protect your data:

- **Encryption in transit** — all data is transmitted over HTTPS/TLS 1.2+
- **Encryption at rest** — all database data is encrypted at rest via Supabase (AES-256)
- **Row Level Security (RLS)** — database policies ensure instructors can only access their own data; pupils can only access their own lesson records
- **PIN brute-force protection** — pupil login is rate-limited; 5 consecutive failures trigger a 15-minute account lockout
- **Rate limiting** — all API endpoints are rate-limited to prevent automated attacks
- **No plain-text passwords** — instructor passwords are hashed using bcrypt via Supabase Auth
- **Service role key isolation** — sensitive backend operations use a server-side service role key; client apps use a restricted anon key

Despite these measures, no system is completely secure. If you believe your account has been compromised, contact us immediately at support@drivesmartapp.co.uk.

---

## 10. Cookies and Tracking

The Drive Smart mobile app does **not** use cookies. The app does not contain third-party advertising SDKs, social media tracking pixels, or analytics SDKs that profile your behaviour for advertising purposes.

---

## 11. Children's Privacy

Drive Smart is intended for use by:
- Instructors aged 18 or over (must hold a valid ADI/PDI licence)
- Pupils aged 17 or over (minimum legal age to hold a provisional driving licence in the UK)

We do not knowingly collect data from children under the age of 17. If you believe a child under 17 has provided us with personal data, please contact us at support@drivesmartapp.co.uk and we will delete it promptly.

---

## 12. International Data Transfers

Some of our third-party providers process data outside the UK and European Economic Area (EEA). Where this occurs, we ensure adequate safeguards are in place, including:

- **Standard Contractual Clauses (SCCs)** — used with Supabase, Expo, and RevenueCat
- **UK Adequacy decisions** — where applicable
- **PCI-DSS compliance** — Stripe, for payment data

---

## 13. Instructor Obligations as Data Controller

When you use Drive Smart as an instructor, you enter personal data about your pupils. Under UK GDPR, **you are the data controller** for that pupil data, and Drive Smart is your data processor.

You are responsible for:
- Having a lawful basis for collecting and storing your pupils' personal data
- Informing your pupils that their data is stored in the Drive Smart app
- Responding to any data subject rights requests from your pupils
- Obtaining appropriate consent where required

You may wish to include a reference to Drive Smart in your own privacy notice provided to pupils.

---

## 14. Changes to This Policy

We may update this Privacy Policy from time to time. When we make material changes, we will:

- Update the "Last updated" date at the top of this policy
- Display an in-app notification on next launch
- Post the updated policy at https://drivesmartapp.co.uk/privacy

Continued use of the app after changes take effect constitutes acceptance of the updated policy.

---

## 15. Contact and Complaints

**Drive Smart Support**  
Email: support@drivesmartapp.co.uk  
Website: https://drivesmartapp.co.uk

If you are unhappy with how we handle your data, you have the right to lodge a complaint with the **Information Commissioner's Office (ICO)**:

- Website: https://ico.org.uk
- Phone: 0303 123 1113
- Address: Information Commissioner's Office, Wycliffe House, Water Lane, Wilmslow, Cheshire, SK9 5AF

---

*This policy is governed by the laws of England and Wales.*
