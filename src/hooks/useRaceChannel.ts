// ─────────────────────────────────────────────────────────────────────────────
// Cycle Cup — multiplayer race channel (Supabase Realtime)
//
// One broadcast channel per room code carries everything:
//   presence            → lobby roster + join order (grid slots / kart colours)
//   'countdown' {n}     → host-driven 3-2-1
//   'go' {}             → race start
//   'state' NetKartState→ 10 Hz kart telemetry
//   'hazard'            → a dropped slick
//   'zap' {targetId}    → slow the targeted kart
//   'cross' {id, time}  → someone crossed the finish line
//
// Reconnects: Supabase Realtime rejoins automatically; we additionally watch
// channel status and resubscribe with backoff, re-tracking presence so a
// tablet that drops Wi-Fi mid-race reappears for everyone within seconds.
// Remote karts dead-reckon in the engine while packets are missing.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { insertRow, updateRowsWhere } from '@/lib/gameDb';
import type { DroppedHazard, NetKartState } from '@/game/types';

export interface RoomPlayer {
  id: string;
  name: string;
  joinedAt: number;
}

export type RoomPhase = 'idle' | 'lobby' | 'countdown' | 'racing' | 'finished';

export interface RaceChannelCallbacks {
  onState?: (s: NetKartState) => void;
  onHazard?: (h: DroppedHazard) => void;
  onZap?: (targetId: string) => void;
  onCross?: (id: string, time: number) => void;
  onCountdown?: (n: number) => void;
  onGo?: () => void;
  onPeerLeft?: (id: string) => void;
}

export interface UseRaceChannelReturn {
  phase: RoomPhase;
  roomCode: string;
  players: RoomPlayer[];
  isHost: boolean;
  connectionOk: boolean;
  finishOrder: string[];
  createRoom: (trackId: string, trackName: string, laps: number) => Promise<string>;
  joinRoom: (code: string) => Promise<void>;
  leaveRoom: () => void;
  startCountdown: () => void;
  sendState: (s: NetKartState) => void;
  sendHazard: (h: DroppedHazard) => void;
  sendZap: (targetId: string) => void;
  sendCross: (time: number) => void;
  /** For solo mode: jump straight to racing without a channel. */
  soloStart: () => void;
  setCallbacks: (cb: RaceChannelCallbacks) => void;
}

function makeRoomCode(): string {
  // No 0/O/1/I — read aloud across a room of tablets
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

export function useRaceChannel(playerId: string, playerName: string): UseRaceChannelReturn {
  const [phase, setPhase] = useState<RoomPhase>('idle');
  const [roomCode, setRoomCode] = useState('');
  const [players, setPlayers] = useState<RoomPlayer[]>([]);
  const [isHost, setIsHost] = useState(false);
  const [connectionOk, setConnectionOk] = useState(true);
  const [finishOrder, setFinishOrder] = useState<string[]>([]);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const callbacksRef = useRef<RaceChannelCallbacks>({});
  const phaseRef = useRef<RoomPhase>('idle');
  const isHostRef = useRef(false);
  const roomCodeRef = useRef('');
  const joinedAtRef = useRef(Date.now());
  const finishTimesRef = useRef<Map<string, number>>(new Map());
  const retryRef = useRef(0);

  phaseRef.current = phase;

  const setCallbacks = useCallback((cb: RaceChannelCallbacks) => {
    callbacksRef.current = cb;
  }, []);

  const teardown = useCallback(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  }, []);

  useEffect(() => teardown, [teardown]);

  const subscribe = useCallback((code: string, hosting: boolean) => {
    teardown();
    const ch = supabase.channel(`cyclecup:${code}`, {
      config: { broadcast: { self: false }, presence: { key: playerId } },
    });

    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState<{ name: string; joinedAt: number }>();
      const roster: RoomPlayer[] = Object.entries(state).map(([key, metas]) => ({
        id: key,
        name: metas[0]?.name ?? 'Rider',
        joinedAt: metas[0]?.joinedAt ?? Date.now(),
      }));
      roster.sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id));
      setPlayers(roster.slice(0, 4)); // 4 bikes max per room
    });
    ch.on('presence', { event: 'leave' }, ({ key }) => {
      callbacksRef.current.onPeerLeft?.(key);
    });
    ch.on('broadcast', { event: 'state' }, ({ payload }) => {
      callbacksRef.current.onState?.(payload as NetKartState);
    });
    ch.on('broadcast', { event: 'hazard' }, ({ payload }) => {
      callbacksRef.current.onHazard?.(payload as DroppedHazard);
    });
    ch.on('broadcast', { event: 'zap' }, ({ payload }) => {
      const { targetId } = payload as { targetId: string };
      if (targetId === playerId) callbacksRef.current.onZap?.(targetId);
    });
    ch.on('broadcast', { event: 'cross' }, ({ payload }) => {
      const { id, time } = payload as { id: string; time: number };
      recordCross(id, time);
      callbacksRef.current.onCross?.(id, time);
    });
    ch.on('broadcast', { event: 'countdown' }, ({ payload }) => {
      const { n } = payload as { n: number };
      setPhase('countdown');
      callbacksRef.current.onCountdown?.(n);
    });
    ch.on('broadcast', { event: 'go' }, () => {
      setPhase('racing');
      callbacksRef.current.onGo?.();
    });

    ch.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        setConnectionOk(true);
        retryRef.current = 0;
        await ch.track({ name: playerName, joinedAt: joinedAtRef.current });
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        setConnectionOk(false);
        // Backoff resubscribe — keeps a dropped tablet rejoining mid-race
        if (roomCodeRef.current === code && phaseRef.current !== 'idle') {
          const delay = Math.min(1000 * 2 ** retryRef.current, 8000);
          retryRef.current += 1;
          setTimeout(() => {
            if (roomCodeRef.current === code && phaseRef.current !== 'idle') {
              subscribe(code, hosting);
            }
          }, delay);
        }
      }
    });

    channelRef.current = ch;
     
  }, [playerId, playerName, teardown]);

  const recordCross = (id: string, time: number) => {
    if (!finishTimesRef.current.has(id)) {
      finishTimesRef.current.set(id, time);
      const order = [...finishTimesRef.current.entries()]
        .sort((a, b) => a[1] - b[1])
        .map(([pid]) => pid);
      setFinishOrder(order);
    }
  };

  const createRoom = useCallback(async (trackId: string, trackName: string, laps: number) => {
    const code = makeRoomCode();
    joinedAtRef.current = Date.now();
    finishTimesRef.current = new Map();
    setFinishOrder([]);
    roomCodeRef.current = code;
    setRoomCode(code);
    setIsHost(true);
    isHostRef.current = true;
    setPhase('lobby');
    subscribe(code, true);
    // Persist the room row (RLS: host_user_id must be auth.uid())
    const { data: auth } = await supabase.auth.getUser();
    if (auth?.user) {
      await insertRow('game_race_rooms', {
        room_code: code,
        route_id: trackId,
        route_name: trackName,
        status: 'waiting',
        host_user_id: auth.user.id,
        player_count: 1,
        laps,
        game_mode: 'cycle_cup',
      });
    }
    return code;
  }, [subscribe]);

  const joinRoom = useCallback(async (code: string) => {
    const clean = code.trim().toUpperCase();
    joinedAtRef.current = Date.now();
    finishTimesRef.current = new Map();
    setFinishOrder([]);
    roomCodeRef.current = clean;
    setRoomCode(clean);
    setIsHost(false);
    isHostRef.current = false;
    setPhase('lobby');
    subscribe(clean, false);
  }, [subscribe]);

  const leaveRoom = useCallback(() => {
    roomCodeRef.current = '';
    teardown();
    setPhase('idle');
    setRoomCode('');
    setPlayers([]);
    setIsHost(false);
    setFinishOrder([]);
    finishTimesRef.current = new Map();
  }, [teardown]);

  const startCountdown = useCallback(() => {
    if (!isHostRef.current || !channelRef.current) return;
    const ch = channelRef.current;
    setPhase('countdown');
    let n = 3;
    const tick = () => {
      if (n > 0) {
        ch.send({ type: 'broadcast', event: 'countdown', payload: { n } });
        callbacksRef.current.onCountdown?.(n);
        n -= 1;
        setTimeout(tick, 1000);
      } else {
        ch.send({ type: 'broadcast', event: 'go', payload: {} });
        setPhase('racing');
        callbacksRef.current.onGo?.();
        // Best-effort room status update
        void Promise.resolve(
          updateRowsWhere(
            'game_race_rooms',
            { status: 'racing', started_at: new Date().toISOString() },
            'room_code',
            roomCodeRef.current,
          ),
        ).catch(() => {});
      }
    };
    tick();
  }, []);

  const soloStart = useCallback(() => {
    roomCodeRef.current = '';
    finishTimesRef.current = new Map();
    setFinishOrder([]);
    setPhase('racing');
  }, []);

  const send = (event: string, payload: unknown) => {
    channelRef.current?.send({ type: 'broadcast', event, payload });
  };

  const sendState = useCallback((s: NetKartState) => send('state', s), []);
  const sendHazard = useCallback((h: DroppedHazard) => send('hazard', h), []);
  const sendZap = useCallback((targetId: string) => send('zap', { targetId }), []);
  const sendCross = useCallback((time: number) => {
    recordCross(playerId, time);
    send('cross', { id: playerId, time });
     
  }, [playerId]);

  return {
    phase, roomCode, players, isHost, connectionOk, finishOrder,
    createRoom, joinRoom, leaveRoom, startCountdown,
    sendState, sendHazard, sendZap, sendCross, soloStart, setCallbacks,
  };
}
