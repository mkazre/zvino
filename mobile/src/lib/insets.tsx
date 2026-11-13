import { createContext, type ReactNode, useContext } from 'react';
import { type EdgeInsets, SafeAreaInsetsContext } from 'react-native-safe-area-context';

/**
 * The root pads every screen above Android's navigation bar and tells screens the bottom inset is 0.
 * Modals draw in their own window over the whole screen, so they need the real device insets.
 */
const DeviceInsets = createContext<EdgeInsets>({ top: 0, right: 0, bottom: 0, left: 0 });
export const DeviceInsetsProvider = DeviceInsets.Provider;
export const useDeviceInsets = () => useContext(DeviceInsets);

/** Wrap a Modal's content: SafeAreaViews and insets inside it see the real system bars again. */
export function ModalInsets({ children }: { children: ReactNode }) {
    const i = useDeviceInsets();
    return <SafeAreaInsetsContext.Provider value={i}>{children}</SafeAreaInsetsContext.Provider>;
}
