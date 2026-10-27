<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DashboardTest extends TestCase
{
    use RefreshDatabase;

    public function test_guests_are_redirected_to_the_login_page()
    {
        $this->get('/dashboard')->assertRedirect('/login');
    }

    public function test_staff_can_visit_the_dashboard()
    {
        $this->actingAs(User::factory()->create(['role' => 'super_admin']));

        $this->get('/dashboard')->assertOk();
    }

    public function test_customers_cannot_visit_the_dashboard()
    {
        $this->actingAs(User::factory()->create());

        $this->get('/dashboard')->assertForbidden();
    }
}
