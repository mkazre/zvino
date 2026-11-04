# Zvino mobile apps

One Expo (SDK 58) codebase that builds **three store apps**:

| App | `APP_VARIANT` | Bundle ID | Who |
|---|---|---|---|
| **Zvino** | `customer` | `zw.co.zvino` | Customers: browse, order, pay, track |
| **Zvino Driver** | `driver` | `zw.co.zvino.driver` | Drivers: go online, accept jobs, deliver, earnings |
| **Zvino Merchant** | `merchant` | `zw.co.zvino.merchant` | Store staff: manager / POS (cashier) / kitchen modes by role |

The variant picks the name, icon colours, permissions and which screens are reachable
(`src/app/_layout.tsx` uses `Stack.Protected`). Everything else is shared:
`src/ui` (design system), `src/lib` (API client, session, push, basket), `src/features`.

## Run locally

```bash
npm install
# Point the app at your Laravel server (Android emulator reaches the host at 10.0.2.2)
set EXPO_PUBLIC_API_URL=http://10.0.2.2:8001      # Windows cmd
npm run customer     # or: npm run driver / npm run merchant
```

Start the API first: `cd ../api && php artisan serve --host=0.0.0.0 --port=8001`.
On a physical phone, use your PC's LAN IP, e.g. `http://192.168.1.20:8001`.

Demo logins (after `php artisan db:seed`):
- Customer / driver app: any phone number, code **123456** (non-production only). Driver demo: `0772000001`.
- Merchant app: `manager@zvino.co.zw`, `cashier@zvino.co.zw`, `kitchen@zvino.co.zw`, password `password`.

> Push notifications and maps need a **development build** (Expo Go can't receive remote push on Android):
> `npx eas-cli@latest build --profile customer-dev --platform android`

## Build for the stores

```bash
npx eas-cli@latest login
npx eas-cli@latest init                      # creates the EAS project → set EAS_PROJECT_ID
npx eas-cli@latest build --profile customer --platform all
npx eas-cli@latest build --profile driver   --platform all
npx eas-cli@latest build --profile merchant --platform all
npx eas-cli@latest submit --profile customer --platform android
```

Production profiles point at `https://zvino.co.zw` (`eas.json` → `base.env`). Set
`GOOGLE_MAPS_ANDROID_KEY` as an EAS secret for maps on Android.

## Still to add before store submission
- Real app icons & splash artwork per app (`assets/images/`), Inter font files
- `assets/sounds/new-order.mp3` for a loud merchant alert (vibration is used today)
- Background location for drivers (foreground sharing works while the app is open)
- Pusher client for instant updates (apps poll every 5–10 s today; the API already broadcasts)

The template folders `src/components`, `src/constants` and `src/hooks` are unused leftovers and can be deleted.
