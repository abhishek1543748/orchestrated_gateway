import React, { useEffect, useMemo, useRef, useState } from "react";

// Simulated webhook gateway for a backend engineer to observe backpressure.
// A bounded queue (0..CAPACITY) accepts test webhooks over HTTP; workers drain
// it; sends that would exceed capacity return 429. All motion and color in the
// UI is bound to this state — nothing animates on a fixed timer.

const CAPACITY = 100;
const TICK_MS = 250; // gateway processing tick
const POLL_MS = 1000; // rate sampling; runs only while connected

// Pressure zones by fill fraction. Order matters (checked high → low).
const ZONES = [
  { id: "critical", from: 0.9, label: "critical" },
  { id: "high", from: 0.75, label: "high" },
  { id: "elevated", from: 0.5, label: "elevated" },
  { id: "nominal", from: 0.0, label: "nominal" },
];
const zoneFor = (depth) => {
  const f = depth / CAPACITY;
  return ZONES.find((z) => f >= z.from) || ZONES[ZONES.length - 1];
};

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const now = () =>
  new Date().toLocaleTimeString("en-GB", { hour12: false }) +
  "." +
  String(Date.now() % 1000).padStart(3, "0");

let LOG_SEQ = 0;

export default function WebhookGatewayConsole() {
  const [connected, setConnected] = useState(true);
  const [paused, setPaused] = useState(false);
  const [workers, setWorkers] = useState(4);
  const [depth, setDepth] = useState(0);
  const [venting, setVenting] = useState(false);
  const [uptime, setUptime] = useState(0);
  const [rates, setRates] = useState({ in: 0, out: 0 });
  const [busy, setBusy] = useState({ x1: false, x10: false });
  const [metrics, setMetrics] = useState({ processed: 0, dead: 0, rejected: 0 });
  const [log, setLog] = useState([]);

  // Refs the interval reads without re-subscribing.
  const depthRef = useRef(0);
  const workersRef = useRef(workers);
  const pausedRef = useRef(paused);
  const inWindow = useRef(0); // accepted since last poll
  const outWindow = useRef(0); // drained since last poll
  const ventTimer = useRef(null);

  useEffect(() => void (depthRef.current = depth), [depth]);
  useEffect(() => void (workersRef.current = workers), [workers]);
  useEffect(() => void (pausedRef.current = paused), [paused]);

  const pushLog = (type, detail) =>
    setLog((prev) =>
      [{ id: ++LOG_SEQ, t: now(), type, detail }, ...prev].slice(0, 120)
    );

  const vent = () => {
    setVenting(true);
    if (ventTimer.current) clearTimeout(ventTimer.current);
    ventTimer.current = setTimeout(() => setVenting(false), 520);
  };

  // Processing loop + uptime + rate sampling — all gated on `connected`.
  useEffect(() => {
    if (!connected) return;
    setUptime(0);

    const tick = setInterval(() => {
      if (pausedRef.current) return;
      const drain = Math.min(workersRef.current, depthRef.current);
      if (drain <= 0) return;
      outWindow.current += drain;
      setDepth((d) => clamp(d - drain, 0, CAPACITY));
      setMetrics((m) => {
        // A small share of processed items fail (dead-letter).
        const dead = [...Array(drain)].reduce((n) => n + (Math.random() < 0.04 ? 1 : 0), 0);
        return { ...m, processed: m.processed + (drain - dead), dead: m.dead + dead };
      });
    }, TICK_MS);

    const clock = setInterval(() => setUptime((s) => s + 1), 1000);

    const poll = setInterval(() => {
      const inPerSec = inWindow.current * (1000 / POLL_MS);
      const outPerSec = outWindow.current * (1000 / POLL_MS);
      inWindow.current = 0;
      outWindow.current = 0;
      setRates({ in: Math.round(inPerSec), out: Math.round(outPerSec) });
    }, POLL_MS);

    return () => {
      clearInterval(tick);
      clearInterval(clock);
      clearInterval(poll);
      setRates({ in: 0, out: 0 });
    };
  }, [connected]);

  // Send N test webhooks. Optimistic accept, reconciled against capacity:
  // items that fit return 202, the overflow returns 429.
  const send = async (n, key) => {
    if (!connected || busy[key]) return;
    setBusy((b) => ({ ...b, [key]: true }));

    const space = CAPACITY - depthRef.current;
    const accepted = clamp(n, 0, space);
    const rejected = n - accepted;

    await new Promise((r) => setTimeout(r, 140)); // round-trip

    if (accepted > 0) {
      inWindow.current += accepted;
      setDepth((d) => clamp(d + accepted, 0, CAPACITY));
      pushLog("accepted", `${accepted} queued · 202`);
    }
    if (rejected > 0) {
      setMetrics((m) => ({ ...m, rejected: m.rejected + rejected }));
      pushLog("rejected", `${rejected} refused · 429 queue full`);
      vent();
    }
    setBusy((b) => ({ ...b, [key]: false }));
  };

  const toggleConnection = () => {
    setConnected((c) => {
      const next = !c;
      pushLog(next ? "link" : "link", next ? "gateway connected" : "gateway disconnected");
      if (!next) setPaused(false);
      return next;
    });
  };

  const zone = zoneFor(depth);
  const fillPct = (depth / CAPACITY) * 100;
  const uptimeStr = useMemo(() => {
    const h = String(Math.floor(uptime / 3600)).padStart(2, "0");
    const m = String(Math.floor((uptime % 3600) / 60)).padStart(2, "0");
    const s = String(uptime % 60).padStart(2, "0");
    return `${h}:${m}:${s}`;
  }, [uptime]);

  // Load fonts once. FixelPont is the intended display face; Pixelify Sans is a
  // free stand-in. To use FixelPont, replace --font-display in the CSS below.
  useEffect(() => {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href =
      "https://fonts.googleapis.com/css2?family=Pixelify+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap";
    document.head.appendChild(l);
    return () => void document.head.removeChild(l);
  }, []);

  return (
    <div className="wg-root" data-zone={zone.id}>
      <style>{CSS}</style>

      <div className="wg-panel">
        {/* Status bar */}
        <header className="wg-bar">
          <div className="wg-mark">
            <span className="wg-mark-name">GATEWAY</span>
            <span className="wg-mark-sub">webhook backpressure monitor</span>
          </div>
          <div className="wg-bar-right">
            <div className="wg-throughput" title="Accepted / drained per second">
              <span><b>{rates.in}</b>/s in</span>
              <span className="wg-sep" />
              <span><b>{rates.out}</b>/s out</span>
            </div>
            <div className="wg-uptime">
              <span className="wg-cap">uptime</span>
              <span className="wg-mono">{connected ? uptimeStr : "--:--:--"}</span>
            </div>
            <button
              className={`wg-conn ${connected ? "is-on" : "is-off"}`}
              onClick={toggleConnection}
            >
              <span className="wg-conn-dot" />
              {connected ? "connected" : "disconnected"}
            </button>
          </div>
        </header>

        <div className="wg-grid">
          {/* Control rail */}
          <section className="wg-rail" aria-label="controls">
            <div className="wg-block">
              <h2 className="wg-h">Send test webhooks</h2>
              <div className="wg-btns">
                <button
                  className="wg-btn wg-btn-primary"
                  disabled={!connected}
                  data-busy={busy.x1}
                  onClick={() => send(1, "x1")}
                >
                  <span className="wg-btn-label">Send 1</span>
                  <span className="wg-spin" aria-hidden />
                </button>
                <button
                  className="wg-btn wg-btn-primary"
                  disabled={!connected}
                  data-busy={busy.x10}
                  onClick={() => send(10, "x10")}
                >
                  <span className="wg-btn-label">Send 10</span>
                  <span className="wg-spin" aria-hidden />
                </button>
              </div>
              <p className="wg-hint">
                Fills the queue faster than workers drain it. Spam Send 10 to reach 429.
              </p>
            </div>

            <div className="wg-block">
              <h2 className="wg-h">Workers</h2>
              <div className="wg-stepper">
                <button
                  className="wg-btn wg-btn-ghost"
                  disabled={!connected || workers <= 1}
                  onClick={() => setWorkers((w) => clamp(w - 1, 1, 12))}
                >
                  –
                </button>
                <span className="wg-stepper-val wg-mono">{workers}</span>
                <button
                  className="wg-btn wg-btn-ghost"
                  disabled={!connected || workers >= 12}
                  onClick={() => setWorkers((w) => clamp(w + 1, 1, 12))}
                >
                  +
                </button>
              </div>
              <button
                className="wg-btn wg-btn-ghost wg-wide"
                disabled={!connected}
                onClick={() => setPaused((p) => !p)}
              >
                {paused ? "Resume draining" : "Pause draining"}
              </button>
            </div>

            <div className="wg-block wg-readout">
              <div className="wg-stat">
                <span className="wg-cap">Processed</span>
                <span className="wg-mono wg-num">{metrics.processed}</span>
              </div>
              <div className="wg-stat">
                <span className="wg-cap">Dead-lettered</span>
                <span className="wg-mono wg-num">{metrics.dead}</span>
              </div>
              <div className="wg-stat">
                <span className="wg-cap">429 refused</span>
                <span className="wg-mono wg-num">{metrics.rejected}</span>
              </div>
            </div>
          </section>

          {/* Pressure column — the queue as a bounded vessel */}
          <section className="wg-vessel-wrap" aria-label="queue pressure">
            <div className={`wg-valve ${venting ? "is-venting" : ""}`}>
              <span className="wg-valve-cap">relief valve</span>
              <span className="wg-valve-state">{venting ? "venting 429" : "seated"}</span>
            </div>

            <div className="wg-vessel">
              <div className="wg-fill" style={{ height: `${fillPct}%` }} />
              {[90, 75, 50].map((mark) => (
                <div key={mark} className="wg-mark-line" style={{ bottom: `${mark}%` }}>
                  <span className="wg-mark-num wg-mono">{mark}</span>
                </div>
              ))}
            </div>

            <div className="wg-vessel-read">
              <div className="wg-depth">
                <span className="wg-depth-num">{depth}</span>
                <span className="wg-depth-cap">/ {CAPACITY} slots</span>
              </div>
              <div className="wg-zone">
                <span className="wg-zone-dot" />
                {zone.label} pressure
              </div>
            </div>
          </section>

          {/* Event log — real events, newest first */}
          <section className="wg-log" aria-label="event log">
            <div className="wg-log-head">
              <h2 className="wg-h">Events</h2>
              <button
                className="wg-btn wg-btn-ghost wg-btn-sm"
                onClick={() => setLog([])}
                disabled={log.length === 0}
              >
                Clear
              </button>
            </div>
            <div className="wg-log-body">
              {log.length === 0 ? (
                <p className="wg-log-empty">
                  No events yet. Send a test webhook to see it land in the queue.
                </p>
              ) : (
                log.map((e) => (
                  <div key={e.id} className={`wg-log-row wg-row-${e.type}`}>
                    <span className="wg-log-t wg-mono">{e.t}</span>
                    <span className="wg-log-tag">{e.type}</span>
                    <span className="wg-log-detail">{e.detail}</span>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

const CSS = `
.wg-root{
  /* Painted-steel instrument housing — slate, not pure black. */
  --bg:#12141C; --panel:#191C27; --panel-2:#212533; --panel-3:#171A24;
  --line:#2E3346; --line-soft:#242939;
  --ink:#EAECF3; --ink-2:#9298AD; --ink-3:#5C6277;
  --action:#EDEFF5; --action-ink:#14161C;

  /* Pressure ramp (cold -> hot). Used only to encode queue depth. */
  --z-nominal:#4E86E0; --z-elevated:#E0A23D; --z-high:#E5793B; --z-critical:#E5484D;
  --pressure:var(--z-nominal);

  /* FixelPont is the intended display face; swap it in here when licensed. */
  --font-display:'Pixelify Sans', ui-monospace, monospace;
  --font-body:'IBM Plex Sans', system-ui, sans-serif;
  --font-mono:'IBM Plex Mono', ui-monospace, monospace;

  --r:10px; --r-sm:7px;

  min-height:100vh; box-sizing:border-box; padding:clamp(14px,3vw,34px);
  background:var(--bg); color:var(--ink); font-family:var(--font-body);
  -webkit-font-smoothing:antialiased;
}
.wg-root[data-zone="elevated"]{ --pressure:var(--z-elevated); }
.wg-root[data-zone="high"]{ --pressure:var(--z-high); }
.wg-root[data-zone="critical"]{ --pressure:var(--z-critical); }
.wg-root *{ box-sizing:border-box; }

.wg-panel{
  max-width:1200px; margin:0 auto; background:var(--panel);
  border:1px solid var(--line); border-radius:var(--r); overflow:hidden;
}

/* Status bar */
.wg-bar{
  display:flex; align-items:center; justify-content:space-between; gap:16px;
  padding:14px 18px; background:var(--panel-3); border-bottom:1px solid var(--line);
  flex-wrap:wrap;
}
.wg-mark{ display:flex; flex-direction:column; line-height:1; }
.wg-mark-name{
  font-family:var(--font-display); font-size:22px; font-weight:700;
  letter-spacing:.02em; color:var(--ink);
}
.wg-mark-sub{ margin-top:6px; font-size:12px; color:var(--ink-3); letter-spacing:.02em; }
.wg-bar-right{ display:flex; align-items:center; gap:18px; flex-wrap:wrap; }
.wg-throughput{ display:flex; align-items:center; gap:10px; font-size:13px; color:var(--ink-2); }
.wg-throughput b{ font-family:var(--font-mono); color:var(--ink); font-weight:600; }
.wg-sep{ width:1px; height:12px; background:var(--line); }
.wg-uptime{ display:flex; flex-direction:column; align-items:flex-end; line-height:1.3; }
.wg-uptime .wg-mono{ font-size:13px; color:var(--ink); }

.wg-cap{ font-size:10px; letter-spacing:.14em; text-transform:uppercase; color:var(--ink-3); }
.wg-mono{ font-family:var(--font-mono); font-variant-numeric:tabular-nums; }

.wg-conn{
  display:inline-flex; align-items:center; gap:8px; cursor:pointer;
  padding:7px 12px; border-radius:var(--r-sm); font-size:13px; font-weight:500;
  background:var(--panel-2); color:var(--ink); border:1px solid var(--line);
  transition:border-color .15s, background .15s;
}
.wg-conn:hover{ border-color:#3b4260; }
.wg-conn-dot{ width:8px; height:8px; border-radius:2px; background:var(--ink-3); }
.wg-conn.is-on .wg-conn-dot{ background:var(--z-nominal); }
.wg-conn.is-off{ color:var(--ink-2); }

/* Grid: control rail · vessel · log */
.wg-grid{
  display:grid; grid-template-columns:250px 1fr 320px; gap:1px;
  background:var(--line-soft);
}
.wg-rail,.wg-vessel-wrap,.wg-log{ background:var(--panel); padding:18px; }

.wg-block{ padding-bottom:18px; margin-bottom:18px; border-bottom:1px solid var(--line-soft); }
.wg-block:last-child{ border-bottom:0; margin-bottom:0; padding-bottom:0; }
.wg-h{
  margin:0 0 12px; font-size:12px; font-weight:600; letter-spacing:.04em;
  color:var(--ink-2); text-transform:uppercase;
}

.wg-btns{ display:grid; grid-template-columns:1fr 1fr; gap:8px; }
.wg-btn{
  position:relative; font-family:var(--font-body); font-size:13px; font-weight:600;
  border-radius:var(--r-sm); padding:10px 12px; cursor:pointer; border:1px solid transparent;
  transition:transform .1s, background .15s, border-color .15s, opacity .15s;
}
.wg-btn:active{ transform:translateY(1px); }
.wg-btn:disabled{ opacity:.4; cursor:not-allowed; }
.wg-btn:focus-visible{ outline:2px solid var(--z-nominal); outline-offset:2px; }
.wg-btn-primary{ background:var(--action); color:var(--action-ink); }
.wg-btn-primary:hover:not(:disabled){ background:#fff; }
.wg-btn-ghost{ background:var(--panel-2); color:var(--ink); border-color:var(--line); }
.wg-btn-ghost:hover:not(:disabled){ border-color:#3b4260; }
.wg-btn-sm{ padding:5px 10px; font-size:12px; font-weight:500; }
.wg-wide{ width:100%; margin-top:8px; }

.wg-btn-label{ transition:opacity .12s; }
.wg-btn[data-busy="true"] .wg-btn-label{ opacity:0; }
.wg-spin{
  position:absolute; inset:0; margin:auto; width:14px; height:14px; opacity:0;
  border:2px solid rgba(20,22,28,.25); border-top-color:var(--action-ink);
  border-radius:50%;
}
.wg-btn[data-busy="true"] .wg-spin{ opacity:1; animation:wg-rot .6s linear infinite; }

.wg-hint{ margin:12px 0 0; font-size:12px; line-height:1.5; color:var(--ink-3); }

.wg-stepper{ display:flex; align-items:center; gap:8px; }
.wg-stepper .wg-btn-ghost{ width:38px; height:38px; font-size:18px; padding:0; }
.wg-stepper-val{ flex:1; text-align:center; font-size:20px; color:var(--ink); }

.wg-readout{ display:flex; flex-direction:column; gap:12px; }
.wg-stat{ display:flex; align-items:baseline; justify-content:space-between; }
.wg-num{ font-size:18px; color:var(--ink); }

/* Pressure vessel */
.wg-vessel-wrap{
  display:flex; flex-direction:column; align-items:center; gap:14px;
  background:var(--panel-3);
}
.wg-valve{
  display:flex; flex-direction:column; align-items:center; gap:3px;
  padding:8px 16px 10px; border:1px solid var(--line); border-bottom:0;
  border-radius:var(--r-sm) var(--r-sm) 0 0; background:var(--panel-2);
  transition:border-color .2s, background .2s;
}
.wg-valve-cap{ font-size:10px; letter-spacing:.12em; text-transform:uppercase; color:var(--ink-3); }
.wg-valve-state{ font-family:var(--font-mono); font-size:12px; color:var(--ink-2); }
.wg-valve.is-venting{ border-color:var(--z-critical); background:#2a1e24; }
.wg-valve.is-venting .wg-valve-state{ color:var(--z-critical); animation:wg-vent .52s ease-out; }

.wg-vessel{
  position:relative; width:min(200px,42vw); height:min(360px,46vh); min-height:240px;
  border:1px solid var(--line); border-radius:6px; background:
    repeating-linear-gradient(0deg,transparent,transparent 11px,rgba(255,255,255,.015) 11px,rgba(255,255,255,.015) 12px),
    var(--panel);
  overflow:hidden;
}
.wg-fill{
  position:absolute; left:0; right:0; bottom:0; background:var(--pressure);
  transition:height .22s ease-out, background-color .4s ease;
  box-shadow:0 -1px 0 rgba(255,255,255,.25) inset;
}
.wg-mark-line{
  position:absolute; left:0; right:0; height:0; border-top:1px dashed var(--line);
  pointer-events:none;
}
.wg-mark-num{
  position:absolute; right:6px; top:-8px; font-size:11px; color:var(--ink-3);
  background:var(--panel-3); padding:0 3px;
}
.wg-vessel-read{ display:flex; flex-direction:column; align-items:center; gap:8px; }
.wg-depth{ display:flex; align-items:baseline; gap:8px; }
.wg-depth-num{
  font-family:var(--font-display); font-size:clamp(48px,9vw,76px); font-weight:700;
  line-height:.8; color:var(--pressure); transition:color .4s ease;
}
.wg-depth-cap{ font-size:14px; color:var(--ink-2); }
.wg-zone{
  display:inline-flex; align-items:center; gap:8px; font-size:13px; color:var(--ink-2);
  text-transform:capitalize;
}
.wg-zone-dot{ width:9px; height:9px; border-radius:2px; background:var(--pressure); transition:background .4s ease; }

/* Event log */
.wg-log{ display:flex; flex-direction:column; min-height:0; }
.wg-log-head{ display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; }
.wg-log-head .wg-h{ margin:0; }
.wg-log-body{
  flex:1; overflow-y:auto; display:flex; flex-direction:column; gap:1px;
  max-height:520px; margin:0 -4px; padding:0 4px;
}
.wg-log-empty{ font-size:13px; line-height:1.5; color:var(--ink-3); margin:4px 0; }
.wg-log-row{
  display:grid; grid-template-columns:auto auto 1fr; gap:10px; align-items:baseline;
  padding:7px 8px; border-radius:5px; font-size:12.5px; animation:wg-in .18s ease-out;
}
.wg-log-t{ color:var(--ink-3); font-size:11px; }
.wg-log-tag{
  font-family:var(--font-mono); font-size:10px; letter-spacing:.06em; text-transform:uppercase;
  padding:2px 6px; border-radius:4px; background:var(--panel-2); color:var(--ink-2);
}
.wg-log-detail{ color:var(--ink); }
.wg-row-accepted .wg-log-tag{ color:var(--z-nominal); }
.wg-row-rejected .wg-log-tag{ color:var(--z-critical); }
.wg-row-rejected .wg-log-detail{ color:var(--z-critical); }
.wg-row-link .wg-log-tag{ color:var(--ink-2); }

@keyframes wg-rot{ to{ transform:rotate(360deg); } }
@keyframes wg-in{ from{ opacity:0; transform:translateY(-3px); } to{ opacity:1; transform:none; } }
@keyframes wg-vent{ 0%{ transform:scale(1); } 30%{ transform:scale(1.06); } 100%{ transform:scale(1); } }

@media (max-width:900px){
  .wg-grid{ grid-template-columns:1fr; }
  .wg-vessel-wrap{ order:-1; }
  .wg-log-body{ max-height:300px; }
}
@media (prefers-reduced-motion:reduce){
  .wg-fill,.wg-depth-num,.wg-zone-dot,.wg-btn{ transition:none; }
  .wg-spin,.wg-log-row,.wg-valve.is-venting .wg-valve-state{ animation:none; }
}
`;
