// Sustained load test with k6 (https://k6.io): browse + checkout quote, ramping to a lunch-rush peak.
//   k6 run -e BASE=https://staging.zvino.co.zw -e TOKEN=<customer API token> loadtest/k6.js
// Run against STAGING with simulated payments, never production.
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = __ENV.BASE || 'http://127.0.0.1:8001';
const H = { headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(__ENV.TOKEN ? { Authorization: `Bearer ${__ENV.TOKEN}` } : {}) } };

export const options = {
    stages: [
        { duration: '1m', target: 20 },  // warm up
        { duration: '3m', target: 100 }, // lunch rush
        { duration: '1m', target: 0 },
    ],
    thresholds: { http_req_failed: ['rate<0.01'], http_req_duration: ['p(95)<1200'] },
};

export default function () {
    const home = http.get(`${BASE}/api/home-layout`, H);
    check(home, { 'home 200': (r) => r.status === 200 });
    const vendors = http.get(`${BASE}/api/vendors`, H).json('data') || [];
    const v = vendors[Math.floor(Math.random() * Math.max(1, vendors.length))];
    if (v) {
        const menu = http.get(`${BASE}/api/vendors/${v.id}/menu`, H);
        check(menu, { 'menu 200': (r) => r.status === 200 });
    }
    http.get(`${BASE}/api/search?q=${['sadza', 'chicken', 'pizza', 'burger'][Math.floor(Math.random() * 4)]}`, H);
    if (__ENV.TOKEN) {
        const q = http.post(`${BASE}/api/checkout/quote`, JSON.stringify({ fulfilment: 'pickup' }), H);
        check(q, { 'quote ok': (r) => r.status === 200 || r.status === 422 });
    }
    sleep(1 + Math.random() * 2);
}
