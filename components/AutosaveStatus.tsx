import type { SaveStatus } from "@/lib/hooks/useDebouncedSave";

const LABEL: Record<SaveStatus, string> = {
  idle: "",
  saving: "Saving…",
  saved: "All changes saved",
  error: "Couldn't save — retrying on next change",
};

export default function AutosaveStatus({ status }: { status: SaveStatus }) {
  const dotColor =
    status === "saving"
      ? "bg-brand-orange"
      : status === "error"
        ? "bg-brand-orange-dark"
        : "bg-[#8fae8a]";

  return (
    <div className="flex h-[18px] items-center gap-1.5">
      {status !== "idle" && (
        <>
          <span
            className={`h-[7px] w-[7px] rounded-full transition-colors ${dotColor}`}
          />
          <span className="text-[11.5px] font-bold tracking-wide text-muted">
            {LABEL[status]}
          </span>
        </>
      )}
    </div>
  );
}
