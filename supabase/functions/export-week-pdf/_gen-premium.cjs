/**
 * Regenerates index.ts with premium layout + Oswald fonts.
 * Wordmark base64 is read from _wm.b64.txt (extracted from current index).
 */
const fs = require("fs");
const path = require("path");

const dir = __dirname;
const wm = fs.readFileSync(path.join(dir, "_wm.b64.txt"), "utf8").trim();

const code = `/**
 * export-week-pdf Edge Function
 *
 * GET ?week_start=YYYY-MM-DD — branded PDF for the caller's week data.
 * Uses caller JWT only (no service_role). RLS applies.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { PDFDocument, rgb } from "npm:pdf-lib@1.17.1";
import fontkit from "npm:@pdf-lib/fontkit@1.1.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const WEEK_START_PATTERN = /^\\d{4}-\\d{2}-\\d{2}$/;

const ORANGE = rgb(0xf7 / 255, 0xa2 / 255, 0x35 / 255);
const ORANGE_DARK = rgb(0xec / 255, 0x4a / 255, 0x31 / 255);
const DARK = rgb(0x1a / 255, 0x16 / 255, 0x13 / 255);
const MUTED = rgb(0x8a / 255, 0x81 / 255, 0x78 / 255);
const RULE = rgb(0xee / 255, 0xee / 255, 0xee / 255);
const CARD_FILL = rgb(0xfa / 255, 0xf8 / 255, 0xf5 / 255);
const PILL_BG = rgb(0xfd / 255, 0xf1 / 255, 0xde / 255);
const WHITE = rgb(1, 1, 1);

const WORDMARK_BASE64 = ${JSON.stringify(wm)};

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const APPROACH_LABELS: Record<string, string> = {
  orange_base: "Orange Base",
  meal_bank: "KCPT Meal Bank",
  own: "My Own Meal",
};

type PdfFont = {
  widthOfTextAtSize: (text: string, size: number) => number;
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
  const fmt = (d: Date) =>
    months[d.getUTCMonth()] + " " + d.getUTCDate() + ", " + d.getUTCFullYear();
  // Same year → "Jul 20 - Jul 26, 2026"
  if (monday.getUTCFullYear() === sunday.getUTCFullYear()) {
    return (
      months[monday.getUTCMonth()] +
      " " +
      monday.getUTCDate() +
      " - " +
      months[sunday.getUTCMonth()] +
      " " +
      sunday.getUTCDate() +
      ", " +
      sunday.getUTCFullYear()
    );
  }
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
  font: PdfFont,
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

function trackedWidth(
  text: string,
  size: number,
  font: PdfFont,
  tracking: number,
): number {
  let w = 0;
  for (let i = 0; i < text.length; i++) {
    w += font.widthOfTextAtSize(text[i], size);
    if (i < text.length - 1) w += tracking;
  }
  return w;
}

function roundedRectPath(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): string {
  const rr = Math.min(r, w / 2, h / 2);
  return [
    "M " + (x + rr) + " " + y,
    "L " + (x + w - rr) + " " + y,
    "Q " + (x + w) + " " + y + " " + (x + w) + " " + (y + rr),
    "L " + (x + w) + " " + (y + h - rr),
    "Q " + (x + w) + " " + (y + h) + " " + (x + w - rr) + " " + (y + h),
    "L " + (x + rr) + " " + (y + h),
    "Q " + x + " " + (y + h) + " " + x + " " + (y + h - rr),
    "L " + x + " " + (y + rr),
    "Q " + x + " " + y + " " + (x + rr) + " " + y,
    "Z",
  ].join(" ");
}

function stringList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((x) => x.trim());
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
    pdfDoc.registerFontkit(fontkit);

    const [oswaldBoldBytes, oswaldRegBytes] = await Promise.all([
      Deno.readFile(new URL("./assets/Oswald-Bold.ttf", import.meta.url)),
      Deno.readFile(new URL("./assets/Oswald-Regular.ttf", import.meta.url)),
    ]);
    const fontBold = await pdfDoc.embedFont(oswaldBoldBytes);
    const font = await pdfDoc.embedFont(oswaldRegBytes);

    let page = pdfDoc.addPage([612, 792]);
    const margin = 48;
    const pageWidth = 612;
    const pageHeight = 792;
    const maxWidth = pageWidth - margin * 2;
    const labelColW = 78;
    const dayColW = 56;
    const avgColW = maxWidth - labelColW - dayColW * 7;

    const logoBytes = base64ToBytes(WORDMARK_BASE64);
    const logoImage = await pdfDoc.embedPng(logoBytes);
    const logoH = 22;
    const logoW = (logoImage.width / logoImage.height) * logoH;

    let y = pageHeight - margin;

    const drawTrackedText = (
      text: string,
      x: number,
      baseline: number,
      size: number,
      f: PdfFont,
      color: ReturnType<typeof rgb>,
      tracking: number,
    ) => {
      let cx = x;
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        page.drawText(ch, { x: cx, y: baseline, size, font: f, color });
        cx += f.widthOfTextAtSize(ch, size) + tracking;
      }
    };

    const drawTrackedRight = (
      text: string,
      rightX: number,
      baseline: number,
      size: number,
      f: PdfFont,
      color: ReturnType<typeof rgb>,
      tracking: number,
    ) => {
      const w = trackedWidth(text, size, f, tracking);
      drawTrackedText(text, rightX - w, baseline, size, f, color, tracking);
    };

    // --- Header ---
    page.drawImage(logoImage, {
      x: margin,
      y: y - logoH,
      width: logoW,
      height: logoH,
    });

    const title = "WEEKLY SUMMARY";
    const titleSize = 24;
    const titleTrack = 1.2;
    drawTrackedRight(
      title,
      pageWidth - margin,
      y - 16,
      titleSize,
      fontBold,
      DARK,
      titleTrack,
    );

    const weekRange = formatWeekRange(weekStart);
    const weekSize = 9;
    const weekW = font.widthOfTextAtSize(weekRange, weekSize);
    page.drawText(weekRange, {
      x: pageWidth - margin - weekW,
      y: y - 30,
      size: weekSize,
      font,
      color: MUTED,
    });

    y -= Math.max(logoH, 34) + 12;
    page.drawLine({
      start: { x: margin, y },
      end: { x: pageWidth - margin, y },
      thickness: 1.25,
      color: DARK,
    });
    y -= 22;

    const ensureSpace = (needed: number) => {
      if (y - needed < 56) {
        page = pdfDoc.addPage([612, 792]);
        y = pageHeight - margin;
      }
    };

    const drawRoundedRect = (
      x: number,
      bottom: number,
      w: number,
      h: number,
      r: number,
      color: ReturnType<typeof rgb>,
    ) => {
      page.drawSvgPath(roundedRectPath(x, bottom, w, h, r), {
        color,
        borderWidth: 0,
      });
    };

    const drawSectionTitle = (
      label: string,
      opts?: { badge?: string; x?: number; width?: number },
    ) => {
      const x0 = opts?.x ?? margin;
      const w0 = opts?.width ?? maxWidth;
      ensureSpace(40);
      page.drawRectangle({
        x: x0,
        y: y - 3,
        width: 3,
        height: 13,
        color: ORANGE,
      });
      const t = label.toUpperCase();
      drawTrackedText(t, x0 + 10, y, 12, fontBold, DARK, 0.6);
      if (opts?.badge) {
        const badge = opts.badge.toUpperCase();
        const badgeSize = 7.5;
        const padX = 10;
        const padY = 4;
        const badgeW = fontBold.widthOfTextAtSize(badge, badgeSize);
        const boxW = badgeW + padX * 2;
        const boxH = badgeSize + padY * 2;
        const boxX = x0 + w0 - boxW;
        const boxY = y - 4;
        drawRoundedRect(boxX, boxY, boxW, boxH, boxH / 2, PILL_BG);
        page.drawText(badge, {
          x: boxX + padX,
          y: boxY + padY,
          size: badgeSize,
          font: fontBold,
          color: ORANGE_DARK,
        });
      }
      y -= 24;
    };

    const wrapText = (
      text: string,
      width: number,
      f: PdfFont,
      size: number,
    ): string[] => {
      const words = text.split(" ");
      const lines: string[] = [];
      let line = "";
      for (const word of words) {
        const test = line ? line + " " + word : word;
        if (f.widthOfTextAtSize(test, size) > width && line) {
          lines.push(line);
          line = word;
        } else {
          line = test;
        }
      }
      if (line) lines.push(line);
      return lines.length ? lines : [""];
    };

    const drawTextLine = (
      text: string,
      opts?: {
        bold?: boolean;
        size?: number;
        color?: ReturnType<typeof rgb>;
        x?: number;
        width?: number;
      },
    ) => {
      const size = opts?.size ?? 10;
      const f = opts?.bold ? fontBold : font;
      const color = opts?.color ?? DARK;
      const x0 = opts?.x ?? margin;
      const w0 = opts?.width ?? maxWidth;
      for (const line of wrapText(text, w0, f, size)) {
        ensureSpace(size + 6);
        page.drawText(line, { x: x0, y, size, font: f, color });
        y -= size + 4;
      }
    };

    const drawSubhead = (label: string, x0: number) => {
      drawTrackedText(label.toUpperCase(), x0, y, 8, fontBold, MUTED, 0.8);
    };

    // --- Food Plan (2x2) ---
    const approach = plan ? String(plan.nutrition_approach ?? "") : "";
    const approachBadge = plan
      ? APPROACH_LABELS[approach] ?? (approach || undefined)
      : undefined;
    drawSectionTitle("Food Plan", { badge: approachBadge });

    if (!plan) {
      drawTextLine("Not filled this week.", { color: MUTED });
    } else {
      const breakfasts = stringList(plan.breakfasts);
      const lunches = stringList(plan.lunches);
      const snacks = [
        ...stringList(plan.trigger_snacks),
        ...stringList(plan.desserts),
      ];
      const evening = Array.isArray(plan.evening_meals)
        ? (plan.evening_meals as Record<string, unknown>[])
        : [];
      const dinners = evening
        .map((e) => (typeof e.meal === "string" ? e.meal.trim() : ""))
        .filter((m) => m.length > 0);

      const colGap = 20;
      const colW = (maxWidth - colGap) / 2;
      const leftX = margin;
      const rightX = margin + colW + colGap;
      const joinItems = (items: string[]) =>
        items.length ? items.join("  ·  ") : "-";

      const drawFoodCell = (
        label: string,
        items: string[],
        x0: number,
        topY: number,
      ): number => {
        let cy = topY;
        drawTrackedText(label.toUpperCase(), x0, cy, 8, fontBold, MUTED, 0.8);
        cy -= 14;
        const body = joinItems(items);
        const color = items.length ? DARK : MUTED;
        for (const line of wrapText(body, colW, font, 9.5)) {
          page.drawText(line, {
            x: x0,
            y: cy,
            size: 9.5,
            font,
            color,
          });
          cy -= 13;
        }
        return cy;
      };

      ensureSpace(90);
      const row1Top = y;
      const leftBottom = drawFoodCell("Breakfasts", breakfasts, leftX, row1Top);
      const rightBottom = drawFoodCell("Lunches", lunches, rightX, row1Top);
      y = Math.min(leftBottom, rightBottom) - 10;
      ensureSpace(70);
      const row2Top = y;
      const left2 = drawFoodCell("Dinners", dinners, leftX, row2Top);
      const right2 = drawFoodCell("Snacks", snacks, rightX, row2Top);
      y = Math.min(left2, right2) - 4;

      if (
        breakfasts.length === 0 &&
        lunches.length === 0 &&
        dinners.length === 0 &&
        snacks.length === 0
      ) {
        y = row1Top;
        drawTextLine("No meals set this week.", { color: MUTED });
      }
    }
    y -= 18;

    // --- Non-Negotiables ---
    drawSectionTitle("Non-Negotiables");
    {
      const labels = nonNegotiables.map((s) => s.trim());
      const cols = 3;
      const gap = 10;
      const cardW = (maxWidth - gap * (cols - 1)) / cols;
      const cardH = 36;
      const radius = 14;
      ensureSpace(cardH + 8);
      for (let i = 0; i < 3; i++) {
        const x = margin + i * (cardW + gap);
        const bottom = y - cardH;
        drawRoundedRect(x, bottom, cardW, cardH, radius, CARD_FILL);
        const label = labels[i] || "-";
        const empty = !labels[i];
        const size = fitCellSize(label, cardW - 16, font, 9.5);
        const tw = font.widthOfTextAtSize(label, size);
        page.drawText(label, {
          x: x + (cardW - tw) / 2,
          y: bottom + (cardH - size) / 2 + 1,
          size,
          font,
          color: empty ? MUTED : DARK,
        });
      }
      y -= cardH + 18;
    }

    // --- Daily Numbers ---
    drawSectionTitle("Daily Numbers");

    const drawCheckmark = (cx: number, cy: number) => {
      // Two-segment check in brand red-orange
      page.drawLine({
        start: { x: cx - 4, y: cy + 1 },
        end: { x: cx - 1, y: cy - 3 },
        thickness: 1.6,
        color: ORANGE_DARK,
      });
      page.drawLine({
        start: { x: cx - 1, y: cy - 3 },
        end: { x: cx + 5, y: cy + 4 },
        thickness: 1.6,
        color: ORANGE_DARK,
      });
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

    if (!trackerRow || !metrics) {
      drawTextLine("No daily numbers recorded this week.", { color: MUTED });
    } else {
      const rowH = 22;
      const pillarKeys = [
        { key: "calories", label: "Calories" },
        { key: "protein", label: "Protein (g)" },
        { key: "water", label: "Water (L)" },
        { key: "steps", label: "Steps" },
        { key: "workout", label: "Workout" },
      ] as const;

      ensureSpace(rowH * (pillarKeys.length + 1) + 12);
      const dayRight = (i: number) => margin + labelColW + dayColW * (i + 1);
      const avgRight = margin + maxWidth;

      // Header
      page.drawText("METRIC", {
        x: margin,
        y,
        size: 8,
        font: fontBold,
        color: DARK,
      });
      for (let i = 0; i < 7; i++) {
        drawRightCell(DAY_LABELS[i], dayRight(i), dayColW, 8, false, MUTED);
      }
      drawRightCell("Avg", avgRight, avgColW, 8, true, ORANGE_DARK);
      y -= rowH;

      for (let pi = 0; pi < pillarKeys.length; pi++) {
        const p = pillarKeys[pi];
        ensureSpace(rowH + 6);
        page.drawText(p.label, {
          x: margin,
          y,
          size: 9,
          font: fontBold,
          color: DARK,
        });

        const series = metrics[p.key];
        for (let i = 0; i < 7; i++) {
          const raw = Array.isArray(series) ? series[i] : null;
          if (p.key === "workout") {
            if (raw === true) {
              drawCheckmark(dayRight(i) - dayColW / 2, y + 3);
            } else {
              drawRightCell("-", dayRight(i), dayColW, 9, false, MUTED);
            }
          } else {
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
          avgMuted ? MUTED : ORANGE_DARK,
        );

        y -= 5;
        if (pi < pillarKeys.length - 1) {
          page.drawLine({
            start: { x: margin, y },
            end: { x: margin + maxWidth, y },
            thickness: 0.5,
            color: RULE,
          });
        }
        y -= rowH - 5;
      }
    }
    y -= 18;

    // --- Sunday Reset (left) + Measurements (right) ---
    const twoColGap = 22;
    const colWidth = (maxWidth - twoColGap) / 2;
    const rightColX = margin + colWidth + twoColGap;

    const winList = wins.map((s) => s.trim()).filter(Boolean);
    const focusList = nextWeekFocus.map((s) => s.trim()).filter(Boolean);

    type BulletLine =
      | { kind: "sub"; text: string }
      | { kind: "muted"; text: string }
      | { kind: "item"; text: string; bullet: boolean };
    const leftLines: BulletLine[] = [];
    const pushItems = (items: string[]) => {
      if (items.length === 0) {
        leftLines.push({ kind: "muted", text: "-" });
        return;
      }
      for (const w of items) {
        const lines = wrapText(w, colWidth - 14, font, 9.5);
        lines.forEach((ln, idx) => {
          leftLines.push({ kind: "item", text: ln, bullet: idx === 0 });
        });
      }
    };
    if (!trackerRow || (winList.length === 0 && focusList.length === 0)) {
      leftLines.push({ kind: "muted", text: "Not completed this week" });
    } else {
      leftLines.push({ kind: "sub", text: "WINS" });
      pushItems(winList);
      leftLines.push({ kind: "sub", text: "NEXT WEEK FOCUS" });
      pushItems(focusList);
    }

    const measureFields: { key: string; label: string; unit: string }[] = [
      { key: "weight", label: "Weight", unit: "lb" },
      { key: "waist", label: "Waist", unit: "in" },
      { key: "hips", label: "Hips", unit: "in" },
      { key: "arm", label: "Arm", unit: "in" },
      { key: "thigh", label: "Thigh", unit: "in" },
      { key: "calve", label: "Calve", unit: "in" },
    ];
    const measureRows = measureFields.map((f) => {
      const v = measurement?.[f.key];
      const has = typeof v === "number";
      return {
        label: f.label,
        value: has ? v + " " + f.unit : "-",
        muted: !has,
      };
    });

    const headerH = 22;
    const leftBodyH = leftLines.reduce((h, l) => {
      if (l.kind === "sub") return h + 18;
      return h + 14;
    }, 0);
    const rightBodyH = measureRows.length * 20;
    ensureSpace(Math.max(headerH + leftBodyH, headerH + rightBodyH) + 12);
    const sectionTop = y;

    // Left header
    page.drawRectangle({
      x: margin,
      y: sectionTop - 3,
      width: 3,
      height: 13,
      color: ORANGE,
    });
    drawTrackedText(
      "SUNDAY RESET",
      margin + 10,
      sectionTop,
      12,
      fontBold,
      DARK,
      0.6,
    );

    let leftY = sectionTop - headerH;
    for (const l of leftLines) {
      if (l.kind === "sub") {
        drawTrackedText(l.text, margin, leftY, 8, fontBold, MUTED, 0.8);
        leftY -= 16;
      } else if (l.kind === "muted") {
        page.drawText(l.text, {
          x: margin,
          y: leftY,
          size: 9.5,
          font,
          color: MUTED,
        });
        leftY -= 14;
      } else {
        if (l.bullet) {
          page.drawCircle({
            x: margin + 3,
            y: leftY + 3,
            size: 2.2,
            color: DARK,
          });
        }
        page.drawText(l.text, {
          x: margin + 12,
          y: leftY,
          size: 9.5,
          font,
          color: DARK,
        });
        leftY -= 14;
      }
    }

    // Right header
    page.drawRectangle({
      x: rightColX,
      y: sectionTop - 3,
      width: 3,
      height: 13,
      color: ORANGE,
    });
    drawTrackedText(
      "MEASUREMENTS",
      rightColX + 10,
      sectionTop,
      12,
      fontBold,
      DARK,
      0.6,
    );

    let rightY = sectionTop - headerH;
    for (let i = 0; i < measureRows.length; i++) {
      const row = measureRows[i];
      page.drawText(row.label, {
        x: rightColX,
        y: rightY,
        size: 9,
        font,
        color: MUTED,
      });
      const size = 10;
      const f = fontBold;
      const tw = f.widthOfTextAtSize(row.value, size);
      page.drawText(row.value, {
        x: rightColX + colWidth - tw,
        y: rightY,
        size,
        font: f,
        color: row.muted ? MUTED : DARK,
      });
      rightY -= 4;
      if (i < measureRows.length - 1) {
        page.drawLine({
          start: { x: rightColX, y: rightY },
          end: { x: rightColX + colWidth, y: rightY },
          thickness: 0.5,
          color: RULE,
        });
      }
      rightY -= 16;
    }

    y = Math.min(leftY, rightY) - 20;

    // --- Footer with banded gradient ---
    const footerH = 28;
    const footerText = "CONSISTENCY BEATS PERFECTION";
    ensureSpace(footerH + 10);
    const footerBottom = Math.max(36, y - footerH);
    const bands = 16;
    const bandW = pageWidth / bands;
    const oR = 0xf7 / 255;
    const oG = 0xa2 / 255;
    const oB = 0x35 / 255;
    const dR = 0xec / 255;
    const dG = 0x4a / 255;
    const dB = 0x31 / 255;
    for (let i = 0; i < bands; i++) {
      const t = i / (bands - 1);
      page.drawRectangle({
        x: i * bandW,
        y: footerBottom,
        width: bandW + 0.5,
        height: footerH,
        color: rgb(oR + (dR - oR) * t, oG + (dG - oG) * t, oB + (dB - oB) * t),
      });
    }
    // Soft top corners: cover square corners with white so bar reads rounded
    const cr = 10;
    page.drawSvgPath(
      "M 0 " + (footerBottom + footerH) +
        " L 0 " + (footerBottom + footerH - cr) +
        " Q 0 " + (footerBottom + footerH) + " " + cr + " " + (footerBottom + footerH) +
        " Z",
      { color: WHITE, borderWidth: 0 },
    );
    page.drawSvgPath(
      "M " + pageWidth + " " + (footerBottom + footerH) +
        " L " + pageWidth + " " + (footerBottom + footerH - cr) +
        " Q " + pageWidth + " " + (footerBottom + footerH) + " " + (pageWidth - cr) + " " + (footerBottom + footerH) +
        " Z",
      { color: WHITE, borderWidth: 0 },
    );
    const footSize = 11;
    const footTrack = 1.4;
    const footW = trackedWidth(footerText, footSize, fontBold, footTrack);
    drawTrackedText(
      footerText,
      (pageWidth - footW) / 2,
      footerBottom + (footerH - footSize) / 2 + 1,
      footSize,
      fontBold,
      WHITE,
      footTrack,
    );

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
`;

fs.writeFileSync(path.join(dir, "index.ts"), code);
console.log("wrote index.ts", code.length);
