"""
momentum.py — "entity momentum": which topic words are currently gaining
Discover impressions on our own property.

How it works: GSC returns page URLs; swissinfo slugs contain the headline
words. We tokenize slugs, sum impressions per term per day, and compare the
last 2 days against the daily average of the 7 days before that. A term with
ratio >= 2 and meaningful volume is "hot".

The table is cached in memory and lazily refreshed (default every 6 h).
"""
import os, re, time
from collections import defaultdict
from gsc_client import fetch_discover_pages

STOP = set("""the a an of in to for and on with from by at as is are be that
this its it new after over under up out about more no not how why what when
where who swiss switzerland eng www https com ch""".split())

TTL_SECONDS = int(os.environ.get("MOMENTUM_TTL_HOURS", "6")) * 3600
MIN_RECENT_IMPRESSIONS = int(os.environ.get("MOMENTUM_MIN_IMPR", "3000"))

_cache = {"built_at": 0.0, "table": {}, "hot": []}

def slug_terms(page_url: str) -> set[str]:
    path = page_url.split("swissinfo.ch", 1)[-1]
    segments = [s for s in path.split("/") if s and not s.isdigit()]
    if not segments:
        return set()
    slug = segments[-1]                      # last non-numeric segment = headline slug
    words = re.findall(r"[a-z]+", slug.lower())
    return {w for w in words if len(w) >= 3 and w not in STOP}

def _build_table():
    rows = fetch_discover_pages(days_back=10)
    if not rows:
        return {}, []
    dates = sorted({r["date"] for r in rows})
    recent_dates = set(dates[-2:])           # last 2 days (fresh data)
    base_dates = set(dates[:-2])             # the days before
    recent, base = defaultdict(int), defaultdict(int)
    for r in rows:
        for term in slug_terms(r["page"]):
            if r["date"] in recent_dates:
                recent[term] += r["impressions"]
            else:
                base[term] += r["impressions"]
    n_base_days = max(len(base_dates), 1)
    table = {}
    for term, rec in recent.items():
        baseline_2d = (base.get(term, 0) / n_base_days) * 2   # same-size window
        if rec >= MIN_RECENT_IMPRESSIONS:
            ratio = rec / baseline_2d if baseline_2d > 0 else float("inf")
            table[term] = {"recent_impressions": rec,
                           "ratio": round(min(ratio, 99.0), 1)}
    hot = sorted(({"term": t, **v} for t, v in table.items() if v["ratio"] >= 2.0),
                 key=lambda x: -x["ratio"])[:10]
    return table, hot

def get_momentum(headline: str) -> dict:
    now = time.time()
    if now - _cache["built_at"] > TTL_SECONDS:
        _cache["table"], _cache["hot"] = _build_table()
        _cache["built_at"] = now
    words = {w for w in re.findall(r"[a-z]+", headline.lower())
             if len(w) >= 3 and w not in STOP}
    matched = sorted(
        ({"term": t, **_cache["table"][t]} for t in words
         if t in _cache["table"] and _cache["table"][t]["ratio"] >= 2.0),
        key=lambda x: -x["ratio"])
    return {"matched": matched, "site_hot": _cache["hot"],
            "table_age_minutes": int((now - _cache["built_at"]) / 60)}