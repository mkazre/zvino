import { Redirect } from 'expo-router';
import { VARIANT } from '@/lib/config';
import { useSession } from '@/lib/session';

/** Entry point: send each app to its home. */
export default function Index() {
    const { me } = useSession();
    if (VARIANT === 'customer') return <Redirect href="/home" />;
    if (VARIANT === 'driver') return <Redirect href={me ? '/shift' : '/sign-in'} />;
    return <Redirect href={me ? '/board' : '/staff-login'} />;
}
