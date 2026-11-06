<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>Receipt {{ $o['reference'] }}</title>
    <style>
        @page { margin: 28px 34px; }
        body { font-family: DejaVu Sans, sans-serif; font-size: 11px; color: #222222; }
        h1 { font-size: 20px; margin: 0 0 2px; }
        .muted { color: #6b6b6b; }
        .small { font-size: 9.5px; }
        table { width: 100%; border-collapse: collapse; }
        .head td { vertical-align: top; }
        .box { border: 1px solid #e6e6e3; border-radius: 8px; padding: 10px 12px; margin-top: 14px; }
        .lines th { text-align: left; font-size: 9.5px; color: #6b6b6b; font-weight: normal; border-bottom: 1px solid #e6e6e3; padding: 6px 4px; }
        .lines td { padding: 7px 4px; border-bottom: 1px solid #f1f1ef; vertical-align: top; }
        .r, .lines th.r { text-align: right; white-space: nowrap; }
        .totals td { padding: 4px 4px; }
        .grand td { font-size: 14px; font-weight: bold; border-top: 2px solid #222222; padding-top: 8px; }
        .paid { display: inline-block; background: #e3f8e9; color: #108b34; font-weight: bold; padding: 3px 8px; border-radius: 10px; font-size: 10px; }
        .unpaid { display: inline-block; background: #fcf3d9; color: #8a6508; font-weight: bold; padding: 3px 8px; border-radius: 10px; font-size: 10px; }
        .cols td { width: 50%; vertical-align: top; padding-right: 10px; }
        .label { font-size: 9px; text-transform: uppercase; letter-spacing: .5px; color: #6b6b6b; margin-bottom: 3px; }
    </style>
</head>
<body>
@php($fmt = fn ($m) => $primary === 'USD' ? '$'.number_format($m['usd'], 2) : 'ZiG '.number_format($m['zig'], 2))
@php($alt = fn ($m) => $primary === 'USD' ? 'ZiG '.number_format($m['zig'], 2) : '$'.number_format($m['usd'], 2))
<table class="head">
    <tr>
        <td>@if ($logo)<img src="{{ $logo }}" style="height: 34px;" alt="">@else<h1>{{ $brand }}</h1>@endif
            <div class="muted small" style="margin-top: 6px;">{{ $business['address'] }}@if ($business['vat']) · VAT/BP {{ $business['vat'] }}@endif</div>
        </td>
        <td class="r">
            <h1>Tax invoice / receipt</h1>
            <div>Order <b>#{{ $o['reference'] }}</b></div>
            <div class="muted">{{ \Illuminate\Support\Carbon::parse($o['placed_at'])->timezone('Africa/Harare')->format('j M Y, H:i') }}</div>
            <div style="margin-top: 6px;"><span class="{{ $o['details']['payment']['status'] === 'Paid' ? 'paid' : 'unpaid' }}">{{ $o['details']['payment']['status'] }}</span></div>
        </td>
    </tr>
</table>

<div class="box">
    <table class="cols"><tr>
        <td>
            <div class="label">From</div>
            <b>{{ $o['store']['name'] }}</b><br>
            <span class="muted">{{ $o['store']['address'] }}</span>
        </td>
        <td>
            <div class="label">{{ $o['fulfilment'] === 'pickup' ? 'Collected by' : 'Delivered to' }}</div>
            <b>{{ $o['details']['account']['name'] ?: 'Customer' }}</b> · {{ $o['details']['account']['phone'] }}<br>
            @if ($o['details']['address'])<span class="muted">{{ implode(', ', array_filter([$o['details']['address']['line1'] ?? null, $o['details']['address']['suburb'] ?? null, $o['details']['address']['city'] ?? null])) }}</span>@endif
        </td>
    </tr></table>
</div>

<table class="lines" style="margin-top: 14px;">
    <thead><tr><th style="width: 30px;">Qty</th><th>Item</th><th class="r">Unit</th><th class="r">Amount</th></tr></thead>
    <tbody>
    @foreach ($o['receipt']['lines'] as $l)
        <tr>
            <td>{{ $l['quantity'] }}×</td>
            <td><b>{{ $l['name'] }}</b>@if (count($l['options']))<br><span class="muted small">{{ implode(' · ', $l['options']) }}</span>@endif @if ($l['notes'])<br><span class="muted small">“{{ $l['notes'] }}”</span>@endif</td>
            <td class="r">{{ $fmt($l['unit']) }}</td>
            <td class="r">{{ $fmt($l['total']) }}</td>
        </tr>
    @endforeach
    </tbody>
</table>

<table class="totals" style="margin-top: 10px; width: 55%; margin-left: 45%;">
    @foreach ($o['receipt']['totals'] as $t)
        <tr><td>{{ $t['label'] }}</td><td class="r">{{ $fmt($t['amount']) }}</td></tr>
    @endforeach
    <tr class="grand"><td>Total</td><td class="r">{{ $fmt($o['receipt']['total']) }}</td></tr>
    <tr><td class="muted small">≈ {{ $alt($o['receipt']['total']) }} at {{ number_format($rate, 2) }} ZiG/USD</td><td class="r muted small">VAT incl. {{ $fmt($o['receipt']['vat']) }}</td></tr>
    @if ($o['receipt']['wallet_applied'])<tr><td class="muted">Paid from wallet</td><td class="r muted">{{ $fmt($o['receipt']['wallet_applied']) }}</td></tr>@endif
</table>

<div class="box">
    <table class="cols"><tr>
        <td><div class="label">Payment method</div>{{ $o['details']['payment']['method'] }}</td>
        <td><div class="label">{{ $o['time']['label'] }}</div>{{ $o['time']['at'] ? \Illuminate\Support\Carbon::parse($o['time']['at'])->timezone('Africa/Harare')->format('j M Y, H:i') : '–' }}</td>
    </tr></table>
</div>

<p class="muted small" style="margin-top: 22px; text-align: center;">Thank you for ordering with {{ $brand }}. Questions about this order? {{ $support }} · quote #{{ $o['reference'] }}</p>
</body>
</html>
