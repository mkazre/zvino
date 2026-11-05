import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, ApiError, type Money } from '@/lib/api';
import { timeAgo, zig } from '@/lib/money';
import { useSession } from '@/lib/session';
import { Button, Card, Row, SectionTitle, Text, useTheme } from '@/ui';

interface Wallet { balance: Money; transactions: { id: number; type: 'credit' | 'debit'; amount_zig: number; reason: string; created_at: string }[] }
interface Loyalty { points: number; lifetime_points: number; tier: string; next: { name: string; points_needed: number; threshold: number } | null }
interface Reward { id: number; name: string; points_cost: number }
interface Referral { code: string; you_get: Money; friend_gets: Money; invited: number }

/** Wallet, Zvino Rewards, gift-card redemption and referrals. */
export default function WalletScreen() {
    const t = useTheme();
    const { refresh } = useSession();
    const [wallet, setWallet] = useState<Wallet | null>(null);
    const [loyalty, setLoyalty] = useState<Loyalty | null>(null);
    const [rewards, setRewards] = useState<Reward[]>([]);
    const [ref, setRef] = useState<Referral | null>(null);
    const [code, setCode] = useState('');

    const load = useCallback(() => {
        api.get<Wallet>('/wallet').then(setWallet);
        api.get<Loyalty>('/loyalty/me').then(setLoyalty);
        api.get<Reward[]>('/loyalty/rewards').then(setRewards);
        api.get<Referral>('/referral').then(setRef);
    }, []);
    useFocusEffect(load);

    const act = async (fn: () => Promise<unknown>, ok: string) => {
        try {
            await fn();
            Alert.alert(ok);
            load();
            refresh();
        } catch (e) {
            Alert.alert('Oops', e instanceof ApiError ? e.friendly : 'Please try again.');
        }
    };

    return (
        <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.bg }}>
            <Row style={{ paddingHorizontal: 20, paddingVertical: 12 }}>
                <Pressable onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color={t.ink} /></Pressable>
                <Text variant="title" style={{ fontSize: 22 }}>Wallet & rewards</Text>
            </Row>
            <ScrollView contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 48 }}>
                <Card tone="inverse">
                    <Text variant="caption" style={{ color: 'rgba(255,255,255,0.6)' }}>Zvino wallet</Text>
                    <Text variant="display" color="onInverse">{zig(wallet?.balance.zig)}</Text>
                    <Text variant="caption" style={{ color: 'rgba(255,255,255,0.6)' }}>${wallet?.balance.usd.toFixed(2) ?? '0.00'}</Text>
                    <Row gap={8} style={{ marginTop: 14 }}>
                        <TextInput value={code} onChangeText={(v) => setCode(v.toUpperCase())} placeholder="Gift card code" placeholderTextColor="rgba(255,255,255,0.4)" autoCapitalize="characters" style={{ flex: 1, height: 44, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 12, color: '#fff' }} />
                        <Button title="Redeem" size="md" tone="soft" disabled={!code} onPress={() => act(() => api.post('/gift-cards/redeem', { code }), 'Gift card added to your wallet 🎉')} />
                    </Row>
                </Card>

                {loyalty && (
                    <Card tone="gold">
                        <Row justify="space-between"><Text variant="caption" style={{ color: '#6b4e05' }}>Zvino Rewards</Text><Text variant="label" style={{ color: '#3d2c03' }}>{loyalty.tier}</Text></Row>
                        <Text variant="display" style={{ color: '#3d2c03' }}>{loyalty.points} pts</Text>
                        {loyalty.next && (
                            <>
                                <View style={{ height: 6, borderRadius: 3, backgroundColor: 'rgba(0,0,0,0.08)', marginTop: 10 }}><View style={{ height: 6, borderRadius: 3, backgroundColor: t.gold, width: `${Math.min(100, (loyalty.lifetime_points / loyalty.next.threshold) * 100)}%` }} /></View>
                                <Text variant="caption" style={{ color: '#6b4e05', marginTop: 6 }}>{loyalty.next.points_needed} points to {loyalty.next.name}</Text>
                            </>
                        )}
                    </Card>
                )}

                <SectionTitle>Spend your points</SectionTitle>
                {rewards.map((r) => (
                    <Card key={r.id}>
                        <Row>
                            <Text style={{ fontSize: 26 }}>🎁</Text>
                            <View style={{ flex: 1 }}><Text variant="label">{r.name}</Text><Text variant="caption">{r.points_cost} pts</Text></View>
                            <Button title="Redeem" size="sm" disabled={(loyalty?.points ?? 0) < r.points_cost} onPress={() => act(() => api.post('/loyalty/redeem', { reward_id: r.id }), 'Reward redeemed!')} />
                        </Row>
                    </Card>
                ))}

                {ref && (
                    <>
                        <SectionTitle>Invite friends</SectionTitle>
                        <Card tone="brand">
                            <Text variant="heading" style={{ color: '#fff' }}>Give {zig(ref.friend_gets.zig)}, get {zig(ref.you_get.zig)}</Text>
                            <Text variant="caption" style={{ color: 'rgba(255,255,255,0.8)' }}>When a friend’s first order is delivered. {ref.invited} invited so far.</Text>
                            <Row gap={8} style={{ marginTop: 12 }}>
                                <Pressable onPress={() => { Clipboard.setStringAsync(ref.code); Alert.alert('Code copied'); }} style={{ flex: 1, height: 46, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}><Text variant="mono" style={{ color: '#fff', fontSize: 18 }}>{ref.code}</Text></Pressable>
                                <Button title="Share" size="md" tone="soft" onPress={() => Share.share({ message: `Get ${zig(ref.friend_gets.zig)} off your first Zvino order with my code ${ref.code} 🍲 https://zvino.online` })} />
                            </Row>
                        </Card>
                    </>
                )}

                <SectionTitle>Activity</SectionTitle>
                {wallet?.transactions.map((tx) => (
                    <Row key={tx.id} justify="space-between" style={{ paddingVertical: 10, borderBottomWidth: 0.5, borderColor: t.border }}>
                        <View style={{ flex: 1 }}><Text variant="label">{tx.reason}</Text><Text variant="caption">{timeAgo(tx.created_at)}</Text></View>
                        <Text variant="label" color={tx.type === 'credit' ? 'brand' : 'ink'}>{tx.type === 'credit' ? '+' : '−'}{zig(tx.amount_zig)}</Text>
                    </Row>
                ))}
            </ScrollView>
        </SafeAreaView>
    );
}
