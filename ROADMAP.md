# Zvino v1 roadmap

Scope: feature parity with DoorDash / Uber Eats core, launched in Harare and Bulawayo.
Decisions: 3 apps (Customer, Driver, Merchant) from one Expo codebase, public ordering website,
admin panel, Laravel API on shared hosting, Pusher, Paynow, Google Maps, Inter, monochrome + green.

## Phase 1: Platform core (API)
- [x] Settings registry: every operational setting editable in admin, typed, cached, audited
- [x] Delivery zones (map polygons) with per-zone fees, minimums, ETAs and surge
- [x] Distance-based delivery fee (base + per km), service fee, small-order fee, tax rules
- [x] Store hours, holiday closures, busy mode (+prep time), pause ordering, delivery radius
- [x] Proper modifier groups (required/optional, min/max), item out-of-stock until time
- [x] Order lifecycle: merchant accept/reject with reason, prep time, auto-cancel, scheduled orders
- [x] Drivers: onboarding, documents, vehicle, approval, online/offline, live location
- [x] Dispatch: offer to nearest available driver, accept/decline with timeout, re-offer, manual assign, batching
- [x] Proof of delivery (photo / PIN), contactless drop-off
- [x] Tips, ratings & reviews (store + driver), favourites
- [x] Refunds (full/partial, to wallet or source), disputes
- [x] Wallet top-up, referrals, gift cards, Zvino+ subscription (free delivery, reduced fees)
- [x] Group orders (shared cart link)
- [x] Order chat customer ↔ driver ↔ store; masked contact
- [x] Ledgers: merchant & driver earnings, commissions, payouts, statements
- [x] Notification templates (push / SMS / email) and campaigns
- [x] Audit log, fine-grained permissions

## Phase 2: Design system
- [x] Tokens (colour, type, spacing, radius, elevation) shared by web and mobile
- [x] Component library: buttons, inputs, sheets, tables, cards, empty/loading/error states

## Phase 3: Admin panel rebuild
- [x] All existing screens redesigned + live dispatch map, drivers, zones, payouts, refunds,
      reviews, support console, campaigns, reports & exports, audit log
- [x] Full settings: business, branding, fees & taxes, zones, payments, notifications,
      legal pages, app versions & force-update, maintenance mode, roles & permissions

## Phase 4: Customer website
- [x] Landing, city & restaurant pages (SEO), menu, cart, checkout, tracking, account, Zvino+, gift cards, partner & driver pages, group orders

## Phase 5: Mobile apps (Expo, shared packages)
- [ ] Zvino: full ordering experience incl. live map tracking
- [ ] Zvino Driver: online toggle, job offers, navigation hand-off, proof of delivery, earnings
- [ ] Zvino Merchant: Store manager, POS and Kitchen modes (one app, mode chosen by staff role)

## Phase 6: Launch hardening
- [ ] Load & security review, error monitoring, backups, store listings, production deploy

## Zvino originals: 50 features beyond DoorDash / Uber Eats
Grouped by the app they live in. 🇿🇼 = built for Zimbabwe. ⚠ = needs an external account or approval (in brackets).

### Customer app & website (18)
1. 🇿🇼 **Data-light mode**: compressed images and lean screens for users on expensive bundles
2. 🇿🇼 **Split tender**: pay part in USD cash and part in ZiG by EcoCash on one order
3. 🇿🇼 **Live ZiG/USD rate banner** at checkout so totals are never a surprise
4. 🇿🇼 **Landmark addresses**: "opposite OK Mart, blue gate" plus a pin plus a gate photo
5. 🇿🇼 **Voice-note directions** for the driver, in Shona, Ndebele or English
6. 🇿🇼 **Shona and Ndebele** languages (also in the driver and merchant apps)
7. 🇿🇼 **Diaspora "Send a meal home"**: pay from the UK/SA/US by card for family in Zimbabwe
8. 🇿🇼 **Diaspora grocery hampers**: monthly hamper subscription delivered to family
9. 🇿🇼 **Funeral and gathering catering**: bulk orders with deposit, headcount and event date
10. 🇿🇼 **Month-end shop planner**: scheduled big grocery order with payday reminders
11. **"Your usual"**: one-tap reorder of the last order from a store
12. **Hot-meal guarantee**: automatic wallet credit when delivery runs past the promised ETA
13. **Split the bill**: friends pay their share by EcoCash link before the order is placed
14. **Gift a meal to any phone number**: recipient gets an SMS and picks their meal ✅
15. **Photo reviews** with dish-level ratings, plus **price-drop alerts** on favourites
16. **Dietary and allergen filters**: halal, vegetarian, no pork, nut-free, spice level
17. **School and office lunch plans**: recurring weekday deliveries
18. **Round-up for charity, eco "no cutlery" toggle, and accessibility** (large text, screen reader, high contrast)

### Driver app (9)
19. 🇿🇼 **Cash remittance via EcoCash** for cash-on-delivery money held, in-app ✅
20. 🇿🇼 **USD change to wallet**: credit the customer's change as wallet balance when there are no small notes ✅
21. 🇿🇼 **Peri-urban batch runs**: Chitungwiza, Ruwa, Norton and Epworth delivered in scheduled batches
22. **SOS and trip sharing**: panic button alerts ops and shares live location ✅
23. **Night safety zones**: warnings and optional opt-out for flagged areas after dark
24. **Demand heatmap and earnings goals**: where to wait, with daily and weekly targets
25. **Instant cash-out** of earnings to EcoCash (small fee)
26. **Driver tiers**: priority offers for high-rated, reliable drivers
27. ⚠ **Fuel advance and micro-insurance** offers [insurance / lending partner]

### Merchant app: Store manager mode (6)
28. 🇿🇼 **Load-shedding mode**: "Power out / on generator" hides oven and fryer items and adds prep time ✅
29. 🇿🇼 **Fresh market selling**: Mbare and market vendors list produce by weight
30. 🇿🇼 **Pharmacy orders**: prescription photo review and approve/decline before payment
31. **Self-serve promotions**: BOGO, happy hour, % off, free item
32. **Menu insights**: best sellers, items often removed from carts, prep time per item ✅
33. **Same-day payout** to EcoCash (small fee)

### Merchant app: POS mode (5)
34. 🇿🇼 ⚠ **ZIMRA fiscal export**: daily sales and VAT report for fiscalisation [ZIMRA FDMS / fiscal device]
35. 🇿🇼 **EcoCash / InnBucks QR at the counter**: customer scans and pays, the sale closes automatically
36. 🇿🇼 **Multi-currency till**: take USD and ZiG cash, with change calculated in either
37. **Offline sales**: keep selling when the network drops; syncs when it's back
38. **Bluetooth receipt printer** and cash drawer support

### Merchant app: Kitchen mode (4)
39. **Rush mode**: when tickets pile up, automatically add prep time and slow incoming app orders
40. **Station routing**: grill, fryer and drinks each see only their items
41. **Bluetooth kitchen printer** with loud new-order alerts that repeat until acknowledged
42. **Prep timers** per item that learn real cook times, so the app's ETAs improve

### Admin panel (8)
43. 🇿🇼 ⚠ **USSD ordering** (`*xxx#`): reorder and track without data [Econet/NetOne short code]
44. 🇿🇼 ⚠ **WhatsApp ordering and tracking bot** [Meta WhatsApp Business API]
45. 🇿🇼 **SMS tracking fallback**: status updates by SMS when the customer has no data
46. 🇿🇼 **Fuel-indexed delivery fees**: per-km rate tracks the ZERA fuel price, with admin approval
47. 🇿🇼 **Seasonal campaign presets**: Independence, Heroes, Christmas and month-end templates
48. **Fraud shield**: velocity checks, device limits, COD blacklist, OTP confirm for large COD orders
49. **Weather-aware surge**: rainy-season demand suggests surge per zone
50. **Ops command centre**: live map of orders and drivers, late-order alerts, one-click reassign, sponsored-listing and corporate-account management

## Needed from Zvino before go-live
Paynow keys · SMS provider · Google Maps API key · Apple & Google developer accounts ·
logo & food photography · terms & privacy policy
