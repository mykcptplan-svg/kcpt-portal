import type { ReactNode } from "react";

export default function AuthGroupLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-1 items-center justify-center overflow-hidden px-6 py-12">
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-[900px] w-[900px] -translate-x-1/2 -translate-y-[52%] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(251,147,58,0.16) 0%, rgba(236,74,49,0.06) 45%, rgba(250,248,245,0) 72%)",
        }}
      />
      <div
        className="pointer-events-none absolute -left-[120px] -top-[120px] h-[420px] w-[420px] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(247,162,53,0.12) 0%, rgba(250,248,245,0) 70%)",
        }}
      />
      <div className="relative w-full max-w-sm">{children}</div>
    </div>
  );
}
