import { router } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { useTheme } from '@/ui';

/**
 * Google sign-in hands back to <package>:/oauthredirect. expo-auth-session reads that link itself;
 * the router also lands here, so step straight back to the screen that started the sign-in.
 */
export default function OAuthRedirect() {
    const t = useTheme();
    useEffect(() => {
        const id = setTimeout(() => (router.canGoBack() ? router.back() : router.replace('/')), 0);
        return () => clearTimeout(id);
    }, []);
    return <View style={{ flex: 1, backgroundColor: t.bg }} />;
}
