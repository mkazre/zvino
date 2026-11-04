import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOfflineBanner } from '@/lib/network';
import { Text, useTheme } from '@/ui';

/** "You're offline" banner that slides down from the top; turns green for a moment when back online. */
export function OfflineBanner() {
    const t = useTheme();
    const insets = useSafeAreaInsets();
    const { online, visible } = useOfflineBanner();
    const y = useRef(new Animated.Value(-120)).current;
    useEffect(() => {
        Animated.spring(y, { toValue: visible ? 0 : -120, useNativeDriver: true, bounciness: 4 }).start();
    }, [visible, y]);
    return (
        <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 12, right: 12, top: insets.top + 6, zIndex: 999, transform: [{ translateY: y }], backgroundColor: online ? t.brand : t.inverse, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10, elevation: 6 }}>
            <Ionicons name={online ? 'cloud-done-outline' : 'cloud-offline-outline'} size={20} color={online ? t.onBrand : t.onInverse} />
            <Text variant="label" style={{ color: online ? t.onBrand : t.onInverse, flex: 1 }}>{online ? 'Back online' : 'You’re offline. We’ll retry when you’re back.'}</Text>
        </Animated.View>
    );
}
