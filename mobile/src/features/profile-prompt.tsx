import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, TextInput, View } from 'react-native';
import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Button, Text, useTheme } from '@/ui';
import { GoogleButton } from './google-signin';

const ASKED = 'zvino.profile.asked';

/**
 * Customers without an email (new phone sign-ups): a friendly sheet asking for their name (if
 * missing) and email, or one tap with Google. Asked again at most once every 3 days if skipped.
 */
export function ProfilePrompt() {
    const t = useTheme();
    const { me, refresh } = useSession();
    const [open, setOpen] = useState(false);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [busy, setBusy] = useState(false);
    const needsName = !me?.name;

    useEffect(() => {
        if (!me || me.email || (me.role && me.role !== 'customer')) return;
        let cancelled = false;
        AsyncStorage.getItem(ASKED).then((at) => {
            if (!cancelled && (!at || Date.now() - Number(at) > 3 * 86400000)) setTimeout(() => !cancelled && setOpen(true), 1200);
        }).catch(() => {});
        return () => { cancelled = true; };
    }, [me?.id, me?.email]); // eslint-disable-line react-hooks/exhaustive-deps

    const later = () => { AsyncStorage.setItem(ASKED, String(Date.now())).catch(() => {}); setOpen(false); };
    const save = async () => {
        setBusy(true);
        try {
            await api.patch('/me', { email: email.trim(), ...(needsName ? { name: name.trim() } : {}) });
            await refresh();
            setOpen(false);
        } catch (e) {
            Alert.alert('Couldn’t save', e instanceof ApiError ? e.friendly : '');
        } finally {
            setBusy(false);
        }
    };
    const withGoogle = async (idToken: string) => {
        setBusy(true);
        try {
            await api.post('/auth/google', { id_token: idToken }); // signed in: links Google and fills the email
            await refresh();
            setOpen(false);
        } catch (e) {
            Alert.alert('Google', e instanceof ApiError ? e.friendly : '');
        } finally {
            setBusy(false);
        }
    };

    if (!open) return null;
    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    const input = { height: 52, borderRadius: 14, borderWidth: 1.5, borderColor: t.border, paddingHorizontal: 16, fontSize: 16, color: t.ink, backgroundColor: t.surface } as const;

    return (
        <Modal visible transparent animationType="slide" onRequestClose={later}>
            <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }} onPress={later} />
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <View style={{ backgroundColor: t.bg, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 22, paddingBottom: 34, gap: 12 }}>
                    <Text variant="title">{needsName ? 'Finish your profile' : 'Add your email'}</Text>
                    <Text color="muted">For your receipts, order updates and account recovery.</Text>
                    <GoogleButton label="Use my Google account" onToken={withGoogle} disabled={busy} />
                    {needsName && <TextInput value={name} onChangeText={setName} placeholder="Your name" placeholderTextColor={t.faint} autoComplete="name" style={input} />}
                    <TextInput value={email} onChangeText={setEmail} placeholder="you@example.com" placeholderTextColor={t.faint} keyboardType="email-address" autoCapitalize="none" autoComplete="email" style={input} />
                    <Button title="Save" loading={busy} disabled={!validEmail || (needsName && name.trim().length < 2)} onPress={save} />
                    <Pressable onPress={later} style={{ alignSelf: 'center', padding: 6 }}><Text variant="label" color="muted">Not now</Text></Pressable>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}
