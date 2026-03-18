"use client";
import Link from "next/link";
import { VOICES } from "@/components/voices";

export interface TopBarProps {
  voice: string;
  onVoiceChange: (v: string) => void;
  speed: number;
  onSpeedChange: (s: number) => void;
  isPlaying: boolean;
  loading: boolean;
  onTogglePlay: () => void;
  theme: string;
  onThemeChange: (t: string) => void;
  entitled: boolean;
  email: string;
  onSubscribeClick: () => void;
  onMenuClick: () => void;
  hasAudio?: boolean;
  onStop?: () => void;
}

export default function TopBar({ voice, onVoiceChange, speed, onSpeedChange, isPlaying, loading, onTogglePlay, theme, onThemeChange, entitled, email, onSubscribeClick, onMenuClick, hasAudio, onStop }: TopBarProps) {
  return (
    <div className="topbar">
      {/* Left: Logo */}
      <div className="topbar-left">
        <Link href="/" className="logo" style={{ textDecoration: "none" }}>
          <span className="read" style={{ fontFamily: "var(--font-spectral)", fontSize: 20, fontWeight: 400, textTransform: "lowercase" }}>read</span>
          <span className="to" style={{ fontFamily: "var(--font-spectral)", fontSize: 20, fontWeight: 400, textTransform: "lowercase", marginLeft: 2 }}>to</span>
        </Link>
      </div>

      {/* Center: Voice + Speed + Play */}
      <div className="topbar-center">
        {hasAudio && onStop && (
          <button className="btn btn-sm" onClick={onStop} title="Stop and clear (Escape)" aria-label="Stop and clear" style={{ fontFamily: "var(--font-ui)", padding: "4px 10px" }}>✕ New</button>
        )}
        <select data-tour="voice-select" className="btn" value={voice} onChange={(e) => onVoiceChange(e.target.value)} style={{ fontFamily: "var(--font-ui)", fontSize: 13, padding: "4px 8px", minHeight: 36 }} title="Select voice">
          {VOICES.map((v) => (<option key={v.id} value={v.id}>{v.label}</option>))}
        </select>
        <div data-tour="speed-control" className="speed-seg">
          {([0.75, 1, 1.25, 1.5, 2] as number[]).map((s) => (
            <button key={s} aria-pressed={speed === s} onClick={() => onSpeedChange(s)}>{s}×</button>
          ))}
        </div>
        <button data-tour="play-btn" className="play-btn" onClick={onTogglePlay} disabled={loading} aria-label={isPlaying ? "Pause" : "Play"} title={isPlaying ? "Pause (Space)" : "Play (Space)"}>
          {loading ? (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2" strokeDasharray="25 13" opacity="0.8"><animateTransform attributeName="transform" type="rotate" from="0 10 10" to="360 10 10" dur="0.8s" repeatCount="indefinite"/></circle></svg>
          ) : isPlaying ? (
            <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor"><rect x="3" y="2" width="4" height="14" rx="1"/><rect x="11" y="2" width="4" height="14" rx="1"/></svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor"><path d="M4 2.5L15 9L4 15.5V2.5Z"/></svg>
          )}
        </button>
      </div>

      {/* Right: Theme + Subscribe */}
      <div className="topbar-right">
        <button data-tour="theme-toggle" className="btn btn-sm" onClick={() => { const themes = ["white", "beige", "dark"]; onThemeChange(themes[(themes.indexOf(theme) + 1) % themes.length]); }} title={`Theme: ${theme}`} aria-label="Toggle theme" style={{ minWidth: 36, padding: "4px 8px" }}>
          {theme === "dark" ? "🌙" : theme === "beige" ? "📜" : "☀️"}
        </button>
        {entitled ? (
          <button className="btn btn-sm" onClick={onSubscribeClick} style={{ fontFamily: "var(--font-ui)" }}>{email ? email.split("@")[0] : "Account"}</button>
        ) : (
          <button className="btn btn-primary btn-sm" onClick={onSubscribeClick} style={{ fontFamily: "var(--font-ui)" }}>Subscribe</button>
        )}
      </div>

      {/* Mobile: play + hamburger */}
      <div className="topbar-mobile-controls">
        <button className="play-btn" style={{ width: 44, height: 44 }} onClick={onTogglePlay} disabled={loading} aria-label={isPlaying ? "Pause" : "Play"}>
          {loading ? (
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2" strokeDasharray="25 13" opacity="0.8"><animateTransform attributeName="transform" type="rotate" from="0 10 10" to="360 10 10" dur="0.8s" repeatCount="indefinite"/></circle></svg>
          ) : isPlaying ? (
            <svg width="14" height="14" viewBox="0 0 18 18" fill="currentColor"><rect x="3" y="2" width="4" height="14" rx="1"/><rect x="11" y="2" width="4" height="14" rx="1"/></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 18 18" fill="currentColor"><path d="M4 2.5L15 9L4 15.5V2.5Z"/></svg>
          )}
        </button>
        <button className="btn btn-sm" onClick={onMenuClick} aria-label="Open menu" style={{ padding: "4px 10px", fontFamily: "var(--font-ui)" }}>☰</button>
      </div>
    </div>
  );
}
