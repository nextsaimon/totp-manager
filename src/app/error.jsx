"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ServerCrash } from "lucide-react";

export default function Error({ error, reset }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="min-h-screen w-full flex flex-col items-center justify-center bg-background p-4 text-center">
      <div className="flex flex-col items-center space-y-4 max-w-lg">
        <ServerCrash className="h-16 w-16 text-destructive" strokeWidth={1.5} />

        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Oops! Something Went Wrong
        </h1>

        <p className="text-muted-foreground">
          An unexpected error occurred. We've logged the issue and are looking
          into it. Please try again, or return to the home page if the problem
          persists.
        </p>

        <div className="mt-6 flex items-center gap-4">
          <Button onClick={() => reset()}>Try Again</Button>
          <Link href="/">
            <Button variant="outline">Go Back Home</Button>
          </Link>
        </div>
      </div>
    </main>
  );
}
