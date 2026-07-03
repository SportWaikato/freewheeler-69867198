// Cycle Cup — podium / results screen.
import type { RaceFinishData, TrackDef } from '@/game/types';
import type { RoomPlayer } from '@/hooks/useRaceChannel';

interface Props {
  track: TrackDef;
  result: RaceFinishData;
  playerId: string;
  /** Multiplayer: finish order (ids) + roster for names. Solo: empty. */
  finishOrder: string[];
  players: RoomPlayer[];
  saveState: 'saving' | 'saved' | 'error';
  onRaceAgain: () => void;
  onChangeTrack: () => void;
  onExit: () => void;
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const MEDALS = ['🥇', '🥈', '🥉', '🏅'];

export default function Podium({
  track, result, playerId, finishOrder, players, saveState, onRaceAgain, onChangeTrack, onExit,
}: Props) {
  const isMulti = result.totalRacers > 1;
  const nameOf = (id: string) => players.find(p => p.id === id)?.name ?? 'Rider';

  return (
    <div className="min-h-screen bg-brand-dark text-white flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        <div className="text-center mb-6">
          <div className="text-7xl mb-2">{isMulti ? MEDALS[Math.min(result.finishPosition - 1, 3)] : (result.beatPar ? '🏆' : '🏁')}</div>
          <h1 className="font-display text-6xl uppercase leading-none text-brand-neon">
            {isMulti
              ? `${result.finishPosition}${result.finishPosition === 1 ? 'st' : result.finishPosition === 2 ? 'nd' : result.finishPosition === 3 ? 'rd' : 'th'} place!`
              : result.beatPar ? 'Beat the par!' : 'Course complete!'}
          </h1>
          <p className="font-body text-white/60 mt-1">{track.name} · {fmt(result.finishTimeSeconds)}</p>
        </div>

        {isMulti && finishOrder.length > 0 && (
          <div className="mb-6 space-y-1.5">
            {finishOrder.map((id, i) => (
              <div key={id} className={`flex items-center gap-3 px-4 py-2 border ${id === playerId ? 'border-brand-neon bg-brand-neon/10' : 'border-white/15 bg-white/5'}`}>
                <span className="font-display text-2xl w-8">{i + 1}</span>
                <span className="text-2xl">{MEDALS[Math.min(i, 3)]}</span>
                <span className="font-body flex-1">{nameOf(id)}{id === playerId && ' (you)'}</span>
              </div>
            ))}
            {players.filter(p => !finishOrder.includes(p.id)).map(p => (
              <div key={p.id} className="flex items-center gap-3 px-4 py-2 border border-white/10 text-white/40">
                <span className="font-display text-2xl w-8">·</span>
                <span className="text-2xl">🚴</span>
                <span className="font-body flex-1">{p.name} — still riding…</span>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-6">
          {[
            [result.distanceKm.toFixed(2), 'km ridden'],
            [`${Math.round(result.avgPowerWatts)}`, 'avg watts'],
            [`${Math.round(result.elevationGainM)}`, 'm climbed'],
            [result.bestLapSeconds ? fmt(result.bestLapSeconds) : '—', 'best lap'],
          ].map(([v, label]) => (
            <div key={label} className="bg-white/5 border border-white/15 p-3 text-center">
              <div className="font-display text-3xl text-white">{v}</div>
              <div className="font-body text-[10px] uppercase tracking-widest text-white/50">{label}</div>
            </div>
          ))}
        </div>

        <div className="bg-brand-neon/10 border-2 border-brand-neon p-4 text-center mb-6">
          <div className="font-display text-5xl text-brand-neon">+{result.placementPoints}</div>
          <div className="font-body text-xs uppercase tracking-widest text-white/70">
            placement points → school leaderboard
          </div>
          <div className="font-body text-xs text-white/50 mt-1">
            {saveState === 'saving' && 'Saving your ride…'}
            {saveState === 'saved' && '✅ Ride + bonus points saved to your profile'}
            {saveState === 'error' && '⚠ Could not save — check your connection'}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <button onClick={onRaceAgain} className="bg-brand-neon text-brand-dark font-display uppercase py-3 hover:opacity-90">
            Race again
          </button>
          <button onClick={onChangeTrack} className="bg-white/10 border border-white/25 font-display uppercase py-3 hover:bg-white/20">
            Change course
          </button>
          <button onClick={onExit} className="bg-white/10 border border-white/25 font-display uppercase py-3 hover:bg-white/20">
            Leaderboards
          </button>
        </div>
      </div>
    </div>
  );
}
