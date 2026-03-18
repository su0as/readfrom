"use client";
import { useCallback, useEffect, useState } from "react";

export interface LibraryEntry {
  id: string;           // nanoid or timestamp
  title: string;        // first 60 chars of text, or extracted title
  text: string;         // full text (truncated at 50_000 chars for storage)
  wordCount: number;
  savedAt: number;      // unix ms
  lastPlayedAt?: number;
}

const STORAGE_KEY = "rf_library";
const MAX_ENTRIES = 20;

function load(): LibraryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as LibraryEntry[];
  } catch {
    return [];
  }
}

function save(entries: LibraryEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {}
}

export function useLibrary() {
  const [entries, setEntries] = useState<LibraryEntry[]>([]);

  useEffect(() => {
    setEntries(load());
  }, []);

  const addEntry = useCallback((entry: Omit<LibraryEntry, "id" | "savedAt">) => {
    setEntries((prev) => {
      // dedupe by title (first 60 chars)
      const filtered = prev.filter((e) => e.title !== entry.title);
      const newEntry: LibraryEntry = {
        ...entry,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        savedAt: Date.now(),
        text: entry.text.slice(0, 50_000),
      };
      const updated = [newEntry, ...filtered].slice(0, MAX_ENTRIES);
      save(updated);
      return updated;
    });
  }, []);

  const updateLastPlayed = useCallback((id: string) => {
    setEntries((prev) => {
      const updated = prev.map((e) =>
        e.id === id ? { ...e, lastPlayedAt: Date.now() } : e
      );
      save(updated);
      return updated;
    });
  }, []);

  const removeEntry = useCallback((id: string) => {
    setEntries((prev) => {
      const updated = prev.filter((e) => e.id !== id);
      save(updated);
      return updated;
    });
  }, []);

  const clearAll = useCallback(() => {
    save([]);
    setEntries([]);
  }, []);

  return { entries, addEntry, updateLastPlayed, removeEntry, clearAll };
}
