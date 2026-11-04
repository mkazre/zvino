import '../css/app.css';

import { createInertiaApp } from '@inertiajs/react';
import { resolvePageComponent } from 'laravel-vite-plugin/inertia-helpers';
import { createRoot } from 'react-dom/client';
import { route as routeFn } from 'ziggy-js';
import { initializeTheme } from './hooks/use-appearance';

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

        root.render(<App {...props} />);
    },
    progress: {
        color: 'var(--color-brand)',
    },
});

// This will set light / dark mode on load...
initializeTheme();
