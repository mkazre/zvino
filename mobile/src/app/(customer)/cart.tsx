import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ProductThumb } from '@/features/product-thumb';
import { SubstitutePicker } from '@/features/substitute-picker';
import { type CartLine, useCart } from '@/lib/cart';
import { alt, zig } from '@/lib/money';
import { useSession } from '@/lib/session';
import { Button, Empty, Row, Text, useTheme } from '@/ui';

/** Basket: product photos, quantities, optional substitutes (shops), and the way to checkout. */
export default function Cart() {
    const t = useTheme();
    const { me } = useSession();
    const { store, lines, subtotal, count, setQty, setSubstitute, clear, buffer } = useCart();
    const [subFor, setSubFor] = useState<CartLine | null>(null);
    const short = store ? Math.max(0, store.min_order_zig - subtotal) : 0;
    const progress = store && store.min_order_zig > 0 ? Math.min(1, subtotal / store.min_order_zig) : 1;
    const shop = !!store?.is_shopper_store;
    const confirmClear = () => Alert.alert('Empty your basket?', 'This removes every item.', [{ text: 'Keep', style: 'cancel' }, { text: 'Empty basket', style: 'destructive', onPress: clear }]);

    return (
        <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.canvas }}>
            <Row justify="space-between" style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 14, backgroundColor: t.bg }}>
                <View style={{ flex: 1 }}>
                    <Text variant="title">Your basket</Text>
                    {store && <Row gap={6} style={{ marginTop: 2 }}><Ionicons name="storefront-outline" size={14} color={t.muted} /><Text variant="caption" numberOfLines={1}>{store.name} · {count} item{count === 1 ? '' : 's'}</Text></Row>}
                </View>
                {lines.length > 0 && <Pressable onPress={confirmClear} hitSlop={8} style={{ paddingHorizontal: 12, height: 36, borderRadius: 18, justifyContent: 'center', marginRight: 6 }}><Text variant="label" color="muted">Clear</Text></Pressable>}
                <Pressable onPress={() => router.back()} accessibilityLabel="Close" style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.subtle, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="close" size={22} color={t.ink} /></Pressable>
            </Row>

            {!lines.length ? (
                <Empty icon="bag-handle-outline" title="Your basket is empty" body="Add something delicious to get started." action={<Button title="Browse stores" onPress={() => router.replace('/search')} size="md" />} />
            ) : (
                <>
                    <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
                        {lines.map((l) => (
                            <View key={l.key} style={{ backgroundColor: t.surface, borderRadius: 20, padding: 12, gap: 10, borderWidth: 1, borderColor: t.border }}>
                                <Row align="flex-start" gap={12}>
                                    <ProductThumb uri={l.image} size={72} product={shop} />
                                    <View style={{ flex: 1, gap: 2 }}>
                                        <Text variant="label" numberOfLines={2} style={{ fontSize: 15.5 }}>{l.name}</Text>
                                        {(l.variant || l.modifiers.length > 0) && <Text variant="caption" numberOfLines={2}>{[l.variant, ...l.modifiers].filter(Boolean).join(' · ')}</Text>}
                                        {l.notes ? <Row gap={4}><Ionicons name="chatbubble-ellipses-outline" size={12} color={t.muted} /><Text variant="caption" numberOfLines={1} style={{ flex: 1 }}>{l.notes}</Text></Row> : null}
                                        <Row justify="space-between" style={{ marginTop: 6 }}>
                                            <Text variant="heading" style={{ fontSize: 16 }}>{zig(l.unit_zig * l.quantity)}</Text>
                                            <Row gap={0} style={{ backgroundColor: t.subtle, borderRadius: 99, height: 36 }}>
                                                <Pressable onPress={() => setQty(l.key, l.quantity - 1)} accessibilityLabel={l.quantity === 1 ? 'Remove' : 'Less'} style={{ width: 38, height: 36, alignItems: 'center', justifyContent: 'center' }}><Ionicons name={l.quantity === 1 ? 'trash-outline' : 'remove'} size={17} color={l.quantity === 1 ? t.red : t.ink} /></Pressable>
                                                <Text variant="label" style={{ minWidth: 20, textAlign: 'center' }}>{l.quantity}</Text>
                                                <Pressable onPress={() => setQty(l.key, l.quantity + 1)} accessibilityLabel="More" style={{ width: 38, height: 36, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="add" size={18} color={t.ink} /></Pressable>
                                            </Row>
                                        </Row>
                                    </View>
                                </Row>
                                {shop && (
                                    <Pressable onPress={() => setSubFor(l)} accessibilityRole="button"
                                        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderStyle: l.substitute ? 'solid' : 'dashed', borderColor: l.substitute ? t.brand : t.border, backgroundColor: l.substitute ? t.brandSoft : 'transparent' }}>
                                        {l.substitute ? <ProductThumb uri={l.substitute.image} size={30} product radius={8} /> : <Ionicons name="repeat" size={16} color={t.muted} />}
                                        <Text variant="caption" numberOfLines={1} style={{ flex: 1, fontWeight: '700', color: l.substitute ? t.brandText : t.muted }}>{l.substitute ? `If out of stock: ${l.substitute.name}` : 'Select substitute (optional)'}</Text>
                                        <Ionicons name="chevron-forward" size={15} color={l.substitute ? t.brandText : t.faint} />
                                    </Pressable>
                                )}
                            </View>
                        ))}
                        <Pressable onPress={() => store && router.push(`/store/${store.id}`)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14 }}>
                            <Ionicons name="add-circle-outline" size={18} color={t.brandText} /><Text variant="label" color="brand">Add more items</Text>
                        </Pressable>
                    </ScrollView>

                    <View style={{ backgroundColor: t.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 16, gap: 10, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: -4 }, elevation: 12 }}>
                        <Row justify="space-between"><Text color="muted">Subtotal</Text><View style={{ alignItems: 'flex-end' }}><Text variant="heading">{zig(subtotal)}</Text>{alt(subtotal) ? <Text variant="caption">{alt(subtotal)}</Text> : null}</View></Row>
                        {buffer > 0 && <Row justify="space-between"><Text variant="caption">Substitute buffer (refunded if not used)</Text><Text variant="label">{zig(buffer)}</Text></Row>}
                        <Text variant="caption">Delivery and service fees are shown at checkout.</Text>
                        {short > 0 && (
                            <View style={{ gap: 6 }}>
                                <View style={{ height: 6, borderRadius: 3, backgroundColor: t.subtle, overflow: 'hidden' }}><View style={{ width: `${progress * 100}%`, height: 6, backgroundColor: t.gold }} /></View>
                                <Text variant="caption" color="gold">Add {zig(short)} more to reach the {zig(store!.min_order_zig)} minimum.</Text>
                            </View>
                        )}
                        <Button title={me ? `Go to checkout · ${zig(subtotal + buffer)}` : 'Sign in to check out'} disabled={short > 0} onPress={() => router.push(me ? '/checkout' : '/sign-in')} icon={<Ionicons name="arrow-forward" size={18} color="#fff" />} />
                    </View>
                </>
            )}
            {subFor && <SubstitutePicker itemId={subFor.item_id} itemName={subFor.name} current={subFor.substitute} onPick={(s) => setSubstitute(subFor.key, s)} onClose={() => setSubFor(null)} />}
        </SafeAreaView>
    );
}
