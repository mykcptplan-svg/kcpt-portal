/**
 * export-week-pdf Edge Function
 *
 * GET ?week_start=YYYY-MM-DD — branded PDF for the caller's week data.
 * Uses caller JWT only (no service_role). RLS applies.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { PDFDocument, rgb, StandardFonts } from "npm:pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const WEEK_START_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const ORANGE = rgb(0xfb / 255, 0x93 / 255, 0x3a / 255);
const ORANGE_DARK = rgb(0xec / 255, 0x4a / 255, 0x31 / 255);
const DARK = rgb(0x1a / 255, 0x16 / 255, 0x13 / 255);
const MUTED = rgb(0.45, 0.42, 0.4);

const HEART_MARK_BASE64 = "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";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const APPROACH_LABELS: Record<string, string> = {
  orange_base: "Orange Base",
  meal_bank: "KCPT Meal Bank",
  own: "My Own Meal",
};

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function requiredEnv(name: string): string | null {
  const value = Deno.env.get(name);
  return value && value.length > 0 ? value : null;
}

function isValidWeekStart(value: unknown): value is string {
  return typeof value === "string" && WEEK_START_PATTERN.test(value);
}

function formatWeekRange(weekStart: string): string {
  const [year, month, day] = weekStart.split("-").map(Number);
  const monday = new Date(Date.UTC(year, month - 1, day));
  const sunday = new Date(Date.UTC(year, month - 1, day + 6));
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const fmt = (d: Date) => months[d.getUTCMonth()] + " " + d.getUTCDate();
  return fmt(monday) + " - " + fmt(sunday);
}

function coerceNonNegotiables(raw: unknown): string[] {
  const names = ["", "", ""];
  if (!Array.isArray(raw)) return names;
  for (let i = 0; i < 3; i++) {
    const item = raw[i];
    if (typeof item === "string") names[i] = item;
    else if (
      item !== null &&
      typeof item === "object" &&
      !Array.isArray(item) &&
      typeof (item as Record<string, unknown>).name === "string"
    ) {
      names[i] = (item as Record<string, unknown>).name as string;
    }
  }
  return names;
}

function coerceString3(raw: unknown): string[] {
  const out = ["", "", ""];
  if (!Array.isArray(raw)) return out;
  for (let i = 0; i < 3; i++) {
    if (typeof raw[i] === "string") out[i] = raw[i] as string;
  }
  return out;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function avgNumbers(values: unknown): number | null {
  if (!Array.isArray(values)) return null;
  const nums = values.filter((v): v is number => typeof v === "number");
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return "-";
  if (v === true) return "Y";
  if (typeof v === "boolean") return v ? "Y" : "-";
  if (typeof v === "number") {
    return Number.isInteger(v) ? String(v) : v.toFixed(1);
  }
  return String(v);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice("Bearer ".length);
  const supabaseUrl = requiredEnv("SUPABASE_URL");
  const supabaseAnonKey = requiredEnv("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("export-week-pdf: missing environment configuration");
    return jsonResponse({ error: "Unable to export PDF" }, 500);
  }

  const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const {
    data: { user },
    error: userError,
  } = await callerClient.auth.getUser(token);

  if (userError || !user) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const url = new URL(req.url);
  const weekStart = url.searchParams.get("week_start");
  if (!isValidWeekStart(weekStart)) {
    return jsonResponse(
      { error: "week_start query param is required and must be YYYY-MM-DD" },
      400,
    );
  }

  const [planRes, trackerRes, measurementRes] = await Promise.all([
    callerClient
      .from("weekly_base_plans")
      .select("*")
      .eq("user_id", user.id)
      .eq("week_start", weekStart)
      .maybeSingle(),
    callerClient
      .from("weekly_tracker_entries")
      .select("*")
      .eq("user_id", user.id)
      .eq("week_start", weekStart)
      .maybeSingle(),
    callerClient
      .from("weight_measurements")
      .select("*")
      .eq("user_id", user.id)
      .eq("week_start", weekStart)
      .maybeSingle(),
  ]);

  if (planRes.error || trackerRes.error || measurementRes.error) {
    console.error("export-week-pdf: select failed", {
      plan: planRes.error,
      tracker: trackerRes.error,
      measurement: measurementRes.error,
    });
    return jsonResponse({ error: "Unable to load week data" }, 500);
  }

  const plan = planRes.data as Record<string, unknown> | null;
  const trackerRow = trackerRes.data as Record<string, unknown> | null;
  const measurement = measurementRes.data as Record<string, unknown> | null;

  const nonNegotiables = coerceNonNegotiables(trackerRow?.habits);
  const wins = coerceString3(trackerRow?.wins);
  const nextWeekFocus = coerceString3(trackerRow?.next_week_focus);
  const metrics = (trackerRow?.daily_metrics ?? null) as Record<
    string,
    unknown
  > | null;

  try {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    let page = pdfDoc.addPage([612, 792]);
    let y = 742;
    const margin = 48;
    const maxWidth = 612 - margin * 2;

    const logoBytes = base64ToBytes(HEART_MARK_BASE64);
    const logoImage = await pdfDoc.embedPng(logoBytes);
    const logoH = 28;
    const logoW = (logoImage.width / logoImage.height) * logoH;

    page.drawRectangle({
      x: 0,
      y: 762,
      width: 612,
      height: 30,
      color: ORANGE,
    });
    page.drawRectangle({
      x: 0,
      y: 756,
      width: 612,
      height: 6,
      color: ORANGE_DARK,
    });

    page.drawImage(logoImage, {
      x: margin,
      y: y - 6,
      width: logoW,
      height: logoH,
    });
    page.drawText("KCPT", {
      x: margin + logoW + 10,
      y: y + 2,
      size: 18,
      font: fontBold,
      color: DARK,
    });
    y -= 40;

    page.drawText("Week Summary", {
      x: margin,
      y,
      size: 14,
      font: fontBold,
      color: DARK,
    });
    y -= 18;
    page.drawText(formatWeekRange(weekStart), {
      x: margin,
      y,
      size: 11,
      font,
      color: MUTED,
    });
    y -= 28;

    const ensureSpace = (needed: number) => {
      if (y - needed < 48) {
        page = pdfDoc.addPage([612, 792]);
        y = 760;
      }
    };

    const drawSectionTitle = (title: string) => {
      ensureSpace(40);
      page.drawRectangle({
        x: margin,
        y: y - 4,
        width: 4,
        height: 14,
        color: ORANGE,
      });
      page.drawText(title, {
        x: margin + 12,
        y,
        size: 13,
        font: fontBold,
        color: DARK,
      });
      y -= 22;
    };

    const drawLine = (
      text: string,
      opts?: { bold?: boolean; size?: number; color?: ReturnType<typeof rgb> },
    ) => {
      const size = opts?.size ?? 10;
      const f = opts?.bold ? fontBold : font;
      const color = opts?.color ?? DARK;
      const words = text.split(" ");
      let line = "";
      for (const word of words) {
        const test = line ? line + " " + word : word;
        if (f.widthOfTextAtSize(test, size) > maxWidth) {
          ensureSpace(size + 6);
          page.drawText(line, { x: margin, y, size, font: f, color });
          y -= size + 4;
          line = word;
        } else {
          line = test;
        }
      }
      if (line) {
        ensureSpace(size + 6);
        page.drawText(line, { x: margin, y, size, font: f, color });
        y -= size + 4;
      }
    };

    drawSectionTitle("Food Plan");
    if (!plan) {
      drawLine("Not filled this week.", { color: MUTED });
    } else {
      const approach = String(plan.nutrition_approach ?? "");
      drawLine(
        "Approach: " + (APPROACH_LABELS[approach] ?? (approach || "-")),
        { bold: true },
      );
      y -= 4;
      const groups: { label: string; key: string }[] = [
        { label: "Breakfasts", key: "breakfasts" },
        { label: "Lunches", key: "lunches" },
        { label: "Trigger Snacks", key: "trigger_snacks" },
        { label: "Desserts", key: "desserts" },
      ];
      for (const g of groups) {
        const items = Array.isArray(plan[g.key])
          ? (plan[g.key] as unknown[]).filter(
              (x) => typeof x === "string" && x.trim().length > 0,
            )
          : [];
        if (items.length === 0) continue;
        drawLine(g.label, { bold: true, size: 10 });
        for (const item of items) {
          drawLine("  - " + String(item));
        }
        y -= 2;
      }
      const evening = Array.isArray(plan.evening_meals)
        ? (plan.evening_meals as Record<string, unknown>[])
        : [];
      const eveningFilled = evening.filter(
        (e) => typeof e.meal === "string" && e.meal.trim().length > 0,
      );
      if (eveningFilled.length > 0) {
        drawLine("Evening Meals", { bold: true });
        for (const e of eveningFilled) {
          const day = String(e.day ?? "");
          const meal = String(e.meal ?? "");
          const ap = String(e.approach ?? "");
          drawLine(
            "  - " + day + ": " + meal + " (" + (APPROACH_LABELS[ap] ?? ap) + ")",
          );
        }
      }
    }
    y -= 10;

    drawSectionTitle("Success Tracker");
    if (!trackerRow) {
      drawLine("Not filled this week.", { color: MUTED });
    } else {
      const nn = nonNegotiables.map((s) => s.trim()).filter(Boolean);
      drawLine("Non-Negotiables", { bold: true });
      if (nn.length === 0) {
        drawLine("  None set", { color: MUTED });
      } else {
        for (const n of nn) drawLine("  - " + n);
      }
      y -= 4;

      drawLine("Pillars", { bold: true });
      const pillarKeys = [
        { key: "calories", label: "Calories" },
        { key: "protein", label: "Protein (g)" },
        { key: "water", label: "Water (L)" },
        { key: "steps", label: "Steps" },
        { key: "workout", label: "Workout" },
      ] as const;

      if (!metrics) {
        drawLine("  No pillar data", { color: MUTED });
      } else {
        drawLine("  Day: " + DAY_LABELS.join("  "), { size: 8, color: MUTED });
        for (const p of pillarKeys) {
          const series = metrics[p.key];
          const cells = Array.isArray(series)
            ? series.map(formatCell).join("  ")
            : "-";
          let avgStr = "";
          if (p.key === "workout") {
            const count = Array.isArray(series)
              ? series.filter((v) => v === true).length
              : 0;
            avgStr = " (" + count + "/7)";
          } else if (p.key === "calories") {
            const avg = avgNumbers(series);
            avgStr = avg != null ? " (avg " + Math.round(avg) + ")" : "";
          } else {
            const avg = avgNumbers(series);
            avgStr =
              avg != null
                ? " (avg " +
                  (p.key === "water"
                    ? avg.toFixed(1)
                    : String(Math.round(avg))) +
                  ")"
                : "";
          }
          drawLine("  " + p.label + ": " + cells + avgStr, { size: 9 });
        }
      }
      y -= 4;

      drawLine("Sunday Reset", { bold: true });
      const winList = wins.map((s) => s.trim()).filter(Boolean);
      const focusList = nextWeekFocus.map((s) => s.trim()).filter(Boolean);
      if (winList.length === 0 && focusList.length === 0) {
        drawLine("  Not completed this week", { color: MUTED });
      } else {
        if (winList.length > 0) {
          drawLine("  Wins:", { bold: true, size: 9 });
          winList.forEach((w, i) => drawLine("    " + (i + 1) + ". " + w));
        }
        if (focusList.length > 0) {
          drawLine("  Next week focus:", { bold: true, size: 9 });
          focusList.forEach((w, i) => drawLine("    " + (i + 1) + ". " + w));
        }
      }
    }
    y -= 10;

    drawSectionTitle("Weight & Measurements");
    if (!measurement) {
      drawLine("Not filled this week.", { color: MUTED });
    } else {
      const fields: { key: string; label: string; unit: string }[] = [
        { key: "weight", label: "Weight", unit: "lbs" },
        { key: "waist", label: "Waist", unit: "in" },
        { key: "hips", label: "Hips", unit: "in" },
        { key: "arm", label: "Arm", unit: "in" },
        { key: "thigh", label: "Thigh", unit: "in" },
        { key: "calve", label: "Calve", unit: "in" },
      ];
      let any = false;
      for (const f of fields) {
        const v = measurement[f.key];
        if (typeof v === "number") {
          any = true;
          drawLine("  " + f.label + ": " + v + " " + f.unit);
        }
      }
      if (!any) drawLine("  No measurements recorded", { color: MUTED });
    }

    y -= 20;
    ensureSpace(20);
    page.drawText("Consistency Beats Perfection", {
      x: margin,
      y,
      size: 10,
      font: fontBold,
      color: ORANGE_DARK,
    });

    const pdfBytes = await pdfDoc.save();
    return new Response(pdfBytes, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition":
          'attachment; filename="kcpt-week-' + weekStart + '.pdf"',
      },
    });
  } catch (err) {
    console.error("export-week-pdf: generate failed", err);
    return jsonResponse({ error: "Unable to generate PDF" }, 500);
  }
});
