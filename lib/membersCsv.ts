/**
 * Client-side CSV download for Admin members export.
 * Escapes cells per RFC 4180 (wrap in quotes; double internal quotes).
 */
import type { MemberListItem } from "@/lib/api/admin";

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatJoinedDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatLocalDateStamp(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function buildMembersCsv(members: MemberListItem[]): string {
  const header = [
    "Full Name",
    "Email",
    "Status",
    "Coach Review",
    "Role",
    "Joined",
  ];
  const rows = members.map((m) => [
    m.full_name,
    m.email ?? "",
    m.status,
    m.coach_review_enabled ? "Yes" : "No",
    m.role,
    formatJoinedDate(m.created_at),
  ]);

  return [header, ...rows]
    .map((cols) => cols.map((c) => escapeCsvCell(c)).join(","))
    .join("\r\n");
}

export function downloadMembersCsv(members: MemberListItem[]): void {
  const csv = buildMembersCsv(members);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `kcpt-members-${formatLocalDateStamp()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
