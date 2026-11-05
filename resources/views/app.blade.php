<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
        @php($seo = $page['props']['seo'] ?? null)
        <title inertia>{{ $seo['title'] ?? config('app.name', 'Zvino') }}</title>
        @if ($seo)
            {{-- Server-rendered so Google, WhatsApp and Facebook link previews work without JavaScript --}}
            <meta name="description" content="{{ $seo['description'] ?? '' }}">
            <meta property="og:type" content="website">
            <meta property="og:title" content="{{ $seo['title'] ?? '' }}">
            <meta property="og:description" content="{{ $seo['description'] ?? '' }}">
            @if (! empty($seo['image']))<meta property="og:image" content="{{ url($seo['image']) }}">@endif
            <meta property="og:url" content="{{ url()->current() }}">
            <meta name="twitter:card" content="summary_large_image">
            <link rel="canonical" href="{{ url()->current() }}">
            @if (! empty($seo['jsonld']))<script type="application/ld+json">{!! json_encode($seo['jsonld'], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) !!}</script>@endif
        @endif
        @php($brand = \App\Support\Brand::palette())
        <meta name="theme-color" content="#ffffff">
        <link rel="icon" href="/favicon.ico" sizes="any">
        <link rel="icon" type="image/png" href="/favicon.png">
        <link rel="apple-touch-icon" href="/apple-touch-icon.png">
        {{-- Brand colours from Settings → Branding (change them there, no rebuild needed) --}}
        <style>:root{--brand-primary:{{ $brand['primary'] }};--brand-primary-dark:{{ $brand['primary_dark'] }};--brand-primary-soft:{{ $brand['primary_soft'] }};--brand-on-primary:{{ $brand['on_primary'] }};--brand-accent:{{ $brand['accent'] }};--brand-accent-dark:{{ $brand['accent_dark'] }};--brand-accent-soft:{{ $brand['accent_soft'] }};--brand-danger:{{ $brand['danger'] }};--brand-danger-soft:{{ $brand['danger_soft'] }}}</style>

        <link rel="preconnect" href="https://fonts.bunny.net">
        <link href="https://fonts.bunny.net/css?family=inter:400,500,600,700,800" rel="stylesheet" />

        @routes
        @viteReactRefresh
        @vite(['resources/js/app.tsx', "resources/js/pages/{$page['component']}.tsx"])
        @inertiaHead
    </head>
    <body class="font-sans antialiased">
        @inertia
    </body>
</html>
