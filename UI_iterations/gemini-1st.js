import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Zap, Flame, Activity, Inbox, HeartPulse, RotateCcw, Wifi, WifiOff, ChevronRight } from 'lucide-react';

// ── Design Tokens ─────────────────────────────────────────────
// Integrating Cloud Current (#78A2D2) and Butter Light (#FEFFAF) 
// over a pure black utility background for maximum contrast.
const C = {
  bg: '#000000',          // Pure black background for utility focus
  bgAlt: '#080808',       // Slightly elevated background
  panel: '#0C0C0C',       // Panel background
  panelAlt: '#121212',    // Secondary panel
  border: '#222222',      // Sharp, subtle borders
  borderSoft: '#151515',
  text: '#EAEAEA',        // Off-white for high readability
  textDim: '#888888',
  textFaint: '#444444',
  amber: '#FEFFAF',       // Butter Light — Action/Highlight accent
  amberDark: '#000000',   // Black text on Butter Light backgrounds
  amberSoft: 'rgba(254,255,175,0.12)',
  hazard: '#FEFFAF',      // Hazard states utilize Butter Light with styling differences
  hazardSoft: 'rgba(254,255,175,0.12)',
  safe: '#78A2D2',        // Cloud Current — Success/Information accent
  safeSoft: 'rgba(120,162,210,0.12)',
  heroBg: '#050505',      // Deep dark for the hero section
  heroText: '#78A2D2',    // Cloud Current text for headers
};

const SAMPLE_PAYLOAD = JSON.stringify(
  { source: 'github', id: 'evt_001', event: 'push', repo: 'my-app' },
  null,
  2
);

const DISPLAY_CAP = 50;

function StatBlock({ label, value, sub, accent }) {
  const color = accent === 'safe' ? C.safe : accent === 'hazard' ? C.hazard : C.text;
  return (
    <div className="wgc-stat">
      <div className="wgc-stat-value" style={{ color }}>{value}</div>
      <div className="wgc-stat-label">{label}</div>
      {sub ? <div className="wgc-stat-sub" style={{ color: C.hazard }}>{sub}</div> : null}
    </div>
  );
}

function Gauge({ value }) {
  const ratio = Math.max(0, Math.min(1, value / DISPLAY_CAP));
  const angle = -90 + ratio * 180;
  const cx = 120, cy = 118, r = 92;
  const ticks = Array.from({ length: 9 }, (_, i) => -90 + (i * 180) / 8);
  const toXY = (deg, radius) => {
    const rad = (deg * Math.PI) / 180;
    return [cx + radius * Math.cos(rad), cy + radius * Math.sin(rad)];
  };
  const arcPoint = (deg) => toXY(deg, r);
  const [sx, sy] = arcPoint(-90);
  const [ex, ey] = arcPoint(90);
  const [dsx, dsy] = arcPoint(54);
  const [dex, dey] = arcPoint(90);

  return (
    <svg viewBox="0 0 240 140" className="wgc-gauge-svg" role="img" aria-label={`Queue pressure gauge, ${value} of ${DISPLAY_CAP}`}>
      <defs>
        <pattern id="wgcHazardTape" width="9" height="9" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
          <rect width="9" height="9" fill={C.bg} />
          <rect width="4.5" height="9" fill={C.hazard} />
        </pattern>
      </defs>
      <path d={`M ${sx} ${sy} A ${r} ${r} 0 0 1 ${ex} ${ey}`} fill="none" stroke={C.border} strokeWidth="6" strokeLinecap="butt" />
      <path d={`M ${dsx} ${dsy} A ${r} ${r} 0 0 1 ${dex} ${dey}`} fill="none" stroke="url(#wgcHazardTape)" strokeWidth="6" strokeLinecap="butt" />
      {ticks.map((deg, i) => {
        const [x1, y1] = toXY(deg, r - 10);
        const [x2, y2] = toXY(deg, r + 4);
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={C.border} strokeWidth="1.5" />;
      })}
      <g className="wgc-needle" style={{ transform: `rotate(${angle}deg)`, transformOrigin: `${cx}px ${cy}px` }}>
        <line x1={cx} y1={cy} x2={cx + r - 12} y2={cy} stroke={C.amber} strokeWidth="2" strokeLinecap="round" />
      </g>
      <circle cx={cx} cy={cy} r="4" fill={C.amber} />
      <text x={cx} y={cy + 34} textAnchor="middle" fill={C.text} fontSize="24" fontWeight="600" fontFamily="'IBM Plex Mono', monospace">{value}</text>
    </svg>
  );
}

export default function WebhookGatewayConsole() {
  const [baseUrl, setBaseUrl] = useState('http://localhost:3000');
  const [connection, setConnection] = useState('unknown');
  const [payload, setPayload] = useState(SAMPLE_PAYLOAD);
  const [busy, setBusy] = useState({ send: false, burst: false, flood: false, metrics: false, dead: false, health: false });
  const [metrics, setMetrics] = useState(null);
  const [deadLetters, setDeadLetters] = useState([]);
  const [lastResponse, setLastResponse] = useState(null);
  const [log, setLog] = useState([]);
  const [counts, setCounts] = useState({ enqueued: 0, rejected: 0, errors: 0 });
  const logEndRef = useRef(null);

  const addLog = useCallback((level, msg) => {
    setLog((prev) => [...prev, { ts: new Date().toLocaleTimeString('en-US', { hour12: false }), level, msg }].slice(-60));
  }, []);

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [log]);

  const checkHealth = useCallback(async () => {
    setBusy((b) => ({ ...b, health: true }));
    try {
      const res = await fetch(`${baseUrl}/health`);
      if (res.ok) {
        const data = await res.json();
        setConnection('online');
        addLog('info', `Health check OK — queue depth ${data.queueDepth}, uptime ${Math.round(data.uptime)}s`);
      } else {
        setConnection('offline');
        addLog('warn', `Health check returned ${res.status}`);
      }
    } catch (e) {
      setConnection('offline');
      addLog('error', `Could not reach ${baseUrl} — ${e.message}`);
    } finally {
      setBusy((b) => ({ ...b, health: false }));
    }
  }, [baseUrl, addLog]);

  useEffect(() => { checkHealth(); }, [checkHealth]);

  const fetchMetricsData = useCallback(async (opts = {}) => {
    const silent = !!opts.silent;
    if (!silent) setBusy((b) => ({ ...b, metrics: true }));
    try {
      const res = await fetch(`${baseUrl}/metrics`);
      const data = await res.json();
      setMetrics(data);
      if (!silent) addLog('info', `Metrics — queue ${data.queueDepth}, processed ${data.processedTotal}, dead letters ${data.deadLetterCount}`);
    } catch (e) {
      if (!silent) addLog('error', `Failed to fetch /metrics — ${e.message}`);
    } finally {
      if (!silent) setBusy((b) => ({ ...b, metrics: false }));
    }
  }, [baseUrl, addLog]);

  useEffect(() => {
    if (connection !== 'online') return undefined;
    const id = setInterval(() => fetchMetricsData({ silent: true }), 3000);
    return () => clearInterval(id);
  }, [connection, fetchMetricsData]);

  const fetchDeadLettersData = useCallback(async () => {
    setBusy((b) => ({ ...b, dead: true }));
    try {
      const res = await fetch(`${baseUrl}/dead-letters`);
      const data = await res.json();
      const list = data.deadLetters || [];
      setDeadLetters(list);
      addLog('info', `Dead letters — ${list.length} on record`);
    } catch (e) {
      addLog('error', `Failed to fetch /dead-letters — ${e.message}`);
    } finally {
      setBusy((b) => ({ ...b, dead: false }));
    }
  }, [baseUrl, addLog]);

  const sendOne = useCallback(async (bodyStr) => {
    try {
      const res = await fetch(`${baseUrl}/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: bodyStr,
      });
      let data = null;
      try { data = await res.json(); } catch { }
      if (res.status === 200) setCounts((c) => ({ ...c, enqueued: c.enqueued + 1 }));
      else if (res.status === 429) setCounts((c) => ({ ...c, rejected: c.rejected + 1 }));
      else setCounts((c) => ({ ...c, errors: c.errors + 1 }));
      return { ok: res.status === 200, status: res.status, data };
    } catch (e) {
      setCounts((c) => ({ ...c, errors: c.errors + 1 }));
      return { ok: false, status: 0, data: null, error: e.message };
    }
  }, [baseUrl]);

  const handleSend = useCallback(async () => {
    try { JSON.parse(payload); } catch {
      addLog('error', 'Payload is not valid JSON — fix it before sending');
      return;
    }
    setBusy((b) => ({ ...b, send: true }));
    const r = await sendOne(payload);
    if (r.status === 200) {
      addLog('info', `Webhook enqueued — id ${r.data?.id ?? '—'}`);
      setLastResponse(JSON.stringify(r.data, null, 2));
    } else if (r.status === 429) {
      addLog('warn', 'Queue full — server returned 429');
      setLastResponse(JSON.stringify(r.data ?? { error: 'queue full — retry later' }, null, 2));
    } else if (r.status === 0) {
      addLog('error', `Could not reach ${baseUrl} — ${r.error}`);
      setLastResponse(`Network error: ${r.error}`);
    } else {
      addLog('error', `Server responded ${r.status}`);
      setLastResponse(JSON.stringify(r.data ?? { error: 'unknown error' }, null, 2));
    }
    setBusy((b) => ({ ...b, send: false }));
  }, [payload, sendOne, addLog, baseUrl]);

  const fireMany = useCallback(async (n, label) => {
    let base;
    try { base = JSON.parse(payload); } catch {
      addLog('error', 'Payload is not valid JSON — fix it before sending');
      return null;
    }
    const jobs = Array.from({ length: n }, (_, i) =>
      sendOne(JSON.stringify({ ...base, id: `${label}_${Date.now()}_${i}` }))
    );
    const results = await Promise.all(jobs);
    const ok = results.filter((r) => r.ok).length;
    const rejected = results.filter((r) => r.status === 429).length;
    const errored = results.length - ok - rejected;
    return { ok, rejected, errored, total: n };
  }, [payload, sendOne, addLog]);

  const handleBurst = useCallback(async () => {
    setBusy((b) => ({ ...b, burst: true }));
    addLog('info', 'Firing 20 concurrent requests…');
    const r = await fireMany(20, 'burst');
    if (r) {
      addLog(r.rejected > 0 ? 'warn' : 'info', `Burst complete — ${r.ok} enqueued, ${r.rejected} rejected, ${r.errored} errors`);
      setLastResponse(`${r.ok}/${r.total} enqueued · ${r.rejected} rejected · ${r.errored} errors`);
    }
    setBusy((b) => ({ ...b, burst: false }));
  }, [fireMany, addLog]);

  const handleFlood = useCallback(async () => {
    setBusy((b) => ({ ...b, flood: true }));
    addLog('warn', 'Firing 200 concurrent requests — expecting 429s');
    const r = await fireMany(200, 'flood');
    if (r) {
      addLog(r.rejected > 0 ? 'warn' : 'info', `Flood complete — ${r.ok} enqueued, ${r.rejected} rejected, ${r.errored} errors`);
      setLastResponse(`${r.ok}/${r.total} enqueued · ${r.rejected} rejected · ${r.errored} errors`);
    }
    setBusy((b) => ({ ...b, flood: false }));
  }, [fireMany, addLog]);

  const clearConsole = useCallback(() => {
    setLog([]);
    setCounts({ enqueued: 0, rejected: 0, errors: 0 });
    setLastResponse(null);
    setDeadLetters([]);
    addLog('info', 'Console cleared — local state only.');
  }, [addLog]);

  const failRate = metrics && (metrics.processedTotal + metrics.deadLetterCount) > 0
    ? Math.round((metrics.deadLetterCount / (metrics.processedTotal + metrics.deadLetterCount)) * 100)
    : null;

  const outcomeTotal = counts.enqueued + counts.rejected;
  const pctEnqueued = outcomeTotal ? (counts.enqueued / outcomeTotal) * 100 : 0;
  const pctRejected = outcomeTotal ? (counts.rejected / outcomeTotal) * 100 : 0;

  return (
    <div className="wgc-app">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap');

        .wgc-app, .wgc-app * { box-sizing: border-box; }
        .wgc-app {
          background: ${C.bg};
          color: ${C.text};
          font-family: 'IBM Plex Sans', sans-serif;
          min-height: 100vh;
          padding: 0;
          line-height: 1.5;
        }
        
        /* ---------- HERO ---------- */
        .wgc-hero {
          border-bottom: 1px solid ${C.border};
          background: ${C.heroBg};
          padding: 40px 32px;
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 32px;
          align-items: center;
        }
        .wgc-eyebrow-row { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
        .wgc-eyebrow {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11px;
          letter-spacing: 0.1em;
          color: ${C.textDim};
          text-transform: uppercase;
        }
        .wgc-status-dot {
          width: 8px; height: 8px; border-radius: 50%;
          background: ${C.textDim};
        }
        .wgc-status-dot.online { background: ${C.safe}; box-shadow: 0 0 8px ${C.safeSoft}; }
        .wgc-status-dot.offline { background: ${C.hazard}; }
        
        .wgc-title {
          font-family: 'IBM Plex Sans', sans-serif;
          font-weight: 600;
          font-size: 32px;
          letter-spacing: -0.02em;
          margin: 0 0 8px 0;
          color: ${C.text};
        }
        .wgc-subtitle {
          color: ${C.textDim};
          font-size: 14px;
          max-width: 600px;
          margin: 0 0 24px 0;
        }
        .wgc-pipeline { display: flex; align-items: center; gap: 12px; }
        .wgc-pipeline-node {
          background: ${C.panelAlt};
          border: 1px solid ${C.border};
          padding: 8px 12px;
          border-radius: 4px;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11px;
          color: ${C.safe};
          display: flex; flex-direction: column;
        }
        .wgc-pipeline-node span { color: ${C.textDim}; font-family: 'IBM Plex Sans', sans-serif; font-size: 10px; }
        .wgc-pipeline-arrow { color: ${C.border}; }

        .wgc-gauge-wrap { display: flex; flex-direction: column; align-items: center; }
        .wgc-gauge-plate { width: 160px; height: 160px; display: flex; justify-content: center; align-items: center; }
        .wgc-gauge-svg { width: 100%; height: auto; }

        /* ---------- BASE URL BAR ---------- */
        .wgc-baseurl-bar {
          display: flex; align-items: center; gap: 16px;
          padding: 16px 32px;
          border-bottom: 1px solid ${C.border};
          background: ${C.bgAlt};
        }
        .wgc-baseurl-bar input {
          flex: 1;
          background: ${C.bg};
          border: 1px solid ${C.border};
          color: ${C.safe};
          font-family: 'IBM Plex Mono', monospace;
          font-size: 13px;
          padding: 8px 12px;
          border-radius: 4px;
        }
        .wgc-baseurl-bar input:focus { outline: 1px solid ${C.safe}; border-color: ${C.safe}; }
        
        /* ---------- CONSOLE GRID ---------- */
        .wgc-console-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          border-bottom: 1px solid ${C.border};
        }
        .wgc-panel {
          padding: 32px;
          border-right: 1px solid ${C.border};
        }
        .wgc-panel:last-child { border-right: none; }
        
        .wgc-panel-header {
          display: flex; align-items: center; gap: 8px;
          margin-bottom: 16px;
        }
        .wgc-panel-tag {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 10px;
          font-weight: 600;
          padding: 2px 6px;
          background: ${C.amber};
          color: ${C.amberDark};
          border-radius: 2px;
        }
        .wgc-panel-tag.get { background: ${C.safe}; color: ${C.bg}; }
        .wgc-panel-path { font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: ${C.text}; }
        
        .wgc-json-editor {
          width: 100%;
          background: ${C.panel};
          border: 1px solid ${C.border};
          color: ${C.text};
          font-family: 'IBM Plex Mono', monospace;
          font-size: 12px;
          padding: 16px;
          border-radius: 4px;
          min-height: 160px;
          margin-bottom: 16px;
        }
        .wgc-json-editor:focus { outline: 1px solid ${C.amber}; border-color: ${C.amber}; }
        
        .wgc-btn-stack { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 24px; }
        .wgc-btn {
          font-family: 'IBM Plex Sans', sans-serif;
          font-weight: 500;
          font-size: 12px;
          border-radius: 4px;
          border: 1px solid transparent;
          padding: 8px 12px;
          display: flex; align-items: center; justify-content: center; gap: 6px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .wgc-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .wgc-btn-primary { background: ${C.amber}; color: ${C.amberDark}; }
        .wgc-btn-primary:hover:not(:disabled) { background: #E6E69E; }
        .wgc-btn-outline { background: transparent; border-color: ${C.amber}; color: ${C.amber}; }
        .wgc-btn-outline:hover:not(:disabled) { background: ${C.amberSoft}; }
        .wgc-btn-hazard { background: transparent; border-color: ${C.hazard}; color: ${C.hazard}; }
        
        .wgc-btn-ghost { background: ${C.panel}; border: 1px solid ${C.border}; color: ${C.text}; }
        .wgc-btn-ghost:hover:not(:disabled) { border-color: ${C.safe}; color: ${C.safe}; }
        .wgc-btn.full { width: 100%; margin-bottom: 8px; }

        .wgc-response-label { font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: ${C.textDim}; margin-bottom: 8px; }
        .wgc-response pre {
          background: ${C.panel}; border: 1px solid ${C.border}; border-radius: 4px;
          padding: 12px; font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: ${C.text};
          white-space: pre-wrap; word-break: break-word;
        }

        /* ---------- METRICS ---------- */
        .wgc-metrics-row { display: grid; grid-template-columns: repeat(4, 1fr); border-bottom: 1px solid ${C.border}; }
        .wgc-stat { padding: 24px; border-right: 1px solid ${C.border}; text-align: center; }
        .wgc-stat:last-child { border-right: none; }
        .wgc-stat-value { font-family: 'IBM Plex Mono', monospace; font-size: 32px; font-weight: 500; }
        .wgc-stat-label { font-family: 'IBM Plex Mono', monospace; font-size: 10px; color: ${C.textDim}; text-transform: uppercase; margin-top: 4px; }
        
        /* ---------- LOG ---------- */
        .wgc-log-panel { border-bottom: 1px solid ${C.border}; }
        .wgc-log-header { padding: 12px 32px; border-bottom: 1px solid ${C.border}; font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: ${C.textDim}; background: ${C.bgAlt}; }
        .wgc-log-body { padding: 16px 32px; max-height: 250px; overflow-y: auto; font-family: 'IBM Plex Mono', monospace; font-size: 12px; }
        .wgc-log-line { margin-bottom: 4px; color: ${C.text}; }
        .wgc-log-line .ts { color: ${C.textFaint}; margin-right: 8px; }
        .wgc-log-line.warn { color: ${C.amber}; }
        .wgc-log-line.error { color: ${C.hazard}; }

        @media (max-width: 900px) {
          .wgc-console-grid, .wgc-metrics-row { grid-template-columns: 1fr; }
          .wgc-stat { border-right: none; border-bottom: 1px solid ${C.border}; }
          .wgc-btn-stack { grid-template-columns: 1fr; }
        }
      `}</style>

      {/* HERO */}
      <section className="wgc-hero">
        <div>
          <div className="wgc-eyebrow-row">
            <span className={`wgc-status-dot ${connection}`} />
            <span className="wgc-eyebrow">
              {connection === 'online' ? 'Gateway Operational' : connection === 'offline' ? 'Gateway Unreachable' : 'Checking Status...'}
            </span>
          </div>
          <h1 className="wgc-title">Concurrent Webhook Gateway</h1>
          <p className="wgc-subtitle">
            Accepts webhooks over HTTP, buffers them in a bounded queue, and processes them through an
            independent worker pool. Built to prove one thing: receiving must never block.
          </p>
          <div className="wgc-pipeline">
            <div className="wgc-pipeline-node">HTTP LAYER<span>Enqueues data</span></div>
            <ChevronRight className="wgc-pipeline-arrow" size={16} />
            <div className="wgc-pipeline-node">BOUNDED QUEUE<span>Buffers load</span></div>
            <ChevronRight className="wgc-pipeline-arrow" size={16} />
            <div className="wgc-pipeline-node">WORKER POOL<span>Async compute</span></div>
          </div>
        </div>
        <div className="wgc-gauge-wrap">
          <div className="wgc-gauge-plate">
            <Gauge value={metrics?.queueDepth ?? 0} />
          </div>
        </div>
      </section>

      {/* BASE URL */}
      <div className="wgc-baseurl-bar">
        {connection === 'online' ? <Wifi size={16} color={C.safe} /> : <WifiOff size={16} color={C.textDim} />}
        <input
          id="wgc-baseurl"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          spellCheck={false}
          placeholder="http://localhost:3000"
        />
        <button className="wgc-btn wgc-btn-ghost" onClick={checkHealth} disabled={busy.health}>
          <HeartPulse size={14} /> {busy.health ? 'PINGING' : 'PING'}
        </button>
      </div>

      {/* CONSOLE */}
      <section className="wgc-console-grid">
        <div className="wgc-panel">
          <div className="wgc-panel-header">
            <span className="wgc-panel-tag">POST</span>
            <span className="wgc-panel-path">/webhook</span>
          </div>
          <textarea
            className="wgc-json-editor"
            value={payload}
            onChange={(e) => setPayload(e.target.value)}
            spellCheck={false}
          />
          <div className="wgc-btn-stack">
            <button className="wgc-btn wgc-btn-primary" onClick={handleSend} disabled={busy.send}>
              <Send size={14} /> SEND
            </button>
            <button className="wgc-btn wgc-btn-outline" onClick={handleBurst} disabled={busy.burst}>
              <Zap size={14} /> BURST 20
            </button>
            <button className="wgc-btn wgc-btn-hazard" onClick={handleFlood} disabled={busy.flood}>
              <Flame size={14} /> FLOOD 200
            </button>
          </div>
          <div className="wgc-response">
            <div className="wgc-response-label">LAST RESPONSE</div>
            <pre>{lastResponse ?? 'Waiting for request...'}</pre>
          </div>
        </div>

        <div className="wgc-panel">
          <div className="wgc-panel-header">
            <span className="wgc-panel-tag get">GET</span>
            <span className="wgc-panel-path">/metrics</span>
          </div>
          <button className="wgc-btn wgc-btn-ghost full" onClick={() => fetchMetricsData()} disabled={busy.metrics}>
            <Activity size={14} /> FETCH METRICS
          </button>

          <div className="wgc-panel-header" style={{ marginTop: '24px' }}>
            <span className="wgc-panel-tag get">GET</span>
            <span className="wgc-panel-path">/dead-letters</span>
          </div>
          <button className="wgc-btn wgc-btn-ghost full" onClick={fetchDeadLettersData} disabled={busy.dead}>
            <Inbox size={14} /> FETCH DEAD LETTERS
          </button>
          
          <button className="wgc-btn wgc-btn-ghost full" style={{ marginTop: '32px', borderColor: C.borderSoft }} onClick={clearConsole}>
            <RotateCcw size={14} /> CLEAR LOCAL CONSOLE
          </button>
        </div>
      </section>

      {/* METRICS */}
      <section className="wgc-metrics-row">
        <StatBlock label="QUEUE DEPTH" value={metrics?.queueDepth ?? '—'} />
        <StatBlock label="PROCESSED" value={metrics?.processedTotal ?? '—'} accent="safe" />
        <StatBlock label="DEAD LETTERS" value={metrics?.deadLetterCount ?? '—'} accent="hazard" />
        <StatBlock label="429 REJECTIONS" value={counts.rejected} accent="hazard" />
      </section>

      {/* LOG */}
      <section className="wgc-log-panel">
        <div className="wgc-log-header">SYSTEM LOG</div>
        <div className="wgc-log-body">
          {log.length === 0 && <div style={{ color: C.textDim }}>Awaiting activity...</div>}
          {log.map((l, i) => (
            <div key={i} className={`wgc-log-line ${l.level}`}>
              <span className="ts">[{l.ts}]</span>
              <span className="msg">{l.msg}</span>
            </div>
          ))}
          <div ref={logEndRef} />
        </div>
      </section>
    </div>
  );
}