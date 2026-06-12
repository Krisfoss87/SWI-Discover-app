"""
build_corpus.py — regenerate discover-training-corpus.csv from Parse.ly + GSC exports
Handles German GSC column names (Seiten.csv with "Die häufigsten Seiten", "Klicks", etc.)

Inputs:
  1. Parse.ly posts export (CSV), filtered to analysis window
  2. Folder of monthly GSC Discover exports (zips, /eng page filter ON)

Usage:
  python build_corpus.py parsely.csv ./gsc_discover_zips/

Output:
  discover-training-corpus.csv (Title, dc, Section, pub)
"""
import sys, glob, zipfile, io
import pandas as pd

if len(sys.argv) < 3:
    print(__doc__)
    sys.exit(1)

parsely_path, zip_folder = sys.argv[1], sys.argv[2]

def norm(u):
    """Normalize URL: remove query params and trailing slash"""
    return str(u).split("?")[0].rstrip("/")

# 1. Parse.ly publishing log
print(f"[1/3] Reading Parse.ly export: {parsely_path}")
p = pd.read_csv(parsely_path)
p["url_n"] = p["URL"].map(norm)
p["pub"] = pd.to_datetime(p["Publish date"], errors="coerce")
p = p.drop_duplicates(subset="url_n")
print(f"  → {len(p)} unique URLs from Parse.ly")

# 2. Sum Discover clicks per URL across all monthly GSC zips
print(f"[2/3] Summing Discover clicks from GSC exports in {zip_folder}")
frames = []
for zpath in sorted(glob.glob(f"{zip_folder}/*.zip")):
    print(f"  Processing {zpath.split('/')[-1]}...", end=" ")
    with zipfile.ZipFile(zpath) as z:
        # Find Seiten.csv (German GSC export)
        name = next((n for n in z.namelist() if "Seiten" in n), None)
        if not name:
            print("(no Seiten.csv found, skipping)")
            continue
        
        # Read with German headers, rename positionally
        s = pd.read_csv(io.BytesIO(z.read(name)))
        # German columns: "Die häufigsten Seiten", "Klicks", "Impressionen", "CTR"
        # Rename positionally to avoid header-name issues
        s.columns = ["url", "clicks", "impr", "ctr"][: len(s.columns)]
        
        # Filter to /eng pages only
        s = s[s["url"].astype(str).str.contains("swissinfo.ch/eng", na=False)]
        frames.append(s[["url", "clicks"]])
        print(f"({len(s)} /eng pages, {s['clicks'].sum()} clicks)")

if frames:
    clicks = pd.concat(frames, ignore_index=True)
    clicks["url_n"] = clicks["url"].map(norm)
    dc = clicks.groupby("url_n")["clicks"].sum()
    print(f"  → Total {len(dc)} unique URLs, {dc.sum():.0f} Discover clicks across all months")
else:
    print("  ⚠ No GSC data found; corpus will have zero Discover clicks")
    dc = pd.Series(dtype=int)

# 3. Join and write corpus
print("[3/3] Joining and writing corpus...")
p["dc"] = p["url_n"].map(dc).fillna(0).astype(int)
out = p[["Title", "dc", "Section", "pub"]]
out.to_csv("discover-training-corpus.csv", index=False)

pct_with_clicks = (out["dc"] > 0).mean()
print(f"✓ Wrote discover-training-corpus.csv")
print(f"  {len(out)} stories, {pct_with_clicks:.0%} with Discover clicks")
print(f"  Average clicks (all): {out['dc'].mean():.1f}")
print(f"  Average clicks (>0): {out[out['dc'] > 0]['dc'].mean():.0f}")