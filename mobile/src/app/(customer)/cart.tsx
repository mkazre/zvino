import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SubstitutePicker } from '@/features/substitute-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { type CartLine, useCart } from '@/lib/cart';
import { zig } from '@/lib/money';
import { useSession } from '@/lib/session';
import { Button, Empty, Row, Text, useTheme } from '@/ui';

export default function Cart() {
    const t = useTheme();
    const { me } = useSession();
    const { store, lines, subtotal, setQty, setSubstitute, clear, buffer } = useCart();
    const [subFor, setSubFor] = useState<CartLine | null>(null);
    const short = store ? Math.max(0, store.min_order_zig - subtotal) : 0;

    return (
        <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: t.bg }}>
            <Row justify="space-between" style={{ padding: 20 }}>
                <View><Text variant="title">Basket</Text>{store && <Text variant="caption">{store.name}</Text>}</View>
                <Pressable onPress={() => router.back()}><Ionicons name="close" size={26} color={t.ink} /></Pressable>
            </Row>
            {!lines.length ? (
                <Empty icon="bag-handle-outline" title="Your basket is empty" body="Add something delicious to get started." action={<Button title="Browse stores" onPress={() => router.replace('/search')} size="md" />} />
            ) : (
                <>
                    <ScrollView contentContainerStyle={{ paddingHorizontal: 20 }}>
                        {lines.map((l) => (
                            <Row key={l.key} align="flex-start" style={{ paddingVertical: 14, borderBottomWidth: 0.5, borderColor: t.border }}>
                                <View style={{ flex: 1, gap: 2 }}>
                                    <Text variant="label">{l.name}</Text>
                                    {(l.variant || l.modifiers.length > 0) && <Text variant="caption">{[l.variant, ...l.modifiers].filter(Boolean).join(' · ')}</Text>}
                                    {l.notes && <Text variant="caption">“{l.notes}”</Text>}
                                    {store?.is_shopper_store && (
                                        <Pressable onPress={() => setSubFor(l)} accessibilityRole="button"
                                            style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99, borderWidth: 1, borderColor: l.substitute ? t.brand : t.border, backgroundColor: l.substitute ? t.brandSoft : 'transparent', maxWidth: '100%' }}>
                                            <Ionicons name="repeat" size={13} color={l.substitute ? t.brandText : t.muted} />
                                            <Text variant="caption" numberOfLines={1} style={{ fontWeight: '700', color: l.substitute ? t.brandText : t.muted, flexShrink: 1 }}>{l.substitute ? `Substitute: ${l.substitute.name}` : 'Select substitute (optional)'}</Text>
                                        </Pressable>
                                    )}
                                    <Text variant="label" style={{ marginTop: 4 }}>{zig(l.unit_zig * l.quantity)}</Text>
                                </View>
                                <Row gap={0} style={{ backgroundColor: t.subtle, borderRadius: 99 }}>
                                    <Pressable onPress={() => setQty(l.key, l.quantity - 1)} style={{ padding: 10 }}><Ionicons name={l.quantity === 1 ? 'trash-outline' : 'remove'} size={16} color={t.ink} /></Pressable>
                                    <Text variant="label">{l.quantity}</Text>
                                    <Pressable onPress={() => setQty(l.key, l.quantity + 1)} style={{ padding: 10 }}><Ionicons name="add" size={16} color={t.ink} /></Pressable>
                                </Row>
                            </Row>
                        ))}
                        <Pressable onPress={clear} style={{ paddingVertical: 16 }}><Text variant="label" color="red">Clear basket</Text></Pressable>
                    </ScrollView>
                    <View style={{ padding: 20, gap: 10, borderTopWidth: 0.5, borderColor: t.border }}>
                        <Row justify="space-between"><Text color="muted">Subtotal</Text><Text variant="heading">{zig(subtotal)}</Text></Row>
                        {buffer > 0 && <Row justify="space-between"><Text variant="caption">Substitute buffer (refunded if not used)</Text><Text variant="label">{zig(buffer)}</Text></Row>}
                        {short > 0 && <Text variant="caption" color="gold">Add {zig(short)} more to reach the minimum order.</Text>}
                        <Button title={me ? 'Go to checkout' : 'Sign in to check out'} disabled={short > 0} onPress={() => router.push(me ? '/checkout' : '/sign-in')} />
                    </View>
                </>
            )}
            {subFor && <SubstitutePicker itemId={subFor.item_id} itemName={subFor.name} current={subFor.substitute} onPick={(s) => setSubstitute(subFor.key, s)} onClose={() => setSubFor(null)} />}
        </SafeAreaView>
    );
}
