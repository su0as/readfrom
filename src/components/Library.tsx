"use client";
import { LibraryEntry } from "@/hooks/useLibrary";

interface LibraryProps {
  entries: LibraryEntry[];
  onSelect: (entry: LibraryEntry) => void;
  onRemove: (id: string) => void;
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function Library({ entries, onSelect, onRemove }: LibraryProps) {
  if (entries.length === 0) return null;

  return (
    <div className="library" style={{ marginTop: 32 }}>
      <div style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--muted)", marginBottom: 12, fontWeight: 500, letterSpacing: "0.05em", textTransform: "uppercase" }}>
        Recent
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {entries.map((entry) => (
          <div
            key={entry.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 14px",
              border: "1px solid var(--border)",
              borderRadius: 8,
              cursor: "pointer",
              background: "var(--surface)",
              transition: "border-color 0.15s",
            }}
            onClick={() => onSelect(entry)}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: "var(--font-spectral)", fontSize: 15, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {entry.title}
              </div>
              <div style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                {entry.wordCount} words · {timeAgo(entry.savedAt)}
              </div>
            </div>
            <button
              className="btn btn-sm"
              onClick={(e) => { e.stopPropagation(); onRemove(entry.id); }}
              aria-label="Remove"
              style={{ flexShrink: 0, padding: "2px 8px", fontFamily: "var(--font-ui)", fontSize: 12 }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
