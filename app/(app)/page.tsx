export default function Home() {
  return (
    <div className="flex flex-1 flex-col px-6 py-10 md:px-10">
      <h1 className="font-heading text-2xl uppercase tracking-wide text-foreground">
        Welcome
      </h1>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted">
        KCPT Portal scaffolding is ready. Tracker, Plan, and History
        navigation are placeholders until routes and auth are wired up.
      </p>
    </div>
  );
}
