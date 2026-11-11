import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { View } from 'react-native';
import { useImg } from '@/lib/prefs';
import { useTheme } from '@/ui';

/**
 * Product photo for baskets, checkout and orders. Shop packshots sit whole on white (contain);
 * restaurant dishes fill the tile (cover). Falls back to a neutral icon tile.
 */
export function ProductThumb({ uri, size = 64, product = false, radius = 14 }: { uri?: string | null; size?: number; product?: boolean; radius?: number }) {
    const t = useTheme();
    const img = useImg();
    const src = uri ? img(uri, size * 2) : null;
    return (
        <View style={{ width: size, height: size, borderRadius: radius, overflow: 'hidden', backgroundColor: src && product ? '#FFFFFF' : t.subtle, borderWidth: product ? 1 : 0, borderColor: t.border, alignItems: 'center', justifyContent: 'center' }}>
            {src ? (
                <Image source={{ uri: src }} style={product ? { width: size - 10, height: size - 10 } : { width: size, height: size }} contentFit={product ? 'contain' : 'cover'} transition={150} />
            ) : (
                <Ionicons name={product ? 'basket-outline' : 'restaurant-outline'} size={size * 0.38} color={t.faint} />
            )}
        </View>
    );
}
