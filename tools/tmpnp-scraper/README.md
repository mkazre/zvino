# TM Pick n Pay → Zvino product export

Downloads products from [tmpnponline.co.zw](https://tmpnponline.co.zw) (the public catalogue the website itself uses) and saves a CSV that Zvino imports directly.

## Requirements
Python 3.8 or newer. Nothing else to install.

## Run it

```bash
cd tools/tmpnp-scraper

python tmpnp_scraper.py                         # numbered list of departments, pick the ones you want
python tmpnp_scraper.py --list                  # show all departments and aisles (with their codes)
python tmpnp_scraper.py --category perishables  # one whole department (every aisle in it)
python tmpnp_scraper.py --category eggs,milk    # just some aisles
python tmpnp_scraper.py --all                   # the whole store (~9,000 products, ~10 min)
python tmpnp_scraper.py --category beverages -o drinks.csv
```

It gets **every product** in the chosen categories (it walks through all pages), one request at a time with a short pause so it doesn't load TM Pick n Pay's servers.

Names are tidied (`KOHINOOR BASMATI RICE 5KGX` → `Kohinoor Basmati Rice 5kg`). Use `--raw-names` to keep the original names.

## What's in the CSV (Zvino product CSV v1)

| Column | Meaning |
|---|---|
| `sku` | Product code (`TMPNP-…`). Zvino matches on this, so re-importing updates prices instead of duplicating. |
| `name`, `description` | Product name and description (descriptions are often empty on TM's site). |
| `department`, `category` | e.g. `Perishables` / `Eggs`. Zvino uses one of them as the menu section. |
| `price_usd`, `sale_price_usd` | Shelf price and promo price (promo only when it's really lower). |
| `image_url` | Product photo. Zvino copies it to its own storage. |
| `weight_kg`, `width_cm`, `height_cm` | Pack size, shown to customers as "Size: 2 kg · 28 × 6 cm". |
| `in_stock`, `branches_in_stock`, `stock_by_branch` | Stock at TM's branches when exported (`Borrowdale:10\|Msasa:0\|…`). |
| `source`, `source_url` | Where it came from. |

## Import into Zvino
Admin → **Menu** → **Import** (or `/admin/catalog/import`):
1. Choose the CSV and the Zvino store(s), e.g. each TM Pick n Pay branch you deliver from.
2. Set a markup % if you charge above the shelf price, and the other options.
3. **Check file**: you'll see new products, price changes and any problem lines. Nothing is saved yet.
4. **Import**. Photos are copied in the background.

Re-run the export and import regularly (e.g. weekly) to keep prices and stock current.

## Using your other scraper instead
Any tool works if it writes these column headers. Only `sku`, `name` and `price_usd` (or `price_zig`) are required; extra columns are ignored. There's a template under Admin → Menu → Import → **Template CSV**.
