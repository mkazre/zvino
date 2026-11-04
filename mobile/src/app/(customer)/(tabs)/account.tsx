import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Alert, Pressable, View } from 'react-native';
import { zig } from '@/lib/money';
import { useSession } from '@/lib/session';
import { Button, Card, Empty, Row, Screen, Text, useTheme } from '@/ui';

export default function Account() {
    const t = useTheme();
    const { me, signOut } = useSession();
    if (!me) return <Screen><Empty emoji="👋" title="Welcome to Zvino" body="Sign in to save addresses, earn rewards and track orders." action={<Button title="Sign in" size="md" onPress={() => router.push('/sign-in')} />} /></Screen>;

    const Item = ({ icon, title, sub, onPress }: { icon: keyof typeof Ionicons.glyphMap; title: string; sub?: string; onPress: () => void }) => (
        <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 15, borderBottomWidth: 0.5, borderColor: t.border }}>
            <Ionicons name={icon} size={22} color={t.ink} />
            <View style={{ flex: 1 }}><Text variant="label">{title}</Text>{sub && <Text variant="caption">{sub}</Text>}</View>
            <Ionicons name="chevron-forward" size={18} color={t.faint} />
        </Pressable>
    );

    return (
        <Screen>
            <Text variant="title" style={{ marginTop: 8 }}>{me.name || 'Your account'}</Text>
            <Text color="muted">{me.phone}</Text>
            <Row gap={12} style={{ marginTop: 18 }}>
                <Card tone="inverse" style={{ flex: 1 }} onPress={() => router.push('/wallet')}><Text variant="caption" style={{ color: 'rgba(255,255,255,0.6)' }}>Wallet</Text><Text variant="heading" color="onInverse">{zig(me.wallet_balance_zig)}</Text></Card>
                <Card tone="gold" style={{ flex: 1 }} onPress={() => router.push('/wallet')}><Text variant="caption" style={{ color: '#6b4e05' }}>{me.tier}</Text><Text variant="heading" style={{ color: '#3d2c03' }}>{me.points} pts</Text></Card>
            </Row>
            {!me.zvino_plus && (
                <Card tone="brand" style={{ marginTop: 12 }} onPress={() => Alert.alert('Zvino+', 'Join from the website at zvino.co.zw/plus. In-app sign-up is coming soon.')}>
                    <Text variant="heading" style={{ color: '#fff' }}>Get free delivery with Zvino+</Text>
                    <Text variant="caption" style={{ color: 'rgba(255,255,255,0.8)' }}>Plus half-price service fees on every order.</Text>
                </Card>
            )}
            <View style={{ marginTop: 16 }}>
                <Item icon="location-outline" title="Addresses" onPress={() => router.push('/addresses')} />
                <Item icon="gift-outline" title="Rewards, wallet & gift cards" onPress={() => router.push('/wallet')} />
                <Item icon="share-social-outline" title="Invite friends, get credit" onPress={() => router.push('/wallet')} />
                <Item icon="help-buoy-outline" title="Help & support" sub="WhatsApp, call or chat" onPress={() => Alert.alert('Zvino support', 'WhatsApp or call +263 242 000 000')} />
            </View>
            <Button title="Sign out" tone="ghost" onPress={signOut} style={{ marginTop: 24 }} />
        </Screen>
    );
}
