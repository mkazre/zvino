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
  customer: { name: 'Zvino', id: 'zw.co.zvino', scheme: 'zvino', splash: '#0B6E4F' },
  driver: { name: 'Zvino Driver', id: 'zw.co.zvino.driver', scheme: 'zvinodriver', splash: '#111412' },
  merchant: { name: 'Zvino Merchant', id: 'zw.co.zvino.merchant', scheme: 'zvinomerchant', splash: '#111412' },
};
const v = VARIANTS[VARIANT] ?? VARIANTS.customer;

const locationText = {
  customer: 'Zvino uses your location to find restaurants near you and pin your delivery address.',
  driver: 'Zvino Driver shares your location while you are online so customers can track their order and we can offer you nearby jobs.',
  merchant: 'Zvino Merchant does not need your location.',
}[VARIANT];

module.exports = ({ config }) => ({
  ...config,
  name: v.name,
  scheme: v.scheme,
  ios: {
    ...config.ios,
    bundleIdentifier: v.id,
    supportsTablet: VARIANT === 'merchant',
    infoPlist: { ITSAppUsesNonExemptEncryption: false },
  },
  android: {
    ...config.android,
    package: v.id,
    adaptiveIcon: { backgroundColor: v.splash },
    // Google Maps key for react-native-maps on Android (Settings → Integrations has the same key)
    config: process.env.GOOGLE_MAPS_ANDROID_KEY ? { googleMaps: { apiKey: process.env.GOOGLE_MAPS_ANDROID_KEY } } : undefined,
  },
  plugins: [
    ...config.plugins.filter((p) => p !== 'expo-audio'),
    ['expo-audio', { microphonePermission: 'Record voice-note directions for your driver.' }],
    ['expo-splash-screen', { backgroundColor: v.splash, image: './assets/images/splash-icon.png', imageWidth: 96 }],
    ['expo-notifications', { color: '#0B6E4F' }],
    ['expo-location', { locationWhenInUsePermission: locationText }],
    ['expo-image-picker', { cameraPermission: VARIANT === 'driver' ? 'Take photos of your documents and proof of delivery.' : 'Take photos of your gate so drivers can find you.', photosPermission: 'Choose photos from your library.' }],
  ],
  extra: {
    variant: VARIANT,
    apiUrl: API_URL,
    eas: { projectId: process.env.EAS_PROJECT_ID },
  },
});
