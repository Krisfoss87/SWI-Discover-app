"""
gsc_client.py — minimal Google Search Console API client for Discover data.

Auth: a Google Cloud service account. Set env vars:
  GSC_CREDENTIALS_FILE  path to the service-account JSON key
  GSC_PROPERTY          your verified property, e.g. "sc-domain:swissinfo.ch"
                        or "https://www.swissinfo.ch/"

Requires: pip install google-auth requests
"""
import os
import requests
from datetime import date, timedelta
from google.oauth2 import service_account
from google.auth.transport.requests import Request

SCOPES = ["https://www.googleapis.com/auth/webmasters.readonly"]

def _token():
    creds = service_account.Credentials.from_service_account_file(
        os.environ["GSC_CREDENTIALS_FILE"], scopes=SCOPES)
    creds.refresh(Request())
    return creds.token

def fetch_discover_pages(days_back: int = 10) -> list[dict]:
    """Rows of {date, page, clicks, impressions} for /eng Discover traffic."""
    site = requests.utils.quote(os.environ["GSC_PROPERTY"], safe="")
    url = f"https://www.googleapis.com/webmasters/v3/sites/{site}/searchAnalytics/query"
    headers = {"Authorization": f"Bearer {_token()}"}
    end = date.today()
    start = end - timedelta(days=days_back)

    rows, start_row = [], 0
    while True:
        body = {
            "startDate": start.isoformat(),
            "endDate": end.isoformat(),
            "type": "discover",
            "dataState": "all",          # include fresh (not-yet-final) data
            "dimensions": ["date", "page"],
            "dimensionFilterGroups": [{"filters": [{
                "dimension": "page", "operator": "contains",
                "expression": "swissinfo.ch/eng"}]}],
            "rowLimit": 25000,
            "startRow": start_row,
        }
        r = requests.post(url, headers=headers, json=body, timeout=30)
        r.raise_for_status()
        batch = r.json().get("rows", [])
        for b in batch:
            rows.append({"date": b["keys"][0], "page": b["keys"][1],
                         "clicks": b["clicks"], "impressions": b["impressions"]})
        if len(batch) < 25000:
            return rows
        start_row += 25000