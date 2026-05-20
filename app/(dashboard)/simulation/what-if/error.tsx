"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

type WhatIfErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

function isChunkLoadError(error: Error) {
  return (
    error.name === "ChunkLoadError" ||
    error.message.includes("Loading chunk") ||
    error.message.includes("Failed to fetch dynamically imported module")
  );
}

export default function WhatIfError({ error, reset }: WhatIfErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const chunkError = isChunkLoadError(error);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="max-w-md space-y-4 rounded-lg border bg-card p-6 shadow-panel">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="space-y-2">
            <h2 className="text-lg font-semibold">Could not load what-if simulation</h2>
            <p className="text-sm text-muted-foreground">
              {chunkError
                ? "The page script is out of date, usually after a dev rebuild or switching between build and dev."
                : error.message || "An unexpected error occurred."}
            </p>
            {chunkError ? (
              <p className="text-sm text-muted-foreground">
                Stop the dev server, then start it again with{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-xs">npm run dev</code>
                — it clears <code className="rounded bg-muted px-1 py-0.5 text-xs">.next</code> first so
                dev chunks match. Avoid running <code className="rounded bg-muted px-1 py-0.5 text-xs">next build</code> and{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-xs">next dev</code> against the same folder without that
                reset. Hard-refresh the page after restart.
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => reset()}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Try again
          </Button>
          <Button type="button" variant="outline" onClick={() => window.location.reload()}>
            Reload page
          </Button>
        </div>
      </div>
    </div>
  );
}
