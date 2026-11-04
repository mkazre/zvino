import Ionicons from '@expo/vector-icons/Ionicons';
import { type ColorValue } from 'react-native';

type Name = keyof typeof Ionicons.glyphMap;

/** Filled icon when the tab is active, outline otherwise. */
export const tabIcon =
    (name: Name) =>
    ({ color, focused }: { color: ColorValue; focused: boolean }) => (
        <Ionicons name={(focused ? name : `${name}-outline`) as Name} size={24} color={color as string} />
    );
