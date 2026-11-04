<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** One onboarding screen (draft). Published copies live in AppContent. */
class OnboardingSlide extends Model
{
    public const APPS = ['customer', 'driver', 'merchant'];

    protected $guarded = [];
    protected $casts = ['overlay' => 'array'];

    public function toPublished(): array
    {
        return [
            'image' => $this->image_path ? url($this->image_path) : null,
            'heading' => $this->heading,
            'body' => $this->body,
            'button_label' => $this->button_label,
            'text_color' => $this->text_color,
            'text_position' => $this->text_position,
            'overlay' => $this->overlay ?? ['type' => 'gradient', 'from' => '#000000', 'to' => '#000000', 'opacity' => 0.55, 'direction' => 'to_top'],
        ];
    }
}
