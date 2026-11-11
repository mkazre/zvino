import Ionicons from '@expo/vector-icons/Ionicons';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef } from 'react';
import { Pressable, Text as RNText, View } from 'react-native';

WebBrowser.maybeCompleteAuthSession();

/**
 * "Continue with Google". Client ids come from the build (EAS env):
 *   EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID, EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID, EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
 * The same ids go in Admin → Settings → Integrations so the server accepts the sign-in.
 */
const IDS = {
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
};
export const googleAvailable = !!(IDS.androidClientId || IDS.iosClientId);

/** Button that returns a Google ID token to onToken (only rendered when Google is configured). */
export function GoogleButton({ label = 'Continue with Google', onToken, onError, disabled }: { label?: string; onToken: (idToken: string) => void; onError?: (message: string) => void; disabled?: boolean }) {
    if (!googleAvailable) return null;
    return <GoogleButtonInner label={label} onToken={onToken} onError={onError} disabled={disabled} />;
}

function GoogleButtonInner({ label, onToken, onError, disabled }: { label: string; onToken: (idToken: string) => void; onError?: (message: string) => void; disabled?: boolean }) {
    const [request, response, prompt] = Google.useIdTokenAuthRequest({ ...IDS, selectAccount: true });
    const handled = useRef<string | null>(null);
    useEffect(() => {
        if (!response) return;
        if (response.type === 'success') {
            const token = response.params.id_token ?? response.authentication?.idToken;
            if (token && handled.current !== token) {
                handled.current = token;
                onToken(token);
            }
        } else if (response.type === 'error') {
            onError?.('Google sign-in didn’t complete. Please try again.');
        }
    }, [response]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <Pressable onPress={() => prompt()} disabled={!request || disabled} accessibilityRole="button"
            style={({ pressed }) => ({ height: 56, borderRadius: 28, borderWidth: 1, borderColor: '#DADCE0', backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, opacity: !request || disabled ? 0.5 : pressed ? 0.85 : 1 })}>
            <View style={{ width: 22, height: 22, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="logo-google" size={20} color="#4285F4" /></View>
            <RNText style={{ fontSize: 16, fontWeight: '600', color: '#1F1F1F' }}>{label}</RNText>
        </Pressable>
    );
}
