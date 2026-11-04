<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CateringRequest;
use App\Models\Vendor;
use App\Services\CateringService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Customer side of catering: request, see quotes, pay deposit and balance, cancel. */
class CateringController extends Controller
{
    public function __construct(private CateringService $catering) {}

    public function index(Request $request)
    {
        return response()->json(CateringRequest::with('vendor')->where('user_id', $request->user()->id)->latest()->get()->map(fn ($c) => $this->catering->present($c)));
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'vendor_id' => ['required', Rule::exists('vendors', 'id')->where('status', 'active')],
            'event_type' => ['required', Rule::in(CateringRequest::TYPES)],
            'event_at' => ['required', 'date'],
            'headcount' => ['required', 'integer', 'between:1,5000'],
            'location' => ['required', 'string', 'max:200'],
            'lat' => ['nullable', 'numeric'], 'lng' => ['nullable', 'numeric'],
            'contact_name' => ['nullable', 'string', 'max:80'],
            'contact_phone' => ['nullable', 'string', 'max:20'],
            'notes' => ['nullable', 'string', 'max:1000'],
            'lines' => ['nullable', 'array', 'max:40'],
            'lines.*.item_id' => ['required', 'integer', Rule::exists('items', 'id')->where('vendor_id', $request->input('vendor_id'))],
            'lines.*.quantity' => ['required', 'integer', 'between:1,5000'],
        ]);
        $req = $this->catering->request($request->user(), Vendor::findOrFail($data['vendor_id']), $data);

        return response()->json($this->catering->present($req->load('vendor')), 201);
    }

    public function pay(Request $request, CateringRequest $catering)
    {
        abort_unless($catering->user_id === $request->user()->id, 404);
        $data = $request->validate(['method' => ['required', 'in:ecocash,onemoney,innbucks,card,wallet'], 'phone' => ['nullable', 'string', 'max:20']]);
        $payment = $this->catering->pay($catering, $data['method'], $data['phone'] ?? null);

        return response()->json(['payment' => $payment->only('id', 'status', 'method', 'redirect_url', 'amount_zig'), 'catering' => $this->catering->present($catering->fresh('vendor'))]);
    }

    public function cancel(Request $request, CateringRequest $catering)
    {
        abort_unless($catering->user_id === $request->user()->id, 404);

        return response()->json($this->catering->present($this->catering->close($catering, 'customer', $request->input('reason'))->load('vendor')));
    }
}
