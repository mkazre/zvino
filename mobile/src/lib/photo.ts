import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { ImagePickerAsset } from 'expo-image-picker';

/**
 * Phone cameras produce 4–8 MB photos; on mobile data that upload can take minutes and the server
 * gives up. Shrink to at most `max` px on the long side (slips and IDs stay sharp) before uploading.
 */
export async function shrinkPhoto(asset: ImagePickerAsset, max = 1600): Promise<string> {
    try {
        const big = Math.max(asset.width || 0, asset.height || 0);
        const ctx = ImageManipulator.manipulate(asset.uri);
        if (big > max) ctx.resize(asset.width >= asset.height ? { width: max } : { height: max });
        const img = await ctx.renderAsync();
        const out = await img.saveAsync({ compress: 0.72, format: SaveFormat.JPEG });
        return out.uri;
    } catch {
        return asset.uri;
    }
}
