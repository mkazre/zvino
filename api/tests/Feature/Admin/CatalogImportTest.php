<?php

namespace Tests\Feature\Admin;

use App\Jobs\ImportItemImages;
use App\Models\ExchangeRate;
use App\Models\Item;
use App\Models\User;
use App\Models\Vendor;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class CatalogImportTest extends TestCase
{
    use RefreshDatabase;

    private const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        $this->seed();
        $this->withoutVite();
        Storage::fake('public');
        Storage::fake('local');
        Http::fake(['cdn-s7m8bx8sebjz.vultrcdn.com/*' => Http::response(base64_decode(self::PNG), 200, ['Content-Type' => 'image/png'])]);
    }

    private function csv(array $rows): UploadedFile
    {
        $head = 'sku,name,description,department,category,price_usd,sale_price_usd,image_url,weight_kg,volume_ml,in_stock';
        $lines = array_map(fn ($r) => implode(',', array_map(fn ($v) => '"'.str_replace('"', '""', (string) $v).'"', $r)), $rows);

        return UploadedFile::fake()->createWithContent('tmpnp-eggs.csv', "\xEF\xBB\xBF".$head."\n".implode("\n", $lines)."\n");
    }

    private function rows(string $eggPrice = '1.50'): array
    {
        return [
            ['TMPNP-1', "Fresh Farm Eggs 6's", '<b>Six</b> eggs', 'Perishables', 'Eggs', $eggPrice, '', 'https://cdn-s7m8bx8sebjz.vultrcdn.com/product_images/2025/05/eggs.png', '0.4', '', 'yes'],
            ['TMPNP-2', 'Full Cream Milk 2L', '', 'Perishables', 'Milk', '2.40', '2.10', 'https://cdn-s7m8bx8sebjz.vultrcdn.com/product_images/milk.png', '', '2000', 'yes'],
            ['TMPNP-3', 'Rare Cheese', '', 'Perishables', 'Cheese', '9.00', '', '', '', '', 'no'],
            ['', 'No code', '', '', '', '1', '', '', '', '', 'yes'],
        ];
    }

    private function admin(): User
    {
        return User::where('role', 'super_admin')->firstOrFail();
    }

    public function test_preview_then_import_into_several_stores(): void
    {
        [$a, $b] = Vendor::orderBy('id')->take(2)->get();
        $rate = ExchangeRate::current();
        $this->actingAs($this->admin())->get('/admin/catalog/import/template')->assertOk()->assertHeader('Content-Type', 'text/csv; charset=UTF-8');

        // Step 1: preview, nothing saved.
        $res = $this->actingAs($this->admin())->post('/admin/catalog/import/preview', ['file' => $this->csv($this->rows()), 'vendor_ids' => [$a->id, $b->id], 'markup_pct' => 10, 'hide_out_of_stock' => true]);
        $res->assertRedirect();
        $token = str($res->headers->get('Location'))->after('token=')->toString();
        $this->assertSame(0, Item::whereNotNull('sku')->count());
        $this->actingAs($this->admin())->get("/admin/catalog/import?token=$token")->assertOk()->assertInertia(fn ($p) => $p
            ->component('admin/catalog-import')
            ->where('preview.rows', 3)
            ->where('preview.error_count', 1)
            ->where('preview.stores.0.new', 3)
            ->where('preview.stores.1.new', 3));

        // Step 2: import.
        $this->actingAs($this->admin())->post('/admin/catalog/import/run', ['token' => $token])->assertRedirect()->assertSessionHas('success');
        foreach ([$a, $b] as $v) {
            $eggs = Item::where('vendor_id', $v->id)->where('sku', 'TMPNP-1')->firstOrFail();
            $this->assertEqualsWithDelta(round(1.50 * 1.10 * $rate, 2), $eggs->price_zig, 0.01);
            $this->assertSame(1.5, $eggs->cost_usd);
            $this->assertSame('Six eggs', $eggs->description);
            $this->assertSame('Eggs', $eggs->category->name);
            $this->assertStringStartsWith('/storage/items/import/', $eggs->image_path, 'photo copied to Zvino');
            $this->assertSame('400 g', \App\Http\Resources\ItemResource::size($eggs->attributes));
            $milk = Item::where('vendor_id', $v->id)->where('sku', 'TMPNP-2')->firstOrFail();
            $this->assertTrue($milk->is_special);
            $this->assertEqualsWithDelta(round(2.10 * 1.10 * $rate, 2), $milk->special_price_zig, 0.01);
            $this->assertFalse(Item::where('vendor_id', $v->id)->where('sku', 'TMPNP-3')->value('is_available'), 'out of stock everywhere → hidden');
        }
        $this->assertCount(2, Storage::disk('public')->files('items/import'), 'each photo downloaded once for both stores');

        // Re-import a newer file: price updates, no duplicates, owner's renamed item keeps its name.
        Item::where('vendor_id', $a->id)->where('sku', 'TMPNP-1')->update(['name' => 'Our eggs']);
        $res = $this->actingAs($this->admin())->post('/admin/catalog/import/preview', ['file' => $this->csv($this->rows('1.80')), 'vendor_ids' => [$a->id], 'markup_pct' => 10]);
        $token = str($res->headers->get('Location'))->after('token=')->toString();
        $this->actingAs($this->admin())->get("/admin/catalog/import?token=$token")->assertInertia(fn ($p) => $p->where('preview.stores.0.new', 0)->where('preview.stores.0.updated', 1));
        $this->actingAs($this->admin())->post('/admin/catalog/import/run', ['token' => $token]);
        $eggs = Item::where('vendor_id', $a->id)->where('sku', 'TMPNP-1')->sole();
        $this->assertSame('Our eggs', $eggs->name);
        $this->assertEqualsWithDelta(round(1.80 * 1.10 * $rate, 2), $eggs->price_zig, 0.01);

        // A preview can only be used once.
        $this->actingAs($this->admin())->post('/admin/catalog/import/run', ['token' => $token])->assertStatus(410);
    }

    public function test_store_staff_can_only_import_into_their_own_store(): void
    {
        [$mine, $other] = Vendor::orderBy('id')->take(2)->get();
        $manager = User::factory()->create(['role' => 'vendor_manager', 'vendor_id' => $mine->id]);
        $this->actingAs($manager)->post('/admin/catalog/import/preview', ['file' => $this->csv($this->rows()), 'vendor_ids' => [$other->id]])->assertForbidden();

        // Someone else's preview token is useless.
        $res = $this->actingAs($this->admin())->post('/admin/catalog/import/preview', ['file' => $this->csv($this->rows()), 'vendor_ids' => [$other->id]]);
        $token = str($res->headers->get('Location'))->after('token=')->toString();
        $this->actingAs($manager)->post('/admin/catalog/import/run', ['token' => $token])->assertStatus(410);
        $this->assertSame(0, Item::whereNotNull('sku')->count());
    }

    public function test_photos_are_only_fetched_from_approved_https_sites(): void
    {
        $this->assertTrue(ImportItemImages::allowed('https://cdn-s7m8bx8sebjz.vultrcdn.com/product_images/a.png'));
        $this->assertFalse(ImportItemImages::allowed('http://cdn-s7m8bx8sebjz.vultrcdn.com/a.png'), 'not https');
        $this->assertFalse(ImportItemImages::allowed('https://evil.example.com/a.png'), 'not an approved site');
        $this->assertFalse(ImportItemImages::allowed('https://169.254.169.254/latest/meta-data'), 'internal address');
        $this->assertFalse(ImportItemImages::allowed('https://cdn-s7m8bx8sebjz.vultrcdn.com:8080/a.png'), 'odd port');
        $this->assertFalse(ImportItemImages::allowed('https://user@cdn-s7m8bx8sebjz.vultrcdn.com/a.png'));
    }
}
