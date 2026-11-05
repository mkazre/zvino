<?php

// Zvino keeps Inertia pages in resources/js/pages (lower case). The package default is js/Pages,
// which only works on case-insensitive disks (Windows), so tests failed on Linux / GitHub Actions.
$pages = [resource_path('js/pages')];
$extensions = ['js', 'jsx', 'svelte', 'ts', 'tsx', 'vue'];

return [
    'ssr' => ['enabled' => false, 'url' => 'http://127.0.0.1:13714'],
    'ensure_pages_exist' => false,
    'page_paths' => $pages,
    'page_extensions' => $extensions,
    'history' => ['encrypt' => (bool) env('INERTIA_ENCRYPT_HISTORY', false)],
    'testing' => [
        'ensure_pages_exist' => true,
        'page_paths' => $pages,
        'page_extensions' => $extensions,
    ],
];
