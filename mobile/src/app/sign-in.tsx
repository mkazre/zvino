import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, TextInput, View } from 'react-native';
import { api, ApiError } from '@/lib/api';
import { GoogleButton } from '@/features/google-signin';
import { useSession } from '@/lib/session';
import * as Device from 'expo-device';
import { VARIANT } from '@/lib/config';
import { normalisePhone } from '@/lib/money';
import { Button, Row, Screen, Text, useTheme, Logo } from '@/ui';

/** Step 1 of 2: phone number → SMS code. Used by the customer and driver apps. */
export default function SignIn() {
    const t = useTheme();
    const [phone, setPhone] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const valid = phone.replace(/\D/g, '').length >= 9;
    const { signIn } = useSession();
    const google = async (idToken: string) => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.post<{ token: string }>('/auth/google', { id_token: idToken, device_name: Device.modelName ?? 'mobile' });
            await signIn(res.token);
            router.replace(VARIANT === 'driver' ? '/shift' : '/home');
        } catch (e) {
            setError(e instanceof ApiError ? e.friendly : 'Google sign-in didn’t work.');
        } finally {
            setLoading(false);
        }
    };

    const send = async () => {
        setLoading(true);
        setError(null);
        try {
            await api.post('/auth/otp/request', { phone: normalisePhone(phone) });
            router.push({ pathname: '/verify', params: { phone: normalisePhone(phone) } });
        } catch (e) {
            setError(e instanceof ApiError ? e.friendly : 'Could not send the code.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Screen scroll={false}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'space-between', paddingTop: 24 }}>
                <View style={{ gap: 12 }}>
                    {VARIANT === 'customer' && router.canGoBack() && <Pressable onPress={() => router.back()}><Text variant="label" color="muted">✕  Not now</Text></Pressable>}
                    <View style={{ marginTop: 16 }}><Logo height={40} /></View>
                    <Text variant="display" style={{ marginTop: 12 }}>{VARIANT === 'driver' ? 'Drive with Zvino' : 'What’s your number?'}</Text>
                    <Text color="muted">We’ll text you a 6-digit code. No password needed.</Text>
                    <Row gap={0} style={{ marginTop: 20, height: 60, borderRadius: 16, borderWidth: 2, borderColor: error ? t.red : t.ink, overflow: 'hidden' }}>
                        <View style={{ paddingHorizontal: 16, height: '100%', justifyContent: 'center', borderRightWidth: 1, borderColor: t.border }}><Text variant="label">🇿🇼 +263</Text></View>
                        <TextInput autoFocus value={phone} onChangeText={setPhone} keyboardType="phone-pad" textContentType="telephoneNumber" autoComplete="tel" placeholder="77 123 4567" placeholderTextColor={t.faint} style={{ flex: 1, height: '100%', paddingHorizontal: 16, fontSize: 19, color: t.ink }} onSubmitEditing={() => valid && send()} />
                    </Row>
                    {error && <Text variant="caption" color="red">{error}</Text>}
                </View>
                <View style={{ gap: 12, paddingBottom: 12 }}>
                    <Button title="Continue" onPress={send} loading={loading} disabled={!valid} />
                    {VARIANT === 'customer' && <GoogleButton onToken={google} onError={setError} disabled={loading} />}
                    <Text variant="caption" center>By continuing you agree to Zvino’s Terms and Privacy Policy.</Text>
                </View>
            </KeyboardAvoidingView>
        </Screen>
    );
}
