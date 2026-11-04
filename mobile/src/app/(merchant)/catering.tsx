import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Linking, Pressable } from 'react-native';
import { api, ApiError } from '@/lib/api';
import { label, zig } from '@/lib/money';
import { Badge, Button, Card, Empty, Input, Row, Screen, Text, useTheme } from '@/ui';

interface Req { id: number; reference: string; event_type: string; event_at: string; headcount: number; location: string; contact_name: string | null; contact_phone: string | null; notes: string | null; status: string; quote_zig: number | null; deposit_zig: number; paid_zig: number; customer: { name: string | null } | null }

/** Store manager: quote catering requests, see deposits, mark events delivered. */
export default function MerchantCatering() {
    const t = useTheme();
    const [d, setD] = useState<{ accepts_catering: boolean; requests: Req[] } | null>(null);
    const [quoting, setQuoting] = useState<number | null>(null);
    const [price, setPrice] = useState('');
    const [note, setNote] = useState('');

    const load = useCallback(() => { api.get<{ accepts_catering: boolean; requests: Req[] }>('/merchant/catering').then(setD).catch(() => {}); }, []);
    useFocusEffect(load);
    const act = (r: Req, action: string, body: Record<string, unknown> = {}) => api.post(`/merchant/catering/${r.id}`, { action, ...body }).then(() => { setQuoting(null); load(); }).catch((e) => Alert.alert('Catering', e instanceof ApiError ? e.friendly : ''));

    return (
        <Screen onRefresh={load}>
            <Row gap={12} style={{ marginTop: 8 }}>
                <Pressable onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color={t.ink} /></Pressable>
                <Text variant="title" style={{ flex: 1 }}>Catering</Text>
            </Row>
            {d && !d.accepts_catering && (
                <Card tone="gold" style={{ marginTop: 14, gap: 8 }}>
                    <Text>You’re not taking catering requests. Turn it on to get funeral, wedding and gathering bookings.</Text>
                    <Button title="Take catering requests" size="md" tone="dark" onPress={() => api.patch('/merchant/store', { accepts_catering: true }).then(load)} />
                </Card>
            )}
            {d?.requests.length === 0 && <Empty emoji="🍲" title="No catering requests" />}
            {d?.requests.map((r) => (
                <Card key={r.id} style={{ marginTop: 12, gap: 4 }}>
                    <Row justify="space-between"><Text variant="heading">{label(r.event_type)} · {r.headcount} people</Text><Badge tone={r.status === 'requested' ? 'red' : ['deposit_paid', 'paid'].includes(r.status) ? 'brand' : 'neutral'}>{label(r.status)}</Badge></Row>
                    <Text color="muted">{new Date(r.event_at).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {r.location}</Text>
                    <Pressable onPress={() => r.contact_phone && Linking.openURL(`tel:${r.contact_phone}`)}><Text variant="caption">{r.contact_name} · {r.contact_phone} 📞</Text></Pressable>
                    {r.notes && <Text variant="caption">“{r.notes}”</Text>}
                    {r.quote_zig != null && <Text>Quoted {zig(r.quote_zig)} · paid {zig(r.paid_zig)}</Text>}
                    {quoting === r.id ? (
                        <>
                            <Input label="Total price (ZiG)" value={price} onChangeText={setPrice} keyboardType="decimal-pad" />
                            <Input label="What’s included" value={note} onChangeText={setNote} placeholder="Menu, serving staff, plates…" />
                            <Row gap={8}><Button title="Cancel" tone="ghost" size="md" style={{ flex: 1 }} onPress={() => setQuoting(null)} /><Button title="Send quote" tone="primary" size="md" style={{ flex: 1 }} disabled={!Number(price)} onPress={() => act(r, 'quote', { quote_zig: Number(price), note })} /></Row>
                        </>
                    ) : (
                        <Row gap={8} style={{ marginTop: 6 }}>
                            {['requested', 'quoted'].includes(r.status) && <Button title={r.status === 'quoted' ? 'Change quote' : 'Quote'} tone="primary" size="sm" onPress={() => { setQuoting(r.id); setPrice(r.quote_zig ? String(r.quote_zig) : ''); setNote(''); }} />}
                            {['deposit_paid', 'paid'].includes(r.status) && <Button title="Delivered ✓" tone="primary" size="sm" onPress={() => act(r, 'complete')} />}
                            {['requested', 'quoted', 'deposit_paid', 'paid'].includes(r.status) && <Button title="Decline" tone="ghost" size="sm" onPress={() => Alert.alert('Decline this booking?', 'Any deposit is refunded to the customer.', [{ text: 'Keep', style: 'cancel' }, { text: 'Decline', style: 'destructive', onPress: () => act(r, 'decline') }])} />}
                        </Row>
                    )}
                </Card>
            ))}
        </Screen>
    );
}
