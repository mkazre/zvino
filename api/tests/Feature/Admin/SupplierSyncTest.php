<?php

namespace Tests\Feature\Admin;

use App\Models\ExchangeRate;
use App\Models\Item;
use App\Models\SupplierCategory;
use App\Models\SupplierLocation;
use App\Models\SupplierProduct;
use App\Models\User;
use App\Services\SupplierSync;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class SupplierSyncTest extends TestCase
{
    use RefreshDatabase;

    private const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

    /** What TM Pick n Pay's API returns; tests change prices here between syncs. */
    private array $eggs = [];
    private array $milk = [];
    private int $requests = 0;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        $this->seed();
        $this->withoutVite();
        Storage::fake('public');
        $this->eggs = [$this->product(1, 'PN FRESH FARM EGGS STANDARD 6\'S', '1.50', ['138' => 10, '163' => 0])];
        $this->milk = [$this->product(2, 'DAIRIBORD FULL CREAM MILK 2LT', '2.40', ['138' => 5, '163' => 7], '2.10'), $this->product(3, 'LACTO 500ML', '0.90', ['138' => 3, '163' => 3])];

        Http::fake(function ($request) {
            $this->requests++;
            $url = $request->url();
            $json = fn ($d) => Http::response($d, 200);
            if (str_contains($url, 'vultrcdn.com')) {
                return Http::response(base64_decode(self::PNG), 200, ['Content-Type' => 'image/png']);
            }
            if (str_ends_with($url, '/subcategories')) {
                return $json([['id' => 286, 'name' => 'Perishables', 'slug' => 'perishables', 'products_count' => 3, 'subcategories' => [
                    ['child_category' => ['id' => 314, 'name' => 'Eggs', 'slug' => 'eggs']],
                    ['child_category' => ['id' => 315, 'name' => 'Milk', 'slug' => 'milk']],
                ]], ['id' => 260, 'name' => 'Beverages', 'slug' => 'beverages', 'products_count' => 50, 'subcategories' => []]]);
            }
            if (str_ends_with($url, '/location-groups')) {
                return $json([['name' => 'HARARE REGION ZIMBABWE', 'locations' => [
                    ['id' => 138, 'name' => 'PICK n PAY BORROWDALE', 'status' => 'active', 'street' => 'Borrowdale Rd', 'city' => 'HARARE', 'phone' => '263242000001', 'latitude' => -17.75, 'longitude' => 31.09, 'opening_hour' => '08:00:00', 'closing_hour' => '20:00:00'],
                    ['id' => 163, 'name' => 'TM PICK n PAY MSASA', 'status' => 'active', 'street' => 'Mutare Rd', 'city' => 'HARARE', 'phone' => '263242000002', 'latitude' => -17.83, 'longitude' => 31.12, 'opening_hour' => '08:00:00', 'closing_hour' => '19:00:00'],
                ]]]);
            }
            if (preg_match('#search-product/([a-z-]+)/#', $url, $m)) {
                $data = ['eggs' => $this->eggs, 'milk' => $this->milk, 'perishables' => [...$this->eggs, ...$this->milk]][$m[1]] ?? [];

                return $json(['current_page' => 1, 'last_page' => 1, 'data' => $data]);
            }

            return Http::response('not found', 404);
        });
    }

    private function product(int $id, string $name, string $price, array $stock, string $sale = '0'): array
    {
        return ['id' => $id, 'product_code' => "C$id", 'name' => $name, 'price' => $price, 'sale_price' => $sale, 'status' => 'published', 'description' => 'null', 'slug' => "p-$id",
            'image' => "2025/05/p$id.png", 'weight' => '0.5', 'width' => '0', 'height' => '0', 'product_category' => ['name' => 'Perishables'],
            'stock_levels' => collect($stock)->map(fn ($q, $loc) => ['id' => (int) $loc, 'name' => "Branch $loc", 'pivot' => ['stock_quantity' => $q]])->values()->all()];
    }

    private function admin(): User
    {
        return User::where('role', 'super_admin')->firstOrFail();
    }

    public function test_full_flow_categories_branches_products_markup_and_weekly_update(): void
    {
        $admin = $this->actingAs($this->admin());
        $rate = ExchangeRate::current();

        // 1. Load categories & branches: each branch becomes a draft Zvino store.
        $admin->post('/admin/suppliers/tmpnp/refresh')->assertSessionHas('success');
        $this->assertSame(4, SupplierCategory::count());
        $borrowdale = SupplierLocation::where('external_id', '138')->firstOrFail();
        $this->assertSame('Borrowdale', $borrowdale->branch);
        $store = $borrowdale->vendor;
        $this->assertSame('Zvino Market Borrowdale', $store->name);
        $this->assertSame('pending', $store->status, 'draft until published');
        $this->assertTrue((bool) $store->auto_accept, 'no store staff: orders accepted automatically');
        $this->assertSame('grocery', $store->kind);
        $this->assertSame(7, $store->hours()->count());

        // 2. Settings: 10% default markup. Pick the Perishables department. Sync.
        $admin->post('/admin/suppliers/tmpnp/settings', ['store_name_pattern' => 'Zvino Market {branch}', 'markup_type' => 'percent', 'markup_value' => 10, 'group_by' => 'category', 'hide_out_of_stock' => true, 'weekly_sync' => true, 'shopping_minutes' => 25, 'request_pause_ms' => 1000, 'enabled' => true])->assertSessionHas('success');
        $admin->post('/admin/suppliers/tmpnp/categories', ['selected' => ['perishables']]);
        $admin->post('/admin/suppliers/tmpnp/sync')->assertSessionHas('success');

        $this->assertSame(3, SupplierProduct::where('active', true)->count());
        $eggs = SupplierProduct::where('external_id', '1')->firstOrFail();
        $this->assertSame('Eggs', $eggs->category, 'products keep their aisle, not just the department');
        $this->assertSame("Pn Fresh Farm Eggs Standard 6's", $eggs->name);
        $this->assertStringStartsWith('/storage/items/import/', $eggs->fresh()->image_path, 'photo copied to Zvino');
        $this->assertSame('done', SupplierSync::source()->sync_status['state']);

        // 3. Publish Borrowdale: its menu is filled, priced with the markup, branch stock respected.
        $admin->post('/admin/suppliers/tmpnp/stores', ['ids' => [$borrowdale->id], 'status' => 'active'])->assertSessionHas('success');
        $this->assertSame('active', $store->fresh()->status);
        $item = fn ($ext, $vendor = null) => Item::where('vendor_id', ($vendor ?? $store)->id)->where('supplier_product_id', SupplierProduct::where('external_id', $ext)->value('id'))->first();
        $this->assertEqualsWithDelta(round(1.65 * $rate, 2), $item('1')->price_zig, 0.01);                // 1.50 + 10%
        $this->assertEqualsWithDelta(round(2.31 * $rate, 2), $item('2')->special_price_zig, 0.01);        // promo 2.10 + 10%
        $this->assertSame('Eggs', $item('1')->category->name);

        // Msasa has no eggs in stock: published there, eggs are hidden.
        $msasa = SupplierLocation::where('external_id', '163')->firstOrFail();
        $admin->post('/admin/suppliers/tmpnp/stores', ['ids' => [$msasa->id], 'status' => 'active']);
        $this->assertFalse($item('1', $msasa->vendor)->is_available);
        $this->assertTrue($item('2', $msasa->vendor)->is_available);

        // 4. Markups: aisle (Milk +$0.50) beats the default; a product's own markup beats both.
        $admin->post('/admin/suppliers/tmpnp/categories/'.SupplierCategory::where('slug', 'milk')->value('id').'/markup', ['type' => 'fixed', 'value' => 0.5]);
        $this->assertEqualsWithDelta(round(2.90 * $rate, 2), $item('2')->price_zig, 0.01);                // 2.40 + $0.50
        $admin->post('/admin/suppliers/tmpnp/products/markup', ['ids' => [SupplierProduct::where('external_id', '3')->value('id')], 'type' => 'percent', 'value' => 50]);
        $this->assertEqualsWithDelta(round(1.35 * $rate, 2), $item('3')->price_zig, 0.01);                // 0.90 + 50%

        // 5. Monday update: a price change and a product TM stopped selling.
        $this->eggs[0]['price'] = '1.80';
        $this->milk = [$this->milk[0]]; // Lacto gone
        SupplierSync::start(SupplierSync::source(), 'weekly');
        $this->assertEqualsWithDelta(round(1.98 * $rate, 2), $item('1')->price_zig, 0.01);                // 1.80 + 10%
        $this->assertFalse($item('3')->is_available, 'no longer sold → switched off');
        $this->assertSame(1, Item::where('vendor_id', $store->id)->where('supplier_product_id', SupplierProduct::where('external_id', '1')->value('id'))->count(), 'no duplicates');

        // Drafting hides the store again.
        $admin->post('/admin/suppliers/tmpnp/stores', ['ids' => [$borrowdale->id], 'status' => 'pending']);
        $this->assertSame('pending', $store->fresh()->status);
    }

    public function test_sync_runs_on_its_own_queue_and_only_staff_with_store_rights_can_use_it(): void
    {
        Queue::fake();
        $source = SupplierSync::source();
        SupplierCategory::create(['supplier_source_id' => $source->id, 'slug' => 'eggs', 'name' => 'Eggs', 'selected' => true]);
        $this->actingAs($this->admin())->post('/admin/suppliers/tmpnp/sync');
        Queue::assertPushedOn('supplier', \App\Jobs\Supplier\SyncCatalogue::class);

        // Starting again while it runs doesn't queue a second copy.
        SupplierSync::start($source->fresh());
        Queue::assertPushed(\App\Jobs\Supplier\SyncCatalogue::class, 1);

        $kitchen = User::where('role', 'kitchen')->firstOrFail();
        $this->actingAs($kitchen)->get('/admin/suppliers/tmpnp')->assertForbidden();
        $this->actingAs($this->admin())->get('/admin/suppliers/tmpnp?tab=stores')->assertOk()->assertInertia(fn ($p) => $p->component('admin/suppliers'));
    }

    public function test_store_name_pattern_change_renames_auto_named_stores_only(): void
    {
        $admin = $this->actingAs($this->admin());
        $admin->post('/admin/suppliers/tmpnp/refresh');
        $msasa = SupplierLocation::where('external_id', '163')->firstOrFail()->vendor;
        $msasa->update(['name' => 'My special Msasa shop']);
        $admin->post('/admin/suppliers/tmpnp/settings', ['store_name_pattern' => 'Zvino Grocer – {branch}', 'markup_type' => 'percent', 'markup_value' => 0, 'group_by' => 'category', 'shopping_minutes' => 25, 'request_pause_ms' => 1000]);
        $this->assertSame('Zvino Grocer – Borrowdale', SupplierLocation::where('external_id', '138')->first()->vendor->name);
        $this->assertSame('My special Msasa shop', $msasa->fresh()->name);
    }
}
