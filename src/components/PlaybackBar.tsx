"use client";

export interface PlaybackBarProps {
  visible: boolean;
  currentTimeMs: number;
  totalDurationMs: number;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onSeekBy: (ms: number) => void;
  onSeekToFraction: (frac: number) => void;
}

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${m}:${ss.toString().padStart(2, "0")}`;
}

export default function PlaybackBar({ visible, currentTimeMs, totalDurationMs, isPlaying, onTogglePlay, onSeekBy, onSeekToFraction }: PlaybackBarProps) {
  return (
    <div className={`playback-bar${visible ? " visible" : ""}`}>
      <div className="playback-time">
        <span>{formatTime(currentTimeMs)}</span>
        <span>{formatTime(totalDurationMs)}</span>
      </div>
      <div
        className="playback-progress"
        onClick={(e) => {
          const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
          const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          onSeekToFraction(frac);
        }}
        role="slider"
        aria-label="Playback position"
        aria-valuenow={totalDurationMs > 0 ? Math.round((currentTimeMs / totalDurationMs) * 100) : 0}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="playback-progress-fill" style={{ width: totalDurationMs > 0 ? `${(currentTimeMs / totalDurationMs) * 100}%` : "0%" }} />
      </div>
      <div className="playback-bar-controls">
        <button className="pb-btn" onClick={() => onSeekBy(-10_000)} title="Back 10s (←)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 5V2L7 7l5 5V9c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/><text x="8.5" y="16" fontSize="7" fill="currentColor" fontFamily="sans-serif">10</text></svg>
        </button>
        <button className="pb-play-btn" onClick={onTogglePlay} aria-label={isPlaying ? "Pause" : "Play"}>
          {isPlaying ? (
            <svg width="14" height="14" viewBox="0 0 18 18" fill="currentColor"><rect x="3" y="2" width="4" height="14" rx="1"/><rect x="11" y="2" width="4" height="14" rx="1"/></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 18 18" fill="currentColor"><path d="M4 2.5L15 9L4 15.5V2.5Z"/></svg>
          )}
        </button>
        <button className="pb-btn" onClick={() => onSeekBy(10_000)} title="Forward 10s (→)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 5V2l5 5-5 5V9c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z"/><text x="8.5" y="16" fontSize="7" fill="currentColor" fontFamily="sans-serif">10</text></svg>
        </button>
      </div>
    </div>
  );
}
