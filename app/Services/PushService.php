<?php

namespace App\Services;

use App\Models\AppNotification;
use App\Models\DeviceToken;
use App\Models\User;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/** Sends via Expo Push API (relays to FCM/APNs) and always writes an inbox row. */
class PushService
{
    public function toUser(User $user, string $type, string $title, string $body, array $data = []): void
    {
        AppNotification::create(compact('type', 'title', 'body', 'data') + ['user_id' => $user->id]);

        $this->send($user->deviceTokens()->pluck('token')->all(), $title, $body, $data + ['type' => $type]);
    }

    /** Broadcast to every registered device, e.g. a home-builder announcement. */
    public function broadcast(string $type, string $title, string $body, array $data = []): void
    {
        DeviceToken::query()->select('user_id')->distinct()->pluck('user_id')->each(
            fn ($uid) => AppNotification::create(compact('type', 'title', 'body', 'data') + ['user_id' => $uid])
        );

        DeviceToken::query()->pluck('token')->chunk(100)->each(
            fn ($chunk) => $this->send($chunk->all(), $title, $body, $data + ['type' => $type])
        );
    }

    private function send(array $tokens, string $title, string $body, array $data): void
    {
        if (empty($tokens)) {
            return;
        }

        $messages = array_map(fn ($to) => compact('to', 'title', 'body', 'data') + ['sound' => 'default'], $tokens);

        try {
            $response = Http::timeout(10)->acceptJson()->post(config('zvino.expo_push_url'), $messages);

            // Drop tokens Expo reports as no longer registered.
            foreach ($response->json('data', []) as $i => $ticket) {
                if (($ticket['details']['error'] ?? null) === 'DeviceNotRegistered') {
                    DeviceToken::where('token', $tokens[$i])->delete();
                }
            }
        } catch (\Throwable $e) {
            Log::warning('Expo push failed: '.$e->getMessage());
        }
    }
}
