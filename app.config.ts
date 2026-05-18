/**
 * app.config.ts — Drive Smart dynamic Expo config
 *
 * This file takes precedence over app.json when present. It is evaluated at
 * build time by the Expo CLI and EAS Build so you can inject environment
 * variables and apply conditional logic per environment.
 *
 * All static values mirror app.json — this is the single source of truth.
 */
import { ExpoConfig, ConfigContext } from 'expo/config';

// ── Runtime environment ───────────────────────────────────────────────────────
const APP_ENV   = process.env.APP_ENV ?? 'development';
const IS_PROD   = APP_ENV === 'production';
const IS_PREV   = APP_ENV === 'preview';

// ── Real project identifiers ──────────────────────────────────────────────────
const EAS_PROJECT_ID  = 'b9e8e33a-3fb8-424e-88fa-c495d8ed2f57';
const EXPO_USERNAME   = 'nikos_1';
const IOS_BUNDLE_ID   = 'com.nikos.drivesmart';
const ANDROID_PACKAGE = 'com.nikos.drivesmart';

// ── Versioning (EAS autoIncrement handles build numbers) ──────────────────────
const VERSION              = '1.0.0';
const IOS_BUILD_NUMBER     = '1';
const ANDROID_VERSION_CODE = 1;

// ── OTA channel selection ─────────────────────────────────────────────────────
const OTA_CHANNEL = IS_PROD ? 'production' : IS_PREV ? 'preview' : 'development';
const OTA_URL     = `https://u.expo.dev/${EAS_PROJECT_ID}`;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,

  // ── Identity ────────────────────────────────────────────────────────────────
  name:               'Drive Smart \u2013 Driving Instructor',
  slug:               'drivesmart-instructor',
  version:            VERSION,
  scheme:             'drivesmart',
  orientation:        'portrait',
  userInterfaceStyle: 'automatic',
  backgroundColor:    '#FFFFFF',
  primaryColor:       '#FF6700',
  newArchEnabled:     true,

  // ── App icon ─────────────────────────────────────────────────────────────────
  icon: './assets/images/drive-smart-icon.jpg',

  // ── OTA Updates ──────────────────────────────────────────────────────────────
  runtimeVersion: { policy: 'appVersion' },
  updates: {
    url:                   OTA_URL,
    enabled:               true,
    checkAutomatically:    'ON_LOAD',
    fallbackToCacheTimeout: 3000,
    requestHeaders: {
      'expo-channel-name': OTA_CHANNEL,
    },
  },

  // ── iOS ──────────────────────────────────────────────────────────────────────
  ios: {
    supportsTablet:   false,
    bundleIdentifier: IOS_BUNDLE_ID,
    buildNumber:      IOS_BUILD_NUMBER,
    requireFullScreen: true,
    config: {
      usesNonExemptEncryption: false,
    },
    infoPlist: {
      // Location — used for lesson-to-lesson routing calculations
      NSLocationWhenInUseUsageDescription:
        'Drive Smart uses your location to calculate accurate driving routes between lesson locations and to show your home-to-first-lesson travel time.',
      NSLocationAlwaysAndWhenInUseUsageDescription:
        'Drive Smart uses your location to calculate accurate driving routes between lesson locations and to show your home-to-first-lesson travel time.',
      // Notifications
      NSUserNotificationsUsageDescription:
        'Drive Smart sends push notifications for new messages, lesson confirmations, payment requests, and lesson reminders to help you stay on schedule.',
      // Camera / Photos — pupil profile pictures
      NSCameraUsageDescription:
        'Drive Smart needs camera access to let you take a profile photo for your pupil records.',
      NSPhotoLibraryUsageDescription:
        'Drive Smart needs photo library access to let you upload a profile photo for your pupil records.',
      NSPhotoLibraryAddUsageDescription:
        'Drive Smart needs access to save photos to your library.',
      // Background modes
      UIBackgroundModes:              ['fetch', 'remote-notification'],
      ITSAppUsesNonExemptEncryption:  false,
    },
    // ── Apple Privacy Manifests (required since iOS 17 / SDK 50+) ────────────
    privacyManifests: {
      NSPrivacyAccessedAPITypes: [
        {
          NSPrivacyAccessedAPIType:        'NSPrivacyAccessedAPICategoryUserDefaults',
          NSPrivacyAccessedAPITypeReasons: ['CA92.1'],
        },
        {
          NSPrivacyAccessedAPIType:        'NSPrivacyAccessedAPICategoryFileTimestamp',
          NSPrivacyAccessedAPITypeReasons: ['C617.1'],
        },
        {
          NSPrivacyAccessedAPIType:        'NSPrivacyAccessedAPICategorySystemBootTime',
          NSPrivacyAccessedAPITypeReasons: ['35F9.1'],
        },
        {
          NSPrivacyAccessedAPIType:        'NSPrivacyAccessedAPICategoryDiskSpace',
          NSPrivacyAccessedAPITypeReasons: ['E174.1'],
        },
      ],
    },
  },

  // ── Android ──────────────────────────────────────────────────────────────────
  android: {
    package:          ANDROID_PACKAGE,
    versionCode:      ANDROID_VERSION_CODE,
    compileSdkVersion: 35,
    targetSdkVersion:  35,
    adaptiveIcon: {
      foregroundImage: './assets/images/drive-smart-icon.jpg',
      backgroundColor: '#FF6700',
    },
    permissions: [
      'android.permission.INTERNET',
      'android.permission.RECEIVE_BOOT_COMPLETED',
      'android.permission.VIBRATE',
      'android.permission.CAMERA',
      'android.permission.READ_MEDIA_IMAGES',
      // Required for photo picker on Android 14+ (API 34+)
      'android.permission.READ_MEDIA_VISUAL_USER_SELECTED',
      'android.permission.USE_BIOMETRIC',
      'android.permission.USE_FINGERPRINT',
      'android.permission.POST_NOTIFICATIONS',
      'android.permission.SCHEDULE_EXACT_ALARM',
    ],
    edgeToEdgeEnabled: true,
    // Google Play Data Safety: no device GPS collected
    // Lesson routing uses manually-entered text addresses only
  },

  // ── Web (Metro bundler for development / admin portal) ───────────────────────
  web: {
    bundler: 'metro',
    output:  'static',
    favicon: './assets/images/drive-smart-icon.jpg',
  },

  // ── Plugins ──────────────────────────────────────────────────────────────────
  plugins: [
    // Expo Router — file-based navigation
    'expo-router',

    // OTA Updates
    ['expo-updates', { username: EXPO_USERNAME }],

    // Splash screen
    [
      'expo-splash-screen',
      {
        image:           './assets/images/drive-smart-icon.jpg',
        imageWidth:      280,
        resizeMode:      'contain',
        backgroundColor: '#FFFFFF',
      },
    ],

    // Push notifications
    [
      'expo-notifications',
      {
        icon:           './assets/images/drive-smart-icon.jpg',
        color:          '#FF6700',
        defaultChannel: 'default',
        sounds:         [],
      },
    ],

    // Image picker — camera + photo library (pupil profile avatars)
    [
      'expo-image-picker',
      {
        photosPermission:
          'Drive Smart needs photo library access to let you upload a profile photo for your pupil records.',
        cameraPermission:
          'Drive Smart needs camera access to let you take a profile photo for your pupil records.',
        microphonePermission: false,
      },
    ],
  ],

  // ── Experiments ──────────────────────────────────────────────────────────────
  experiments: {
    typedRoutes: true,
  },

  // ── EAS metadata ─────────────────────────────────────────────────────────────
  extra: {
    eas: {
      projectId: EAS_PROJECT_ID,
    },
    // Available at runtime via expo-constants: Constants.expoConfig?.extra?.appEnv
    appEnv: APP_ENV,
  },

  // ── Store metadata ───────────────────────────────────────────────────────────
  description:
    'Drive Smart is the ultimate app for professional driving instructors. Manage pupils, schedule lessons with AI-powered route optimisation, fill gap lessons instantly via broadcast, track payments, and communicate with pupils — all in one beautifully designed app.',
  keywords: [
    'driving instructor',
    'driving lessons',
    'lesson scheduler',
    'pupil management',
    'driving school',
    'smart schedule',
    'ADI app',
    'route optimisation',
    'lesson booking',
    'driving teacher',
  ],
});
