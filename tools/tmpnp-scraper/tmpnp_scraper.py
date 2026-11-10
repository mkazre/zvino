#!/usr/bin/env python3
"""
TM Pick n Pay -> Zvino product CSV.

Reads the public catalogue API behind https://tmpnponline.co.zw (the same data the website shows)
and writes a CSV in Zvino's import format (Admin -> Catalog -> Import products).

    python tmpnp_scraper.py                 # pick categories from a numbered list
    python tmpnp_scraper.py --list          # just show the categories
    python tmpnp_scraper.py --category perishables,beverages
    python tmpnp_scraper.py --all           # the whole store (~9,000 products, ~10 minutes)

Only uses the Python standard library (Python 3.8+). It is deliberately slow and polite
(one request at a time, short pause between pages) so it doesn't load TM Pick n Pay's servers.
"""

import argparse
import csv
import html
import json
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import date

API = "https://api.tmpnponline.co.zw/api/v1"
CDN = "https://cdn-s7m8bx8sebjz.vultrcdn.com/product_images/"
SITE = "https://tmpnponline.co.zw"
PAUSE = 0.6  # seconds between requests
UA = "ZvinoCatalogImport/1.0 (+https://zvino.online)"

# Zvino product CSV, version 1. Keep in step with App\Support\ProductCsv in the Zvino code.
COLUMNS = [
    "sku", "name", "description", "department", "category", "price_usd", "sale_price_usd",
    "image_url", "weight_kg", "volume_ml", "width_cm", "height_cm", "sold_by",
    "in_stock", "branches_in_stock", "stock_by_branch", "source", "source_url",
]


def get(path, tries=4):
    url = path if path.startswith("http") else API + path
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=40) as r:
                return json.loads(r.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
            if attempt == tries - 1:
                raise
            wait = 3 * (attempt + 1)
            print(f"   ...retrying in {wait}s ({e})", file=sys.stderr)
            time.sleep(wait)


def categories():
    """[{name, slug, count, children:[{name, slug}]}] - the store's departments and their aisles."""
    out = []
    for c in get("/subcategories"):
        kids = [s["child_category"] for s in c.get("subcategories", []) if s.get("child_category")]
        out.append({
            "name": c["name"].strip(), "slug": c["slug"], "count": c.get("products_count") or 0,
            "children": [{"name": k["name"].strip(), "slug": k["slug"]} for k in kids],
        })
    return out


def products_in(slug):
    page, last = 1, 1
    while page <= last:
        d = get(f"/product/search-product/{slug}/1000000/0?page={page}")
        last = d.get("last_page") or 1
        for p in d.get("data", []):
            yield p
        page += 1
        time.sleep(PAUSE)


UNIT = re.compile(r"(\d+(?:[.,]\d+)?)\s*(KG|G|GR|ML|L|LT|LTR|CM|MM|M|S)\b", re.I)


def tidy_name(name):
    """'KOHINOOR EVERYDAY BASMATI RICE 5KGX' -> 'Kohinoor Everyday Basmati Rice 5kg'."""
    n = re.sub(r"\s+", " ", (name or "").strip())
    n = re.sub(r"(\d)(KG|G|ML|L|LT|LTR)X\b", r"\1\2", n, flags=re.I)  # stray trailing X after a size
    if n.isupper() or sum(ch.isupper() for ch in n) > len(n) * 0.6:
        n = " ".join(w if any(c.isdigit() for c in w) else w.capitalize() for w in n.lower().split(" "))
    n = UNIT.sub(lambda m: m.group(1) + m.group(2).lower().replace("lt", "l").replace("ltr", "l").replace("gr", "g"), n)
    n = re.sub(r"(\d+)'S\b", r"\1's", n, flags=re.I)  # 6'S -> 6's
    return n


def clean_text(s):
    s = html.unescape(re.sub(r"<[^>]+>", " ", s or ""))
    s = re.sub(r"\s+", " ", s).strip()
    return "" if s.lower() in ("", "null", "none", "n/a", "-") else s


def num(v):
    try:
        f = float(v)
        return f if f > 0 else None
    except (TypeError, ValueError):
        return None


def row(p, department, category, tidy):
    price = num(p.get("price"))
    sale = num(p.get("sale_price"))
    if not sale or not price or sale >= price:
        sale = None  # only real discounts
    stock = [(s.get("name", "").replace("TM PICK n PAY", "").replace("PICK n PAY", "").strip().title(), int((s.get("pivot") or {}).get("stock_quantity") or 0))
             for s in p.get("stock_levels") or []]
    in_stock = [b for b, q in stock if q > 0]
    weight = num(p.get("weight"))
    return {
        "sku": f"TMPNP-{p.get('product_code') or p['id']}",
        "name": tidy_name(p["name"]) if tidy else p["name"].strip(),
        "description": clean_text(p.get("description")),
        "department": department,
        "category": category,
        "price_usd": f"{price:.2f}" if price else "",
        "sale_price_usd": f"{sale:.2f}" if sale else "",
        "image_url": CDN + p["image"].lstrip("/") if p.get("image") else "",
        "weight_kg": f"{weight:g}" if weight else "",
        "volume_ml": "",  # TM's "volume" is the box size in cm3, not the contents, so it isn't used
        "width_cm": f"{num(p.get('width')):g}" if num(p.get("width")) else "",
        "height_cm": f"{num(p.get('height')):g}" if num(p.get("height")) else "",
        "sold_by": "unit",
        "in_stock": "yes" if in_stock or not stock else "no",
        "branches_in_stock": len(in_stock),
        "stock_by_branch": "|".join(f"{b}:{q}" for b, q in stock),
        "source": "TM Pick n Pay",
        "source_url": f"{SITE}/products/{p.get('slug')}" if p.get("slug") else "",
    }


def scrape(chosen, tidy):
    """Each aisle separately (so items get e.g. 'Eggs' not 'Perishables'), then the department for leftovers."""
    seen, rows = set(), []
    for dep in chosen:
        print(f"\n{dep['name']}")
        targets = [(c["slug"], c["name"]) for c in dep["children"]] + [(dep["slug"], dep.get("label", dep["name"]))]
        for target, label in targets:
            n = 0
            for p in products_in(target):
                if p["id"] in seen or (p.get("status") and p["status"] != "published") or not num(p.get("price")):
                    continue
                seen.add(p["id"])
                rows.append(row(p, dep["name"], label, tidy))
                n += 1
            print(f"  {label:<40} {n:>5} products")
    return rows


def pick(cats):
    for i, c in enumerate(cats, 1):
        aisles = ", ".join(k["name"] for k in c["children"][:6]) + ("..." if len(c["children"]) > 6 else "")
        print(f"{i:>3}. {c['name']:<34} ~{c['count']:>5} products   {aisles}")
    ans = input("\nWhich departments? Numbers separated by commas (e.g. 1,4,7), or 'all': ").strip().lower()
    if ans == "all":
        return cats
    idx = [int(x) for x in re.findall(r"\d+", ans)]
    return [cats[i - 1] for i in idx if 1 <= i <= len(cats)]


def main():
    ap = argparse.ArgumentParser(description="Export TM Pick n Pay products to a Zvino import CSV.")
    ap.add_argument("--category", help="department or aisle slugs, comma separated (see --list)")
    ap.add_argument("--all", action="store_true", help="every department")
    ap.add_argument("--list", action="store_true", help="list departments and aisle slugs, then stop")
    ap.add_argument("--raw-names", action="store_true", help="keep the shop's original (often UPPER CASE) names")
    ap.add_argument("-o", "--out", help="output file (default: tmpnp-<categories>-<date>.csv)")
    a = ap.parse_args()

    print("Loading TM Pick n Pay categories...")
    cats = categories()
    if a.list:
        for c in cats:
            print(f"{c['slug']:<36} {c['name']} (~{c['count']})")
            for k in c["children"]:
                print(f"    {k['slug']:<32} {k['name']}")
        return

    if a.all:
        chosen = cats
    elif a.category:
        chosen = []
        for s in [x.strip().lower() for x in a.category.split(",") if x.strip()]:
            dep = next((c for c in cats if c["slug"] == s), None)
            aisle = next(((c, k) for c in cats for k in c["children"] if k["slug"] == s), None)
            if dep:
                chosen.append(dep)
            elif aisle:  # just one aisle: scrape it on its own, labelled with its own name
                chosen.append({"name": aisle[0]["name"], "slug": s, "children": [], "label": aisle[1]["name"]})
            else:
                print(f"Unknown category '{s}'. Run with --list to see them.")
    else:
        chosen = pick(cats)
    if not chosen:
        print("Nothing chosen.")
        return

    rows = scrape(chosen, not a.raw_names)

    name = a.out or "tmpnp-{}-{}.csv".format("all" if a.all else "-".join(d["slug"] for d in chosen)[:60], date.today().isoformat())
    with open(name, "w", newline="", encoding="utf-8-sig") as f:  # BOM so Excel shows accents properly
        w = csv.DictWriter(f, fieldnames=COLUMNS)
        w.writeheader()
        w.writerows(rows)
    print(f"\nDone: {len(rows)} products -> {name}")
    print("Import it in Zvino: Admin -> Catalog -> Import products.")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nStopped.")
