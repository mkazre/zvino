import qrcode from 'qrcode-generator';
import { useMemo } from 'react';

/** QR code as crisp SVG (no network, no canvas). */
export function QrCode({ value, size = 240 }: { value: string; size?: number }) {
    const { cells, n } = useMemo(() => {
        const qr = qrcode(0, 'M');
        qr.addData(value);
        qr.make();
        const n = qr.getModuleCount();
        const cells: string[] = [];
        for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) cells.push(`M${c + 4} ${r + 4}h1v1h-1z`);
        return { cells, n };
    }, [value]);
    return (
        <svg width={size} height={size} viewBox={`0 0 ${n + 8} ${n + 8}`} shapeRendering="crispEdges" role="img" aria-label="Payment QR code" className="rounded-xl bg-white">
            <path d={cells.join('')} fill="#111412" />
        </svg>
    );
}
