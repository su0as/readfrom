"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <html>
      <body style={{ padding: 24 }}>
        <h2>Something went wrong</h2>
        <pre style={{ whiteSpace: "pre-wrap" }}>{error.message}</pre>
        <button onClick={() => reset()} style={{ marginTop: 12 }}>
          Try again
        </button>
      </body>
    </html>
  );
}
