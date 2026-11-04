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
        <meta name="theme-color" content="#0B6E4F">

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
