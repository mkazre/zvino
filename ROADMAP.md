# Zvino v1 roadmap

Scope: feature parity with DoorDash / Uber Eats core, launched in Harare and Bulawayo.
Decisions: 3 apps (Customer, Driver, Merchant) from one Expo codebase, public ordering website,
admin panel, Laravel API on shared hosting, Pusher, Paynow, Google Maps, Inter, monochrome + green.

## Phase 1: Platform core (API)
- [ ] Settings registry: every operational setting editable in admin, typed, cached, audited
- [ ] Delivery zones (map polygons) with per-zone fees, minimums, ETAs and surge
- [ ] Distance-based delivery fee (base + per km), service fee, small-order fee, tax rules
- [ ] Store hours, holiday closures, busy mode (+prep time), pause ordering, delivery radius
- [ ] Proper modifier groups (required/optional, min/max), item out-of-stock until time
- [ ] Order lifecycle: merchant accept/reject with reason, prep time, auto-cancel, scheduled orders
- [ ] Drivers: onboarding, documents, vehicle, approval, online/offline, live location
- [ ] Dispatch: offer to nearest available driver, accept/decline with timeout, re-offer, manual assign, batching
- [ ] Proof of delivery (photo / PIN), contactless drop-off
- [ ] Tips, ratings & reviews (store + driver), favourites
- [ ] Refunds (full/partial, to wallet or source), disputes
- [ ] Wallet top-up, referrals, gift cards, Zvino+ subscription (free delivery, reduced fees)
- [ ] Group orders (shared cart link)
- [ ] Order chat customer ↔ driver ↔ store; masked contact
- [ ] Ledgers: merchant & driver earnings, commissions, payouts, statements
- [ ] Notification templates (push / SMS / email) and campaigns
- [ ] Audit log, fine-grained permissions

## Phase 2: Design system
- [ ] Tokens (colour, type, spacing, radius, elevation) shared by web and mobile
- [ ] Component library: buttons, inputs, sheets, tables, cards, empty/loading/error states

## Phase 3: Admin panel rebuild
- [ ] All existing screens redesigned + live dispatch map, drivers, zones, payouts, refunds,
      reviews, support console, campaigns, reports & exports, audit log
- [ ] Full settings: business, branding, fees & taxes, zones, payments, notifications,
      legal pages, app versions & force-update, maintenance mode, roles & permissions

## Phase 4: Customer website
- [ ] Landing, city & restaurant pages (SEO), menu, cart, checkout, tracking, account

## Phase 5: Mobile apps (Expo, shared packages)
- [ ] Zvino: full ordering experience incl. live map tracking
- [ ] Zvino Driver: online toggle, job offers, navigation hand-off, proof of delivery, earnings
- [ ] Zvino Merchant: incoming orders with sound, accept/prep time, menu availability, hours, payouts

## Phase 6: Launch hardening
- [ ] Load & security review, error monitoring, backups, store listings, production deploy

## Needed from Zvino before go-live
Paynow keys · SMS provider · Google Maps API key · Apple & Google developer accounts ·
logo & food photography · terms & privacy policy
