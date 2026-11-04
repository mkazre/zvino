import Constants from 'expo-constants';

export type Variant = 'customer' | 'driver' | 'merchant';

const extra = (Constants.expoConfig?.extra ?? {}) as { variant?: Variant; apiUrl?: string };

/** Which of the three apps this build is. */
export const VARIANT: Variant = extra.variant ?? 'customer';
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? extra.apiUrl ?? 'http://10.0.2.2:8001').replace(/\/$/, '');
