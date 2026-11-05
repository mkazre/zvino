<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{ $subjectLine }}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f2;font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;color:#222222;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f2;padding:24px 12px;">
    <tr>
        <td align="center">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;">
                <tr>
                    <td style="padding:24px 28px 8px;"><img src="{{ $logo }}" alt="{{ $brand }}" height="34" style="display:block;height:34px;"></td>
                </tr>
                <tr>
                    <td style="padding:8px 28px 4px;">
                        <h1 style="margin:0 0 12px;font-size:22px;line-height:1.25;font-weight:800;letter-spacing:-0.02em;">{{ $heading }}</h1>
                        @foreach ($lines as $line)
                            <p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:#3a3a3a;">{!! nl2br(e($line)) !!}</p>
                        @endforeach
                    </td>
                </tr>
                @if (count($table))
                    <tr>
                        <td style="padding:4px 28px 8px;">
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #ececea;border-radius:12px;">
                                @foreach ($table as $k => $v)
                                    <tr>
                                        <td style="padding:10px 14px;font-size:13px;color:#6b6b6b;border-bottom:1px solid #f1f1ef;width:40%;">{{ $k }}</td>
                                        <td style="padding:10px 14px;font-size:14px;font-weight:600;border-bottom:1px solid #f1f1ef;">{{ $v }}</td>
                                    </tr>
                                @endforeach
                            </table>
                        </td>
                    </tr>
                @endif
                @if ($buttonUrl)
                    <tr>
                        <td style="padding:16px 28px 8px;">
                            <a href="{{ $buttonUrl }}" style="display:inline-block;background:#17C74A;color:#111111;text-decoration:none;font-weight:700;font-size:15px;padding:13px 22px;border-radius:999px;">{{ $buttonLabel }}</a>
                        </td>
                    </tr>
                @endif
                <tr>
                    <td style="padding:20px 28px 26px;font-size:12px;line-height:1.5;color:#8a8a8a;">
                        @if ($footnote)<p style="margin:0 0 8px;">{{ $footnote }}</p>@endif
                        <p style="margin:0;">{{ $brand }} · Made in Zimbabwe{{ $support ? ' · '.$support : '' }}</p>
                    </td>
                </tr>
            </table>
        </td>
    </tr>
</table>
</body>
</html>
