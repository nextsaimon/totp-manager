import Link from "next/link";
import { Button } from "@/components/ui/button";
import { TriangleAlert } from "lucide-react";

export default function NotFound() {
  return (
    <main className="min-h-screen w-full flex flex-col items-center justify-center bg-background p-4 text-center">
      <div className="flex flex-col items-center space-y-4">
        <TriangleAlert
          className="h-16 w-16 text-destructive"
          strokeWidth={1.5}
        />

        <h1 className="text-8xl font-extrabold tracking-tighter text-foreground animate-pulse">
          404
        </h1>

        <h2 className="text-3xl font-semibold tracking-tight text-foreground">
          Page Not Found
        </h2>

        <p className="max-w-md text-muted-foreground">
          Oops! The page you're looking for doesn't exist. It might have been
          moved, renamed, or you may have a typo in the URL.
        </p>

        <Link href="/">
          <Button className="mt-4">Go Back Home</Button>
        </Link>
      </div>
    </main>
  );
}
