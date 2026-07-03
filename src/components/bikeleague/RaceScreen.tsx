// ─────────────────────────────────────────────────────────────────────────────
// Freewheeler Bike League — race screen
//
// Mounts the GameEngine, renders the HUD + touch steering overlay, and bridges
// the multiplayer channel to the engine. Steering is on-screen hold buttons
// (Wattbike Protons have no handlebars); pedalling power drives forward speed.
// Keyboard (arrows + space) works too for desktop testing.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from 'react';
import type { TrackDef, RaceHudData, RaceFinishData, ItemType } from '@/game/types';
import { GameEngine } from '@/game/engine';
import { ITEM_INFO } from '@/game/items';
import type { LiveMetrics } from '@/hooks/useWattbikeBluetooth';
import type { UseRaceChannelReturn } from '@/hooks/useRaceChannel';

interface Props {
  track: TrackDef;
  playerId: string;
  playerName: string;
  colorIndex: number;
  gridSlot: number;
  simMode: boolean;
  metrics: LiveMetrics;
  channel: UseRaceChannelReturn | null; // null = solo race
  onFinish: (data: RaceFinishData) => void;
  onQuit: () => void;
}

const fmtTime = (s: number | null) =>
  s === null ? '—:—' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export default function RaceScreen({
  track, playerId, playerName, colorIndex, gridSlot, simMode, metrics, channel, onFinish, onQuit,
}: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const minimapRef = useRef<HTMLCanvasElement>(null);
  const steerRef = useRef(0);
  const finishOrderRef = useRef<string[]>([]);
  const crossedRef = useRef(false);
  const simPowerRef = useRef(140);

  const [hud, setHud] = useState<RaceHudData | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [go, setGo] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [crossed, setCrossed] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);

  const metricsRef = useRef(metrics);
  metricsRef.current = metrics;
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;
  const channelRef = useRef(channel);
  channelRef.current = channel;

  if (channel) finishOrderRef.current = channel.finishOrder;

  const showFlash = useCallback((msg: string) => {
    setFlash(msg);
    setTimeout(() => setFlash(null), 1800);
  }, []);

  // ── Engine lifecycle ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mountRef.current) return;

    const engine = new GameEngine(mountRef.current, track, {
      playerId, playerName, colorIndex,
      getFinishOrder: () => finishOrderRef.current,
      events: {
        onHud: setHud,
        onLap: (lap, lapTime) => {
          if (lap < track.laps) showFlash(`LAP ${lap + 1}/${track.laps} — ${fmtTime(lapTime)}`);
          else showFlash('FINAL LAP!');
        },
        onItemPickup: (item: ItemType) => showFlash(`${ITEM_INFO[item].emoji} ${ITEM_INFO[item].label.toUpperCase()}!`),
        onFinish: (data) => onFinishRef.current(data),
        onNetState: (s) => channelRef.current?.sendState(s),
        onDropHazard: (h) => channelRef.current?.sendHazard(h),
        onZap: (targetId) => channelRef.current?.sendZap(targetId),
        onFinishLine: (time) => {
          crossedRef.current = true;
          setCrossed(true);
          if (channelRef.current) {
            channelRef.current.sendCross(time);
          } else {
            finishOrderRef.current = [playerId];
            engine.emitFinish([playerId]);
          }
        },
      },
    });
    engine.setGridSlot(gridSlot);
    engineRef.current = engine;

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track.id]);

  // ── Multiplayer bridge ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!channel) return;
    channel.setCallbacks({
      onState: (s) => engineRef.current?.applyNetState(s),
      onHazard: (h) => engineRef.current?.addHazard(h),
      onZap: () => { engineRef.current?.applyZapToMe(); showFlash('⚡ ZAPPED!'); },
      onCountdown: (n) => setCountdown(n),
      onGo: () => beginRace(),
      onCross: () => {
        // finishOrder state updates via the hook; emit my result once I've crossed
        if (crossedRef.current) {
          engineRef.current?.emitFinish(finishOrderRef.current);
        }
      },
      onPeerLeft: () => setReconnecting(false),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel]);

  // Once my cross is reflected in the shared finish order, emit the result
  useEffect(() => {
    if (crossed && channel && channel.finishOrder.includes(playerId)) {
      finishOrderRef.current = channel.finishOrder;
      engineRef.current?.emitFinish(channel.finishOrder);
    }
  }, [crossed, channel, channel?.finishOrder, playerId]);

  useEffect(() => {
    if (channel) setReconnecting(!channel.connectionOk);
  }, [channel, channel?.connectionOk]);

  const beginRace = useCallback(() => {
    setCountdown(null);
    setGo(true);
    setTimeout(() => setGo(false), 1200);
    engineRef.current?.startRace();
  }, []);

  // Solo: run our own countdown on mount
  useEffect(() => {
    if (channel) return;
    let n = 3;
    setCountdown(n);
    const iv = setInterval(() => {
      n -= 1;
      if (n > 0) setCountdown(n);
      else { clearInterval(iv); beginRace(); }
    }, 1000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel]);

  // ── Rider input pump (Wattbike or sim) ─────────────────────────────────────
  useEffect(() => {
    const iv = setInterval(() => {
      const engine = engineRef.current;
      if (!engine) return;
      if (simMode) {
        // Gentle wandering power so solo dev/testing feels alive
        simPowerRef.current += (Math.random() - 0.5) * 8;
        simPowerRef.current = Math.min(Math.max(simPowerRef.current, 90), 230);
        engine.setRiderInput(simPowerRef.current, 82 + Math.random() * 8, 0);
      } else {
        const m = metricsRef.current;
        engine.setRiderInput(m.power, m.cadence, m.heartRate);
      }
    }, 100);
    return () => clearInterval(iv);
  }, [simMode]);

  // ── Steering + item input ──────────────────────────────────────────────────
  const setSteer = useCallback((v: number) => {
    steerRef.current = v;
    engineRef.current?.setSteer(v);
  }, []);

  const fireItem = useCallback(() => {
    const used = engineRef.current?.useItem();
    if (used) showFlash(`${ITEM_INFO[used].emoji} ${ITEM_INFO[used].label.toUpperCase()} USED`);
  }, [showFlash]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') setSteer(-1);
      if (e.key === 'ArrowRight') setSteer(1);
      if (e.key === ' ') { e.preventDefault(); fireItem(); }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && steerRef.current < 0) setSteer(0);
      if (e.key === 'ArrowRight' && steerRef.current > 0) setSteer(0);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [setSteer, fireItem]);

  // ── Minimap ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = minimapRef.current;
    const engine = engineRef.current;
    if (!canvas || !engine || !hud) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { outline, karts } = engine.minimap();
    const W = canvas.width, H = canvas.height, pad = 12;
    const sx = (x: number) => pad + x * (W - pad * 2);
    const sy = (y: number) => pad + y * (H - pad * 2);
    ctx.clearRect(0, 0, W, H);
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    outline.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(sx(x), sy(y)) : ctx.lineTo(sx(x), sy(y))));
    ctx.closePath();
    ctx.stroke();
    for (const k of [...karts].reverse()) {
      ctx.beginPath();
      ctx.fillStyle = `#${k.color.toString(16).padStart(6, '0')}`;
      ctx.arc(sx(k.x), sy(k.y), k.me ? 6 : 4.5, 0, Math.PI * 2);
      ctx.fill();
      if (k.me) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); }
    }
  }, [hud]);

  const posSuffix = (p: number) => (p === 1 ? 'ST' : p === 2 ? 'ND' : p === 3 ? 'RD' : 'TH');
  const holdBtn = 'select-none touch-none flex items-center justify-center rounded-full border-4 active:scale-95 transition-transform';

  return (
    <div className="relative w-full h-full overflow-hidden bg-black">
      <div ref={mountRef} className="absolute inset-0" />

      {/* ── Top HUD bar ── */}
      <div className="absolute top-0 inset-x-0 flex items-start justify-between p-3 pointer-events-none z-10">
        {/* Position + lap */}
        <div className="flex items-center gap-3">
          <div className="bg-black/70 backdrop-blur px-4 py-2 border-2 border-brand-neon">
            <span className="font-display text-5xl leading-none text-brand-neon">{hud?.position ?? 1}</span>
            <span className="font-display text-xl text-brand-neon/80">{posSuffix(hud?.position ?? 1)}</span>
            <span className="ml-2 text-white/60 text-sm font-body">/ {hud?.totalKarts ?? 1}</span>
          </div>
          <div className="bg-black/70 backdrop-blur px-4 py-2 border border-white/20">
            <div className="text-[10px] uppercase tracking-widest text-white/50 font-body">Lap</div>
            <div className="font-display text-2xl text-white leading-none">
              {hud?.lap ?? 1}<span className="text-white/50 text-base">/{track.laps}</span>
            </div>
          </div>
          <div className="bg-black/70 backdrop-blur px-4 py-2 border border-white/20">
            <div className="text-[10px] uppercase tracking-widest text-white/50 font-body">Time</div>
            <div className="font-display text-2xl text-white leading-none">{fmtTime(hud?.elapsed ?? 0)}</div>
          </div>
        </div>

        {/* Live bike metrics */}
        <div className="flex items-center gap-2">
          {[
            [`${(hud?.speedKmh ?? 0).toFixed(0)}`, 'km/h'],
            [`${Math.round(hud?.powerW ?? 0)}`, 'watts'],
            [`${Math.round(hud?.cadenceRpm ?? 0)}`, 'rpm'],
          ].map(([v, u]) => (
            <div key={u} className="bg-black/70 backdrop-blur px-3 py-2 border border-white/20 text-center min-w-[72px]">
              <div className="font-display text-2xl text-white leading-none">{v}</div>
              <div className="text-[10px] uppercase tracking-widest text-white/50 font-body">{u}</div>
            </div>
          ))}
          <canvas ref={minimapRef} width={150} height={150} className="bg-black/60 border border-white/20 ml-1" />
        </div>
      </div>

      {/* ── Status pills ── */}
      <div className="absolute top-24 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 z-10 pointer-events-none">
        {hud?.boosting && <div className="px-4 py-1 bg-brand-neon text-brand-dark font-display text-sm tracking-wider">🚀 TURBO</div>}
        {hud?.drafting && !hud?.boosting && <div className="px-4 py-1 bg-sky-400 text-black font-display text-sm tracking-wider">🌬 DRAFT +12%</div>}
        {hud?.slowed && <div className="px-4 py-1 bg-red-500 text-white font-display text-sm tracking-wider">🛢 SLOWED</div>}
        {hud?.offTrack && !hud?.slowed && <div className="px-4 py-1 bg-orange-500 text-black font-display text-sm tracking-wider">⚠ WALL SCRAPE</div>}
        {reconnecting && <div className="px-4 py-1 bg-yellow-400 text-black font-display text-sm tracking-wider animate-pulse">RECONNECTING…</div>}
      </div>

      {/* ── Flash messages ── */}
      {flash && (
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
          <div className="font-display text-4xl text-white bg-black/60 px-8 py-3 border-2 border-brand-neon animate-in fade-in zoom-in duration-200">
            {flash}
          </div>
        </div>
      )}

      {/* ── Countdown / GO ── */}
      {countdown !== null && (
        <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none">
          <div className="font-display text-[11rem] leading-none text-brand-neon drop-shadow-[0_0_40px_rgba(196,245,60,0.8)]">
            {countdown}
          </div>
        </div>
      )}
      {go && (
        <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none">
          <div className="font-display text-[10rem] leading-none text-brand-neon drop-shadow-[0_0_50px_rgba(196,245,60,0.9)]">GO!</div>
        </div>
      )}

      {/* ── Crossed the line, waiting for others ── */}
      {crossed && (
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 z-20 pointer-events-none text-center">
          <div className="font-display text-6xl text-brand-neon drop-shadow-[0_0_30px_rgba(196,245,60,0.7)]">FINISHED!</div>
          {channel && channel.finishOrder.length < channel.players.length && (
            <div className="mt-2 font-body text-white/80 bg-black/50 px-4 py-1">Waiting for other riders…</div>
          )}
        </div>
      )}

      {/* ── Bottom controls: steer left · charge/item · steer right ── */}
      <div className="absolute bottom-0 inset-x-0 z-10 flex items-end justify-between p-4 pb-6">
        <button
          className={`${holdBtn} w-32 h-32 md:w-40 md:h-40 bg-black/50 border-white/40 text-white`}
          onPointerDown={(e) => { e.preventDefault(); setSteer(-1); }}
          onPointerUp={() => setSteer(0)}
          onPointerLeave={() => { if (steerRef.current < 0) setSteer(0); }}
          onContextMenu={(e) => e.preventDefault()}
          aria-label="Steer left"
        >
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none"><path d="M15 4 L7 12 L15 20" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>

        <div className="flex flex-col items-center gap-2">
          {/* Sprint-charge meter */}
          <div className="w-44 h-2.5 bg-white/15 overflow-hidden rounded-full">
            <div
              className={`h-full transition-[width] duration-150 ${((hud?.charge ?? 0) > 0.8) ? 'bg-brand-neon animate-pulse' : 'bg-brand-neon/70'}`}
              style={{ width: `${(hud?.charge ?? 0) * 100}%` }}
            />
          </div>
          <div className="text-[10px] uppercase tracking-widest text-white/50 font-body -mt-1">Sprint charge</div>
          {/* Item button */}
          <button
            className={`${holdBtn} w-24 h-24 md:w-28 md:h-28 ${hud?.item ? 'bg-brand-neon border-white text-brand-dark' : 'bg-black/50 border-white/25 text-white/30'}`}
            onPointerDown={(e) => { e.preventDefault(); fireItem(); }}
            aria-label="Use item"
          >
            {hud?.item
              ? <span className="text-5xl leading-none">{ITEM_INFO[hud.item].emoji}</span>
              : <span className="font-display text-xs tracking-wider">NO ITEM</span>}
          </button>
        </div>

        <button
          className={`${holdBtn} w-32 h-32 md:w-40 md:h-40 bg-black/50 border-white/40 text-white`}
          onPointerDown={(e) => { e.preventDefault(); setSteer(1); }}
          onPointerUp={() => setSteer(0)}
          onPointerLeave={() => { if (steerRef.current > 0) setSteer(0); }}
          onContextMenu={(e) => e.preventDefault()}
          aria-label="Steer right"
        >
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none"><path d="M9 4 L17 12 L9 20" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
      </div>

      {/* ── Race progress bar ── */}
      <div className="absolute bottom-1 inset-x-8 z-10 pointer-events-none">
        <div className="h-1 bg-white/10">
          <div className="h-full bg-brand-neon transition-[width] duration-300" style={{ width: `${hud?.progressPct ?? 0}%` }} />
        </div>
      </div>

      {/* Quit */}
      <button
        onClick={onQuit}
        className="absolute top-3 left-1/2 -translate-x-1/2 z-10 text-white/40 hover:text-white text-xs font-body uppercase tracking-widest bg-black/40 px-3 py-1"
      >
        ✕ Quit race
      </button>
    </div>
  );
}
