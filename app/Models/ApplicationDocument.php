<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ApplicationDocument extends Model
{
    protected $guarded = [];

    public function application(): BelongsTo { return $this->belongsTo(PartnerApplication::class, 'partner_application_id'); }

    public function isImage(): bool { return str_starts_with($this->mime, 'image/'); }
}
