<?php

namespace App\Services;

use App\Mail\ZvinoMail;
use App\Models\Order;
use App\Models\Setting;
use App\Models\User;
use App\Support\OrderView;
use App\Support\Permissions;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\URL;

/**
 * Order emails: the customer at the key moments (confirmed, on the way, delivered, cancelled), and
 * staff about new orders and problems. Queued (the cron runs the queue every minute) so a slow mail
 * server never slows down the kitchen or the driver app.
 */
class OrderMailer
{
    /** Customer email per status: [subject, heading, line]. */
    private const CUSTOMER = [
        'placed' => ['Order #{ref} received', 'Thanks, {name}! Your order is in.', '{store} will confirm it shortly. You can track it live in the app or on the website.'],
        'scheduled' => ['Order #{ref} scheduled', 'Your order is booked, {name}.', 'We’ll send it to {store} in time for {time}.'],
        'accepted' => ['{store} confirmed your order', 'Your order is confirmed', '{store} is preparing your order now.'],
        'picked_up' => ['Your order is on the way', 'On the way to you 🛵', '{driver} has collected your order from {store}.'],
        'ready_pickup' => ['Your order is ready to collect', 'Ready to collect', 'Your order is waiting for you at {store}{store_address}.'],
        'delivered' => ['Enjoy your meal! Receipt for #{ref}', 'Delivered. Enjoy! 🎉', 'Thanks for ordering with Zvino. Your receipt is below, and you can rate your order in the app.'],
        'cancelled' => ['Order #{ref} cancelled', 'Your order was cancelled', 'Any payment has been returned to your Zvino wallet.'],
        'rejected' => ['{store} couldn’t take order #{ref}', 'Sorry, {name}', '{store} couldn’t take your order this time. You’ve been fully refunded to your Zvino wallet.'],
    ];

    public function statusChanged(Order $order, string $status): void
    {
        $order->loadMissing('user', 'vendor', 'driver.user', 'address');
        $key = $status === 'ready' && $order->fulfilment === 'pickup' ? 'ready_pickup' : $status;
        if (isset(self::CUSTOMER[$key]) && $order->user?->email && Setting::get('notifications.email_enabled') !== false) {
            $this->customer($order, $key);
        }
        if ($status === 'placed' && Setting::get('notifications.email_staff_new_orders')) {
            $this->staff($order, "New order #{$order->reference} · {$order->vendor->name}", 'New order', "A new {$order->fulfilment} order was placed at {$order->vendor->name}.");
        }
        if (in_array($status, ['cancelled', 'rejected'], true) && Setting::get('notifications.email_staff_problems') !== false) {
            $what = $status === 'rejected' ? 'declined by the store' : 'cancelled';
            $this->staff($order, "Order #{$order->reference} {$what}", 'Order '.$what, "Order #{$order->reference} from {$order->vendor->name} was {$what}.".($order->cancel_reason || $order->reject_reason ? ' Reason: '.($order->cancel_reason ?: $order->reject_reason) : ''));
        }
    }

    private function customer(Order $order, string $key): void
    {
        [$subject, $heading, $line] = self::CUSTOMER[$key];
        $vars = [
            '{ref}' => $order->reference,
            '{name}' => explode(' ', trim((string) $order->user->name))[0] ?: 'there',
            '{store}' => $order->vendor->name,
            '{store_address}' => $order->vendor->address ? ', '.$order->vendor->address : '',
            '{driver}' => $order->driver?->user?->name ? explode(' ', $order->driver->user->name)[0] : 'Your driver',
            '{time}' => $order->scheduled_for?->timezone('Africa/Harare')->format('D j M, H:i') ?? '',
        ];
        $view = OrderView::forCustomer($order);
        $money = fn ($m) => ($m['zig'] ?? 0) ? 'ZiG '.number_format($m['zig'], 2).' ($'.number_format($m['usd'], 2).')' : '–';
        $table = ['Order' => '#'.$order->reference, 'From' => $order->vendor->name];
        foreach ($view['receipt']['lines'] as $l) {
            $table[$l['quantity'].'× '.$l['name']] = $money($l['total']);
        }
        $table['Total'] = $money($view['receipt']['total']);
        $table['Payment'] = $view['details']['payment']['method'];

        $mail = new ZvinoMail(strtr($subject, $vars), strtr($heading, $vars), [strtr($line, $vars)], $table,
            $key === 'delivered' ? 'Download receipt (PDF)' : 'Track your order',
            $key === 'delivered' ? URL::temporarySignedRoute('site.order.receipt', now()->addDays(60), ['order' => $order->id]) : url("/orders/{$order->id}"));
        $this->send($order->user->email, $mail);
    }

    private function staff(Order $order, string $subject, string $heading, string $line): void
    {
        $to = User::whereIn('role', ['super_admin', 'admin', 'support'])->whereNotNull('email')->get()
            ->filter(fn ($u) => Permissions::allows($u, 'orders.view'))->pluck('email')
            ->push(Setting::get('notifications.ops_alert_email'))->filter()->unique()->values()->all();
        if (! $to) {
            return;
        }
        $mail = new ZvinoMail($subject, $heading, [$line], [
            'Order' => '#'.$order->reference, 'Store' => $order->vendor->name, 'Customer' => trim(($order->user?->name ?? 'Guest').' '.($order->user?->phone ?? '')),
            'Total' => 'ZiG '.number_format((float) $order->total_zig, 2), 'Type' => ucfirst($order->fulfilment), 'Payment' => OrderView::paymentLabel($order->payment_method),
        ], 'Open in admin', url("/admin/orders/{$order->id}"));
        $this->send($to, $mail);
    }

    private function send(string|array $to, ZvinoMail $mail): void
    {
        try {
            Mail::to($to)->queue($mail);
        } catch (\Throwable $e) {
            report($e);
        }
    }
}
