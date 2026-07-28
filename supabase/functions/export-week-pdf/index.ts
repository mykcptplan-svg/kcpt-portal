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
const RULE = rgb(0.85, 0.83, 0.8);
const CARD_FILL = rgb(0.98, 0.97, 0.95);

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

function fitCellSize(
  text: string,
  maxWidth: number,
  font: { widthOfTextAtSize: (t: string, s: number) => number },
  baseSize: number,
  minSize = 6,
): number {
  let size = baseSize;
  const pad = 2;
  while (size > minSize && font.widthOfTextAtSize(text, size) > maxWidth - pad) {
    size -= 0.5;
  }
  return size;
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
    const pageWidth = 612;
    const maxWidth = pageWidth - margin * 2;
    const labelColW = 78;
    const dayColW = 56;
    const avgColW = maxWidth - labelColW - dayColW * 7;

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

    const weekRange = formatWeekRange(weekStart);
    const weekSize = 9;
    const weekW = font.widthOfTextAtSize(weekRange, weekSize);
    page.drawText(weekRange, {
      x: pageWidth - margin - weekW,
      y: y + 4,
      size: weekSize,
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
      ensureSpace(36);
      page.drawRectangle({
        x: margin,
        y: y - 3,
        width: 3,
        height: 12,
        color: ORANGE,
      });
      page.drawText(title, {
        x: margin + 10,
        y,
        size: 12,
        font: fontBold,
        color: DARK,
      });
      y -= 18;
    };

    const drawTextLine = (
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

    const drawRightCell = (
      text: string,
      colRight: number,
      colWidth: number,
      baseSize: number,
      useBold: boolean,
      color: ReturnType<typeof rgb>,
    ) => {
      const f = useBold ? fontBold : font;
      const size = fitCellSize(text, colWidth, f, baseSize);
      const tw = f.widthOfTextAtSize(text, size);
      page.drawText(text, {
        x: colRight - tw,
        y,
        size,
        font: f,
        color,
      });
    };

    const drawPillarsTable = (dailyMetrics: Record<string, unknown>) => {
      const rowH = 17;
      const pillarKeys = [
        { key: "calories", label: "Calories" },
        { key: "protein", label: "Protein (g)" },
        { key: "water", label: "Water (L)" },
        { key: "steps", label: "Steps" },
        { key: "workout", label: "Workout" },
      ] as const;

      ensureSpace(rowH * (pillarKeys.length + 1) + 8);

      const dayRight = (i: number) => margin + labelColW + dayColW * (i + 1);
      const avgRight = margin + maxWidth;

      // Header
      for (let i = 0; i < 7; i++) {
        drawRightCell(DAY_LABELS[i], dayRight(i), dayColW, 8, false, MUTED);
      }
      drawRightCell("Avg", avgRight, avgColW, 8, false, MUTED);
      y -= 4;
      page.drawLine({
        start: { x: margin, y },
        end: { x: margin + maxWidth, y },
        thickness: 0.5,
        color: RULE,
      });
      y -= rowH - 4;

      for (const p of pillarKeys) {
        ensureSpace(rowH + 4);
        page.drawText(p.label, {
          x: margin,
          y,
          size: 9,
          font,
          color: DARK,
        });

        const series = dailyMetrics[p.key];
        for (let i = 0; i < 7; i++) {
          const raw = Array.isArray(series) ? series[i] : null;
          const text = formatCell(raw);
          const empty = text === "-";
          drawRightCell(
            text,
            dayRight(i),
            dayColW,
            9,
            false,
            empty ? MUTED : DARK,
          );
        }

        let avgText = "-";
        let avgMuted = true;
        if (p.key === "workout") {
          const count = Array.isArray(series)
            ? series.filter((v) => v === true).length
            : 0;
          avgText = count + "/7";
          avgMuted = false;
        } else {
          const avg = avgNumbers(series);
          if (avg != null) {
            avgMuted = false;
            avgText =
              p.key === "water" ? avg.toFixed(1) : String(Math.round(avg));
          }
        }
        drawRightCell(
          avgText,
          avgRight,
          avgColW,
          9,
          true,
          avgMuted ? MUTED : DARK,
        );

        y -= 4;
        page.drawLine({
          start: { x: margin, y },
          end: { x: margin + maxWidth, y },
          thickness: 0.5,
          color: RULE,
        });
        y -= rowH - 4;
      }
    };

    const drawMeasurementCards = (
      cards: { label: string; value: string }[],
    ) => {
      const cols = 3;
      const gap = 10;
      const cardW = (maxWidth - gap * (cols - 1)) / cols;
      const cardH = 40;
      const padX = 10;
      const rows = Math.ceil(cards.length / cols);
      ensureSpace(rows * (cardH + gap));

      for (let i = 0; i < cards.length; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = margin + col * (cardW + gap);
        const top = y - row * (cardH + gap);
        const cardBottom = top - cardH;

        page.drawRectangle({
          x,
          y: cardBottom,
          width: cardW,
          height: cardH,
          color: CARD_FILL,
        });
        page.drawText(cards[i].label, {
          x: x + padX,
          y: top - 14,
          size: 8,
          font,
          color: MUTED,
        });
        page.drawText(cards[i].value, {
          x: x + padX,
          y: top - 30,
          size: 12,
          font: fontBold,
          color: DARK,
        });
      }
      y -= rows * (cardH + gap);
    };

    drawSectionTitle("Food Plan");
    if (!plan) {
      drawTextLine("Not filled this week.", { color: MUTED });
    } else {
      const approach = String(plan.nutrition_approach ?? "");
      drawTextLine(
        "Approach: " + (APPROACH_LABELS[approach] ?? (approach || "-")),
        { bold: true },
      );
      y -= 2;
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
        drawTextLine(g.label, { bold: true, size: 10 });
        for (const item of items) {
          drawTextLine("  - " + String(item));
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
        drawTextLine("Evening Meals", { bold: true });
        for (const e of eveningFilled) {
          const day = String(e.day ?? "");
          const meal = String(e.meal ?? "");
          const ap = String(e.approach ?? "");
          drawTextLine(
            "  - " + day + ": " + meal + " (" + (APPROACH_LABELS[ap] ?? ap) + ")",
          );
        }
      }
    }
    y -= 12;

    drawSectionTitle("Success Tracker");
    if (!trackerRow) {
      drawTextLine("Not filled this week.", { color: MUTED });
    } else {
      const nn = nonNegotiables.map((s) => s.trim()).filter(Boolean);
      drawTextLine("Non-Negotiables", { bold: true });
      if (nn.length === 0) {
        drawTextLine("  None set", { color: MUTED });
      } else {
        for (const n of nn) drawTextLine("  - " + n);
      }
      y -= 4;

      drawTextLine("Pillars", { bold: true });
      if (!metrics) {
        drawTextLine("  No pillar data", { color: MUTED });
      } else {
        drawPillarsTable(metrics);
      }
      y -= 4;

      drawTextLine("Sunday Reset", { bold: true });
      const winList = wins.map((s) => s.trim()).filter(Boolean);
      const focusList = nextWeekFocus.map((s) => s.trim()).filter(Boolean);
      if (winList.length === 0 && focusList.length === 0) {
        drawTextLine("  Not completed this week", { color: MUTED });
      } else {
        if (winList.length > 0) {
          drawTextLine("  Wins:", { bold: true, size: 9 });
          winList.forEach((w, i) => drawTextLine("    " + (i + 1) + ". " + w));
        }
        if (focusList.length > 0) {
          drawTextLine("  Next week focus:", { bold: true, size: 9 });
          focusList.forEach((w, i) =>
            drawTextLine("    " + (i + 1) + ". " + w)
          );
        }
      }
    }
    y -= 12;

    drawSectionTitle("Weight & Measurements");
    if (!measurement) {
      drawTextLine("Not filled this week.", { color: MUTED });
    } else {
      const fields: { key: string; label: string; unit: string }[] = [
        { key: "weight", label: "Weight", unit: "lbs" },
        { key: "waist", label: "Waist", unit: "in" },
        { key: "hips", label: "Hips", unit: "in" },
        { key: "arm", label: "Arm", unit: "in" },
        { key: "thigh", label: "Thigh", unit: "in" },
        { key: "calve", label: "Calve", unit: "in" },
      ];
      const cards: { label: string; value: string }[] = [];
      for (const f of fields) {
        const v = measurement[f.key];
        if (typeof v === "number") {
          cards.push({ label: f.label, value: v + " " + f.unit });
        }
      }
      if (cards.length === 0) {
        drawTextLine("  No measurements recorded", { color: MUTED });
      } else {
        drawMeasurementCards(cards);
      }
    }

    y -= 16;
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
