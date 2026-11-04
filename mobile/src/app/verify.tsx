import * as Device from 'expo-device';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, TextInput, View } from 'react-native';
import { api, ApiError } from '@/lib/api';
import { VARIANT } from '@/lib/config';
import { useSession } from '@/lib/session';
import { Button, Input, Screen, Text, useTheme } from '@/ui';

/** Step 2 of 2: enter the SMS code. New customers add their name here. */
export default function Verify() {
    const t = useTheme();
    const { phone } = useLocalSearchParams<{ phone: string }>();
    const { signIn } = useSession();
    const [code, setCode] = useState('');
    const [name, setName] = useState('');
    const [isNew, setIsNew] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [resendIn, setResendIn] = useState(45);
    const ref = useRef<React.ComponentRef<typeof TextInput>>(null);

    useEffect(() => {
        if (resendIn <= 0) return;
        const timer = setTimeout(() => setResendIn(resendIn - 1), 1000);
        return () => clearTimeout(timer);
    }, [resendIn]);

    const verify = async (value = code) => {
        if (value.length !== 6) return;
        setLoading(true);
        setError(null);
        try {
            const res = await api.post<{ token: string; is_new: boolean }>('/auth/otp/verify', { phone, code: value, device_name: Device.modelName ?? 'mobile' });
            if (res.is_new && !name) {
                // keep token, ask for name before entering the app
                setIsNew(true);
                await signIn(res.token);
                return;
            }
            await signIn(res.token);
            router.replace(VARIANT === 'driver' ? '/shift' : '/home');
        } catch (e) {
            setError(e instanceof ApiError ? e.friendly : 'That code didn’t work.');
            setCode('');
        } finally {
            setLoading(false);
        }
    };

    const saveName = async () => {
        await api.patch('/me', { name });
        router.replace(VARIANT === 'driver' ? '/driver-apply' : '/home');
    };

    if (isNew) {
        return (
            <Screen>
                <View style={{ gap: 14, paddingTop: 40 }}>
                    <Text variant="display">Welcome! 👋</Text>
                    <Text color="muted">What should we call you?</Text>
                    <Input autoFocus value={name} onChangeText={setName} placeholder="First name" />
                    <Button title="Let’s eat" onPress={saveName} disabled={name.trim().length < 2} />
                </View>
            </Screen>
        );
    }

    return (
        <Screen scroll={false}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, gap: 14, paddingTop: 24 }}>
                <Pressable onPress={() => router.back()}><Text variant="label" color="muted">← Change number</Text></Pressable>
                <Text variant="display" style={{ marginTop: 12 }}>Enter the code</Text>
                <Text color="muted">Sent to <Text variant="label">{phone}</Text></Text>
                <Pressable onPress={() => ref.current?.focus()} style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
                    {Array.from({ length: 6 }, (_, i) => (
                        <View key={i} style={{ flex: 1, height: 60, borderRadius: 14, borderWidth: 2, borderColor: error ? t.red : i === code.length ? t.ink : t.border, alignItems: 'center', justifyContent: 'center' }}>
                            <Text variant="title">{code[i] ?? ''}</Text>
                        </View>
                    ))}
                </Pressable>
                <TextInput ref={ref} autoFocus value={code} onChangeText={(v) => { const c = v.replace(/\D/g, '').slice(0, 6); setCode(c); if (c.length === 6) verify(c); }} keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="sms-otp" maxLength={6} style={{ position: 'absolute', opacity: 0, height: 1, width: 1 }} />
                {error && <Text variant="caption" color="red">{error}</Text>}
                <Button title="Verify" onPress={() => verify()} loading={loading} disabled={code.length !== 6} style={{ marginTop: 12 }} />
                <Pressable disabled={resendIn > 0} onPress={async () => { await api.post('/auth/otp/request', { phone }).catch(() => {}); setResendIn(45); }}>
                    <Text variant="label" color="muted" center>{resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}</Text>
                </Pressable>
            </KeyboardAvoidingView>
        </Screen>
    );
}
