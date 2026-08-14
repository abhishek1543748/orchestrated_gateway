import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Zap, Flame, Activity, Inbox, RotateCcw, Waves, Radio } from 'lucide-react';

// ── Design tokens ─────────────────────────────────────────────
// "Petrol & Signal" — a light lab-instrument aesthetic.
// Porcelain page, one deep-petrol instrument panel, viridian for flow,
// coral for overpressure. The signature is a pressure vessel that fills
// with the queue and vents a relief valve when the gateway returns 429.
const C = {
  paper: '#E9EDEC',
  paperEdge: '#DFE5E3',
  panel: '#ffffffff',
  panelSoft: '#F4F7F5',
  ink: '#12292D',
  inkPanel: '#122A2E',
  inkPanelHi: '#173438',
  inkDim: '#5A6E6F',
  inkFaint: '#8D9A99',
  line: '#D3DBD8',
  lineSoft: '#E3E8E5',
  flow: '#0E8C77',
  flowLift: '#12A98E',
  flowDeep: '#0A6455',
  flowSoft: 'rgba(14,140,119,0.10)',
  relief: '#E4573B',
  reliefLift: '#F06A4E',
  reliefSoft: 'rgba(228,87,59,0.12)',
  onPanelDim: '#7E9694',
  onPanelFaint: '#3F5A5C',
};

const SAMPLE_PAYLOAD = JSON.stringify(
  { source: 'github', id: 'evt_001', event: 'push', repo: 'my-app' },
  null,
  2
);

const CAP = 50;
const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

// ── Signature: the pressure vessel ────────────────────────────
function PressureVessel({ depth, ventKey, open }) {
  const value = Math.max(0, depth || 0);
  const ratio = Math.max(0, Math.min(1, value / CAP));

  // Vessel interior geometry (SVG units)
  const iTop = 30;
  const iBottom = 250;
  const iH = iBottom - iTop;
  const fillH = ratio * iH;
  const fillY = iBottom - fillH;
  const hazardY = iTop + iH * 0.25; // 75% mark from bottom
  const hot = ratio > 0.75;
  const liquid = hot ? C.relief : C.flowLift;

  const ticks = [
    { v: 0, y: iBottom },
    { v: 25, y: iTop + iH * 0.5 },
    { v: 50, y: iTop },
  ];

  return (
    <svg viewBox="0 0 210 300" className="pg-vessel" role="img"
      aria-label={`Queue pressure: ${value} of ${CAP} buffered${open ? ', relief valve open' : ''}`}>
      <defs>
        <clipPath id="pgVesselClip">
          <rect x="66" y={iTop} width="78" height={iH} rx="15" />
        </clipPath>
        <pattern id="pgHazard" width="11" height="11" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
          <rect width="11" height="11" fill="transparent" />
          <rect width="5.5" height="11" fill={C.relief} opacity="0.18" />
        </pattern>
        <linearGradient id="pgLiquid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={liquid} stopOpacity="0.95" />
          <stop offset="1" stopColor={liquid} stopOpacity="0.72" />
        </linearGradient>
      </defs>

      {/* relief valve nozzle */}
      <g className={open ? 'pg-valve open' : 'pg-valve'}>
        <rect x="98" y="8" width="14" height="16" rx="3" fill={C.inkPanelHi} stroke={open ? C.relief : C.onPanelFaint} strokeWidth="1.5" />
        <rect x="92" y="4" width="26" height="6" rx="3" fill={open ? C.relief : C.onPanelFaint} />
      </g>
      {/* vent burst — remounts on each new key so the animation replays once */}
      <g key={ventKey} className="pg-vent" aria-hidden="true">
        <line x1="105" y1="4" x2="105" y2="-14" stroke={C.relief} strokeWidth="2" strokeLinecap="round" />
        <line x1="95" y1="4" x2="88" y2="-10" stroke={C.relief} strokeWidth="2" strokeLinecap="round" />
        <line x1="115" y1="4" x2="122" y2="-10" stroke={C.relief} strokeWidth="2" strokeLinecap="round" />
      </g>

      {/* vessel wall */}
      <rect x="63" y={iTop - 3} width="84" height={iH + 6} rx="18"
        fill={C.inkPanelHi} stroke={C.onPanelFaint} strokeWidth="1.5" />

      {/* liquid + hazard band, clipped to interior */}
      <g clipPath="url(#pgVesselClip)">
        <rect x="66" y={iTop} width="78" height={iH * 0.25} fill="url(#pgHazard)" />
        <line x1="66" y1={hazardY} x2="144" y2={hazardY} stroke={C.relief} strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />
        <rect className="pg-liquid" x="66" y={fillY} width="78" height={fillH} fill="url(#pgLiquid)" />
        {fillH > 2 && (
          <rect className="pg-liquid" x="66" y={fillY} width="78" height="2.5" fill={liquid} opacity="0.9" />
        )}
      </g>

      {/* calibration ticks */}
      {ticks.map((t) => (
        <g key={t.v}>
          <line x1="47" y1={t.y} x2="60" y2={t.y} stroke={C.onPanelFaint} strokeWidth="1.5" />
          <text x="42" y={t.y + 4} textAnchor="end" fill={C.onPanelDim}
            fontFamily="'Space Mono', monospace" fontSize="11">{t.v}</text>
        </g>
      ))}

      {/* inlet / outlet stubs */}
      <rect x="150" y={iBottom - 26} width="20" height="9" rx="2" fill={C.inkPanelHi} stroke={C.onPanelFaint} strokeWidth="1.2" />
      <rect x="40" y={iBottom - 26} width="20" height="9" rx="2" fill={C.inkPanelHi} stroke={C.onPanelFaint} strokeWidth="1.2" />
    </svg>
  );
}

function FlowStrip({ online, hot }) {
  const queueTone = hot ? C.relief : online ? C.flow : C.inkFaint;
  return (
    <div className="pg-flow" aria-hidden="true">
      <span className="pg-flow-node in">HTTP</span>
      <span className={`pg-flow-pipe ${online ? 'live' : ''}`} />
      <span className="pg-flow-node" style={{ borderColor: queueTone, color: queueTone }}>QUEUE</span>
      <span className={`pg-flow-pipe ${online ? 'live' : ''}`} />
      <span className="pg-flow-node work">WORKERS</span>
    </div>
  );
}

function Readout({ label, value, tone }) {
  const color = tone === 'flow' ? C.flowLift : tone === 'relief' ? C.reliefLift : '#E7EDEB';
  return (
    <div className="pg-readout">
      <div className="pg-readout-val" style={{ color }}>{value}</div>
      <div className="pg-readout-label">{label}</div>
    </div>
  );
}

export default function WebhookGatewayConsole() {
  // API base URL — driven by VITE_API_URL env variable.
  // Dev:  VITE_API_URL is empty → fetch('/api/...') → Vite proxy → localhost:3000 (no CORS)
  // Prod: VITE_API_URL = 'https://your-gateway.railway.app' → direct call + CORS headers
  const baseUrl = import.meta.env.VITE_API_URL ?? '';

  const [connection, setConnection] = useState('unknown');
  const [payload, setPayload] = useState(SAMPLE_PAYLOAD);
  const [busy, setBusy] = useState({ send: false, burst: false, flood: false, metrics: false, dead: false, health: false });
  const [metrics, setMetrics] = useState(null);
  const [deadLetters, setDeadLetters] = useState([]);
  const [lastResponse, setLastResponse] = useState(null);
  const [log, setLog] = useState([]);
  const [counts, setCounts] = useState({ enqueued: 0, rejected: 0, errors: 0 });
  const [spin, setSpin] = useState(0);
  const [vent, setVent] = useState(0);
  const prevRejected = useRef(0);
  const logEndRef = useRef(null);

  const addLog = useCallback((level, msg) => {
    setLog((prev) => [...prev, { ts: new Date().toLocaleTimeString('en-US', { hour12: false }), level, msg }].slice(-60));
  }, []);

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [log]);

  // Trigger a relief-valve vent whenever a fresh 429 lands.
  useEffect(() => {
    if (counts.rejected > prevRejected.current) setVent((v) => v + 1);
    prevRejected.current = counts.rejected;
  }, [counts.rejected]);

  const checkHealth = useCallback(async () => {
    setBusy((b) => ({ ...b, health: true }));
    try {
      const res = await fetch(`${baseUrl}/health`);
      if (res.ok) {
        const data = await res.json();
        setConnection('online');
        addLog('info', `Health OK — queue ${data.queueDepth}, uptime ${Math.round(data.uptime)}s`);
      } else {
        setConnection('offline');
        addLog('warn', `Health check returned ${res.status}`);
      }
    } catch (e) {
      setConnection('offline');
      addLog('error', `Can't reach ${baseUrl} — start the gateway, then ping again`);
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
      if (!silent) addLog('info', `Metrics — queue ${data.queueDepth}, processed ${data.processedTotal}, dead ${data.deadLetterCount}`);
    } catch (e) {
      if (!silent) addLog('error', `Couldn't read /metrics — ${e.message}`);
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
      addLog('error', `Couldn't read /dead-letters — ${e.message}`);
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
      addLog('error', 'Payload isn\'t valid JSON — fix it, then send');
      return;
    }
    setBusy((b) => ({ ...b, send: true }));
    const r = await sendOne(payload);
    if (r.status === 200) {
      addLog('info', `Enqueued — id ${r.data?.id ?? '—'}`);
      setLastResponse(JSON.stringify(r.data, null, 2));
    } else if (r.status === 429) {
      addLog('warn', 'Queue at capacity — relief valve open, returned 429');
      setLastResponse(JSON.stringify(r.data ?? { error: 'queue full — retry later' }, null, 2));
    } else if (r.status === 0) {
      addLog('error', `Can't reach ${baseUrl} — ${r.error}`);
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
      addLog('error', 'Payload isn\'t valid JSON — fix it, then send');
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
    addLog('info', 'Firing 20 at once…');
    const r = await fireMany(20, 'burst');
    if (r) {
      addLog(r.rejected > 0 ? 'warn' : 'info', `Burst done — ${r.ok} enqueued, ${r.rejected} rejected, ${r.errored} errors`);
      setLastResponse(`${r.ok}/${r.total} enqueued · ${r.rejected} rejected · ${r.errored} errors`);
    }
    setBusy((b) => ({ ...b, burst: false }));
  }, [fireMany, addLog]);

  const handleFlood = useCallback(async () => {
    setBusy((b) => ({ ...b, flood: true }));
    addLog('warn', 'Firing 200 at once — expect the valve to open');
    const r = await fireMany(200, 'flood');
    if (r) {
      addLog(r.rejected > 0 ? 'warn' : 'info', `Flood done — ${r.ok} enqueued, ${r.rejected} rejected, ${r.errored} errors`);
      setLastResponse(`${r.ok}/${r.total} enqueued · ${r.rejected} rejected · ${r.errored} errors`);
    }
    setBusy((b) => ({ ...b, flood: false }));
  }, [fireMany, addLog]);

  const clearConsole = useCallback(() => {
    setLog([]);
    setCounts({ enqueued: 0, rejected: 0, errors: 0 });
    setLastResponse(null);
    setDeadLetters([]);
    addLog('info', 'Console cleared — local view only, gateway untouched');
  }, [addLog]);

  const anyBusy = Object.values(busy).some(Boolean);
  useEffect(() => {
    if (!anyBusy) return undefined;
    const id = setInterval(() => setSpin((f) => (f + 1) % SPINNER.length), 90);
    return () => clearInterval(id);
  }, [anyBusy]);

  const depth = metrics?.queueDepth ?? 0;
  const ratio = Math.max(0, Math.min(1, depth / CAP));
  const valveOpen = ratio >= 1 || (counts.rejected > 0 && ratio > 0.9);

  return (
    <div className="pg-app">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600&family=Space+Grotesk:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap');

        .pg-app, .pg-app * { box-sizing: border-box; }
        .pg-app {
          background:
            radial-gradient(1200px 600px at 12% -10%, #EEF2F0 0%, transparent 60%),
            ${C.paper};
          color: ${C.ink};
          font-family: 'Instrument Sans', system-ui, sans-serif;
          min-height: 100vh;
          line-height: 1.55;
          -webkit-font-smoothing: antialiased;
        }
        .pg-shell { max-width: 1160px; margin: 0 auto; padding: 0 28px 72px; }

        /* ---- status bar ---- */
        .pg-status {
          display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
          padding: 14px 0; margin-bottom: 8px;
          border-bottom: 1px solid ${C.line};
        }
        .pg-brandmark {
          width: 26px; height: 26px; border-radius: 8px; flex: none;
          background: ${C.inkPanel};
          display: grid; place-items: center; color: ${C.flowLift};
        }
        .pg-brand { font-family: 'Space Grotesk', sans-serif; font-weight: 600; font-size: 15px; letter-spacing: -0.01em; }
        .pg-status-spacer { flex: 1; }
        .pg-endpoint {
          font-family: 'Space Mono', monospace; font-size: 12px; color: ${C.inkDim};
          padding: 4px 10px; border: 1px solid ${C.line}; border-radius: 999px; background: ${C.panel};
        }
        .pg-dot {
          display: inline-flex; align-items: center; gap: 7px;
          font-family: 'Space Mono', monospace; font-size: 12px; font-weight: 700;
          letter-spacing: 0.04em;
        }
        .pg-dot i { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
        .pg-dot.online { color: ${C.flowDeep}; }
        .pg-dot.online i { background: ${C.flow}; box-shadow: 0 0 0 3px ${C.flowSoft}; }
        .pg-dot.offline { color: ${C.relief}; }
        .pg-dot.offline i { background: ${C.relief}; box-shadow: 0 0 0 3px ${C.reliefSoft}; }
        .pg-dot.unknown { color: ${C.inkFaint}; }
        .pg-dot.unknown i { background: ${C.inkFaint}; }

        /* ---- hero ---- */
        .pg-hero { padding: 44px 0 20px; }
        .pg-eyebrow {
          font-family: 'Space Mono', monospace; font-size: 12px; font-weight: 700;
          letter-spacing: 0.22em; text-transform: uppercase; color: ${C.flowDeep};
          display: flex; align-items: center; gap: 10px; margin-bottom: 20px;
        }
        .pg-eyebrow::before { content: ''; width: 26px; height: 2px; background: ${C.flow}; display: inline-block; }
        .pg-h1 {
          font-family: 'Space Grotesk', sans-serif; font-weight: 600;
          font-size: clamp(34px, 6vw, 62px); line-height: 1.02; letter-spacing: -0.03em;
          margin: 0; max-width: 15ch;
        }
        .pg-h1 em { font-style: normal; color: ${C.flow}; }
        .pg-lede { font-size: 17px; color: ${C.inkDim}; max-width: 56ch; margin: 22px 0 26px; }

        /* ---- flow strip ---- */
        .pg-flow { display: flex; align-items: center; gap: 0; flex-wrap: wrap; }
        .pg-flow-node {
          font-family: 'Space Mono', monospace; font-size: 12px; font-weight: 700; letter-spacing: 0.08em;
          padding: 8px 14px; border: 1.5px solid ${C.line}; border-radius: 10px;
          background: ${C.panel}; color: ${C.inkDim};
        }
        .pg-flow-node.in { border-color: ${C.flow}; color: ${C.flowDeep}; }
        .pg-flow-node.work { border-color: ${C.ink}; color: ${C.ink}; }
        .pg-flow-pipe {
          width: 46px; height: 2px; background: ${C.line}; position: relative; flex: none;
        }
        .pg-flow-pipe.live {
          background: linear-gradient(90deg, ${C.flow} 0 50%, transparent 50% 100%);
          background-size: 12px 2px; animation: pg-drift 0.9s linear infinite;
        }
        @keyframes pg-drift { to { background-position: 12px 0; } }

        /* ---- main grid ---- */
        .pg-grid {
          display: grid; grid-template-columns: 1.15fr 0.85fr; gap: 22px;
          margin-top: 40px; align-items: start;
        }
        .pg-card {
          background: ${C.panel}; border: 1px solid ${C.line}; border-radius: 16px;
          box-shadow: 0 1px 2px rgba(18,41,45,0.04), 0 20px 40px -28px rgba(18,41,45,0.30);
        }
        .pg-card-pad { padding: 24px; }

        .pg-route { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
        .pg-verb {
          font-family: 'Space Mono', monospace; font-size: 11px; font-weight: 700; letter-spacing: 0.05em;
          padding: 3px 9px; border-radius: 7px; color: ${C.panel};
        }
        .pg-verb.post { background: ${C.flow}; }
        .pg-verb.get { background: ${C.ink}; }
        .pg-path { font-family: 'Space Mono', monospace; font-size: 13px; color: ${C.ink}; }
        .pg-route-hint { margin-left: auto; font-size: 12px; color: ${C.inkFaint}; }

        .pg-editor {
          width: 100%; min-height: 168px; resize: vertical;
          background: ${C.panelSoft}; border: 1px solid ${C.line}; border-radius: 12px;
          padding: 15px; color: ${C.ink};
          font-family: 'Space Mono', monospace; font-size: 12.5px; line-height: 1.6;
        }
        .pg-editor:focus { outline: none; border-color: ${C.flow}; box-shadow: 0 0 0 3px ${C.flowSoft}; }

        .pg-actions { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-top: 16px; }
        .pg-btn {
          font-family: 'Space Grotesk', sans-serif; font-weight: 500; font-size: 13px;
          display: inline-flex; align-items: center; justify-content: center; gap: 7px;
          padding: 11px 12px; border-radius: 11px; border: 1.5px solid transparent;
          cursor: pointer; transition: transform 0.12s ease, background 0.15s, box-shadow 0.15s, border-color 0.15s;
        }
        .pg-btn:active:not(:disabled) { transform: translateY(1px); }
        .pg-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .pg-btn:focus-visible { outline: none; box-shadow: 0 0 0 3px ${C.flowSoft}; }
        .pg-btn.solid { background: ${C.flow}; color: #fff; }
        .pg-btn.solid:hover:not(:disabled) { background: ${C.flowDeep}; }
        .pg-btn.line { background: ${C.panel}; border-color: ${C.line}; color: ${C.ink}; }
        .pg-btn.line:hover:not(:disabled) { border-color: ${C.flow}; color: ${C.flowDeep}; }
        .pg-btn.danger { background: ${C.panel}; border-color: ${C.relief}; color: ${C.relief}; }
        .pg-btn.danger:hover:not(:disabled) { background: ${C.reliefSoft}; }
        .pg-btn.wide { width: 100%; }
        .pg-btn.ghost { background: transparent; border-color: ${C.line}; color: ${C.inkDim}; }
        .pg-btn.ghost:hover:not(:disabled) { border-color: ${C.inkDim}; color: ${C.ink}; }

        .pg-resp { margin-top: 18px; }
        .pg-resp-label {
          font-family: 'Space Mono', monospace; font-size: 11px; letter-spacing: 0.06em;
          text-transform: uppercase; color: ${C.inkFaint}; margin-bottom: 8px;
        }
        .pg-resp pre {
          margin: 0; background: ${C.panelSoft}; border: 1px solid ${C.lineSoft}; border-radius: 12px;
          padding: 14px; font-family: 'Space Mono', monospace; font-size: 12.5px; color: ${C.ink};
          white-space: pre-wrap; word-break: break-word;
        }

        .pg-baseurl { display: flex; align-items: center; gap: 10px; margin-top: 18px; }
        .pg-baseurl input {
          flex: 1; background: ${C.panelSoft}; border: 1px solid ${C.line}; border-radius: 11px;
          padding: 10px 13px; color: ${C.flowDeep};
          font-family: 'Space Mono', monospace; font-size: 12.5px;
        }
        .pg-baseurl input:focus { outline: none; border-color: ${C.flow}; box-shadow: 0 0 0 3px ${C.flowSoft}; }

        /* ---- instrument panel (dark) ---- */
        .pg-instrument {
          background: ${C.inkPanel}; border: 1px solid ${C.inkPanelHi}; border-radius: 16px;
          padding: 22px 22px 20px; color: #E7EDEB;
          box-shadow: 0 24px 48px -30px rgba(18,41,45,0.6);
          position: sticky; top: 20px;
        }
        .pg-inst-head {
          display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;
        }
        .pg-inst-title {
          font-family: 'Space Grotesk', sans-serif; font-weight: 600; font-size: 15px; color: #EAF0EE;
        }
        .pg-inst-sub { font-family: 'Space Mono', monospace; font-size: 11px; color: ${C.onPanelDim}; }
        .pg-vessel { display: block; width: 100%; height: auto; max-height: 300px; margin: 4px auto 2px; }

        .pg-depth { text-align: center; margin-top: 2px; }
        .pg-depth b {
          font-family: 'Space Mono', monospace; font-weight: 700; font-size: 42px; color: #EAF0EE;
          letter-spacing: -0.02em; line-height: 1;
        }
        .pg-depth b.hot { color: ${C.reliefLift}; }
        .pg-depth span { font-family: 'Space Mono', monospace; font-size: 12px; color: ${C.onPanelDim}; margin-left: 6px; }
        .pg-valve-state {
          margin: 12px auto 0; text-align: center;
          font-family: 'Space Mono', monospace; font-size: 11px; letter-spacing: 0.04em;
          padding: 6px 12px; border-radius: 999px; display: inline-block;
          border: 1px solid ${C.onPanelFaint}; color: ${C.onPanelDim};
        }
        .pg-valve-state.open { color: ${C.reliefLift}; border-color: ${C.relief}; background: ${C.reliefSoft}; }
        .pg-valve-wrap { text-align: center; }

        .pg-readouts {
          display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px;
          margin-top: 18px; background: ${C.inkPanelHi}; border-radius: 12px; overflow: hidden;
          border: 1px solid ${C.inkPanelHi};
        }
        .pg-readout { background: ${C.inkPanel}; padding: 14px 10px; text-align: center; }
        .pg-readout-val { font-family: 'Space Mono', monospace; font-weight: 700; font-size: 22px; }
        .pg-readout-label {
          font-family: 'Space Mono', monospace; font-size: 9.5px; letter-spacing: 0.06em;
          text-transform: uppercase; color: ${C.onPanelDim}; margin-top: 3px;
        }
        .pg-inst-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 16px; }
        .pg-btn.oncard {
          background: ${C.inkPanelHi}; border-color: ${C.onPanelFaint}; color: #DCE6E3; font-size: 12px;
        }
        .pg-btn.oncard:hover:not(:disabled) { border-color: ${C.flowLift}; color: ${C.flowLift}; }

        /* ---- event stream ---- */
        .pg-stream { margin-top: 22px; }
        .pg-stream-head {
          display: flex; align-items: center; justify-content: space-between;
          padding: 14px 20px; border-bottom: 1px solid ${C.lineSoft};
        }
        .pg-stream-title {
          font-family: 'Space Grotesk', sans-serif; font-weight: 600; font-size: 14px;
          display: flex; align-items: center; gap: 9px;
        }
        .pg-stream-state { font-family: 'Space Mono', monospace; font-size: 12px; color: ${C.inkDim}; }
        .pg-stream-state .sp { color: ${C.flow}; }
        .pg-stream-body {
          padding: 14px 20px; max-height: 260px; overflow-y: auto;
          font-family: 'Space Mono', monospace; font-size: 12.5px;
        }
        .pg-line { display: flex; gap: 10px; padding: 3px 0; color: ${C.ink}; }
        .pg-line .ts { color: ${C.inkFaint}; flex: none; }
        .pg-line .car { color: ${C.flow}; flex: none; }
        .pg-line.warn { color: #9A6B12; }
        .pg-line.warn .car { color: #C68A1E; }
        .pg-line.error { color: ${C.relief}; }
        .pg-line.error .car { color: ${C.relief}; }
        .pg-empty { color: ${C.inkFaint}; }
        .pg-caret {
          display: inline-block; width: 8px; height: 14px; background: ${C.flow};
          animation: pg-blink 1.05s step-end infinite; vertical-align: -2px;
        }
        @keyframes pg-blink { 0%, 50% { opacity: 1; } 50.01%, 100% { opacity: 0; } }

        /* ---- vessel motion ---- */
        .pg-liquid { transition: y 0.6s cubic-bezier(.22,.61,.36,1), height 0.6s cubic-bezier(.22,.61,.36,1), fill 0.4s; }
        .pg-valve.open rect { filter: drop-shadow(0 0 4px ${C.relief}); }
        .pg-vent { opacity: 0; }
        .pg-vent { animation: pg-vent 0.6s ease-out; }
        @keyframes pg-vent {
          0% { opacity: 0; transform: translateY(6px); }
          30% { opacity: 1; }
          100% { opacity: 0; transform: translateY(-8px); }
        }

        @media (max-width: 900px) {
          .pg-grid { grid-template-columns: 1fr; }
          .pg-instrument { position: static; }
          .pg-actions { grid-template-columns: 1fr; }
        }
        @media (prefers-reduced-motion: reduce) {
          .pg-flow-pipe.live { animation: none; background: ${C.flow}; }
          .pg-liquid { transition: none; }
          .pg-vent { animation: none; opacity: 0; }
          .pg-caret { animation: none; }
        }
      `}</style>

      <div className="pg-shell">
        {/* status bar */}
        <div className="pg-status">
          <span className="pg-brandmark"><Waves size={15} /></span>
          <span className="pg-brand">Gateway</span>
          <span className="pg-status-spacer" />
          <span className="pg-endpoint">{baseUrl.replace(/^https?:\/\//, '')}</span>
          <span className={`pg-dot ${connection}`}>
            <i />{connection === 'online' ? 'ONLINE' : connection === 'offline' ? 'OFFLINE' : 'CHECKING'}
          </span>
        </div>

        {/* hero */}
        <header className="pg-hero">
          <div className="pg-eyebrow">Backpressure, demonstrated</div>
          <h1 className="pg-h1">Receiving must <em>never</em> block.</h1>
          <p className="pg-lede">
            Every webhook is accepted over HTTP, held in a bounded queue, and drained by an independent
            worker pool. When the queue fills, the gateway sheds load with a clean 429 instead of stalling
            the sender. Push it below and watch the pressure rise.
          </p>
          <FlowStrip online={connection === 'online'} hot={ratio > 0.75} />
        </header>

        {/* main workspace */}
        <div className="pg-grid">
          {/* left: send */}
          <section className="pg-card pg-card-pad">
            <div className="pg-route">
              <span className="pg-verb post">POST</span>
              <span className="pg-path">/webhook</span>
              <span className="pg-route-hint">accepts, never waits</span>
            </div>
            <textarea
              className="pg-editor"
              value={payload}
              onChange={(e) => setPayload(e.target.value)}
              spellCheck={false}
              aria-label="Webhook JSON payload"
            />
            <div className="pg-actions">
              <button className="pg-btn solid" onClick={handleSend} disabled={busy.send}>
                <Send size={15} /> Send
              </button>
              <button className="pg-btn line" onClick={handleBurst} disabled={busy.burst}>
                <Zap size={15} /> Burst ×20
              </button>
              <button className="pg-btn danger" onClick={handleFlood} disabled={busy.flood}>
                <Flame size={15} /> Flood ×200
              </button>
            </div>

            <div className="pg-resp">
              <div className="pg-resp-label">Last response</div>
              <pre>{lastResponse ?? 'Awaiting the first request. Send a webhook to begin.'}</pre>
            </div>

            <div className="pg-baseurl">
              <input
                value={baseUrl || '(proxy via Vite → localhost:3000)'}
                readOnly
                spellCheck={false}
                aria-label="Gateway base URL"
                title="Set VITE_API_URL env variable to change this"
                style={{ opacity: 0.7, cursor: 'default' }}
              />
              <button className="pg-btn ghost" onClick={checkHealth} disabled={busy.health}>
                <Radio size={14} /> {busy.health ? 'Pinging' : 'Ping'}
              </button>
            </div>
          </section>

          {/* right: instrument */}
          <aside className="pg-instrument">
            <div className="pg-inst-head">
              <span className="pg-inst-title">Queue pressure</span>
              <span className="pg-inst-sub">cap {CAP}</span>
            </div>

            <PressureVessel depth={depth} ventKey={vent} open={valveOpen} />

            <div className="pg-depth">
              <b className={ratio > 0.75 ? 'hot' : ''}>{metrics ? depth : '—'}</b>
              <span>/ {CAP} buffered</span>
            </div>
            <div className="pg-valve-wrap">
              <span className={`pg-valve-state ${valveOpen ? 'open' : ''}`}>
                {valveOpen ? 'Relief valve open · shedding 429' : 'Relief valve closed'}
              </span>
            </div>

            <div className="pg-readouts">
              <Readout label="Processed" value={metrics?.processedTotal ?? '—'} tone="flow" />
              <Readout label="Dead" value={metrics?.deadLetterCount ?? '—'} tone="relief" />
              <Readout label="429s" value={counts.rejected} tone="relief" />
            </div>

            <div className="pg-inst-actions">
              <button className="pg-btn oncard" onClick={() => fetchMetricsData()} disabled={busy.metrics}>
                <Activity size={14} /> Metrics
              </button>
              <button className="pg-btn oncard" onClick={fetchDeadLettersData} disabled={busy.dead}>
                <Inbox size={14} /> Dead letters
              </button>
            </div>
          </aside>
        </div>

        {/* event stream */}
        <section className="pg-card pg-stream">
          <div className="pg-stream-head">
            <span className="pg-stream-title"><Waves size={15} color={C.flow} /> Event stream</span>
            <span className="pg-stream-state">
              {anyBusy ? <><span className="sp">{SPINNER[spin]}</span> working</> : 'idle'}
              {' · '}
              <button className="pg-btn ghost" style={{ padding: '3px 9px', fontSize: 11, marginLeft: 4 }} onClick={clearConsole}>
                <RotateCcw size={12} /> Clear
              </button>
            </span>
          </div>
          <div className="pg-stream-body">
            {log.length === 0 && <div className="pg-empty">No events yet. Send a webhook to begin.</div>}
            {log.map((l, i) => (
              <div key={i} className={`pg-line ${l.level}`}>
                <span className="car">›</span>
                <span className="ts">{l.ts}</span>
                <span>{l.msg}</span>
              </div>
            ))}
            {log.length > 0 && (
              <div className="pg-line"><span className="car">›</span><span className="pg-caret" /></div>
            )}
            <div ref={logEndRef} />
          </div>
        </section>
      </div>
    </div>
  );
}
