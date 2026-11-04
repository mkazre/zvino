import { router } from 'expo-router';
import { Alert, Linking } from 'react-native';
import { api } from './api';
import { VARIANT } from './config';

/**
 * Where a notification / announcement goes when tapped:
 *   store:12 · promo:ZVINO20 · url:https://… · a screen name (plans, hampers, wallet…) · order ids in data
 */
export async function openLink(link?: string | null, data?: Record<string, unknown>) {
    if (data?.order_id && !link) {
        return router.push(VARIANT === 'driver' ? `/job/${data.order_id}` : VARIANT === 'merchant' ? '/board' : `/order/${data.order_id}`);
    }
    if (!link) return router.push('/inbox');
    const [type, ...rest] = link.split(':');
    const value = rest.join(':');
    if (type === 'store' && value) return router.push(`/store/${value}`);
    if (type === 'url' && value) return Linking.openURL(value);
    if (type === 'promo' && value) {
        const ok = await api.post('/cart/voucher', { code: value }).then(() => true).catch(() => false);
        return Alert.alert(`Promo ${value}`, ok ? 'Added to your basket ✓ It applies at checkout.' : `Use code ${value} at checkout.`, [{ text: 'Browse', onPress: () => router.push('/home') }]);
    }
    return router.push(`/${link.replace(/^\//, '')}`);
}
