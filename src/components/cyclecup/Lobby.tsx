// Cycle Cup — lobby: bike connection, solo start, or create/join a room.
import { useState } from 'react';
import type { TrackDef } from '@/game/types';
import type { UseWattbikeBluetoothReturn } from '@/hooks/useWattbikeBluetooth';
import type { UseRaceChannelReturn } from '@/hooks/useRaceChannel';
import { RIDER_COLORS } from '@/game/bikeModel';

interface Props {
  track: TrackDef;
  playerId: string;
  playerName: string;
  ble: UseWattbikeBluetoothReturn;
  channel: UseRaceChannelReturn;
  simMode: boolean;
  setSimMode: (v: boolean) => void;
  onStartSolo: () => void;
  onBack: () => void;
}

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

export default function Lobby({
  track, playerId, ble, channel, simMode, setSimMode, onStartSolo, onBack,
}: Props) {
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);

  const bikeConnected = ble.status === 'connected' || ble.status === 'riding';
  const canRace = bikeConnected || simMode;
  const inLobby = channel.phase === 'lobby';

  const bikePanel = (
    <div className="border-2 border-white/15 p-4 space-y-3">
      <h3 className="font-display text-xl uppercase text-white">1 · Your bike</h3>
      {bikeConnected ? (
        <div className="flex items-center gap-2 font-body text-brand-neon">
          <span className="w-2.5 h-2.5 rounded-full bg-brand-neon animate-pulse" />
          Connected: {ble.deviceName || 'Wattbike'}
        </div>
      ) : (
        <button
          onClick={ble.connect}
          disabled={ble.status === 'connecting'}
          className="w-full bg-brand-neon text-brand-dark font-display uppercase text-lg py-3 hover:opacity-90 disabled:opacity-50"
        >
          {ble.status === 'connecting' ? 'Searching…' : '🔗 Connect Wattbike'}
        </button>
      )}
      {ble.error && <p className="font-body text-xs text-red-400">{ble.error}</p>}
      <label className="flex items-center gap-2 font-body text-xs text-white/50 cursor-pointer">
        <input type="checkbox" checked={simMode} onChange={e => setSimMode(e.target.checked)} />
        No bike? Practice mode (simulated pedalling)
      </label>
    </div>
  );

  return (
    <div className="min-h-screen bg-brand-dark text-white">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <button onClick={() => { channel.leaveRoom(); onBack(); }} className="font-body text-sm text-white/60 hover:text-brand-neon uppercase tracking-widest mb-6">
          ← Change course
        </button>

        <div className="mb-6">
          <div className="font-body text-xs uppercase tracking-widest text-brand-neon">{track.laps} laps · difficulty {'▲'.repeat(track.difficulty)}</div>
          <h1 className="font-display text-5xl uppercase leading-none">{track.name}</h1>
          <p className="font-body text-white/60 mt-1">{track.tagline}</p>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {bikePanel}

          <div className="border-2 border-white/15 p-4 space-y-3">
            <h3 className="font-display text-xl uppercase text-white">2 · Race mode</h3>

            {!inLobby ? (
              <>
                <button
                  onClick={onStartSolo}
                  disabled={!canRace}
                  className="w-full bg-white text-brand-dark font-display uppercase text-lg py-3 hover:bg-brand-neon disabled:opacity-40"
                >
                  🏁 Solo time trial
                </button>
                <div className="flex items-center gap-2 text-white/30 font-body text-xs uppercase tracking-widest">
                  <div className="flex-1 h-px bg-white/15" /> or race friends <div className="flex-1 h-px bg-white/15" />
                </div>
                <button
                  onClick={async () => {
                    setBusy(true);
                    try { await channel.createRoom(track.id, track.name, track.laps); } finally { setBusy(false); }
                  }}
                  disabled={busy || !canRace}
                  className="w-full bg-brand-green text-white font-display uppercase text-lg py-3 hover:opacity-90 disabled:opacity-40"
                >
                  🎮 Host a race
                </button>
                <div className="flex gap-2">
                  <input
                    value={joinCode}
                    onChange={e => setJoinCode(e.target.value.toUpperCase().slice(0, 4))}
                    placeholder="CODE"
                    className="flex-1 bg-white/10 border border-white/25 px-3 py-2 font-display text-2xl tracking-[0.4em] text-center uppercase placeholder:text-white/25"
                    maxLength={4}
                  />
                  <button
                    onClick={() => joinCode.length === 4 && channel.joinRoom(joinCode)}
                    disabled={joinCode.length !== 4 || !canRace}
                    className="bg-white/15 border border-white/25 px-5 font-display uppercase hover:bg-brand-neon hover:text-brand-dark disabled:opacity-40"
                  >
                    Join
                  </button>
                </div>
                {!canRace && <p className="font-body text-xs text-white/40">Connect a bike (or tick practice mode) to race.</p>}
              </>
            ) : (
              <>
                <div className="text-center py-2">
                  <div className="font-body text-xs uppercase tracking-widest text-white/50">Room code — share it out loud</div>
                  <div className="font-display text-6xl tracking-[0.35em] text-brand-neon pl-3">{channel.roomCode}</div>
                </div>
                <div className="space-y-1.5">
                  {channel.players.map((p, i) => (
                    <div key={p.id} className="flex items-center gap-3 bg-white/8 border border-white/15 px-3 py-2">
                      <span className="w-4 h-4 rounded-full border-2 border-white/40" style={{ background: hex(RIDER_COLORS[i % RIDER_COLORS.length]) }} />
                      <span className="font-body flex-1">{p.name}{p.id === playerId && ' (you)'}</span>
                      {i === 0 && <span className="font-body text-[10px] uppercase tracking-widest text-brand-neon">Host</span>}
                    </div>
                  ))}
                  {Array.from({ length: Math.max(0, 4 - channel.players.length) }).map((_, i) => (
                    <div key={i} className="border border-dashed border-white/15 px-3 py-2 font-body text-white/30 text-sm">
                      Waiting for rider…
                    </div>
                  ))}
                </div>
                {!channel.connectionOk && (
                  <p className="font-body text-xs text-yellow-400 animate-pulse">Reconnecting to room…</p>
                )}
                {channel.isHost ? (
                  <button
                    onClick={channel.startCountdown}
                    disabled={channel.players.length < 2}
                    className="w-full bg-brand-neon text-brand-dark font-display uppercase text-xl py-3 hover:opacity-90 disabled:opacity-40"
                  >
                    {channel.players.length < 2 ? 'Waiting for riders…' : `🏁 Start race (${channel.players.length})`}
                  </button>
                ) : (
                  <p className="font-body text-sm text-white/60 text-center animate-pulse">Waiting for the host to start…</p>
                )}
                <button onClick={channel.leaveRoom} className="w-full font-body text-xs text-white/40 hover:text-white uppercase tracking-widest">
                  Leave room
                </button>
              </>
            )}
          </div>
        </div>

        <div className="mt-6 border border-white/10 p-3 font-body text-xs text-white/40 leading-relaxed">
          <strong className="text-white/60">How it works:</strong> your pedalling power sets your speed — the harder you ride, the faster your bike.
          Steer with the on-screen buttons. Ride through item boxes for pick-ups, hit green pads for a boost,
          and spike your cadence to fill the sprint meter for a free mini-turbo.
        </div>
      </div>
    </div>
  );
}
