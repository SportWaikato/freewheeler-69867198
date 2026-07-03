import { useState, useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft, Flag, StopCircle, CheckCircle,
  AlertTriangle, Map, Layers, Gamepad2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useWattbikeBluetooth } from "@/hooks/useWattbikeBluetooth";
import RouteSelector from "@/components/ride/RouteSelector";
import LiveMetricsDisplay, { getPowerZone, formatTime } from "@/components/ride/LiveMetrics";
import RouteMap from "@/components/ride/RouteMap";
import RideScene from "@/components/ride/RideScene";
import SessionFeedbackForm from "@/components/SessionFeedbackForm";
import { getElevationForDistance, type Route } from "@/data/routes";
import logoSrc from "@/assets/fw-logo-oval.png";

type Stage = "pre-ride" | "riding" | "complete";
type ViewMode = "map" | "scene";

const RIDE_PROMPTS = [
  "Keep pedalling — every km counts!",
  "You're earning points right now.",
  "Push through — your school is counting on you!",
  "Consistency beats intensity. Stay steady.",
  "Halfway through? Dig deep.",
  "Think about the leaderboard. Go harder.",
];

export default function RidePage() {
  const { nfcSession, user } = useAuth();
  const navigate = useNavigate();

  const [stage, setStage] = useState<Stage>("pre-ride");
  const [selectedRoute, setSelectedRoute] = useState<Route | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [promptIdx, setPromptIdx] = useState(0);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("map");
  const [completedSummary, setCompletedSummary] = useState<{
    duration_minutes: number;
    distance_km: number;
    avg_speed_kmh: number;
    avg_power_watts: number;
    elevation_m: number;
    courseMap: string;
  } | null>(null);

  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const promptRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const ble = useWattbikeBluetooth();
  const riderName = nfcSession?.firstName ?? user?.email?.split("@")[0] ?? "Rider";
  const zone = getPowerZone(ble.metrics.power);

  // Timer + prompt cycle while riding
  useEffect(() => {
    if (stage === "riding") {
      timerRef.current  = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
      promptRef.current = setInterval(
        () => setPromptIdx((i) => (i + 1) % RIDE_PROMPTS.length),
        30_000,
      );
    } else {
      if (timerRef.current)  clearInterval(timerRef.current);
      if (promptRef.current) clearInterval(promptRef.current);
    }
    return () => {
      if (timerRef.current)  clearInterval(timerRef.current);
      if (promptRef.current) clearInterval(promptRef.current);
    };
  }, [stage]);

  const handleStartRide = () => {
    ble.startRide();
    setElapsedSeconds(0);
    setPromptIdx(0);
    setStage("riding");
  };

  const handleEndRide = () => {
    const summary = ble.endRide();
    const elevation_m = selectedRoute
      ? getElevationForDistance(selectedRoute, summary.distance_km)
      : 0;
    setCompletedSummary({ ...summary, elevation_m, courseMap: selectedRoute?.name ?? "" });
    setStage("complete");
    setShowEndConfirm(false);
  };

  const handleFeedbackClose = (open: boolean) => {
    setShowFeedback(open);
    if (!open) navigate("/dashboard");
  };

  // ── Riding stage: full-screen immersive ──────────────────────────────────────
  if (stage === "riding") {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        {/* Slim top bar */}
        <div className="flex items-center justify-between border-b-[2px] border-secondary bg-card px-4 py-2">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-green-500" />
            <span className="font-display text-xs uppercase tracking-wider text-muted-foreground">
              Live
            </span>
          </div>
          {selectedRoute && (
            <span className="font-display text-xs uppercase tracking-wider text-foreground">
              {selectedRoute.emoji} {selectedRoute.name}
            </span>
          )}
          <span className="font-display text-xs uppercase tracking-widest text-primary">
            {formatTime(elapsedSeconds)}
          </span>
        </div>

        {/* Elevation progress strip */}
        {selectedRoute && (
          <div className="h-1 w-full bg-secondary">
            <motion.div
              className="h-full bg-primary"
              animate={{
                width: `${Math.min(
                  (ble.metrics.distance / selectedRoute.distance_km) * 100,
                  100,
                )}%`,
              }}
              transition={{ duration: 0.5 }}
            />
          </div>
        )}

        <div className="flex flex-1 flex-col gap-4 p-4">
          {/* Zone banner + speed */}
          <LiveMetricsDisplay metrics={ble.metrics} elapsedSeconds={elapsedSeconds} />

          {/* Map / Scene toggle + visualisation */}
          {selectedRoute && (
            <div className="space-y-2">
              {/* Toggle row */}
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setViewMode("map")}
                  className={`flex flex-1 items-center justify-center gap-1.5 border-[2px] py-1.5 font-display text-xs uppercase tracking-wider transition-colors ${
                    viewMode === "map"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-secondary bg-card text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Map className="h-3.5 w-3.5" />
                  Map
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("scene")}
                  className={`flex flex-1 items-center justify-center gap-1.5 border-[2px] py-1.5 font-display text-xs uppercase tracking-wider transition-colors ${
                    viewMode === "scene"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-secondary bg-card text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Layers className="h-3.5 w-3.5" />
                  Scene
                </button>
              </div>

              {/* Visualisation */}
              {viewMode === "map" ? (
                <RouteMap
                  route={selectedRoute}
                  distanceRiddenKm={ble.metrics.distance}
                />
              ) : (
                <RideScene
                  route={selectedRoute}
                  distanceRiddenKm={ble.metrics.distance}
                  speedKmh={ble.metrics.speed}
                  powerW={ble.metrics.power}
                />
              )}
            </div>
          )}

          {/* Motivational prompt */}
          <AnimatePresence mode="wait">
            <motion.div
              key={promptIdx}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={`border-l-4 px-4 py-2 ${zone.ring ?? "border-primary"}`}
            >
              <p className="font-body text-sm italic text-muted-foreground">
                {RIDE_PROMPTS[promptIdx]}
              </p>
            </motion.div>
          </AnimatePresence>

          {/* End ride */}
          <div className="mt-auto pt-2">
            {!showEndConfirm ? (
              <Button
                variant="outline"
                onClick={() => setShowEndConfirm(true)}
                className="w-full border-[2px] border-secondary font-display uppercase tracking-wider gap-2"
              >
                <StopCircle className="h-4 w-4" />
                End Ride
              </Button>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-3 border-[3px] border-destructive bg-destructive/10 p-4"
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-destructive" />
                  <p className="font-body text-sm text-foreground">
                    End the ride? Your data will be saved.
                  </p>
                </div>
                <div className="flex gap-3">
                  <Button
                    onClick={handleEndRide}
                    className="flex-1 bg-destructive font-display uppercase tracking-wider text-white hover:bg-destructive/90"
                  >
                    Yes, End
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setShowEndConfirm(false)}
                    className="flex-1 border-2 border-secondary font-display uppercase tracking-wider"
                  >
                    Keep Going
                  </Button>
                </div>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Pre-ride + Complete stages (shared header) ───────────────────────────────
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b-[3px] border-secondary bg-card shadow-[0_3px_0px_hsl(var(--brand-dark))]">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex items-center gap-1 font-body text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>
          <div className="flex flex-1 items-center justify-center">
            <Link to="/">
              <img src={logoSrc} alt="Freewheeler" className="h-10 object-contain" />
            </Link>
          </div>
          <span className="w-12 text-right font-display text-sm uppercase tracking-wider text-muted-foreground">
            {riderName}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-6 px-4 py-6">
        <AnimatePresence mode="wait">

          {/* ── Pre-ride ── */}
          {stage === "pre-ride" && (
            <motion.div
              key="pre-ride"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-6"
            >
              <div>
                <h1 className="font-display text-2xl uppercase tracking-wider text-foreground">
                  Ready to Ride, {riderName}?
                </h1>
                <p className="mt-1 font-body text-sm text-muted-foreground">
                  Pick a route, then jump into the 3D game — connect your Wattbike and go solo or multiplayer from inside the ride.
                </p>
              </div>

              {/* Cycle Cup — kart racing mode */}
              <button
                type="button"
                onClick={() => navigate('/cycle-cup')}
                className="w-full text-left border-2 border-brand-dark bg-brand-dark text-white p-5 shadow-[6px_6px_0_0_hsl(var(--brand-green))] hover:-translate-y-0.5 transition-transform"
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="font-body text-[10px] uppercase tracking-widest text-brand-neon">New game mode</div>
                    <div className="font-display text-3xl uppercase leading-none text-brand-neon">Cycle Cup 🏁</div>
                    <p className="font-body text-sm text-white/70 mt-1">
                      Kart racing on your Wattbike — items, boosts and up to 4 riders per race.
                    </p>
                  </div>
                  <Gamepad2 className="h-10 w-10 shrink-0 text-brand-neon" />
                </div>
              </button>

              <section>
                <h2 className="mb-3 font-display text-sm uppercase tracking-wider text-foreground">
                  Choose a Route
                </h2>
                <RouteSelector selected={selectedRoute} onSelect={setSelectedRoute} />
              </section>

              {selectedRoute && (
                <Button
                  type="button"
                  onClick={() => navigate(`/game/${selectedRoute.id}`)}
                  className="tape-element-green w-full py-5 font-display text-lg uppercase tracking-wider gap-2"
                >
                  <Gamepad2 className="h-5 w-5" />
                  🎮 Play 3D Game
                </Button>
              )}
            </motion.div>
          )}

          {/* ── Complete ── */}
          {stage === "complete" && completedSummary && (
            <motion.div
              key="complete"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 280 }}
              className="space-y-6 text-center"
            >
              <div>
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.1, type: "spring", stiffness: 400 }}
                  className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/20"
                >
                  <CheckCircle className="h-10 w-10 text-primary" />
                </motion.div>
                <h1 className="font-display text-3xl uppercase tracking-wider text-foreground">
                  Ride Complete!
                </h1>
                <p className="mt-1 font-body text-sm text-muted-foreground">
                  Great effort, {riderName}. Log your ride to bank your points.
                </p>
              </div>

              {/* Summary */}
              <div className="border-[3px] border-secondary bg-card p-5 shadow-[4px_4px_0px_hsl(var(--brand-dark))] text-left">
                <h2 className="mb-4 font-display text-xs uppercase tracking-wider text-muted-foreground">
                  Your Ride
                </h2>
                <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                  {[
                    { label: "Distance",  value: `${completedSummary.distance_km} km` },
                    { label: "Duration",  value: `${Math.round(completedSummary.duration_minutes)} min` },
                    { label: "Avg Speed", value: `${completedSummary.avg_speed_kmh} km/h` },
                    { label: "Elevation", value: `${completedSummary.elevation_m} m` },
                    { label: "Avg Power", value: `${completedSummary.avg_power_watts} W` },
                    { label: "Route",     value: completedSummary.courseMap || "—" },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <p className="font-display text-[10px] uppercase tracking-wider text-muted-foreground">
                        {label}
                      </p>
                      <p className="font-display text-xl text-foreground">{value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <Button
                onClick={() => setShowFeedback(true)}
                className="tape-element-green w-full py-5 font-display text-lg uppercase tracking-wider"
              >
                Log This Ride + Earn Points
              </Button>

              <Button
                variant="outline"
                onClick={() => navigate("/dashboard")}
                className="w-full border-2 border-secondary font-display uppercase tracking-wider"
              >
                Skip — Go to Dashboard
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <SessionFeedbackForm
        open={showFeedback}
        onOpenChange={handleFeedbackClose}
        prefilledData={
          completedSummary
            ? {
                distance_km:       completedSummary.distance_km,
                duration_minutes:  completedSummary.duration_minutes,
                avg_speed_kmh:     completedSummary.avg_speed_kmh,
                elevation_m:       completedSummary.elevation_m,
                avg_power_watts:   completedSummary.avg_power_watts,
                courseMap:         completedSummary.courseMap,
                rideSource:        "bluetooth",
              }
            : undefined
        }
      />
    </div>
  );
}
