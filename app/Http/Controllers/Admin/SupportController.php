<?php

namespace App\Http\Controllers\Admin;

use App\Models\SupportTicket;
use App\Models\User;
use App\Services\PushService;
use Illuminate\Http\Request;
use Inertia\Inertia;

class SupportController extends AdminController
{
    public function index(Request $request)
    {
        $status = $request->query('status', 'open');

        return Inertia::render('admin/support', [
            'tickets' => SupportTicket::with('user:id,name,phone', 'assignee:id,name')
                ->when($status !== 'all', fn ($q) => $q->where('status', $status))
                ->when($request->query('mine'), fn ($q) => $q->where('assigned_to', $request->user()->id))
                ->orderByRaw("CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END")
                ->latest()->paginate(30)->withQueryString(),
            'counts' => SupportTicket::selectRaw('status, COUNT(*) as c')->groupBy('status')->pluck('c', 'status'),
            'status' => $status,
            'active' => $request->query('ticket') ? $this->detail(SupportTicket::findOrFail($request->query('ticket'))) : null,
            'agents' => User::whereIn('role', ['super_admin', 'admin', 'support'])->get(['id', 'name']),
        ]);
    }

    public function show(SupportTicket $ticket)
    {
        return redirect()->route('admin.support', ['ticket' => $ticket->id, 'status' => 'all']);
    }

    public function reply(Request $request, SupportTicket $ticket, PushService $push)
    {
        $body = $request->validate(['body' => ['required', 'string', 'max:5000']])['body'];
        $ticket->messages()->create(['sender_id' => $request->user()->id, 'is_staff' => true, 'body' => $body]);
        $ticket->update(['status' => 'pending', 'assigned_to' => $ticket->assigned_to ?? $request->user()->id]);
        $push->toUser($ticket->user, 'support', 'Zvino Support replied', \Illuminate\Support\Str::limit($body, 120), ['ticket_id' => $ticket->id, 'order_id' => $ticket->order_id]);
        if ($ticket->user->email && config('mail.default') !== 'log') {
            try {
                \Illuminate\Support\Facades\Mail::to($ticket->user->email)->queue(new \App\Mail\ZvinoMail("Re: {$ticket->subject} (ticket #{$ticket->id})", 'Zvino Support replied', [$body]));
            } catch (\Throwable $e) {
                report($e);
            }
        }

        return back()->with('success', 'Reply sent.');
    }

    public function update(Request $request, SupportTicket $ticket)
    {
        $ticket->update($request->validate([
            'status' => ['sometimes', 'in:open,pending,resolved'],
            'priority' => ['sometimes', 'in:low,normal,high,urgent'],
            'assigned_to' => ['sometimes', 'nullable', 'exists:users,id'],
        ]));

        return back();
    }

    private function detail(SupportTicket $t): array
    {
        $t->load('user:id,name,phone,email', 'messages.sender:id,name', 'order:id,reference,status,total_zig,vendor_id', 'order.vendor:id,name');

        return $t->toArray() + [
            'customer_orders' => $t->user->orders()->latest()->limit(5)->get(['id', 'reference', 'status', 'total_zig', 'created_at']),
            'wallet_zig' => $t->user->walletBalance(),
        ];
    }
}
