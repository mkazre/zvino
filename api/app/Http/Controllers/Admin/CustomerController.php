<?php

namespace App\Http\Controllers\Admin;

use App\Http\Resources\OrderResource;
use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Symfony\Component\HttpFoundation\StreamedResponse;

class CustomerController extends AdminController
{
    private function query(Request $request)
    {
        $s = $request->query('q');

        return User::where('role', 'customer')
            ->with('loyalty')
            ->withCount(['orders' => fn ($q) => $q->where('status', 'delivered')])
            ->withSum(['orders as spend_zig' => fn ($q) => $q->where('status', 'delivered')], 'total_zig')
            ->withMax('orders as last_order_at', 'created_at')
            ->when($s, fn ($q) => $q->where(fn ($w) => $w->where('name', 'like', "%$s%")->orWhere('phone', 'like', "%$s%")->orWhere('email', 'like', "%$s%")))
            ->when($request->query('tier'), fn ($q, $t) => $q->whereHas('loyalty', fn ($l) => $l->where('tier', $t)))
            ->when($request->query('segment') === 'new', fn ($q) => $q->where('created_at', '>=', now()->subDays(30)))
            ->when($request->query('segment') === 'lapsed', fn ($q) => $q->whereHas('orders')->whereDoesntHave('orders', fn ($o) => $o->where('created_at', '>=', now()->subDays(30))))
            ->when($request->query('segment') === 'vip', fn ($q) => $q->has('orders', '>=', 10))
            ->when($request->query('segment') === 'banned', fn ($q) => $q->whereNotNull('banned_at'));
    }

    public function index(Request $request)
    {
        return Inertia::render('admin/customers', [
            'customers' => $this->query($request)->latest()->paginate(30)->withQueryString(),
            'filters' => $request->only('q', 'tier', 'segment'),
            'tiers' => array_keys(\App\Models\Setting::get('loyalty.tiers')),
            'stats' => [
                'total' => User::where('role', 'customer')->count(),
                'new_30d' => User::where('role', 'customer')->where('created_at', '>=', now()->subDays(30))->count(),
                'active_30d' => User::where('role', 'customer')->whereHas('orders', fn ($o) => $o->where('created_at', '>=', now()->subDays(30)))->count(),
                'zvino_plus' => \App\Models\Subscription::where('current_period_end', '>', now())->distinct('user_id')->count('user_id'),
            ],
        ]);
    }

    public function show(User $user)
    {
        abort_unless($user->role === 'customer' || $user->role === 'driver', 404);
        $user->load('loyalty', 'addresses');

        return Inertia::render('admin/customer-show', [
            'customer' => $user->toArray() + [
                'wallet_zig' => $user->walletBalance(),
                'zvino_plus' => $user->activeSubscription()?->only('status', 'current_period_end'),
                'referral_code' => $user->referral_code,
            ],
            'stats' => [
                'orders' => $user->orders()->where('status', 'delivered')->count(),
                'spend_zig' => (float) $user->orders()->where('status', 'delivered')->sum('total_zig'),
                'avg_zig' => round((float) $user->orders()->where('status', 'delivered')->avg('total_zig'), 2),
                'refunds_zig' => (float) $user->orders()->sum('refunded_zig'),
                'cancelled' => $user->orders()->where('status', 'cancelled')->count(),
            ],
            'orders' => OrderResource::collection($user->orders()->with('vendor')->latest()->limit(20)->get()),
            'wallet' => $user->walletTransactions()->latest()->limit(30)->get(),
            'tickets' => $user->hasMany(\App\Models\SupportTicket::class)->latest()->limit(10)->get(['id', 'subject', 'status', 'created_at']),
        ]);
    }

    public function adjustWallet(Request $request, User $user)
    {
        $data = $request->validate(['type' => ['required', 'in:credit,debit'], 'amount_zig' => ['required', 'numeric', 'min:0.01', 'max:100000'], 'reason' => ['required', 'string', 'max:200']]);
        abort_if($data['type'] === 'debit' && $user->walletBalance() < $data['amount_zig'], 422, 'Wallet balance is too low for that debit.');
        $user->walletTransactions()->create($data + ['reason' => 'Admin: '.$data['reason']]);
        AuditLog::record('customer.wallet_'.$data['type'], $user, $data);

        return back()->with('success', 'Wallet '.($data['type'] === 'credit' ? 'credited' : 'debited').'.');
    }

    public function toggleBan(Request $request, User $user)
    {
        $reason = $request->validate(['reason' => ['nullable', 'string', 'max:200']])['reason'] ?? null;
        $user->update(['banned_at' => $user->banned_at ? null : now()]);
        if ($user->banned_at) {
            $user->tokens()->delete();
        }
        AuditLog::record($user->banned_at ? 'customer.banned' : 'customer.unbanned', $user, ['reason' => $reason]);

        return back()->with('success', $user->banned_at ? 'Customer blocked and signed out.' : 'Customer unblocked.');
    }

    public function export(Request $request): StreamedResponse
    {
        AuditLog::record('customers.exported');

        return response()->streamDownload(function () use ($request) {
            $out = fopen('php://output', 'w');
            fputcsv($out, ['ID', 'Name', 'Phone', 'Email', 'Tier', 'Points', 'Orders', 'Spend (ZiG)', 'Joined', 'Marketing opt-in']);
            $this->query($request)->chunk(500, function ($rows) use ($out) {
                foreach ($rows as $u) {
                    fputcsv($out, [$u->id, $u->name, $u->phone, $u->email, $u->loyalty?->tier ?? 'Bronze', $u->loyalty?->points ?? 0, $u->orders_count, $u->spend_zig ?? 0, $u->created_at->toDateString(), $u->marketing_opt_in ? 'yes' : 'no']);
                }
            });
            fclose($out);
        }, 'zvino-customers-'.now()->format('Y-m-d').'.csv', ['Content-Type' => 'text/csv']);
    }
}
