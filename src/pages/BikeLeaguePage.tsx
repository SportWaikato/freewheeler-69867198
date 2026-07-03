// ─────────────────────────────────────────────────────────────────────────────
// Freewheeler Bike League — page orchestrator
//
// Flow: course select → lobby (bike connect · solo / host / join) → race → podium.
// Owns the Wattbike hook (one BLE connection across the whole flow), the race
// channel, and result persistence into game_rides (+ game_race_results for
// multiplayer) so points flow through the existing award_game_ride_points()
// trigger into the shared student_points leaderboard.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { insertRow } from '@/lib/gameDb';
import { useAuth } from '@/hooks/useAuth';
import { useWattbikeBluetooth } from '@/hooks/useWattbikeBluetooth';
import { useRaceChannel } from '@/hooks/useRaceChannel';
import type { RaceFinishData, TrackDef } from '@/game/types';
import TrackSelect from '@/components/bikeleague/TrackSelect';
import Lobby from '@/components/bikeleague/Lobby';
import RaceScreen from '@/components/bikeleague/RaceScreen';
import Podium from '@/components/bikeleague/Podium';

type Screen = 'select' | 'lobby' | 'race' | 'podium';

export default function BikeLeaguePage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const ble = useWattbikeBluetooth();

  const playerId = useMemo(() => Math.random().toString(36).slice(2, 11), []);
  const playerName = session?.user?.email?.split('@')[0] ?? 'Rider';
  const channel = useRaceChannel(playerId, playerName);

  const [screen, setScreen] = useState<Screen>('select');
  const [track, setTrack] = useState<TrackDef | null>(null);
  const [simMode, setSimMode] = useState(false);
  const [isMulti, setIsMulti] = useState(false);
  const [result, setResult] = useState<RaceFinishData | null>(null);
  const [saveState, setSaveState] = useState<'saving' | 'saved' | 'error'>('saving');
  const savedRef = useRef(false);

  // Full-screen: hide body scroll while racing
  useEffect(() => {
    if (screen === 'race') {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [screen]);

  // Multiplayer race start comes from the channel (host countdown → 'go')
  useEffect(() => {
    if (channel.phase === 'countdown' && screen === 'lobby') {
      setIsMulti(true);
      if (ble.status === 'connected') ble.startRide();
      setScreen('race');
    }
  }, [channel.phase, screen, ble]);

  const startSolo = () => {
    setIsMulti(false);
    channel.soloStart();
    if (ble.status === 'connected') ble.startRide();
    setScreen('race');
  };

  const myGridSlot = Math.max(channel.players.findIndex(p => p.id === playerId), 0);

  const saveResult = async (data: RaceFinishData, trackDef: TrackDef) => {
    if (savedRef.current) return;
    savedRef.current = true;
    setSaveState('saving');
    const userId = session?.user?.id;
    if (!userId) { setSaveState('error'); return; }
    try {
      const { error } = await insertRow('game_rides', {
        user_id: userId,
        route_id: trackDef.id,
        route_name: trackDef.name,
        distance_km: parseFloat(data.distanceKm.toFixed(3)),
        avg_speed_kmh: parseFloat(data.avgSpeedKmh.toFixed(1)),
        avg_power_watts: Math.round(data.avgPowerWatts),
        avg_cadence_rpm: Math.round(data.avgCadenceRpm),
        elevation_gain_m: Math.round(data.elevationGainM),
        duration_seconds: data.finishTimeSeconds,
        source: 'bike_league',
        placement_points: data.placementPoints,
      });
      if (error) throw error;

      if (data.totalRacers > 1 && channel.roomCode) {
        await insertRow('game_race_results', {
          room_code: channel.roomCode,
          route_id: trackDef.id,
          route_name: trackDef.name,
          user_id: userId,
          lane: myGridSlot + 1,
          finish_position: data.finishPosition,
          finish_time_seconds: data.finishTimeSeconds,
          total_racers: data.totalRacers,
          placement_points: data.placementPoints,
          best_lap_seconds: data.bestLapSeconds,
          distance_km: parseFloat(data.distanceKm.toFixed(3)),
          avg_power_watts: Math.round(data.avgPowerWatts),
        });
      }
      setSaveState('saved');
    } catch {
      setSaveState('error');
    }
  };

  const handleFinish = (data: RaceFinishData) => {
    setResult(data);
    if (ble.status === 'riding') ble.endRide();
    if (track) void saveResult(data, track);
    setScreen('podium');
  };

  const resetForNewRace = () => {
    savedRef.current = false;
    setResult(null);
    setSaveState('saving');
  };

  if (screen === 'select' || !track) {
    return (
      <TrackSelect
        onSelect={(t) => { setTrack(t); resetForNewRace(); setScreen('lobby'); }}
        onBack={() => navigate('/ride')}
      />
    );
  }

  if (screen === 'lobby') {
    return (
      <Lobby
        track={track}
        playerId={playerId}
        playerName={playerName}
        ble={ble}
        channel={channel}
        simMode={simMode}
        setSimMode={setSimMode}
        onStartSolo={startSolo}
        onBack={() => { setTrack(null); setScreen('select'); }}
      />
    );
  }

  if (screen === 'race') {
    return (
      <div className="w-screen h-screen">
        <RaceScreen
          track={track}
          playerId={playerId}
          playerName={playerName}
          colorIndex={myGridSlot}
          gridSlot={myGridSlot}
          simMode={simMode || !(ble.status === 'connected' || ble.status === 'riding')}
          metrics={ble.metrics}
          channel={isMulti ? channel : null}
          onFinish={handleFinish}
          onQuit={() => { channel.leaveRoom(); resetForNewRace(); setScreen('lobby'); }}
        />
      </div>
    );
  }

  return result ? (
    <Podium
      track={track}
      result={result}
      playerId={playerId}
      finishOrder={channel.finishOrder}
      players={channel.players}
      saveState={saveState}
      onRaceAgain={() => { channel.leaveRoom(); resetForNewRace(); setScreen('lobby'); }}
      onChangeTrack={() => { channel.leaveRoom(); resetForNewRace(); setTrack(null); setScreen('select'); }}
      onExit={() => { channel.leaveRoom(); navigate('/leaderboards'); }}
    />
  ) : null;
}
