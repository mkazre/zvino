/**
 * Home builder block registry. One definition per block type drives the admin editor (controls,
 * defaults, groups) and is read by the website renderer (components/home-blocks.tsx).
 *
 * Block columns: title, subtitle, cta_label, link_to. Everything else lives in `payload` (flat keys).
 * Shared style keys (every block): bg_type none|color|gradient|image, bg_color, bg_from, bg_to, bg_angle,
 * bg_image, ov_type none|solid|gradient, ov_from, ov_to, ov_opacity, ov_direction, text_tone auto|light|dark,
 * text_color, align left|center, pad none|sm|md|lg, width contained|full, radius none|md|xl, hide_on, channel,
 * starts_at, ends_at.
 */
import {
    BadgeCheck, Bell, Clock3, Filter, Flame, Gift, GalleryHorizontal, Grid2x2, Handshake, HelpCircle, History, Image, LayoutGrid, LayoutList, Megaphone, MessageSquareQuote, Shapes, ShoppingBasket, Tag, ThumbsUp,
    MoveVertical, Rocket, ShieldCheck, Smartphone, Sparkles, Star, Store, TicketPercent, Timer, Truck, Type, UtensilsCrossed, Video, type LucideIcon, BarChart3, ListChecks, PanelTop,
} from 'lucide-react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Payload = Record<string, any>; // free-form JSON (values checked where read)

export type Ctl =
    | { k: string; t: 'text' | 'textarea' | 'url'; label: string; placeholder?: string; hint?: string }
    | { k: string; t: 'number'; label: string; min?: number; max?: number; step?: number; suffix?: string; hint?: string }
    | { k: string; t: 'select' | 'segmented'; label: string; options: [string, string][]; hint?: string }
    | { k: string; t: 'toggle'; label: string; hint?: string }
    | { k: string; t: 'color'; label: string }
    | { k: string; t: 'image'; label: string; hint?: string }
    | { k: string; t: 'datetime'; label: string; hint?: string }
    | { k: string; t: 'range'; label: string; min: number; max: number; step: number; format?: 'pct' | 'deg' | 'px' }
    | { k: string; t: 'icon'; label: string }
    | { k: string; t: 'stores' | 'dishes'; label: string; hint?: string }
    | { k: string; t: 'list'; label: string; item: Ctl[]; add: string; summary: string; max?: number };

export interface BlockDef {
    name: string;
    desc: string;
    icon: LucideIcon;
    group: 'Heroes & banners' | 'Stores & food' | 'Promotions' | 'Content' | 'Layout';
    /** Also drawn by the customer app (older types). Others show on the website only. */
    app?: boolean;
    base: { title?: string | false; subtitle?: string | false; cta?: boolean };
    fields: Ctl[];
    defaults: { title?: string; subtitle?: string; cta_label?: string; link_to?: string; payload?: Payload };
    /** Which style controls make sense. */
    style?: 'full' | 'basic' | 'none';
}

export const ICON_CHOICES: [string, string][] = [
    ['bike', 'Bike'], ['map-pin', 'Map pin'], ['smartphone', 'Phone'], ['wallet', 'Wallet'], ['clock', 'Clock'], ['shield', 'Shield'], ['star', 'Star'], ['gift', 'Gift'],
    ['utensils', 'Cutlery'], ['store', 'Store'], ['truck', 'Truck'], ['heart', 'Heart'], ['zap', 'Lightning'], ['leaf', 'Leaf'], ['percent', 'Percent'], ['chat', 'Chat'],
    ['search', 'Search'], ['package', 'Package'], ['users', 'People'], ['sparkles', 'Sparkles'], ['flame', 'Flame'], ['check', 'Tick'], ['card', 'Card'], ['home', 'Home'],
];

const LAYOUT: Ctl = { k: 'layout', t: 'segmented', label: 'Layout', options: [['grid', 'Grid'], ['rail', 'Scrolling row']] };
const COLUMNS = (max = 4): Ctl => ({ k: 'columns', t: 'select', label: 'Columns on desktop', options: Array.from({ length: max - 1 }, (_, i) => [String(i + 2), `${i + 2} columns`]) });
const LIMIT: Ctl = { k: 'limit', t: 'number', label: 'How many to show', min: 1, max: 24 };

export const BLOCKS: Record<string, BlockDef> = {
    // ── Existing (also in the app) ───────────────────────────────────────────
    hero: {
        name: 'Hero', desc: 'Big headline at the top, with search', icon: PanelTop, group: 'Heroes & banners', app: true,
        base: { title: 'Headline', subtitle: 'Text under the headline', cta: true },
        fields: [
            { k: 'eyebrow', t: 'text', label: 'Small label above the headline', placeholder: 'Now delivering in Harare & Bulawayo', hint: 'Leave empty to show the cities automatically.' },
            { k: 'accent_text', t: 'text', label: 'Second line (in brand colour)', placeholder: 'delivered fast.' },
            { k: 'show_search', t: 'toggle', label: 'Show the food search box' },
            { k: 'show_stats', t: 'toggle', label: 'Show stores / payments / currencies line' },
            { k: 'show_store_cards', t: 'toggle', label: 'Show featured store cards on the right (desktop)' },
            { k: 'min_height', t: 'select', label: 'Height', options: [['auto', 'Fit content'], ['60', 'Tall (60% of screen)'], ['80', 'Very tall (80%)'], ['100', 'Full screen']] },
            { k: 'background', t: 'color', label: 'App hero colour' },
        ],
        defaults: { title: 'Your favourite food,', subtitle: 'Order from the best restaurants and shops near you. Pay with EcoCash, InnBucks, OneMoney or card.', payload: { show_search: true, show_stats: true, show_store_cards: true, background: '#1C1C1C', bg_type: 'default', text_tone: 'light' } },
        style: 'full',
    },
    categories: {
        name: 'Category rail', desc: 'Scrollable cuisine icons', icon: LayoutGrid, group: 'Stores & food', app: true,
        base: { title: 'Heading' }, fields: [{ k: 'shape', t: 'segmented', label: 'Icon shape', options: [['circle', 'Circle'], ['square', 'Rounded square']] }],
        defaults: { title: 'What are you craving?', payload: { shape: 'circle' } }, style: 'basic',
    },
    specials: {
        name: 'Specials', desc: 'Live discounted dishes', icon: Flame, group: 'Stores & food', app: true,
        base: { title: 'Heading', cta: true }, fields: [LIMIT, LAYOUT, COLUMNS(3)],
        defaults: { title: 'Today’s specials 🔥', cta_label: 'All offers', link_to: '/stores?offers=1', payload: { limit: 6, layout: 'grid', columns: '3' } }, style: 'basic',
    },
    vendors: {
        name: 'Store list', desc: 'Popular or featured stores', icon: Store, group: 'Stores & food', app: true,
        base: { title: 'Heading', cta: true },
        fields: [LIMIT, { k: 'featured_only', t: 'toggle', label: 'Featured stores only' }, LAYOUT, COLUMNS(4)],
        defaults: { title: 'Popular near you', cta_label: 'See all', link_to: '/stores', payload: { limit: 8, layout: 'grid', columns: '4' } }, style: 'basic',
    },
    banner: {
        name: 'Announcement strip', desc: 'Thin message bar, optional push', icon: Bell, group: 'Heroes & banners', app: true,
        base: { title: 'Bold text', subtitle: 'Message', cta: true },
        fields: [{ k: 'tone', t: 'segmented', label: 'Style', options: [['dark', 'Dark'], ['gold', 'Gold'], ['brand', 'Green'], ['red', 'Red']] }],
        defaults: { title: 'Free delivery weekend', subtitle: 'on orders over ZiG 150.', payload: { tone: 'gold' } }, style: 'none',
    },
    rewards: {
        name: 'Rewards teaser', desc: 'Points & rewards to unlock', icon: Gift, group: 'Promotions', app: true,
        base: { title: 'Heading', subtitle: 'Text', cta: true }, fields: [],
        defaults: { title: 'Zvino Rewards', subtitle: 'Earn points on every order and swap them for free delivery and treats.', cta_label: 'See my points', link_to: '/account?tab=wallet' }, style: 'full',
    },
    richtext: {
        name: 'Text', desc: 'Heading and paragraph', icon: Type, group: 'Content', app: true,
        base: { title: 'Heading', subtitle: 'Text', cta: true }, fields: [{ k: 'size', t: 'segmented', label: 'Text size', options: [['sm', 'Small'], ['md', 'Medium'], ['lg', 'Large']] }],
        defaults: { title: 'Made in Zimbabwe', subtitle: 'Zvino connects you with local restaurants, grocers and pharmacies.', payload: { size: 'md' } }, style: 'full',
    },
    spacer: {
        name: 'Spacer', desc: 'Breathing room', icon: MoveVertical, group: 'Layout', app: true,
        base: {}, fields: [{ k: 'height', t: 'range', label: 'Height', min: 8, max: 160, step: 4, format: 'px' }, { k: 'divider', t: 'toggle', label: 'Show a divider line' }],
        defaults: { payload: { height: 32 } }, style: 'none',
    },

    // ── New: website blocks ──────────────────────────────────────────────────
    image_banner: {
        name: 'Image banner', desc: 'Full-width photo with text and button', icon: Image, group: 'Heroes & banners',
        base: { title: 'Heading', subtitle: 'Text', cta: true },
        fields: [{ k: 'height', t: 'segmented', label: 'Height', options: [['sm', 'Short'], ['md', 'Medium'], ['lg', 'Tall']] }, { k: 'content_pos', t: 'segmented', label: 'Text position', options: [['left', 'Left'], ['center', 'Centre'], ['bottom', 'Bottom']] }],
        defaults: { title: 'Braai season is here', subtitle: 'Order meat packs, sides and drinks for the weekend.', cta_label: 'Shop braai packs', link_to: '/stores?q=braai', payload: { height: 'md', content_pos: 'left', bg_type: 'image', ov_type: 'gradient', ov_from: '#000000', ov_to: '#000000', ov_opacity: 0.65, ov_direction: 'to_right', text_tone: 'light', radius: 'xl' } },
        style: 'full',
    },
    carousel: {
        name: 'Slideshow', desc: 'Rotating promo slides', icon: GalleryHorizontal, group: 'Heroes & banners',
        base: {},
        fields: [
            { k: 'slides', t: 'list', label: 'Slides', add: 'Add slide', summary: 'title', max: 8, item: [{ k: 'image', t: 'image', label: 'Photo' }, { k: 'title', t: 'text', label: 'Heading' }, { k: 'subtitle', t: 'text', label: 'Text' }, { k: 'cta_label', t: 'text', label: 'Button text' }, { k: 'link', t: 'url', label: 'Button opens', placeholder: '/stores' }] },
            { k: 'interval', t: 'range', label: 'Change every', min: 0, max: 12, step: 1 },
            { k: 'height', t: 'segmented', label: 'Height', options: [['sm', 'Short'], ['md', 'Medium'], ['lg', 'Tall']] },
            { k: 'overlay_strength', t: 'range', label: 'Darken photos', min: 0, max: 0.9, step: 0.05, format: 'pct' },
        ],
        defaults: { payload: { interval: 5, height: 'md', overlay_strength: 0.45, radius: 'xl', slides: [{ title: 'New on Zvino', subtitle: 'Fresh places to try this week.', cta_label: 'Explore', link: '/stores' }, { title: 'Free delivery Fridays', subtitle: 'On orders over ZiG 150.', cta_label: 'Order now', link: '/stores' }] } },
        style: 'basic',
    },
    promo_grid: {
        name: 'Promo tiles', desc: '2–4 clickable promo cards', icon: Grid2x2, group: 'Promotions',
        base: { title: 'Heading (optional)' },
        fields: [
            { k: 'tiles', t: 'list', label: 'Tiles', add: 'Add tile', summary: 'title', max: 8, item: [{ k: 'title', t: 'text', label: 'Heading' }, { k: 'subtitle', t: 'textarea', label: 'Text' }, { k: 'cta_label', t: 'text', label: 'Link text' }, { k: 'link', t: 'url', label: 'Opens', placeholder: '/plus' }, { k: 'image', t: 'image', label: 'Photo (optional)' }, { k: 'color', t: 'color', label: 'Background colour' }, { k: 'tone', t: 'segmented', label: 'Text', options: [['light', 'Light'], ['dark', 'Dark']] }] },
            COLUMNS(4),
        ],
        defaults: { payload: { columns: '2', tiles: [{ title: 'Free delivery, every order.', subtitle: 'Plus half-price service fees and member-only deals.', cta_label: 'Join Zvino+', link: '/plus', color: '#222222', tone: 'light' }, { title: 'Send a meal home.', subtitle: 'In the diaspora? Gift a Zvino card to family in Zimbabwe.', cta_label: 'Buy a gift card', link: '/gift-cards', color: '#FFFBD9', tone: 'dark' }] } },
        style: 'basic',
    },
    cuisine_tiles: {
        name: 'Cuisine photo tiles', desc: 'Photo tiles that open a cuisine', icon: UtensilsCrossed, group: 'Stores & food',
        base: { title: 'Heading', cta: true },
        fields: [
            { k: 'tiles', t: 'list', label: 'Tiles', add: 'Add tile', summary: 'label', max: 12, item: [{ k: 'label', t: 'text', label: 'Label' }, { k: 'image', t: 'image', label: 'Photo' }, { k: 'query', t: 'text', label: 'Shows stores for', placeholder: 'Pizza (cuisine or search word)' }] },
            { k: 'columns', t: 'select', label: 'Tiles per row (desktop)', options: [['3', '3'], ['4', '4'], ['5', '5'], ['6', '6']] },
            { k: 'shape', t: 'segmented', label: 'Shape', options: [['square', 'Square'], ['wide', 'Wide'], ['circle', 'Circle']] },
        ],
        defaults: { title: 'Pick a cuisine', payload: { columns: '4', shape: 'square', tiles: [{ label: 'Traditional', query: 'Traditional' }, { label: 'Pizza', query: 'Pizza' }, { label: 'Chicken', query: 'Chicken' }, { label: 'Groceries', query: 'Groceries' }] } },
        style: 'basic',
    },
    store_collection: {
        name: 'Hand-picked stores', desc: 'Choose exactly which stores', icon: Sparkles, group: 'Stores & food', app: true,
        base: { title: 'Heading', subtitle: 'Text', cta: true }, fields: [{ k: 'vendor_ids', t: 'stores', label: 'Stores (in this order)' }, LAYOUT, COLUMNS(4)],
        defaults: { title: 'Editor’s picks', payload: { vendor_ids: [], layout: 'rail', columns: '4' } }, style: 'basic',
    },
    dish_collection: {
        name: 'Hand-picked dishes', desc: 'Choose exactly which dishes', icon: Star, group: 'Stores & food',
        base: { title: 'Heading', subtitle: 'Text', cta: true }, fields: [{ k: 'item_ids', t: 'dishes', label: 'Dishes (in this order)' }, LAYOUT, COLUMNS(3)],
        defaults: { title: 'Dishes we love', payload: { item_ids: [], layout: 'grid', columns: '3' } }, style: 'basic',
    },
    new_stores: {
        name: 'New on Zvino', desc: 'Newest stores, automatically', icon: Rocket, group: 'Stores & food', app: true,
        base: { title: 'Heading', cta: true }, fields: [LIMIT, { k: 'days', t: 'number', label: 'Joined in the last', min: 1, max: 365, suffix: 'days' }, LAYOUT, COLUMNS(4)],
        defaults: { title: 'New on Zvino', payload: { limit: 8, days: 60, layout: 'rail', columns: '4' } }, style: 'basic',
    },
    top_rated: {
        name: 'Top rated', desc: 'Best-reviewed stores', icon: Star, group: 'Stores & food', app: true,
        base: { title: 'Heading', cta: true }, fields: [LIMIT, { k: 'min_rating', t: 'range', label: 'Minimum rating', min: 3, max: 5, step: 0.1 }, LAYOUT, COLUMNS(4)],
        defaults: { title: 'Top rated near you', payload: { limit: 8, min_rating: 4.2, layout: 'grid', columns: '4' } }, style: 'basic',
    },
    free_delivery: {
        name: 'Free delivery stores', desc: 'Stores with no delivery fee', icon: Truck, group: 'Stores & food', app: true,
        base: { title: 'Heading', cta: true }, fields: [LIMIT, LAYOUT, COLUMNS(4)],
        defaults: { title: 'Free delivery', cta_label: 'See all', link_to: '/stores?free_delivery=1', payload: { limit: 8, layout: 'rail', columns: '4' } }, style: 'basic',
    },
    countdown: {
        name: 'Countdown deal', desc: 'Timer to the end of an offer', icon: Timer, group: 'Promotions',
        base: { title: 'Heading', subtitle: 'Text', cta: true },
        fields: [{ k: 'ends_at_deal', t: 'datetime', label: 'Offer ends', hint: 'Harare time.' }, { k: 'hide_when_over', t: 'toggle', label: 'Hide automatically when the timer ends' }, { k: 'over_text', t: 'text', label: 'Text after it ends', placeholder: 'This deal has ended.' }],
        defaults: { title: 'Flash deal: 30% off pizza', subtitle: 'Today only at selected stores.', cta_label: 'Grab the deal', link_to: '/stores?q=pizza', payload: { hide_when_over: true, bg_type: 'color', bg_color: '#DF302D', text_tone: 'light', radius: 'xl' } },
        style: 'full',
    },
    promo_code: {
        name: 'Promo code', desc: 'Coupon with a copy button', icon: TicketPercent, group: 'Promotions',
        base: { title: 'Heading', subtitle: 'Terms / text', cta: true },
        fields: [{ k: 'code', t: 'text', label: 'Code', placeholder: 'ZVINO20' }, { k: 'badge', t: 'text', label: 'Big badge text', placeholder: '20% OFF' }],
        defaults: { title: '20% off your first order', subtitle: 'Minimum order ZiG 50. New customers only.', cta_label: 'Order now', link_to: '/stores', payload: { code: 'ZVINO20', badge: '20% OFF', bg_type: 'color', bg_color: '#FFFBD9', text_tone: 'dark', radius: 'xl' } },
        style: 'full',
    },
    app_download: {
        name: 'Get the app', desc: 'App Store & Google Play badges', icon: Smartphone, group: 'Promotions',
        base: { title: 'Heading', subtitle: 'Text' },
        fields: [{ k: 'image', t: 'image', label: 'Phone / app screenshot (optional)' }, { k: 'points', t: 'textarea', label: 'Bullet points (one per line)' }],
        defaults: { title: 'Order faster in the Zvino app', subtitle: 'Live tracking, saved addresses and app-only deals.', payload: { points: 'Track your driver live\nReorder in one tap\nApp-only offers', bg_type: 'color', bg_color: '#1C1C1C', text_tone: 'light', radius: 'xl' } },
        style: 'full',
    },
    how_it_works: {
        name: 'How it works', desc: 'Numbered steps with icons', icon: ListChecks, group: 'Content',
        base: { title: 'Heading (optional)', subtitle: 'Text (optional)' },
        fields: [{ k: 'steps', t: 'list', label: 'Steps', add: 'Add step', summary: 'title', max: 6, item: [{ k: 'icon', t: 'icon', label: 'Icon' }, { k: 'title', t: 'text', label: 'Heading' }, { k: 'text', t: 'textarea', label: 'Text' }] }, { k: 'numbered', t: 'toggle', label: 'Number the steps' }, COLUMNS(4)],
        defaults: { payload: { columns: '3', steps: [{ icon: 'map-pin', title: 'Tell us where', text: 'Pin your gate on the map, add a landmark and even a voice note for your driver.' }, { icon: 'smartphone', title: 'Pay your way', text: 'EcoCash, InnBucks, OneMoney, Visa/Mastercard, Zvino wallet or cash on delivery.' }, { icon: 'bike', title: 'Track it live', text: 'Watch your driver on the map and chat with them until your food arrives.' }] } },
        style: 'basic',
    },
    features: {
        name: 'Feature grid', desc: 'Icon cards: reasons to choose you', icon: ShieldCheck, group: 'Content',
        base: { title: 'Heading', subtitle: 'Text' },
        fields: [{ k: 'items', t: 'list', label: 'Features', add: 'Add feature', summary: 'title', max: 12, item: [{ k: 'icon', t: 'icon', label: 'Icon' }, { k: 'title', t: 'text', label: 'Heading' }, { k: 'text', t: 'textarea', label: 'Text' }] }, COLUMNS(4), { k: 'card', t: 'segmented', label: 'Card style', options: [['border', 'Outline'], ['filled', 'Filled'], ['plain', 'Plain']] }],
        defaults: { title: 'Why Zvino', payload: { columns: '3', card: 'border', items: [{ icon: 'clock', title: 'Fast delivery', text: 'Most orders arrive in under 40 minutes.' }, { icon: 'wallet', title: 'Pay your way', text: 'EcoCash, InnBucks, OneMoney, card or cash.' }, { icon: 'shield', title: 'Safe & secure', text: 'Delivery PINs and live tracking on every order.' }] } },
        style: 'full',
    },
    testimonials: {
        name: 'Reviews & quotes', desc: 'What customers say', icon: MessageSquareQuote, group: 'Content',
        base: { title: 'Heading' },
        fields: [{ k: 'quotes', t: 'list', label: 'Quotes', add: 'Add quote', summary: 'name', max: 12, item: [{ k: 'quote', t: 'textarea', label: 'Quote' }, { k: 'name', t: 'text', label: 'Name' }, { k: 'role', t: 'text', label: 'Where / who', placeholder: 'Borrowdale, Harare' }, { k: 'rating', t: 'range', label: 'Stars', min: 0, max: 5, step: 1 }, { k: 'avatar', t: 'image', label: 'Photo (optional)' }] }, LAYOUT, COLUMNS(3)],
        defaults: { title: 'Loved across Zimbabwe', payload: { layout: 'grid', columns: '3', quotes: [{ quote: 'My sadza arrived hot and the driver called at the gate. Brilliant.', name: 'Rudo M.', role: 'Avondale, Harare', rating: 5 }, { quote: 'Paying with EcoCash takes seconds. I order lunch every Friday.', name: 'Tinashe K.', role: 'Bulawayo', rating: 5 }, { quote: 'I send groceries to my mum from London every month.', name: 'Chipo D.', role: 'London, UK', rating: 5 }] } },
        style: 'full',
    },
    stats: {
        name: 'Numbers', desc: 'Big stats: stores, cities, orders', icon: BarChart3, group: 'Content',
        base: { title: 'Heading (optional)' },
        fields: [{ k: 'items', t: 'list', label: 'Numbers', add: 'Add number', summary: 'label', max: 6, item: [{ k: 'value', t: 'text', label: 'Number', placeholder: '{stores}+ or 50,000' }, { k: 'label', t: 'text', label: 'Label' }] }],
        defaults: { payload: { bg_type: 'color', bg_color: '#F7F7F5', radius: 'xl', items: [{ value: '{stores}+', label: 'Restaurants & shops' }, { value: '{cities}', label: 'Cities' }, { value: '30 min', label: 'Average delivery' }, { value: '4.8★', label: 'Customer rating' }] } },
        style: 'full',
    },
    faq: {
        name: 'FAQ', desc: 'Questions and answers', icon: HelpCircle, group: 'Content',
        base: { title: 'Heading' },
        fields: [{ k: 'items', t: 'list', label: 'Questions', add: 'Add question', summary: 'q', max: 20, item: [{ k: 'q', t: 'text', label: 'Question' }, { k: 'a', t: 'textarea', label: 'Answer' }] }, { k: 'open_first', t: 'toggle', label: 'Open the first answer' }],
        defaults: { title: 'Questions? We’ve got answers', payload: { open_first: true, items: [{ q: 'Which payment methods can I use?', a: 'EcoCash, InnBucks, OneMoney, Visa/Mastercard, your Zvino wallet, or cash on delivery.' }, { q: 'Can I pay in USD?', a: 'Yes. Prices show in ZiG and USD; pay in either.' }, { q: 'Where do you deliver?', a: 'Across Harare and Bulawayo, with more cities coming soon.' }] } },
        style: 'basic',
    },
    video: {
        name: 'Video', desc: 'YouTube, Vimeo or MP4', icon: Video, group: 'Content',
        base: { title: 'Heading (optional)', subtitle: 'Text (optional)' },
        fields: [{ k: 'url', t: 'url', label: 'Video link', placeholder: 'https://youtu.be/…' }, { k: 'poster', t: 'image', label: 'Cover image (MP4 only)' }, { k: 'aspect', t: 'segmented', label: 'Shape', options: [['16/9', 'Wide'], ['4/3', 'Standard'], ['1/1', 'Square'], ['9/16', 'Tall']] }, { k: 'autoplay', t: 'toggle', label: 'Autoplay muted (MP4)' }],
        defaults: { payload: { aspect: '16/9', radius: 'xl' } }, style: 'basic',
    },
    cta_band: {
        name: 'Call to action', desc: 'Headline with one or two buttons', icon: Megaphone, group: 'Promotions',
        base: { title: 'Heading', subtitle: 'Text', cta: true },
        fields: [{ k: 'cta2_label', t: 'text', label: 'Second button text' }, { k: 'cta2_link', t: 'url', label: 'Second button opens' }, { k: 'button_style', t: 'segmented', label: 'Main button', options: [['brand', 'Green'], ['dark', 'Dark'], ['light', 'White']] }],
        defaults: { title: 'Hungry? Let’s fix that.', subtitle: 'Hundreds of restaurants, one tap away.', cta_label: 'Order now', link_to: '/stores', payload: { bg_type: 'gradient', bg_from: '#17C74A', bg_to: '#108B34', bg_angle: 135, text_tone: 'dark', align: 'center', radius: 'xl', button_style: 'dark' } },
        style: 'full',
    },
    // ── Store feeds (location-aware; website and app) ─────────────────────────
    order_again: {
        name: 'Order again', desc: 'Stores this customer ordered from', icon: History, group: 'Stores & food', app: true,
        base: { title: 'Heading', cta: true }, fields: [LIMIT, LAYOUT, COLUMNS(4)],
        defaults: { title: 'Order again', payload: { limit: 10, layout: 'rail', columns: '4' } }, style: 'basic',
    },
    recommended: {
        name: 'Recommended for you', desc: 'Matches their favourite cuisines', icon: ThumbsUp, group: 'Stores & food', app: true,
        base: { title: 'Heading', cta: true }, fields: [LIMIT, LAYOUT, COLUMNS(4)],
        defaults: { title: 'Recommended for you', payload: { limit: 10, layout: 'rail', columns: '4' } }, style: 'basic',
    },
    deals_near_you: {
        name: 'Local deals near you', desc: 'Nearby stores with specials', icon: Tag, group: 'Stores & food', app: true,
        base: { title: 'Heading', cta: true }, fields: [LIMIT, LAYOUT, COLUMNS(4)],
        defaults: { title: 'Local deals near you', cta_label: 'See all', link_to: '/stores?offers=1', payload: { limit: 10, layout: 'rail', columns: '4' } }, style: 'basic',
    },
    shops_near_you: {
        name: 'Shops near you', desc: 'Logo tiles of nearby shops', icon: ShoppingBasket, group: 'Stores & food', app: true,
        base: { title: 'Heading', cta: true }, fields: [LIMIT, { k: 'shape', t: 'segmented', label: 'Tiles', options: [['square', 'Rounded square'], ['circle', 'Circle']] }],
        defaults: { title: 'Shops near you', cta_label: 'See all', link_to: '/stores?segment=shops', payload: { limit: 12, shape: 'square' } }, style: 'basic',
    },
    brand_logos: {
        name: 'Popular brands', desc: 'Logo tiles, hand-picked or featured', icon: BadgeCheck, group: 'Stores & food', app: true,
        base: { title: 'Heading', cta: true },
        fields: [{ k: 'vendor_ids', t: 'stores', label: 'Brands (leave empty for featured stores)' }, LIMIT, { k: 'shape', t: 'segmented', label: 'Tiles', options: [['square', 'Rounded square'], ['circle', 'Circle']] }, { k: 'ad_ids', t: 'stores', label: 'Mark as “Ad” (sponsored)' }],
        defaults: { title: 'Popular brands', payload: { limit: 12, shape: 'square', vendor_ids: [], ad_ids: [] } }, style: 'basic',
    },
    all_stores: {
        name: 'All stores near you', desc: 'Big list of every nearby store', icon: LayoutList, group: 'Stores & food', app: true,
        base: { title: 'Heading ({count} = number of stores)' },
        fields: [{ k: 'limit', t: 'number', label: 'Show up to', min: 5, max: 60 }, { k: 'columns', t: 'select', label: 'Columns on desktop', options: [['1', '1 (big cards)'], ['2', '2'], ['3', '3']] }],
        defaults: { title: 'All {count} restaurants near you', payload: { limit: 30, columns: '2' } }, style: 'basic',
    },
    category_icons: {
        name: 'Category icons', desc: 'Your own icons: Hot deals, Pizza…', icon: Shapes, group: 'Stores & food', app: true,
        base: { title: 'Heading (optional)' },
        fields: [{ k: 'tiles', t: 'list', label: 'Icons', add: 'Add icon', summary: 'label', max: 16, item: [{ k: 'label', t: 'text', label: 'Label' }, { k: 'image', t: 'image', label: 'Icon / illustration (square PNG)' }, { k: 'emoji', t: 'text', label: 'Or an emoji', placeholder: '🍕' }, { k: 'link', t: 'url', label: 'Opens', placeholder: '/stores?q=pizza' }] }, { k: 'size', t: 'segmented', label: 'Size', options: [['sm', 'Small'], ['md', 'Medium'], ['lg', 'Large']] }],
        defaults: { payload: { size: 'md', tiles: [{ label: 'Hot deals', emoji: '🏷️', link: '/stores?offers=1' }, { label: 'Fast food', emoji: '🍟', link: '/stores?q=fast' }, { label: 'Comfort food', emoji: '🍲', link: '/stores?cuisine=Traditional' }, { label: 'Pizza', emoji: '🍕', link: '/stores?q=pizza' }, { label: 'Burgers', emoji: '🍔', link: '/stores?q=burger' }] } },
        style: 'basic',
    },
    filter_chips: {
        name: 'Filter chips', desc: 'Top rated, Fast, Halaal…', icon: Filter, group: 'Stores & food', app: true,
        base: {},
        fields: [{ k: 'chips', t: 'list', label: 'Chips', add: 'Add chip', summary: 'label', max: 12, item: [{ k: 'label', t: 'text', label: 'Label' }, { k: 'link', t: 'url', label: 'Opens', placeholder: '/stores?sort=rating' }] }],
        defaults: { payload: { pad: 'sm', chips: [{ label: 'Top rated', link: '/stores?sort=rating' }, { label: 'Fast', link: '/stores?sort=fastest' }, { label: 'Free delivery', link: '/stores?free_delivery=1' }, { label: 'Offers', link: '/stores?offers=1' }, { label: 'Halaal', link: '/stores?q=halaal' }, { label: 'Vegetarian', link: '/stores?q=vegetarian' }] } },
        style: 'none',
    },
    notice_banner: {
        name: 'Notice strip with picture', desc: '“Delivery available from 7:00”', icon: Clock3, group: 'Heroes & banners', app: true,
        base: { title: 'Heading ({opens} = next opening time)', subtitle: 'Text' },
        fields: [{ k: 'image', t: 'image', label: 'Illustration (optional, square)' }, { k: 'only_when_closed', t: 'toggle', label: 'Only show when all nearby stores are closed' }, { k: 'tone', t: 'segmented', label: 'Colour', options: [['olive', 'Olive'], ['dark', 'Dark'], ['gold', 'Gold'], ['brand', 'Green']] }],
        defaults: { title: 'Delivery available from {opens}', subtitle: 'In the meantime, click & collect may be available.', payload: { only_when_closed: true, tone: 'olive' } }, style: 'none',
    },
    promo_cards: {
        name: 'Promo cards', desc: 'Swipeable cards with a button', icon: GalleryHorizontal, group: 'Promotions', app: true,
        base: { title: 'Heading (optional)' },
        fields: [{ k: 'cards', t: 'list', label: 'Cards', add: 'Add card', summary: 'title', max: 8, item: [{ k: 'title', t: 'text', label: 'Heading' }, { k: 'text', t: 'textarea', label: 'Text' }, { k: 'cta_label', t: 'text', label: 'Button', placeholder: 'Order now' }, { k: 'link', t: 'url', label: 'Opens' }, { k: 'image', t: 'image', label: 'Background picture' }, { k: 'color', t: 'color', label: 'Background colour' }, { k: 'tone', t: 'segmented', label: 'Text', options: [['light', 'White'], ['dark', 'Dark']] }] }],
        defaults: { payload: { cards: [{ title: 'Paying less for more. Done!', text: 'Order your favourite meals for a lot less.', cta_label: 'Order now', link: '/stores?offers=1', color: '#111111', tone: 'light' }] } },
        style: 'basic',
    },
    partner_cta: {
        name: 'Join Zvino cards', desc: 'Restaurants, drivers, corporate', icon: Handshake, group: 'Promotions',
        base: { title: 'Heading (optional)' },
        fields: [{ k: 'cards', t: 'list', label: 'Cards', add: 'Add card', summary: 'title', max: 4, item: [{ k: 'icon', t: 'icon', label: 'Icon' }, { k: 'title', t: 'text', label: 'Heading' }, { k: 'text', t: 'textarea', label: 'Text' }, { k: 'cta_label', t: 'text', label: 'Link text' }, { k: 'link', t: 'url', label: 'Opens' }] }, COLUMNS(4)],
        defaults: { payload: { columns: '3', cards: [{ icon: 'store', title: 'Own a restaurant or shop?', text: 'Reach thousands of new customers. We handle delivery and payments.', cta_label: 'Sign up your business', link: '/partners/apply' }, { icon: 'bike', title: 'Got a bike or car?', text: 'Earn on your own schedule with weekly EcoCash payouts. Keep 100% of tips.', cta_label: 'Apply to drive', link: '/drive/apply' }, { icon: 'users', title: 'Feeding a team?', text: 'Staff lunches and meetings on one monthly invoice.', cta_label: 'Corporate accounts', link: '/business' }] } },
        style: 'basic',
    },
};

export const GROUPS: BlockDef['group'][] = ['Heroes & banners', 'Stores & food', 'Promotions', 'Content', 'Layout'];

/** Style controls shown on the Style tab. */
export const STYLE_CONTROLS: { section: string; full?: boolean; controls: Ctl[]; when?: (p: Payload) => boolean }[] = [
    { section: 'Background', controls: [{ k: 'bg_type', t: 'segmented', label: 'Background', options: [['none', 'None'], ['color', 'Colour'], ['gradient', 'Gradient'], ['image', 'Photo']] }] },
    { section: 'Background', controls: [{ k: 'bg_color', t: 'color', label: 'Colour' }], when: (p) => p.bg_type === 'color' },
    { section: 'Background', controls: [{ k: 'bg_from', t: 'color', label: 'From' }, { k: 'bg_to', t: 'color', label: 'To' }, { k: 'bg_angle', t: 'range', label: 'Angle', min: 0, max: 360, step: 15, format: 'deg' }], when: (p) => p.bg_type === 'gradient' },
    { section: 'Background', controls: [{ k: 'bg_image', t: 'image', label: 'Background photo', hint: 'Landscape, at least 1600 px wide. JPG/PNG/WebP up to 8 MB.' }, { k: 'bg_position', t: 'segmented', label: 'Focus', options: [['top', 'Top'], ['center', 'Centre'], ['bottom', 'Bottom']] }, { k: 'bg_color', t: 'color', label: 'Colour behind the photo (while loading)' }], when: (p) => p.bg_type === 'image' },
    { section: 'Overlay (keeps text readable)', full: true, controls: [{ k: 'ov_type', t: 'segmented', label: 'Overlay', options: [['none', 'None'], ['solid', 'Solid'], ['gradient', 'Gradient']] }], when: (p) => p.bg_type === 'image' || p.bg_type === 'default' },
    { section: 'Overlay (keeps text readable)', full: true, controls: [{ k: 'ov_from', t: 'color', label: 'Colour' }, { k: 'ov_opacity', t: 'range', label: 'Strength', min: 0, max: 1, step: 0.05, format: 'pct' }], when: (p) => (p.bg_type === 'image' || p.bg_type === 'default') && p.ov_type === 'solid' },
    { section: 'Overlay (keeps text readable)', full: true, controls: [{ k: 'ov_from', t: 'color', label: 'Colour 1' }, { k: 'ov_to', t: 'color', label: 'Colour 2' }, { k: 'ov_opacity', t: 'range', label: 'Strength', min: 0, max: 1, step: 0.05, format: 'pct' }, { k: 'ov_direction', t: 'select', label: 'Direction', options: [['to_top', 'Bottom → top'], ['to_bottom', 'Top → bottom'], ['to_right', 'Left → right'], ['to_left', 'Right → left'], ['diagonal', 'Diagonal'], ['radial', 'Spotlight']] }], when: (p) => (p.bg_type === 'image' || p.bg_type === 'default') && p.ov_type === 'gradient' },
    { section: 'Text', controls: [{ k: 'text_tone', t: 'segmented', label: 'Text colour', options: [['auto', 'Auto'], ['light', 'White'], ['dark', 'Dark'], ['custom', 'Custom']] }] },
    { section: 'Text', controls: [{ k: 'text_color', t: 'color', label: 'Custom text colour' }], when: (p) => p.text_tone === 'custom' },
    { section: 'Text', controls: [{ k: 'align', t: 'segmented', label: 'Alignment', options: [['left', 'Left'], ['center', 'Centre']] }] },
    { section: 'Size & spacing', controls: [{ k: 'pad', t: 'segmented', label: 'Space around', options: [['none', 'None'], ['sm', 'S'], ['md', 'M'], ['lg', 'L']] }, { k: 'width', t: 'segmented', label: 'Width', options: [['contained', 'Contained'], ['full', 'Full width']] }, { k: 'radius', t: 'segmented', label: 'Corners', options: [['none', 'Square'], ['md', 'Rounded'], ['xl', 'Extra round']] }] },
];

/** "basic" blocks get spacing + background colour only. */
export const BASIC_STYLE_SECTIONS = ['Background', 'Text', 'Size & spacing'];

export const blockName = (type: string) => BLOCKS[type]?.name ?? type;
