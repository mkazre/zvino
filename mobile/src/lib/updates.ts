import * as Updates from 'expo-updates';
import { useEffect } from 'react';
import { AppState } from 'react-native';

/**
 * Over-the-air updates: on launch, check for a newer update and switch to it straight away
 * (instead of only on the next launch). When the app comes back to the foreground we download
 * quietly and apply on the next launch, so nobody loses what they're typing.
 */
export function useOtaUpdates() {
    useEffect(() => {
        if (__DEV__ || !Updates.isEnabled) return;
        const check = async (apply: boolean) => {
            try {
                const r = await Updates.checkForUpdateAsync();
                if (!r.isAvailable) return;
                await Updates.fetchUpdateAsync();
                if (apply) await Updates.reloadAsync();
            } catch {
                // offline or the update server is unreachable: try again next time
            }
        };
        check(true);
        const sub = AppState.addEventListener('change', (s) => { if (s === 'active') check(false); });
        return () => sub.remove();
    }, []);
}

/** "update 01a1d50a" when running an over-the-air update, "built-in" for the code inside the install. */
export function updateLabel(): string {
    if (!Updates.isEnabled) return 'dev';
    return Updates.updateId && !Updates.isEmbeddedLaunch ? `update ${Updates.updateId.slice(0, 8)}` : 'built-in';
}
