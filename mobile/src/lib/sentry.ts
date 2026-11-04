import * as Sentry from '@sentry/react-native';
import { VARIANT } from './config';

/** Crash and error reporting. Only active when the build has EXPO_PUBLIC_SENTRY_DSN. */
export const SENTRY_ENABLED = !!process.env.EXPO_PUBLIC_SENTRY_DSN;

if (SENTRY_ENABLED) {
    Sentry.init({
        dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
        environment: __DEV__ ? 'development' : 'production',
        tracesSampleRate: 0.1,
        sendDefaultPii: false,
        initialScope: { tags: { app: VARIANT } },
    });
}

export function identify(user: { id: number; role: string } | null) {
    if (SENTRY_ENABLED) Sentry.setUser(user ? { id: String(user.id), segment: user.role } : null);
}

export { Sentry };
