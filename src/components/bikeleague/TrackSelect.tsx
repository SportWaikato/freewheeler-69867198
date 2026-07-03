// Freewheeler Bike League — course select. Arcade-style cards, one per TrackDef.
import type { TrackDef } from '@/game/types';
import { TRACKS } from '@/data/tracks';
import { THEMES } from '@/game/themes';

interface Props {
  onSelect: (track: TrackDef) => void;
  onBack: () => void;
}

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

function TrackCard({ track, onSelect }: { track: TrackDef; onSelect: () => void }) {
  const theme = THEMES[track.themeId];
  const sky = `linear-gradient(180deg, ${hex(theme.skyTop)} 0%, ${hex(theme.skyBottom)} 70%, ${hex(theme.groundColor)} 70.5%, ${hex(theme.groundColor)} 100%)`;
  return (
    <button
      onClick={onSelect}
      className="group text-left border-2 border-brand-dark bg-card hover:border-brand-neon hover:-translate-y-1 transition-all shadow-[6px_6px_0_0_hsl(var(--brand-dark))]"
    >
      {/* Theme art panel */}
      <div className="relative h-40 overflow-hidden" style={{ background: sky }}>
        {/* Stylised track ribbon */}
        <svg viewBox="0 0 200 90" className="absolute bottom-0 w-full" preserveAspectRatio="none">
          <path d="M -10 90 C 40 40 90 75 120 55 C 150 35 170 60 210 45 L 210 90 Z"
            fill={hex(theme.palette.road)} opacity="0.92" />
          <path d="M -10 90 C 40 42 90 77 120 57 C 150 37 170 62 210 47"
            stroke={hex(theme.palette.kerbA)} strokeWidth="2.5" strokeDasharray="6 5" fill="none" />
        </svg>
        <div className="absolute top-2 right-2 flex gap-0.5">
          {[1, 2, 3].map(i => (
            <span key={i} className={`font-display text-lg ${i <= track.difficulty ? 'text-brand-neon' : 'text-black/25'}`}>▲</span>
          ))}
        </div>
        <div className="absolute bottom-2 left-3 right-3">
          <div className="font-display text-2xl uppercase leading-none text-white drop-shadow-[2px_2px_0_rgba(0,0,0,0.7)]">
            {track.name}
          </div>
        </div>
      </div>
      <div className="p-3 space-y-2">
        <p className="font-body text-sm text-muted-foreground">{track.tagline}</p>
        <div className="flex gap-3 text-xs font-body text-foreground/70">
          <span>🏁 {track.laps} laps</span>
          <span>⛰ {track.elevGainPerLapM} m/lap</span>
          <span>⏱ par {Math.floor(track.parTimeSeconds / 60)}:{String(track.parTimeSeconds % 60).padStart(2, '0')}</span>
        </div>
        <div className="font-display text-sm uppercase tracking-wider text-brand-green group-hover:text-brand-dark">
          Ride it →
        </div>
      </div>
    </button>
  );
}

export default function TrackSelect({ onSelect, onBack }: Props) {
  return (
    <div className="min-h-screen bg-brand-dark text-white">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <button onClick={onBack} className="font-body text-sm text-white/60 hover:text-brand-neon uppercase tracking-widest mb-6">
          ← Back to Ride
        </button>
        <div className="mb-8">
          <div className="tape-element mb-3">Game on</div>
          <h1 className="font-display text-6xl md:text-7xl uppercase leading-none text-brand-neon">Freewheeler Bike League</h1>
          <p className="font-body text-white/70 mt-2 max-w-xl">
            Pick a course. Pedal hard for speed, steer with the buttons, grab item boxes, boost past your mates.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-6">
          {TRACKS.map(t => <TrackCard key={t.id} track={t} onSelect={() => onSelect(t)} />)}
        </div>
        <p className="font-body text-xs text-white/40 mt-8">New courses drop every season — keep an eye on this screen.</p>
      </div>
    </div>
  );
}
