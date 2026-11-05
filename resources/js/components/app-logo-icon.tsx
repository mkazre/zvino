import { type ImgHTMLAttributes } from 'react';

/** The Zvino bell mark (logo without the wordmark). */
export default function AppLogoIcon({ className, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
    return <img src="/brand/mark.png" alt="Zvino" className={className} {...props} />;
}
