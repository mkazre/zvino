<?php

namespace App\Http\Controllers\Admin;

use App\Models\AuditLog;
use App\Models\CateringRequest;
use App\Models\Company;
use App\Models\CompanyInvoice;
use App\Models\CompanyMember;
use App\Models\Hamper;
use App\Services\CateringService;
use App\Services\CompanyService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;

/** Admin: catering bookings, diaspora hampers and corporate accounts. */
class SpecialOrdersController extends AdminController
{
    // ── Catering ─────────────────────────────────────────────────────

    public function catering(Request $request, CateringService $svc)
    {
        $status = $request->query('status', 'open');
        $rows = $this->scoped(CateringRequest::with('vendor', 'user'), $request)
            ->when($status === 'open', fn ($q) => $q->whereIn('status', ['requested', 'quoted', 'deposit_paid', 'paid']))
            ->when(! in_array($status, ['open', 'all'], true), fn ($q) => $q->where('status', $status))
            ->orderBy('event_at')->paginate(30)->withQueryString()->through(fn ($c) => $svc->present($c));

        return Inertia::render('admin/catering', ['rows' => $rows, 'filters' => ['status' => $status]]);
    }

    public function cateringAction(Request $request, CateringRequest $catering, CateringService $svc)
    {
        $this->authorizeVendor($request, $catering->vendor_id);
        $data = $request->validate([
            'action' => ['required', 'in:quote,complete,decline'],
            'quote_zig' => ['required_if:action,quote', 'nullable', 'numeric', 'min:1'],
            'deposit_pct' => ['nullable', 'numeric', 'between:0,100'],
            'note' => ['nullable', 'string', 'max:500'],
        ]);
        match ($data['action']) {
            'quote' => $svc->quote($catering, (float) $data['quote_zig'], $data['note'] ?? null, isset($data['deposit_pct']) ? (float) $data['deposit_pct'] : null),
            'complete' => $svc->complete($catering),
            'decline' => $svc->close($catering, 'store', $data['note'] ?? null),
        };
        AuditLog::record('catering.'.$data['action'], $catering, $data);

        return back()->with('success', 'Catering '.$catering->reference.' updated.');
    }

    // ── Hampers ──────────────────────────────────────────────────────

    public function hampers(Request $request)
    {
        return Inertia::render('admin/hampers', [
            'hampers' => Hamper::with('vendor:id,name')->orderBy('sort_order')->get()->map(fn ($h) => \App\Http\Controllers\Api\HamperController::present($h) + ['is_active' => $h->is_active, 'lines' => $h->lines, 'vendor_id' => $h->vendor_id]),
            'vendors' => $this->vendorOptions($request),
            'items' => \App\Models\Item::whereIn('vendor_id', collect($this->vendorOptions($request))->pluck('id'))->orderBy('name')->get(['id', 'vendor_id', 'name', 'price_zig']),
            'subscribers' => \App\Models\RecurringOrder::whereNotNull('hamper_id')->where('is_active', true)->count(),
        ]);
    }

    public function saveHamper(Request $request, ?Hamper $hamper = null)
    {
        $data = $request->validate([
            'vendor_id' => ['required', 'exists:vendors,id'],
            'name' => ['required', 'string', 'max:80'],
            'description' => ['nullable', 'string', 'max:500'],
            'is_active' => ['boolean'],
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.item_id' => ['required', 'integer', Rule::exists('items', 'id')->where('vendor_id', $request->input('vendor_id'))],
            'lines.*.quantity' => ['required', 'integer', 'between:1,100'],
            'image' => ['nullable', 'image', 'max:8192'],
        ]);
        $this->authorizeVendor($request, (int) $data['vendor_id']);
        if ($request->hasFile('image')) {
            $data['image_path'] = '/storage/'.$request->file('image')->store('hampers', 'public');
        }
        unset($data['image']);
        $hamper ? $hamper->update($data) : Hamper::create($data);

        return back()->with('success', 'Hamper saved.');
    }

    // ── Corporate accounts ───────────────────────────────────────────

    public function companies()
    {
        return Inertia::render('admin/companies', [
            'companies' => Company::withCount(['members' => fn ($q) => $q->where('is_active', true)])->with(['members.user:id,name', 'invoices' => fn ($q) => $q->latest()->limit(6)])->orderBy('name')->get()
                ->map(fn (Company $c) => $c->toArray() + [
                    'spent_month_zig' => $c->spentThisMonth(),
                    'unbilled_zig' => round((float) $c->spendQuery()->whereNull('company_invoice_id')->get()->sum(fn ($o) => $o->total_zig - $o->refunded_zig), 2),
                ]),
        ]);
    }

    public function saveCompany(Request $request, ?Company $company = null)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'billing_email' => ['nullable', 'email'],
            'billing_contact' => ['nullable', 'string', 'max:80'],
            'vat_number' => ['nullable', 'string', 'max:40'],
            'monthly_budget_zig' => ['nullable', 'numeric', 'min:0'],
            'daily_allowance_zig' => ['nullable', 'numeric', 'min:0'],
            'allowed_days' => ['nullable', 'array'],
            'allowed_days.*' => ['integer', 'between:1,7'],
            'payment_terms_days' => ['nullable', 'integer', 'between:0,90'],
            'is_active' => ['boolean'],
        ]);
        $company = $company ? tap($company)->update($data) : Company::create($data);
        AuditLog::record('company.saved', $company, $data);

        return back()->with('success', "{$company->name} saved.");
    }

    public function addMembers(Request $request, Company $company)
    {
        $data = $request->validate(['phones' => ['required', 'string', 'max:5000'], 'role' => ['nullable', 'in:member,admin']]);
        $added = 0;
        // One per line: "0771234567" or "0771234567, Tendai Moyo"
        foreach (preg_split('/\r?\n/', $data['phones']) as $line) {
            [$phone, $name] = array_map('trim', explode(',', $line.','));
            if (! preg_match('/\d{9,}/', preg_replace('/\D/', '', $phone))) {
                continue;
            }
            $phone = \App\Http\Controllers\Site\SignInController::normalise($phone);
            CompanyMember::updateOrCreate(['company_id' => $company->id, 'phone' => $phone], [
                'name' => $name ?: null, 'role' => $data['role'] ?? 'member', 'is_active' => true,
                'user_id' => \App\Models\User::where('phone', $phone)->value('id'),
            ]);
            $added++;
        }

        return back()->with('success', "$added staff added to {$company->name}.");
    }

    public function updateMember(Request $request, CompanyMember $member)
    {
        $member->update($request->validate(['is_active' => ['sometimes', 'boolean'], 'daily_allowance_zig' => ['nullable', 'numeric', 'min:0'], 'role' => ['sometimes', 'in:member,admin']]));

        return back();
    }

    public function invoice(CompanyService $svc)
    {
        $n = $svc->invoiceAll(now());

        return back()->with('success', $n ? "$n invoice(s) created." : 'Nothing to invoice.');
    }

    public function invoicePaid(Request $request, CompanyInvoice $invoice)
    {
        $invoice->update(['status' => 'paid', 'paid_at' => now(), 'reference' => $request->validate(['reference' => ['required', 'string', 'max:80']])['reference']]);
        AuditLog::record('company.invoice_paid', $invoice);

        return back()->with('success', "Invoice {$invoice->number} marked paid.");
    }
}
