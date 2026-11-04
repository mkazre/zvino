import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCart } from '@/lib/cart';
import { zig } from '@/lib/money';
import { useSession } from '@/lib/session';
import { Button, Empty, Row, Text, useTheme } from '@/ui';

export default function Cart() {
    const t = useTheme();
    const { me } = useSession();
    const { store, lines, subtotal, setQty, clear } = useCart();
    const short = store ? Math.max(0, store.min_order_zig - subtotal) : 0;

    return (
        <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: t.bg }}>
            <Row justify="space-between" style={{ padding: 20 }}>
                <View><Text variant="title">Basket</Text>{store && <Text variant="caption">{store.name}</Text>}</View>
                <Pressable onPress={() => router.back()}><Ionicons name="close" size={26} color={t.ink} /></Pressable>
            </Row>
            {!lines.length ? (
                <Empty emoji="🛍️" title="Your basket is empty" body="Add something delicious to get started." action={<Button title="Browse stores" onPress={() => router.replace('/search')} size="md" />} />
            ) : (
                <>
                    <ScrollView contentContainerStyle={{ paddingHorizontal: 20 }}>
                        {lines.map((l) => (
                            <Row key={l.key} align="flex-start" style={{ paddingVertical: 14, borderBottomWidth: 0.5, borderColor: t.border }}>
                                <View style={{ flex: 1, gap: 2 }}>
                                    <Text variant="label">{l.name}</Text>
                                    {(l.variant || l.modifiers.length > 0) && <Text variant="caption">{[l.variant, ...l.modifiers].filter(Boolean).join(' · ')}</Text>}
                                    {l.notes && <Text variant="caption">“{l.notes}”</Text>}
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
                        {short > 0 && <Text variant="caption" color="gold">Add {zig(short)} more to reach the minimum order.</Text>}
                        <Button title={me ? 'Go to checkout' : 'Sign in to check out'} disabled={short > 0} onPress={() => router.push(me ? '/checkout' : '/sign-in')} />
                    </View>
                </>
            )}
        </SafeAreaView>
    );
}
