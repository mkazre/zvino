/**
 * One codebase, three store apps. Pick one with APP_VARIANT:
 *   APP_VARIANT=customer  → "Zvino"           (default)
 *   APP_VARIANT=driver    → "Zvino Driver"
 *   APP_VARIANT=merchant  → "Zvino Merchant"  (store manager / POS / kitchen)
 * The variant decides name, bundle id, colours, permissions and which routes are reachable.
 */
const VARIANT = process.env.APP_VARIANT ?? 'customer';
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:8001'; // Android emulator → host machine

const VARIANTS = {
  customer: { name: 'Zvino', id: 'zw.co.zvino', scheme: 'zvino', splash: '#FFFFFF', icon: '#FFFFFF' },
  driver: { name: 'Zvino Driver', id: 'zw.co.zvino.driver', scheme: 'zvinodriver', splash: '#FFFFFF', icon: '#17C74A' },
  merchant: { name: 'Zvino Merchant', id: 'zw.co.zvino.merchant', scheme: 'zvinomerchant', splash: '#222222', icon: '#222222' },
};
const v = VARIANTS[VARIANT] ?? VARIANTS.customer;

const locationText = {
  customer: 'Zvino uses your location to find restaurants near you and pin your delivery address.',
  driver: 'Zvino Driver shares your location while you are online so customers can track their order and we can offer you nearby jobs.',
  merchant: 'Zvino Merchant does not need your location.',
}[VARIANT];

module.exports = ({ config }) => ({
  ...config,
  // Expo project: https://expo.dev/accounts/khuphukiles-team/projects/zvino (one project, three app variants)
  owner: 'khuphukiles-team',
  slug: 'zvino',
  name: v.name,
  scheme: v.scheme,
  icon: `./assets/brand/icon-${VARIANT}.png`,
  ios: {
    ...config.ios,
    bundleIdentifier: v.id,
    supportsTablet: VARIANT === 'merchant',
    infoPlist: { ITSAppUsesNonExemptEncryption: false, ...(VARIANT === 'driver' ? { UIBackgroundModes: ['location'] } : {}) },
  },
  android: {
    ...config.android,
    package: v.id,
    adaptiveIcon: { backgroundColor: v.icon, foregroundImage: `./assets/brand/adaptive-${VARIANT}.png`, monochromeImage: './assets/brand/adaptive-monochrome.png' },
    // Drivers: keep sharing GPS while the phone is locked or another app (maps) is open.
    permissions: VARIANT === 'driver' ? ['ACCESS_BACKGROUND_LOCATION', 'FOREGROUND_SERVICE', 'FOREGROUND_SERVICE_LOCATION'] : undefined,
    // Google Maps key for react-native-maps on Android (Settings → Integrations has the same key)
    config: process.env.GOOGLE_MAPS_ANDROID_KEY ? { googleMaps: { apiKey: process.env.GOOGLE_MAPS_ANDROID_KEY } } : undefined,
  },
  plugins: [
    ...config.plugins.filter((p) => p !== 'expo-audio'),
    ['expo-audio', { microphonePermission: 'Record voice-note directions for your driver.' }],
    ['expo-splash-screen', { backgroundColor: v.splash, image: `./assets/brand/splash-${VARIANT}.png`, imageWidth: 180 }],
    ['expo-notifications', { color: '#17C74A', icon: './assets/brand/adaptive-monochrome.png' }],
    ['expo-location', VARIANT === 'driver'
      ? { locationWhenInUsePermission: locationText, locationAlwaysAndWhenInUsePermission: locationText, isAndroidBackgroundLocationEnabled: true, isAndroidForegroundServiceEnabled: true, isIosBackgroundLocationEnabled: true }
      : { locationWhenInUsePermission: locationText }],
    // Test builds talk to a laptop server over plain http on the local Wi-Fi; store builds are https-only.
    ['expo-build-properties', {
      android: {
        usesCleartextTraffic: process.env.ALLOW_HTTP === '1',
        // Test builds skip code shrinking (faster to debug); store builds shrink but must keep
        // WorkManager's Room database (used by notifications/background tasks) or the app crashes at launch.
        enableMinifyInReleaseBuilds: process.env.ALLOW_HTTP !== '1',
        extraProguardRules: [
          '-keep class * extends androidx.room.RoomDatabase { <init>(); }',
          '-keep class androidx.work.impl.WorkDatabase_Impl { *; }',
          '-keep class androidx.work.** { *; }',
        ].join('\n'),
      },
    }],
    // Crash & error reports (only active when EXPO_PUBLIC_SENTRY_DSN is set at build time).
    ['@sentry/react-native/expo', { organization: process.env.SENTRY_ORG, project: process.env.SENTRY_PROJECT }],
    ['expo-image-picker', { cameraPermission: VARIANT === 'driver' ? 'Take photos of your documents and proof of delivery.' : 'Take photos of your gate so drivers can find you.', photosPermission: 'Choose photos from your library.' }],
  ],
  extra: {
    variant: VARIANT,
    apiUrl: API_URL,
    eas: { projectId: process.env.EAS_PROJECT_ID ?? 'a1854f97-5f84-484c-96a3-25b74b89d37e' },
  },
});
