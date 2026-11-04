import qrcode from 'qrcode-generator';
import { useMemo } from 'react';
import { View } from 'react-native';

/** QR code drawn with plain Views, so no native module is needed. */
export function QrView({ value, size = 240 }: { value: string; size?: number }) {
    const rows = useMemo(() => {
        const qr = qrcode(0, 'M');
        qr.addData(value);
        qr.make();
        const n = qr.getModuleCount();
        return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
    }, [value]);
    const cell = Math.floor(size / (rows.length + 4));
    return (
        <View style={{ padding: cell * 2, backgroundColor: '#fff', borderRadius: 12 }}>
            {rows.map((row, r) => (
                <View key={r} style={{ flexDirection: 'row' }}>
                    {row.map((dark, c) => <View key={c} style={{ width: cell, height: cell, backgroundColor: dark ? '#222222' : '#fff' }} />)}
                </View>
            ))}
        </View>
    );
}
