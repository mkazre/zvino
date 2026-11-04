import * as Haptics from 'expo-haptics';
import { type ReactNode } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Switch as RNSwitch, Text as RNText, TextInput, View, type TextInputProps, type TextStyle, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { radius, useTheme } from './theme';

export { useTheme } from './theme';

type TextVariant = 'display' | 'title' | 'heading' | 'body' | 'label' | 'caption' | 'mono';
const SIZES: Record<TextVariant, TextStyle> = {
    display: { fontSize: 32, lineHeight: 36, fontWeight: '800', letterSpacing: -1 },
    title: { fontSize: 24, lineHeight: 30, fontWeight: '800', letterSpacing: -0.6 },
    heading: { fontSize: 17, lineHeight: 22, fontWeight: '700', letterSpacing: -0.2 },
    body: { fontSize: 15, lineHeight: 21 },
    label: { fontSize: 14, lineHeight: 19, fontWeight: '600' },
    caption: { fontSize: 12.5, lineHeight: 17 },
    mono: { fontSize: 15, fontVariant: ['tabular-nums'], fontWeight: '700', letterSpacing: 1 },
};

export function Text({ children, variant = 'body', color, style, numberOfLines, center }: { children: ReactNode; variant?: TextVariant; color?: 'ink' | 'muted' | 'brand' | 'red' | 'gold' | 'onInverse' | 'onBrand' | 'faint'; style?: TextStyle; numberOfLines?: number; center?: boolean }) {
    const t = useTheme();
    return (
        <RNText numberOfLines={numberOfLines} style={[SIZES[variant], { color: t[color ?? (variant === 'caption' ? 'muted' : 'ink')], fontVariant: ['tabular-nums'] }, center && { textAlign: 'center' }, style]}>
            {children}
        </RNText>
    );
}

export function Screen({ children, scroll = true, padded = true, onRefresh, refreshing = false, style, edges = ['top'] }: { children: ReactNode; scroll?: boolean; padded?: boolean; onRefresh?: () => void; refreshing?: boolean; style?: ViewStyle; edges?: ('top' | 'bottom')[] }) {
    const t = useTheme();
    const inner = padded ? { paddingHorizontal: 20, paddingBottom: 32 } : undefined;
    return (
        <SafeAreaView edges={edges} style={[{ flex: 1, backgroundColor: t.bg }, style]}>
            {scroll ? (
                <ScrollView contentContainerStyle={inner} refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.brand} /> : undefined} keyboardShouldPersistTaps="handled">
                    {children}
                </ScrollView>
            ) : (
                <View style={[{ flex: 1 }, inner]}>{children}</View>
            )}
        </SafeAreaView>
    );
}

type ButtonTone = 'primary' | 'dark' | 'outline' | 'ghost' | 'danger' | 'soft';
export function Button({ title, onPress, tone = 'dark', loading, disabled, icon, size = 'lg', style }: { title: string; onPress?: () => void; tone?: ButtonTone; loading?: boolean; disabled?: boolean; icon?: ReactNode; size?: 'sm' | 'md' | 'lg'; style?: ViewStyle }) {
    const t = useTheme();
    const bg = { primary: t.brand, dark: t.inverse, outline: 'transparent', ghost: 'transparent', danger: t.red, soft: t.subtle }[tone];
    const fg = { primary: t.onBrand, dark: t.onInverse, outline: t.ink, ghost: t.ink, danger: '#fff', soft: t.ink }[tone];
    const h = { sm: 36, md: 44, lg: 54 }[size];
    return (
        <Pressable
            disabled={disabled || loading}
            onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                onPress?.();
            }}
            style={({ pressed }) => [
                { height: h, borderRadius: radius.full, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, paddingHorizontal: size === 'sm' ? 14 : 22, opacity: disabled ? 0.45 : pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
                tone === 'outline' && { borderWidth: 1.5, borderColor: t.border },
                style,
            ]}
        >
            {loading ? <ActivityIndicator color={fg} /> : <>{icon}<RNText style={{ color: fg, fontSize: size === 'sm' ? 13.5 : 16, fontWeight: '700' }}>{title}</RNText></>}
        </Pressable>
    );
}

export function Card({ children, style, onPress, tone = 'surface' }: { children: ReactNode; style?: ViewStyle; onPress?: () => void; tone?: 'surface' | 'subtle' | 'inverse' | 'brand' | 'gold' }) {
    const t = useTheme();
    const bg = { surface: t.surface, subtle: t.subtle, inverse: t.inverse, brand: t.brand, gold: t.goldSoft }[tone];
    const base: ViewStyle = { backgroundColor: bg, borderRadius: radius.lg, padding: 16, borderWidth: tone === 'surface' ? StyleSheet.hairlineWidth : 0, borderColor: t.border };
    return onPress ? (
        <Pressable onPress={onPress} style={({ pressed }) => [base, { opacity: pressed ? 0.85 : 1 }, style]}>{children}</Pressable>
    ) : (
        <View style={[base, style]}>{children}</View>
    );
}

export function Input({ label, error, style, ...props }: TextInputProps & { label?: string; error?: string }) {
    const t = useTheme();
    return (
        <View style={{ gap: 6 }}>
            {label && <Text variant="label">{label}</Text>}
            <TextInput placeholderTextColor={t.faint} style={[{ height: 52, borderRadius: radius.md, borderWidth: 1.5, borderColor: error ? t.red : t.border, paddingHorizontal: 16, fontSize: 16, color: t.ink, backgroundColor: t.surface }, style as TextStyle]} {...props} />
            {error && <Text variant="caption" color="red">{error}</Text>}
        </View>
    );
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'brand' | 'gold' | 'red' | 'dark' }) {
    const t = useTheme();
    const map = { neutral: [t.subtle, t.ink], brand: [t.brandSoft, t.brand], gold: [t.goldSoft, t.gold], red: [t.redSoft, t.red], dark: [t.inverse, t.onInverse] }[tone];
    return (
        <View style={{ backgroundColor: map[0], borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' }}>
            <RNText style={{ color: map[1], fontSize: 12, fontWeight: '700' }}>{children}</RNText>
        </View>
    );
}

export function Row({ children, gap = 12, style, align = 'center', justify }: { children: ReactNode; gap?: number; style?: ViewStyle; align?: ViewStyle['alignItems']; justify?: ViewStyle['justifyContent'] }) {
    return <View style={[{ flexDirection: 'row', alignItems: align, justifyContent: justify, gap }, style]}>{children}</View>;
}

export function Stack({ children, gap = 12, style }: { children: ReactNode; gap?: number; style?: ViewStyle }) {
    return <View style={[{ gap }, style]}>{children}</View>;
}

export function Divider() {
    const t = useTheme();
    return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.border }} />;
}

export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
    const t = useTheme();
    return (
        <Pressable onPress={onPress} style={{ height: 38, paddingHorizontal: 16, borderRadius: radius.full, backgroundColor: active ? t.inverse : t.subtle, justifyContent: 'center' }}>
            <RNText style={{ color: active ? t.onInverse : t.ink, fontWeight: '600', fontSize: 14 }}>{label}</RNText>
        </Pressable>
    );
}

export function Toggle({ value, onChange, label, description }: { value: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
    const t = useTheme();
    return (
        <Row justify="space-between" style={{ paddingVertical: 6 }}>
            <View style={{ flex: 1, gap: 2 }}>
                <Text variant="label">{label}</Text>
                {description && <Text variant="caption">{description}</Text>}
            </View>
            <RNSwitch value={value} onValueChange={onChange} trackColor={{ true: t.brand, false: t.border }} thumbColor="#fff" />
        </Row>
    );
}

export function Empty({ emoji = '🍽️', title, body, action }: { emoji?: string; title: string; body?: string; action?: ReactNode }) {
    return (
        <View style={{ alignItems: 'center', paddingVertical: 56, gap: 8 }}>
            <RNText style={{ fontSize: 44 }}>{emoji}</RNText>
            <Text variant="heading" center>{title}</Text>
            {body && <Text variant="caption" center style={{ maxWidth: 280 }}>{body}</Text>}
            {action && <View style={{ marginTop: 12 }}>{action}</View>}
        </View>
    );
}

export function Loading() {
    const t = useTheme();
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg }}><ActivityIndicator color={t.brand} size="large" /></View>;
}

export function Price({ zig: z, usd: u, size = 'body', strike }: { zig: number; usd?: number; size?: 'body' | 'heading' | 'title'; strike?: number | null }) {
    return (
        <View>
            <Row gap={6}>
                <Text variant={size === 'body' ? 'label' : size} color={strike ? 'red' : 'ink'}>{`ZiG ${z.toFixed(2)}`}</Text>
                {!!strike && <Text variant="caption" style={{ textDecorationLine: 'line-through' }}>{`ZiG ${strike.toFixed(2)}`}</Text>}
            </Row>
            {u !== undefined && <Text variant="caption">{`$${u.toFixed(2)}`}</Text>}
        </View>
    );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
    return <Row justify="space-between" style={{ marginTop: 28, marginBottom: 12 }}><Text variant="heading" style={{ fontSize: 20 }}>{children}</Text>{action}</Row>;
}

export const STATUS_TONE: Record<string, 'neutral' | 'brand' | 'gold' | 'red' | 'dark'> = {
    placed: 'neutral', scheduled: 'neutral', accepted: 'brand', preparing: 'gold', ready: 'brand', picked_up: 'brand', arriving: 'brand',
    delivered: 'neutral', cancelled: 'red', rejected: 'red', pending_payment: 'gold',
};
