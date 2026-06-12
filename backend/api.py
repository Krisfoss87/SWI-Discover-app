"""
api.py — Internal endpoint for similar-stories TF-IDF lookup
Requires: pip install fastapi uvicorn scikit-learn pandas

Runs as an internal service. Requires API_KEY environment variable at deploy time.
Never commit the key to the repo.

Usage:
  export API_KEY="your-secret-key"
  uvicorn api:app --host 0.0.0.0 --port 8000

⚠ SECURITY NOTE:
  This API uses a query-parameter key, which is visible in browser network tabs
  and server logs. This is acceptable for INTERNAL-ONLY tools (VPN-protected).
  If this service or the React frontend ever become public-facing, move the key
  to a server-side proxy instead.
"""
import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

# Optionally load similar_stories module if corpus exists
try:
    from similar_stories import similar
    corpus_available = True
except ImportError:
    print("⚠ similar_stories module not found. Corpus lookup disabled.")
    corpus_available = False

app = FastAPI()

# CORS: only allow internal hosts (update as needed)
# For now, allow all origins since this is internal-only; if exposed, restrict this
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

API_KEY = os.getenv("API_KEY")

@app.get("/similar")
def get_similar(q: str, k: int = 5, key: str = None):
    """
    Find k similar stories by headline similarity (TF-IDF cosine).
    
    Args:
        q: Query headline
        k: Number of results (default 5)
        key: API key (from query param). Must match env var API_KEY.
    
    Returns:
        List of similar stories: [{"Title": "...", "Discover_clicks": ..., "Publish_date": "..."}, ...]
    """
    # Validate key
    if not API_KEY:
        raise HTTPException(status_code=500, detail="API_KEY not configured on server")
    if key != API_KEY:
        raise HTTPException(status_code=403, detail="Invalid API key")
    
    if not corpus_available:
        raise HTTPException(status_code=503, detail="Corpus not available; ensure discover-training-corpus.csv exists")
    
    if not q or not q.strip():
        return []
    
    try:
        res = similar(q, k)
        return res.to_dict(orient="records")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lookup failed: {str(e)}")

@app.get("/health")
def health():
    """Health check endpoint"""
    return {
        "status": "ok",
        "corpus_available": corpus_available,
        "api_key_configured": API_KEY is not None,
    }
