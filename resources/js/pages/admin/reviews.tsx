import { Button } from '@/components/ui/button';
import { Avatar, Badge, Card, CardBody, EmptyState, Page, PageHeader, Progress, Segmented, Stars, Switch, Textarea } from '@/components/z';
import { Pager } from '@/components/z/table';
import AdminLayout from '@/layouts/admin-layout';
import { timeAgo } from '@/lib/money';
import { cn } from '@/lib/utils';
import { type PageLink } from '@/types';
import { Link, router } from '@inertiajs/react';
import { MessageSquareReply, Star } from 'lucide-react';
import { useState } from 'react';

interface Review {
    id: number;
    vendor_rating: number;
    driver_rating: number | null;
    comment: string | null;
    tags: string[] | null;
    vendor_reply: string | null;
    is_hidden: boolean;
    created_at: string;
    user?: { name: string };
    vendor?: { id: number; name: string };
    driver?: { user?: { name: string } } | null;
    order?: { id: number; reference: string };
}

interface Props {
    reviews: { data: Review[]; links: PageLink[] };
    summary: { average: number; count: number; driver_average: number; distribution: Record<string, number> };
    filters: { rating?: string; unreplied?: string };
}

export default function Reviews({ reviews, summary, filters }: Props) {
    const go = (p: Record<string, string | undefined>) => router.get('/admin/reviews', { ...filters, ...p }, { preserveState: true, replace: true });

    return (
        <AdminLayout title="Reviews">
            <Page>
                <PageHeader title="Reviews" description="What customers say about stores and drivers." />
                <div className="grid gap-4 md:grid-cols-[300px_1fr]">
                    <Card padded className="h-fit">
                        <div className="flex items-end gap-3">
                            <span className="tabular text-5xl font-bold tracking-tight">{summary.average.toFixed(1)}</span>
                            <div className="pb-1.5"><Stars value={summary.average} /><div className="text-muted-foreground text-xs">{summary.count} reviews</div></div>
                        </div>
                        <div className="mt-5 grid gap-2">
                            {[5, 4, 3, 2, 1].map((r) => {
                                const n = summary.distribution[r] ?? 0;
                                return (
                                    <button key={r} onClick={() => go({ rating: filters.rating === String(r) ? undefined : String(r) })} className={cn('flex items-center gap-2 rounded-md px-1 text-xs', filters.rating === String(r) && 'bg-muted')}>
                                        <span className="w-3 font-medium">{r}</span><Star className="text-gold size-3 fill-current" />
                                        <Progress value={summary.count ? (n / summary.count) * 100 : 0} tone={r <= 2 ? 'red' : 'gold'} />
                                        <span className="tabular text-muted-foreground w-8 text-right">{n}</span>
                                    </button>
                                );
                            })}
                        </div>
                        <div className="text-muted-foreground mt-5 border-t pt-4 text-xs">Drivers average <b className="text-foreground">{summary.driver_average.toFixed(1)} ★</b></div>
                    </Card>
                    <div className="grid content-start gap-3">
                        <Segmented value={filters.unreplied ? 'unreplied' : 'all'} onChange={(v) => go({ unreplied: v === 'unreplied' ? '1' : undefined })} options={[{ value: 'all', label: 'All reviews' }, { value: 'unreplied', label: 'Needs a reply' }]} />
                        {reviews.data.length === 0 && <Card><EmptyState icon={Star} title="No reviews match" /></Card>}
                        {reviews.data.map((r) => <ReviewCard key={r.id} r={r} />)}
                        <Pager links={reviews.links} />
                    </div>
                </div>
            </Page>
        </AdminLayout>
    );
}

function ReviewCard({ r }: { r: Review }) {
    const [replying, setReplying] = useState(false);
    const [reply, setReply] = useState(r.vendor_reply ?? '');
    return (
        <Card className={cn(r.is_hidden && 'opacity-60')}>
            <CardBody className="pt-5">
                <div className="flex items-start gap-3">
                    <Avatar name={r.user?.name} size={36} />
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold">{r.user?.name}</span>
                            <Stars value={r.vendor_rating} />
                            {r.driver_rating && <Badge>Driver {r.driver_rating}★</Badge>}
                            {r.is_hidden && <Badge tone="danger">Hidden</Badge>}
                            <span className="text-muted-foreground ml-auto text-xs">{timeAgo(r.created_at)}</span>
                        </div>
                        <div className="text-muted-foreground mt-0.5 text-xs">
                            {r.vendor?.name} · <Link href={`/admin/orders/${r.order?.id}`} className="font-mono hover:underline">{r.order?.reference}</Link>{r.driver?.user && ` · delivered by ${r.driver.user.name}`}
                        </div>
                        {r.comment && <p className="mt-2 text-sm leading-relaxed">{r.comment}</p>}
                        {r.tags?.length ? <div className="mt-2 flex flex-wrap gap-1">{r.tags.map((t) => <Badge key={t}>{t}</Badge>)}</div> : null}
                        {r.vendor_reply && !replying && <div className="bg-subtle mt-3 rounded-lg border-l-2 px-3 py-2 text-sm"><span className="text-muted-foreground text-xs font-medium">Store reply</span><p>{r.vendor_reply}</p></div>}
                        {replying && (
                            <div className="mt-3 grid gap-2">
                                <Textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply publicly as the store…" className="min-h-[64px]" />
                                <div className="flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => setReplying(false)}>Cancel</Button><Button size="sm" onClick={() => router.patch(`/admin/reviews/${r.id}`, { vendor_reply: reply }, { preserveScroll: true, onSuccess: () => setReplying(false) })}>Post reply</Button></div>
                            </div>
                        )}
                        <div className="mt-3 flex items-center gap-4">
                            {!replying && <button onClick={() => setReplying(true)} className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-xs font-medium"><MessageSquareReply className="size-3.5" /> {r.vendor_reply ? 'Edit reply' : 'Reply'}</button>}
                            <span className="ml-auto flex items-center gap-2 text-xs"><span className="text-muted-foreground">Visible</span><Switch size="sm" checked={!r.is_hidden} onChange={(v) => router.patch(`/admin/reviews/${r.id}`, { is_hidden: !v }, { preserveScroll: true })} /></span>
                        </div>
                    </div>
                </div>
            </CardBody>
        </Card>
    );
}
