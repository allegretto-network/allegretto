import { createFileRoute } from "@tanstack/react-router";
import LogoWordmark from "../assets/logo_wordmark.svg?react";
import { Button } from "@allegretto-network/ui/components/button";
import { BookOpenIcon } from "lucide-react";

const DOCS_URL = "https://docs.allegretto.network";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [{ title: "Allegretto Network - Agent Commerce Protocol" }],
  }),
  component: Landing,
});

function Landing() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-10 px-6 text-center">
      <LogoWordmark className="h-24 w-auto" />
      <Button size="lg" render={<a target="_blank" href={DOCS_URL} />} variant="outline">
        <BookOpenIcon data-icon="inline-start" />
        Docs
      </Button>
    </main>
  );
}
