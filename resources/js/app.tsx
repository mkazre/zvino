import '../css/app.css';

import { createInertiaApp } from '@inertiajs/react';
import { resolvePageComponent } from 'laravel-vite-plugin/inertia-helpers';
import { createRoot } from 'react-dom/client';
import { route as routeFn } from 'ziggy-js';
import { initializeTheme } from './hooks/use-appearance';
import { configureMoney } from './lib/money';

declare global {
    const route: typeof routeFn;
}

const appName = import.meta.env.VITE_APP_NAME || 'Zvino';

createInertiaApp({
    // Website pages pass full SEO titles ("Mama Rudo's Kitchen · Order online | Zvino"); admin pages pass short ones.
    title: (title) => (!title ? appName : title.includes('Zvino') ? title : `${title} · ${appName}`),
    resolve: (name) => resolvePageComponent(`./pages/${name}.tsx`, import.meta.glob('./pages/**/*.tsx')),
    setup({ el, App, props }) {
        const root = createRoot(el);

        // Set the display currency from the page props before the page renders, so every price on
        // the page (and its layout) uses the same primary currency and rate.
        root.render(
            <App {...props}>
                {({ Component, key, props: pageProps }) => {
                    configureMoney(pageProps as Parameters<typeof configureMoney>[0]);
                    return <Component key={key} {...pageProps} />;
                }}
            </App>,
        );
    },
    progress: {
        color: 'var(--color-brand)',
    },
});

// This will set light / dark mode on load...
initializeTheme();
