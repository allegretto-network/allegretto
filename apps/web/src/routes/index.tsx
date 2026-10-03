import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [{ title: "Allegretto Network - Agent Commerce Protocol" }],
  }),
  component: Home,
});

function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <h1 className="font-serif text-6xl font-medium tracking-tight">Allegretto Network</h1>
    </main>
  );
}
