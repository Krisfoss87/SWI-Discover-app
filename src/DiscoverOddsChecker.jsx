import { useState, useMemo, useEffect } from "react";

// ————————————————————————————————————————————————
// Two models fitted on 8,292 stories (published Apr 2025 – Apr 2026,
// complete monthly Discover coverage — every English page with ≥1 click).
// enter: P(any Discover clicks), AUC 0.82 (bottom decile 2.1% actual, top 63%)
// big:   P(≥5,000 Discover clicks), AUC 0.81 (bottom decile 0%, top 7.3%)
// Primary readout = big-hit odds; entry odds shown as secondary.
// ————————————————————————————————————————————————
const MODELS = {
  enter: {
    coefs: { transport: 0.5982, aviation: 1.0936, weather_alps: 0.579, money: 0.4714, crime_incident: 0.2012, migration: -0.359, animals_science: 0.4708, health_aging: -0.1609, geopolitics: -0.263, politics_inst: -1.6262, celebs: -0.1349, food: 1.0471, has_swiss: 0.6146, short_title: 0.125, long_title: 0.0801, has_number: 0.278, has_question: 0.084, has_colon: -0.1957, fmt_news: 1.0422, fmt_explainer: 1.0909, fmt_report: 0.5228, fmt_dead: -1.7775, pub_weekend: 0.4257, pub_midday: 0.1652 },
    intercept: -1.63, baseline: 0.3166,
  },
  big: {
    coefs: { transport: 0.5752, aviation: 1.2247, weather_alps: 0.4195, money: 0.477, crime_incident: 0.6137, migration: 0.1778, animals_science: -0.0184, health_aging: -0.0628, geopolitics: -0.2468, politics_inst: -1.8233, celebs: -0.2769, food: 0.4509, has_swiss: 1.4503, short_title: 0.3513, long_title: 0.1435, has_number: -0.0107, has_question: -0.0389, has_colon: -0.4442, fmt_news: 0.5255, fmt_explainer: 0.6723, fmt_report: 0.7841, fmt_dead: -2.4211, pub_weekend: 0.645, pub_midday: -0.3496 },
    intercept: -4.8182, baseline: 0.0279,
  },
};
const COEFS = MODELS.big.coefs;        // primary readout: odds of a 5,000+ click hit
const INTERCEPT = MODELS.big.intercept;
const BASELINE = MODELS.big.baseline;  // 2.8% — 1 in 36
function probWith(model, f) { let z = model.intercept; for (const k in model.coefs) z += model.coefs[k] * (f[k] || 0); return 1 / (1 + Math.exp(-z)); }

const THEMES = [
  ["transport", /train|rail|sbb|tunnel|motorway|gondola|cable car/i, "Trains & transport"],
  ["aviation", /flight|airline|airport|aviation|plane|airplane|pilot|lufthansa|swiss air/i, "Aviation & SWISS"],
  ["weather_alps", /snow|glacier|avalanche|storm|weather|heatwave|flood|alpine|alps|mountain pass|winter/i, "Weather, Alps & glaciers"],
  ["money", /salar|wage|pension|rent|mortgage|price|cost|tax|wealth|rich|franc|inflation|insurance/i, "Money & cost of living"],
  ["crime_incident", /police|arrest|riot|court|prison|crime|theft|murder|attack|fire|rescue|crash|seiz|fraud|smuggl|trafficking/i, "Crime & incidents"],
  ["migration", /deport|visa|migrat|citizen|permit|asylum|abroad|expat|naturali|immigrant|residence/i, "Migration & citizenship"],
  ["animals_science", /dog|wolf|bear|jellyfish|animal|bird|fish|cow|species|wildlife|scientist|study|research/i, "Animals & science"],
  ["health_aging", /health|hospital|cancer|disease|vaccine|virus|ageing|aging|retire/i, "Health & ageing"],
  ["geopolitics", /\beu\b|europe|neutrality|nato|tariff|trump|ukraine|russia|sanction/i, "EU & geopolitics"],
  ["politics_inst", /parliament|vote|referendum|initiative|minister|election|party|council/i, "Institutional politics"],
  ["celebs", /star|celebrit|festival|concert|band|singer|actor|film/i, "Celebrities & entertainment"],
  ["food", /chocolate|cheese|wine|food|restaurant|coffee|beer/i, "Food & drink"],
];

const FORMATS = [
  { id: "fmt_news", label: "News / follow-up" },
  { id: "fmt_explainer", label: "Explainer" },
  { id: "fmt_report", label: "Report / feature" },
  { id: "fmt_dead", label: "Interview / briefing / podcast" },
];

const PROCESS_WORDS = /restructur|impacts?\b|remains?\b|under pressure|measures\b|framework|stakeholder|strategy paper|discussions\b/i;
const VIVID = /rescued|forced|seized|arrested|collapses?|plunges?|bans?|closes|caught|secret|record|throw away|alive|warns/i;

function featuresFor(title, format) {
  const f = {};
  Object.keys(COEFS).forEach((k) => (f[k] = 0));
  const words = title.trim() ? title.trim().split(/\s+/).length : 0;
  THEMES.forEach(([id, re]) => { if (re.test(title)) f[id] = 1; });
  f.has_swiss = /\bSwiss|Switzerland/i.test(title) ? 1 : 0;
  f.short_title = words > 0 && words <= 7 ? 1 : 0;
  f.long_title = words >= 12 ? 1 : 0;
  f.has_number = /\d/.test(title) ? 1 : 0;
  f.has_question = /\?/.test(title) ? 1 : 0;
  f.has_colon = /:/.test(title) ? 1 : 0;
  if (format) f[format] = 1;
  return { f, words };
}

const TIMINGS = [
  { id: "weekday_midday", label: "Weekday, 09–15", weekend: 0, midday: 1 },
  { id: "weekday_other", label: "Weekday, other hours", weekend: 0, midday: 0 },
  { id: "weekend_midday", label: "Weekend, 09–15", weekend: 1, midday: 1 },
  { id: "weekend_other", label: "Weekend, other hours", weekend: 1, midday: 0 },
];

function prob(f) {
  let z = INTERCEPT;
  for (const k in COEFS) z += COEFS[k] * f[k];
  return 1 / (1 + Math.exp(-z));
}

const oneIn = (p) => (p <= 0 ? "—" : p >= 0.5 ? "1 in 2" : `1 in ${Math.round(1 / p)}`);

export default function DiscoverOddsChecker() {
  const [title, setTitle] = useState("");
  const [format, setFormat] = useState("fmt_news");
  const [timing, setTiming] = useState("weekday_midday");
  const [precedents, setPrecedents] = useState([]);
  const [precedentsLoading, setPrecedentsLoading] = useState(false);

  const result = useMemo(() => {
    const { f, words } = featuresFor(title, format);
    const tm = TIMINGS.find((x) => x.id === timing);
    f.pub_weekend = tm.weekend; f.pub_midday = tm.midday;
    const p = prob(f);                       // big-hit probability
    const pEnter = probWith(MODELS.enter, f); // entry probability

    // What-if suggestions: re-run the model with one change
    const suggestions = [];
    if (title.trim()) {
      if (!f.has_swiss) {
        const f2 = { ...f, has_swiss: 1 };
        suggestions.push({ text: "Add 'Swiss' or 'Switzerland' to the headline", from: p, to: prob(f2) });
      }
      if (words >= 12) {
        const f2 = { ...f, long_title: 0 };
        suggestions.push({ text: `Cut from ${words} to under 12 words`, from: p, to: prob(f2) });
      } else if (words > 7) {
        const f2 = { ...f, short_title: 1 };
        suggestions.push({ text: `Tighten from ${words} to 7 words or fewer`, from: p, to: prob(f2) });
      }
      if (format === "fmt_dead") {
        const f2 = { ...f, fmt_dead: 0, fmt_news: 1 };
        suggestions.push({ text: "File a news/explainer spin-off — this format almost never enters Discover", from: p, to: prob(f2) });
      }
      if (!f.pub_weekend) {
        const f2 = { ...f, pub_weekend: 1 };
        suggestions.push({ text: "Hold for weekend publication — quieter feed, double the big-hit rate (Sat 5.7% vs midweek ~2.2%)", from: p, to: prob(f2) });
      }
      if (f.politics_inst && !f.money && !f.crime_incident) {
        suggestions.push({ text: "Reframe around the concrete money or human consequence — process politics entered 6 times in 388 tries", from: p, to: null });
      }
    }
    suggestions.sort((a, b) => (b.to ?? 0) - (a.to ?? 0));

    // CTR (tap-appeal) checks — affect clicks once in, not entry
    const ctr = [];
    if (title.trim()) {
      if (PROCESS_WORDS.test(title)) ctr.push({ ok: false, text: "Process language detected ('restructuring', 'remains', 'under pressure') — our worst converters all use it" });
      if (VIVID.test(title)) ctr.push({ ok: true, text: "Vivid verb / concrete outcome — pattern of our 9–15% CTR winners" });
      if (/CHF\s?\d|[0-9][\d,']*\s?(francs?|%)/i.test(title)) ctr.push({ ok: true, text: "Concrete figure with unit — surprising numbers over-convert" });
      if (!VIVID.test(title) && !/\d/.test(title)) ctr.push({ ok: false, text: "No surprising specific yet — add a sum, outcome or unexpected pairing" });
    }

    const themesHit = THEMES.filter(([id]) => f[id] === 1).map(([id, , label]) => ({
      id, label, coef: COEFS[id],
    }));

    return { p, pEnter, words, f, suggestions, ctr, themesHit };
  }, [title, format, timing]);

  // Fetch similar stories from internal API (debounced 500ms)
  useEffect(() => {
    if (!title.trim()) { setPrecedents([]); return; }
    
    setPrecedentsLoading(true);
    const t = setTimeout(() => {
      const apiHost = import.meta.env.VITE_API_HOST || "http://localhost:8000";
      const apiKey = import.meta.env.VITE_API_KEY;
      
      if (!apiKey) {
        console.warn("VITE_API_KEY not set; precedents disabled");
        setPrecedentsLoading(false);
        return;
      }
      
      fetch(`${apiHost}/similar?q=${encodeURIComponent(title)}&k=5&key=${encodeURIComponent(apiKey)}`, 
            { signal: AbortSignal.timeout(3000) })
        .then(r => {
          if (r.ok) return r.json();
          throw new Error(`HTTP ${r.status}`);
        })
        .then(setPrecedents)
        .catch(err => {
          console.log("Precedents lookup unavailable:", err.message);
          setPrecedents([]);
        })
        .finally(() => setPrecedentsLoading(false));
    }, 500);
    return () => clearTimeout(t);
  }, [title]);

  const { p } = result;
  const pct = Math.round(p * 1000) / 10;
  const tone = p >= 0.05 ? "good" : p >= 0.02 ? "mid" : "low";
  const toneColor = { good: "#1F7A33", mid: "#C77700", low: "#E10600" }[tone];
  const toneLabel = { good: "Above-average odds", mid: "Around average", low: "Below average — see fixes" }[tone];
  const markerPos = Math.min(p / 0.12, 1) * 100;
  const basePos = (BASELINE / 0.12) * 100;

  return (
    <div style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", background: "#FFFFFF", color: "#111111", minHeight: "100vh" }}>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "40px 24px 64px" }}>

        {/* Masthead */}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", borderBottom: "3px solid #111", paddingBottom: 12 }}>
          <div>
            <div style={{ fontSize: 13, letterSpacing: "0.18em", textTransform: "uppercase", color: "#E10600", fontWeight: 700 }}>swissinfo.ch · English desk</div>
            <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.02em", margin: "4px 0 0" }}>Discover Odds Checker</h1>
          </div>
          <div style={{ fontSize: 12, color: "#8A8A8A", textAlign: "right", lineHeight: 1.4 }}>trained on complete monthly data<br />8,292 stories · Apr 2025 – Apr 2026</div>
        </div>

        {/* Input */}
        <div style={{ marginTop: 28 }}>
          <label style={{ fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: "#8A8A8A", fontWeight: 700 }}>Headline</label>
          <textarea
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Type or paste your working headline…"
            rows={2}
            style={{ width: "100%", marginTop: 8, fontSize: 22, fontWeight: 600, lineHeight: 1.3, padding: "14px 16px", border: "2px solid #111", borderRadius: 0, outline: "none", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 13, color: "#8A8A8A" }}>
            <span>{result.words} words {result.words > 0 && (result.words <= 7 ? "· short — entry bonus" : result.words >= 12 ? "· long — entry penalty" : "")}</span>
          </div>

          <div style={{ marginTop: 18 }}>
            <label style={{ fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: "#8A8A8A", fontWeight: 700 }}>Format</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
              {FORMATS.map((fm) => (
                <button key={fm.id} onClick={() => setFormat(fm.id)}
                  style={{
                    padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", borderRadius: 0,
                    border: "2px solid #111",
                    background: format === fm.id ? "#111" : "#FFF",
                    color: format === fm.id ? "#FFF" : "#111",
                    fontFamily: "inherit",
                  }}>{fm.label}</button>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 18 }}>
            <label style={{ fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: "#8A8A8A", fontWeight: 700 }}>Planned publish time (CET)</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
              {TIMINGS.map((tm) => (
                <button key={tm.id} onClick={() => setTiming(tm.id)}
                  style={{ padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", borderRadius: 0, border: "2px solid #111",
                    background: timing === tm.id ? "#111" : "#FFF", color: timing === tm.id ? "#FFF" : "#111", fontFamily: "inherit" }}>{tm.label}</button>
              ))}
            </div>
            <div style={{ fontSize: 12, color: "#8A8A8A", marginTop: 6 }}>Avoid 18:00–06:00: stories published then entered Discover 1–4% of the time and produced zero big hits.</div>
          </div>
        </div>

        {/* Odds hero */}
        <div style={{ marginTop: 36, borderTop: "1px solid #DDD", paddingTop: 24 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 20, flexWrap: "wrap" }}>
            <div style={{ fontSize: 84, fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1, color: title.trim() ? toneColor : "#CCC" }}>
              {title.trim() ? oneIn(p) : "1 in —"}
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{title.trim() ? `${pct}% chance of a 5,000+ click hit` : "Awaiting headline"}</div>
              <div style={{ fontSize: 13, color: title.trim() ? toneColor : "#8A8A8A", fontWeight: 600 }}>{title.trim() ? toneLabel : "Site average is 1 in 36 (2.8%)"}</div>
              {title.trim() && <div style={{ fontSize: 13, color: "#8A8A8A", marginTop: 2 }}>Entering Discover at all: {Math.round(result.pEnter * 100)}% (site avg 32%)</div>}
            </div>
          </div>

          {/* probability band */}
          <div style={{ marginTop: 20, position: "relative", height: 14, background: "linear-gradient(to right, #F2D7D5 0%, #F6E3C8 35%, #DCEBD9 70%, #DCEBD9 100%)" }}>
            <div title="site average 1 in 36" style={{ position: "absolute", left: `${basePos}%`, top: -4, bottom: -4, width: 2, background: "#8A8A8A" }} />
            {title.trim() && (
              <div style={{ position: "absolute", left: `calc(${markerPos}% - 7px)`, top: -7, width: 14, height: 28, background: toneColor, transition: "left 200ms ease" }} />
            )}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#8A8A8A", marginTop: 6 }}>
            <span>0%</span><span style={{ marginLeft: `${basePos - 12}%` }}>avg 3%</span><span>12%+</span>
          </div>
        </div>

        {/* Signals */}
        {title.trim() && (
          <div style={{ marginTop: 28, display: "grid", gridTemplateColumns: "1fr", gap: 24 }}>
            <div>
              <div style={{ fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: "#8A8A8A", fontWeight: 700, marginBottom: 10 }}>Detected signals</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, padding: "6px 10px", border: "1.5px solid", borderColor: result.f.has_swiss ? "#1F7A33" : "#E10600", color: result.f.has_swiss ? "#1F7A33" : "#E10600" }}>
                  {result.f.has_swiss ? "✓ 'Swiss/Switzerland' present" : "✗ 'Swiss/Switzerland' missing"}
                </span>
                {result.themesHit.map((t) => (
                  <span key={t.id} style={{ fontSize: 13, fontWeight: 600, padding: "6px 10px", border: "1.5px solid", borderColor: t.coef >= 0.2 ? "#1F7A33" : t.coef <= -0.2 ? "#E10600" : "#8A8A8A", color: t.coef >= 0.2 ? "#1F7A33" : t.coef <= -0.2 ? "#E10600" : "#8A8A8A" }}>
                    {t.label} {t.coef >= 0.2 ? "↑" : t.coef <= -0.2 ? "↓" : ""}
                  </span>
                ))}
                {result.themesHit.length === 0 && <span style={{ fontSize: 13, color: "#8A8A8A" }}>No strong topic signal recognised — the model falls back toward the site average.</span>}
              </div>
            </div>

            {result.suggestions.length > 0 && (
              <div>
                <div style={{ fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: "#E10600", fontWeight: 700, marginBottom: 10 }}>Fixes, ranked by impact</div>
                {result.suggestions.map((s, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 0", borderTop: "1px solid #EEE", fontSize: 15 }}>
                    <span>{s.text}</span>
                    {s.to && <span style={{ fontWeight: 800, whiteSpace: "nowrap" }}>{oneIn(s.from)} → <span style={{ color: "#1F7A33" }}>{oneIn(s.to)}</span></span>}
                  </div>
                ))}
              </div>
            )}

            {result.ctr.length > 0 && (
              <div>
                <div style={{ fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: "#8A8A8A", fontWeight: 700, marginBottom: 10 }}>Once you're in: tap appeal (CTR)</div>
                {result.ctr.map((c, i) => (
                  <div key={i} style={{ padding: "8px 0", borderTop: "1px solid #EEE", fontSize: 14, color: c.ok ? "#1F7A33" : "#C77700", fontWeight: 600 }}>
                    {c.ok ? "✓ " : "△ "}{c.text}
                  </div>
                ))}
              </div>
            )}

            {/* Precedents panel — "Stories like yours" */}
            {precedents.length > 0 && (
              <div style={{ backgroundColor: "#F9F9F9", padding: "16px", borderLeft: "4px solid #8A8A8A" }}>
                <div style={{ fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: "#8A8A8A", fontWeight: 700, marginBottom: 10 }}>
                  Stories like yours {precedentsLoading && "(loading...)"}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
                  {precedents.map((p, i) => (
                    <div key={i} style={{ fontSize: 13, lineHeight: 1.4, paddingBottom: 8, borderBottom: i < precedents.length - 1 ? "1px solid #EEE" : "none" }}>
                      <div style={{ fontWeight: 600, color: "#111" }}>{p.Title}</div>
                      <div style={{ fontSize: 12, color: "#8A8A8A", marginTop: 2 }}>
                        {p.discover_clicks > 0 ? `${p.discover_clicks} clicks` : "Never entered Discover"}
                        {p.pub && ` · ${new Date(p.pub).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: 48, paddingTop: 14, borderTop: "3px solid #111", fontSize: 12, color: "#8A8A8A", lineHeight: 1.6 }}>
          Two calibrated models from the complete monthly Discover data — every English page with at least one click across all 14 full months, 8,292 stories — now including publish timing: baseline entry 32% (AUC 0.82), big-hit odds 2.8% (AUC 0.81).
        </div>
      </div>
    </div>
  );
}
