import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { api, ApiError } from '@/lib/api';
import { Button, Text, useTheme } from '@/ui';
import { useDeviceInsets } from '@/lib/insets';

const TOPICS = ['Missing or wrong item', 'Late delivery', 'Payment or refund', 'Quality of my order', 'Something else'];

/** "Send us a message": a support ticket, optionally about an order. */
export function TicketSheet({ open, onClose, orderId, reference }: { open: boolean; onClose: () => void; orderId?: number; reference?: string }) {
    const t = useTheme();
    const nav = useDeviceInsets();
    const [topic, setTopic] = useState(TOPICS[0]);
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);

    const send = async () => {
        setBusy(true);
        try {
            const r = await api.post<{ id: number }>('/support/tickets', { subject: topic + (reference ? ` · #${reference}` : ''), message: message.trim(), order_id: orderId });
            setMessage('');
            onClose();
            Alert.alert('Message sent', `Thanks, we’ve got it (ticket #${r.id}). We’ll reply in the app.`);
        } catch (e) {
            Alert.alert('Couldn’t send', e instanceof ApiError ? e.friendly : '');
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
            <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }} onPress={onClose} />
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <View style={{ backgroundColor: t.bg, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 22, paddingBottom: 34 + nav.bottom, gap: 14 }}>
                    <Text variant="title">Send us a message</Text>
                    {reference ? <Text color="muted">About order #{reference}. We usually reply within the hour.</Text> : null}
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                        {TOPICS.map((x) => (
                            <Pressable key={x} onPress={() => setTopic(x)} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99, borderWidth: 1, borderColor: topic === x ? t.ink : t.border, backgroundColor: topic === x ? t.ink : 'transparent' }}>
                                <Text variant="label" style={{ color: topic === x ? t.bg : t.ink }}>{x}</Text>
                            </Pressable>
                        ))}
                    </ScrollView>
                    <TextInput value={message} onChangeText={setMessage} multiline maxLength={3000} placeholder="Tell us what happened…" placeholderTextColor={t.faint}
                        style={{ minHeight: 120, borderRadius: 14, borderWidth: 1.5, borderColor: t.border, padding: 14, fontSize: 15, color: t.ink, textAlignVertical: 'top', backgroundColor: t.surface }} />
                    <Button title="Send" loading={busy} disabled={message.trim().length < 5} onPress={send} />
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}
