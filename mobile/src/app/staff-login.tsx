import * as Device from 'expo-device';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Button, Input, Screen, Text, useTheme } from '@/ui';

/** Merchant app: store manager, cashier (POS) and kitchen staff sign in with email + password. */
export default function StaffLogin() {
    const t = useTheme();
    const { signIn } = useSession();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const login = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.post<{ token: string }>('/auth/staff/login', { email: email.trim(), password, device_name: Device.modelName ?? 'merchant' });
            await signIn(res.token);
            router.replace('/');
        } catch (e) {
            setError(e instanceof ApiError ? e.friendly : 'Could not sign in.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Screen scroll={false}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'center', gap: 14, maxWidth: 460, width: '100%', alignSelf: 'center' }}>
                <View style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: t.inverse, alignItems: 'center', justifyContent: 'center' }}><Text variant="title" color="onInverse">z</Text></View>
                <Text variant="display">Zvino Merchant</Text>
                <Text color="muted">Sign in with the staff account your Zvino admin created for you.</Text>
                <View style={{ gap: 12, marginTop: 12 }}>
                    <Input label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
                    <Input label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" onSubmitEditing={login} />
                    {error && <Text variant="caption" color="red">{error}</Text>}
                    <Button title="Sign in" onPress={login} loading={loading} disabled={!email || !password} />
                </View>
                <Text variant="caption" center style={{ marginTop: 8 }}>Managers see the full store. Cashiers open the POS. Kitchen staff open the kitchen display.</Text>
            </KeyboardAvoidingView>
        </Screen>
    );
}
