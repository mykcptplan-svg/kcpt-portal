"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import HeartLoader from "@/components/HeartLoader";
import { useProfile } from "@/lib/context/ProfileContext";
import { isUuid } from "@/lib/kcptPlan";

/**
 * The plan editor now lives in Coach Review. This route only forwards old
 * bookmarks to /coach-review?member=<id>&tab=plan. Non-admins are sent home, as
 * before (client-side guard only; the server enforces access).
 */
export default function PlanEditorRedirectPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = typeof params.id === "string" ? params.id : "";
  const { profile, loading } = useProfile();

  useEffect(() => {
    if (loading || !profile) return;
    if (profile.role !== "admin") {
      router.replace("/");
      return;
    }
    router.replace(
      isUuid(id) ? `/coach-review?member=${id}&tab=plan` : "/coach-review",
    );
  }, [loading, profile, id, router]);

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-10">
      <HeartLoader size={192} />
    </div>
  );
}
