<?php

namespace App\Http\Controllers\Admin;

use App\Models\AuditLog;
use Illuminate\Http\Request;
use Inertia\Inertia;

class AuditController extends AdminController
{
    public function __invoke(Request $request)
    {
        return Inertia::render('admin/audit', [
            'logs' => AuditLog::with('user:id,name,role')
                ->when($request->query('q'), fn ($q, $s) => $q->where('action', 'like', "%$s%"))
                ->when($request->query('user_id'), fn ($q, $u) => $q->where('user_id', $u))
                ->latest('created_at')->paginate(50)->withQueryString(),
            'filters' => $request->only('q', 'user_id'),
        ]);
    }
}
