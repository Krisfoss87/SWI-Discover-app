DISCOVER TOOLKIT — handover package (swissinfo.ch English, June 2026)

CONTENTS
1. similar_stories.py          Similar-headline lookup prototype (Python)
2. discover-training-corpus.csv  8,292 headlines with real Discover outcomes
                                 (columns: Title, dc = total Discover clicks,
                                 Section = format, pub = publish timestamp)
3. discover-odds-checker.jsx   Headline odds checker UI (React). Contains both
                               trained models (entry + 5,000-click hit) as
                               plain coefficients — no server needed.

QUICK START (similar stories)
  pip install scikit-learn pandas
  python similar_stories.py "Swiss railway tunnel closed after landslide"

HOW TO SHIP
- Odds checker: any React app can render the .jsx as-is (no dependencies
  beyond React). For the newsroom, host it on an internal page or embed it
  in the CMS publish screen.
- Similar stories: run as a tiny internal HTTP service (e.g. FastAPI with
  one /similar?q= endpoint wrapping the similar() function); have the odds
  checker call it and display the 5 precedents under the score.
- Retraining: re-export GSC Discover monthly (with the /eng page filter!)
  and the Parse.ly publishing log each quarter; refit the logistic models
  and paste the new coefficients into MODELS in the .jsx.

MODEL NOTES
- Trained on stories published Apr 2025 - Apr 2026 with complete monthly
  Discover coverage. Entry model AUC 0.82, big-hit model AUC 0.81,
  both decile-calibrated.
- Features: topic flags from headline, Swiss-in-title, title length,
  punctuation, format, publish timing (weekend / 09-15 CET).
