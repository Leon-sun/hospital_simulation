import { Loader2 } from "lucide-react";

export default function WhatIfLoading() {
  return (
    <div className="flex flex-1 items-center justify-center p-12">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        Loading what-if simulation…
      </div>
    </div>
  );
}
