import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { type AppContent, type Overlay, type Slide, loadAppContent, markOnboardingSeen, onboardingSeenVersion } from '@/lib/app-content';
import { Logo, Text, useTheme } from '@/ui';

const { width: W } = Dimensions.get('window');
const hexA = (hex: string, a: number) => `${hex}${Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, '0')}`;

function OverlayLayer({ o }: { o: Overlay }) {
    if (!o || o.type === 'none') return null;
    if (o.type === 'solid') return <View style={[StyleSheet.absoluteFill, { backgroundColor: hexA(o.from, o.opacity) }]} />;
    const [start, end] = { to_top: [{ x: 0, y: 1 }, { x: 0, y: 0 }], to_bottom: [{ x: 0, y: 0 }, { x: 0, y: 1 }], diagonal: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }[o.direction] as [{ x: number; y: number }, { x: number; y: number }];
    return <LinearGradient style={StyleSheet.absoluteFill} start={start} end={end} locations={[0, 0.7, 1]} colors={[hexA(o.from, o.opacity), hexA(o.to, o.opacity * 0.15), hexA(o.to, 0)]} />;
}

/**
 * Runs once per launch, before the app: the admin-designed launch screen, then onboarding when
 * a newer version has been published than this phone has seen. Both are optional.
 */
export function Startup({ children }: { children: React.ReactNode }) {
    const [content, setContent] = useState<AppContent | null>(null);
    const [phase, setPhase] = useState<'loading' | 'launch' | 'onboarding' | 'done'>('loading');
    const [seen, setSeen] = useState(0);

    useEffect(() => {
        Promise.all([loadAppContent(), onboardingSeenVersion()]).then(([c, s]) => {
            setContent(c);
            setSeen(s);
            setPhase(c.launch ? 'launch' : c.onboarding?.slides.length && c.onboarding.version > s ? 'onboarding' : 'done');
        });
    }, []);

    const afterLaunch = () => setPhase(content?.onboarding?.slides.length && content.onboarding.version > seen ? 'onboarding' : 'done');

    if (phase === 'done') return <>{children}</>;
    if (phase === 'loading') return <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} />;
    if (phase === 'launch' && content?.launch) return <LaunchScreen l={content.launch} onDone={afterLaunch} />;
    if (phase === 'onboarding' && content?.onboarding) {
        return <Onboarding slides={content.onboarding.slides} onDone={() => { markOnboardingSeen(content.onboarding!.version); setPhase('done'); }} />;
    }
    return <>{children}</>;
}

function LaunchScreen({ l, onDone }: { l: NonNullable<AppContent['launch']>; onDone: () => void }) {
    const fade = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        Animated.timing(fade, { toValue: 1, duration: 280, useNativeDriver: true }).start();
        const t = setTimeout(onDone, l.duration_ms ?? 1500);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const bg = l.background ?? '#FFFFFF';
    return (
        <Pressable style={{ flex: 1 }} onPress={onDone}>
            {l.gradient_to ? <LinearGradient style={StyleSheet.absoluteFill} colors={[bg, l.gradient_to]} /> : <View style={[StyleSheet.absoluteFill, { backgroundColor: bg }]} />}
            {l.image && <Image source={{ uri: l.image }} style={StyleSheet.absoluteFill} contentFit="cover" />}
            <Animated.View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18, opacity: fade, paddingHorizontal: 32 }}>
                {l.show_logo !== false && <Logo height={56} inverse={isDark(l.image ? '#000000' : bg)} />}
                {!!l.tagline && <Text variant="heading" center style={{ color: l.text_color ?? '#222222' }}>{l.tagline}</Text>}
            </Animated.View>
        </Pressable>
    );
}

const isDark = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 < 128;
};

function Onboarding({ slides, onDone }: { slides: Slide[]; onDone: () => void }) {
    const t = useTheme();
    const [i, setI] = useState(0);
    const list = useRef<FlatList<Slide>>(null);
    const next = () => (i < slides.length - 1 ? list.current?.scrollToIndex({ index: i + 1 }) : onDone());
    return (
        <View style={{ flex: 1, backgroundColor: '#000' }}>
            <FlatList
                ref={list}
                data={slides}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                keyExtractor={(_, k) => String(k)}
                onMomentumScrollEnd={(e) => setI(Math.round(e.nativeEvent.contentOffset.x / W))}
                renderItem={({ item: s }) => (
                    <View style={{ width: W, flex: 1 }}>
                        {s.image ? <Image source={{ uri: s.image }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <View style={[StyleSheet.absoluteFill, { backgroundColor: t.brand }]} />}
                        <OverlayLayer o={s.overlay} />
                        <SafeAreaView style={{ flex: 1, justifyContent: s.text_position === 'top' ? 'flex-start' : s.text_position === 'middle' ? 'center' : 'flex-end', paddingHorizontal: 26, paddingBottom: 120, paddingTop: 40 }}>
                            {!!s.heading && <Text variant="display" style={{ color: s.text_color, fontSize: 34, lineHeight: 38 }}>{s.heading}</Text>}
                            {!!s.body && <Text style={{ color: s.text_color, opacity: 0.92, fontSize: 16, lineHeight: 23, marginTop: 10 }}>{s.body}</Text>}
                        </SafeAreaView>
                    </View>
                )}
            />
            <SafeAreaView edges={['bottom', 'top']} style={[StyleSheet.absoluteFill, { justifyContent: 'space-between', pointerEvents: 'box-none' }]}>
                <View style={{ alignItems: 'flex-end', padding: 16 }}>
                    <Pressable onPress={onDone} hitSlop={12}><Text variant="label" style={{ color: '#FFFFFF', opacity: 0.9 }}>Skip</Text></Pressable>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingBottom: 24 }}>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                        {slides.map((_, k) => <View key={k} style={{ height: 6, width: k === i ? 22 : 6, borderRadius: 3, backgroundColor: k === i ? t.brand : 'rgba(255,255,255,0.55)' }} />)}
                    </View>
                    <Pressable onPress={next} style={{ backgroundColor: t.brand, paddingHorizontal: 26, height: 50, borderRadius: 25, justifyContent: 'center' }}>
                        <Text variant="label" style={{ color: t.onBrand, fontSize: 16 }}>{slides[i]?.button_label || (i === slides.length - 1 ? 'Get started' : 'Next')}</Text>
                    </Pressable>
                </View>
            </SafeAreaView>
        </View>
    );
}
