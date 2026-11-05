import SiteLayout from '@/layouts/site-layout';
import { Head } from '@inertiajs/react';

export default function LegalPage({ page, seo }: { page: { slug: string; title: string; body: string; updated_at: string }; seo: { title: string } }) {
    return (
        <SiteLayout>
            <Head title={seo.title} />
            <article className="mx-auto max-w-3xl px-4 py-14 md:px-6">
                <h1 className="text-[40px] font-extrabold tracking-[-0.04em]">{page.title}</h1>
                <p className="text-muted-foreground mt-2 text-sm">Last updated {new Date(page.updated_at).toLocaleDateString('en-ZW', { dateStyle: 'long' })}</p>
                {/* Content is written by Zvino admins in Settings → Legal & content pages. */}
                <div className="prose-zvino mt-10 text-[16px] leading-[1.75] [&_a]:underline [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:text-2xl [&_h2]:font-bold [&_h3]:mt-6 [&_h3]:font-bold [&_li]:ml-5 [&_li]:list-disc [&_p]:mb-4" dangerouslySetInnerHTML={{ __html: page.body }} />
            </article>
        </SiteLayout>
    );
}
