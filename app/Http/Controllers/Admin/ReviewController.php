<?php

namespace App\Http\Controllers\Admin;

use App\Models\AuditLog;
use App\Models\Review;
use Illuminate\Http\Request;
use Inertia\Inertia;

class ReviewController extends AdminController
{
    public function index(Request $request)
    {
        $base = fn () => $this->scoped(Review::query(), $request);

        return Inertia::render('admin/reviews', [
            'reviews' => $base()->with('user:id,name', 'vendor:id,name', 'driver.user:id,name', 'order:id,reference')
                ->when($request->query('rating'), fn ($q, $r) => $q->where('vendor_rating', $r))
                ->when($request->query('vendor_id'), fn ($q, $v) => $q->where('vendor_id', $v))
                ->when($request->boolean('unreplied'), fn ($q) => $q->whereNull('vendor_reply'))
                ->latest()->paginate(30)->withQueryString(),
            'summary' => [
                'average' => round((float) $base()->avg('vendor_rating'), 2),
                'count' => $base()->count(),
                'driver_average' => round((float) $base()->whereNotNull('driver_rating')->avg('driver_rating'), 2),
                'distribution' => $base()->selectRaw('vendor_rating, COUNT(*) as c')->groupBy('vendor_rating')->pluck('c', 'vendor_rating'),
            ],
            'filters' => $request->only('rating', 'vendor_id', 'unreplied'),
        ]);
    }

    public function update(Request $request, Review $review)
    {
        $this->authorizeVendor($request, $review->vendor_id);
        $data = $request->validate(['vendor_reply' => ['sometimes', 'nullable', 'string', 'max:500'], 'is_hidden' => ['sometimes', 'boolean']]);
        $review->update($data);
        if (array_key_exists('is_hidden', $data)) {
            AuditLog::record($data['is_hidden'] ? 'review.hidden' : 'review.shown', $review);
        }

        return back()->with('success', 'Review updated.');
    }
}
