import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { Sheet } from "./ui";

let audioCtx: AudioContext | null = null;
function beep() {
  try {
    audioCtx ??= new AudioContext();
    for (let i = 0; i < 3; i++) {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      const t = audioCtx.currentTime + i * 0.25;
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      o.connect(g).connect(audioCtx.destination);
      o.start(t);
      o.stop(t + 0.2);
    }
  } catch {
    /* no audio */
  }
  navigator.vibrate?.([120, 80, 120]);
}

const fmt = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}${ms < 60_000 ? "." + Math.floor((ms % 1000) / 100) : ""}`;
};

/** Stopwatch plus countdown presets for holds and rests. Keeps running while the sheet is closed. */
export function TimerSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [mode, setMode] = useState<"stopwatch" | "countdown">("countdown");
  const [target, setTarget] = useState(30_000);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [banked, setBanked] = useState(0);
  const [, tick] = useState(0);
  const fired = useRef(false);

  const elapsed = banked + (startedAt ? Date.now() - startedAt : 0);
  const shown = mode === "stopwatch" ? elapsed : Math.max(0, target - elapsed);

  useEffect(() => {
    if (!startedAt) return;
    const t = setInterval(() => tick((n) => n + 1), 100);
    return () => clearInterval(t);
  }, [startedAt]);

  useEffect(() => {
    if (mode === "countdown" && startedAt && shown === 0 && !fired.current) {
      fired.current = true;
      beep();
      setBanked(target);
      setStartedAt(null);
    }
  }, [mode, startedAt, shown, target]);

  const reset = (nextTarget = target) => {
    setStartedAt(null);
    setBanked(0);
    setTarget(nextTarget);
    fired.current = false;
  };

  return (
    <Sheet open={open} onClose={onClose}>
      <div className="stack">
        <div className="segmented">
          <button className={mode === "countdown" ? "on" : ""} onClick={() => { setMode("countdown"); reset(); }}>Countdown</button>
          <button className={mode === "stopwatch" ? "on" : ""} onClick={() => { setMode("stopwatch"); reset(); }}>Stopwatch</button>
        </div>
        <div className="timer" style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(shown)}</div>
        {mode === "countdown" && (
          <div className="row" style={{ justifyContent: "center", flexWrap: "wrap" }}>
            {[15, 30, 45, 60, 90, 120].map((s) => (
              <button key={s} className={`btn sm${target === s * 1000 ? " primary" : ""}`} onClick={() => reset(s * 1000)}>
                {s < 60 ? `:${s}` : `${s / 60}:${String(s % 60).padStart(2, "0")}`}
              </button>
            ))}
          </div>
        )}
        <div className="row">
          <button
            className={`btn lg grow ${startedAt ? "" : "primary"}`}
            onClick={() => {
              audioCtx ??= new AudioContext(); // unlock audio on iOS with a tap
              if (startedAt) {
                setBanked(elapsed);
                setStartedAt(null);
              } else {
                if (mode === "countdown" && shown === 0) reset();
                fired.current = false;
                setStartedAt(Date.now());
              }
            }}
          >
            <Icon name={startedAt ? "pause" : "play"} size={20} /> {startedAt ? "Pause" : "Start"}
          </button>
          <button className="btn lg" onClick={() => reset()}>Reset</button>
        </div>
      </div>
    </Sheet>
  );
}
