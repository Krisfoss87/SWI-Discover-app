# Backend: Similar Stories & Corpus Management

This folder contains the Python scripts for managing your Discover training corpus and similar-story lookup API.

## Files

- **`build_corpus.py`** — Regenerates `discover-training-corpus.csv` from Parse.ly + GSC exports
- **`api.py`** — FastAPI service for TF-IDF headline similarity lookup
- **`similar_stories.py`** — TF-IDF vectorizer (should exist from your original code)

## Setup

### 1. Install dependencies

```bash
pip install fastapi uvicorn scikit-learn pandas
```

### 2. Generate the corpus

Run this quarterly after exporting your data:

```bash
python build_corpus.py /path/to/parsely_export.csv /path/to/gsc_discover_zips/
```

**Inputs:**
- Parse.ly CSV export (columns: URL, Title, Publish date, Section)
- Folder of monthly GSC Discover zips (German Search Console with Seiten.csv inside)

**Output:** `discover-training-corpus.csv` (in the same directory)

The script handles German GSC column names (`Seiten.csv`, `Klicks`, etc.) automatically.

### 3. Run the API service

Set the API key and start the service:

```bash
export API_KEY="your-secret-key-here"
uvicorn api:app --host 0.0.0.0 --port 8000
```

Deploy this on an internal VM or container host (not Vercel). The service needs ~200MB RAM and starts in seconds.

**Health check:**
```bash
curl http://localhost:8000/health
```

## Quarterly Retraining Checklist

This is the step most likely to be forgotten once deployed:

- [ ] Export Parse.ly posts (filtered to your analysis window)
- [ ] Download monthly GSC Discover exports (English /eng filter ON)
- [ ] Place both in `./data/` subfolder
- [ ] Run `python build_corpus.py ./data/parsely.csv ./data/gsc_discover_zips/`
- [ ] Verify the corpus updated: `ls -la discover-training-corpus.csv`
- [ ] Refit the models in the JSX (if using auto-training; otherwise manual fit in your notebook)
- [ ] Update `MODELS` constants in `src/DiscoverOddsChecker.jsx` with new coefficients
- [ ] Push to main → Vercel redeploys frontend automatically

## Security notes

⚠ **Never commit:**
- `discover-training-corpus.csv` — Contains your internal performance data
- `*.csv` (Parse.ly exports, GSC zips)
- Any raw data files

⚠ **API key handling:**
- The React app sends the key as a query parameter (visible in browser network tab & server logs)
- This is acceptable for internal-only tools (VPN-protected)
- If either the frontend or API become publicly reachable, use a server-side proxy instead and keep the key backend-only

## Troubleshooting

**"No Seiten.csv found"** — Your GSC zip may use different names. Check:
```bash
unzip -l gsc_discover_export_dec2025.zip | grep -i sei
```

**API key rejected** — Ensure `API_KEY` env var matches the key in the React app's `REACT_APP_API_KEY`.

**Corpus lookup slow** — TF-IDF builds on first import (~1–2 sec). Subsequent requests should be instant. If persistent, check RAM availability on the server.
