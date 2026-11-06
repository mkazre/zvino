import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Alert, Pressable, TextInput, View } from 'react-native';
import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Button, Row, Text, useTheme } from '@/ui';

let dismissedThisLaunch = false;

/** "Add your email for receipts and order updates": shown to signed-in customers without one. */
export function EmailCard({ dismissible = true }: { dismissible?: boolean }) {
    const t = useTheme();
    const { me, refresh } = useSession();
    const [email, setEmail] = useState('');
    const [busy, setBusy] = useState(false);
    const [hidden, setHidden] = useState(dismissible && dismissedThisLaunch);
    if (!me || me.email || hidden) return null;

    const save = async () => {
        setBusy(true);
        try {
            await api.patch('/me', { email: email.trim() });
            await refresh();
            Alert.alert('Email saved', 'We’ll send your receipts and order updates there.');
        } catch (e) {
            Alert.alert('Email', e instanceof ApiError ? e.friendly : 'Please check the address and try again.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <View style={{ padding: 16, borderRadius: 18, backgroundColor: t.brandSoft, gap: 10 }}>
            <Row justify="space-between" align="flex-start">
                <Row gap={10} style={{ flex: 1 }}>
                    <Ionicons name="mail-outline" size={22} color={t.brandText} />
                    <View style={{ flex: 1 }}><Text variant="label">Add your email</Text><Text variant="caption">Get receipts and order updates by email.</Text></View>
                </Row>
                {dismissible && <Pressable onPress={() => { dismissedThisLaunch = true; setHidden(true); }} accessibilityLabel="Not now"><Ionicons name="close" size={20} color={t.muted} /></Pressable>}
            </Row>
            <Row gap={8}>
                <TextInput value={email} onChangeText={setEmail} placeholder="you@example.com" placeholderTextColor={t.faint} keyboardType="email-address" autoCapitalize="none" autoComplete="email"
                    style={{ flex: 1, height: 46, borderRadius: 12, backgroundColor: t.surface, color: t.ink, paddingHorizontal: 12, borderWidth: 1, borderColor: t.border }} />
                <Button title="Save" size="md" onPress={save} loading={busy} disabled={!/^\S+@\S+\.\S+$/.test(email.trim())} />
            </Row>
        </View>
    );
}
