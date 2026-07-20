# Milestone 1b — Remaining screens (brief for Cursor)

## Already done — don't redo, build on top of it
- Stack: Next.js 16 (App Router) + React 19 + Tailwind v4
- Read `AGENTS.md` first — architecture rules (frontend never calls Supabase
  directly, everything through `lib/api/*.ts` → Edge Functions, Bearer auth)
- Data shapes: `types/index.ts`
- Brand tokens live in `app/globals.css` under `@theme inline`:
  - `--color-brand-orange` (#FB933A), `--color-brand-orange-light` (#F7A235),
    `--color-brand-orange-dark` (#EC4A31)
  - `--color-background` (#000), `--color-foreground`, `--color-muted`,
    `--color-border`
  - Fonts: `--font-heading` (Anton — uppercase, headers only),
    `--font-sans` (Inter — body text)
  - Use the Tailwind utility classes these generate: `bg-brand-orange`,
    `text-foreground`, `font-heading`, `border-border`, etc. — don't
    hardcode hex values in components.
- Routes: `app/(app)/` = authenticated shell, wrapped in `NavShell`
  (sidebar desktop / bottom tabs mobile). `app/(auth)/` = centered,
  no nav — `login` and `set-password` are done and visually confirmed.
- Logo assets: `public/brand/heart-mark.png` (heart icon, transparent bg,
  use for small marks) and the wordmark files also in `public/brand/`.
- `lib/api/*.ts` are stubs (`tracker.ts`, `basePlan.ts`, `measurements.ts`)
  — follow their pattern for any new data calls: `fetch` + comment for the
  Edge Function TODO, `Authorization: Bearer <token>`, never a direct
  Supabase client call from a component.

## ⚠️ Flag for Neven before building #2 (Evening Meals)
`WeeklyBasePlan.evening_meals` in `types/index.ts` is currently typed as
`string[]`. The actual screen needs one entry per day of the week, each
with a meal text field AND a 3-way choice (`KCPT Meal Bank` /
`Orange Base` / `My Own Meal`) — so it needs a richer shape, something like
`{ day: string; meal: string; approach: "meal_bank" | "orange_base" | "own" }[]`.
This is a data-model change (Neven's territory per Milestone split) —
confirm with him before or while building this screen.

## 1. Weekly Base Plan screen
Matches `WeeklyBasePlan` type. Sections, each with manual text inputs
(NOT a recipe database/search — that's the Interactive Meal Bank, explicitly
out of MVP scope):
- Nutrition approach toggle: "Orange Base" vs "KCPT Meal Bank"
- Breakfasts — 2–3 text inputs (3rd optional)
- Lunches — 2–3 text inputs (3rd optional)
- Trigger Snacks — 2–3 text inputs (3rd optional)
- Desserts — 1–2 text inputs (2nd optional)
No calories/macros anywhere on this screen.

## 2. Evening Meals screen
Accordion layout, one day expanded at a time (decision made over the
table-layout alternative — accordion fits mobile better). 7 days,
Mon–Sun. Each day: meal text input + 3-way choice (see data-model flag
above). See `docs/wireframes` conversation history / ask Ivan for the
reference wireframe if needed.

Each collapsed day row needs a completion indicator (e.g. a checkmark or
filled/empty visual state) so the user can tell at a glance which days are
done without opening every accordion item — accordion trades away the
"see the whole week at once" view a table would give, this indicator is
what makes up for that trade-off. Don't ship the accordion without it.

## 3. Weekly Success Tracker screen
Matches `WeeklyTrackerEntry` type (`habits: HabitDayStatus[]`, each
`{ name, days: boolean[7] }`, plus `sunday_reset_done`).
- Top: "My Non-Negotiables" inputs — step target (number), workout goal
  (type + session count), daily water target
- Matrix below: rows = habits (Stuck to Base Plan / Hit Step Target /
  Hit Water Target / Completed Workout), columns = Mon–Sun checkboxes.
  Visual reference: flame-icon checkmarks per day (dark theme, orange),
  not plain checkboxes — matches the brand's heart/flame mark.
- Bottom: "Completed my Sunday Reset" checkbox

## 4. Autosave visual indicator
Small "Saving…" / "Saved" text indicator, debounced (don't fire on every
keystroke). Build with local component state for now — actual persistence
call is Milestone 1a's job once the Edge Functions exist. Reuse across
Base Plan, Evening Meals, and Tracker forms — make it one shared component,
not copy-pasted three times.

## Known items to revisit (not blocking)
- Navigation currently uses plain `<a href>` everywhere (NavShell, dashboard
  cards) instead of Next.js `<Link>`, causing a full page reload on every
  internal nav click instead of client-side transitions. Worth fixing in
  one pass across NavShell + all cards together once more routes exist —
  don't fix piecemeal in a single component, it'll just create the
  inconsistency the other way.

## 5. Mobile responsive pass + e2e QA
Check every screen at mobile width first (this is a mobile-first product —
desktop is secondary). Once Milestone 1a's auth is wired end to end, test
the full flow on a real device inside the Passion.io in-app webview:
invite → registration → login → fill in a screen → autosave fires →
refresh → data persists. Webview session persistence is flagged as
critical/untested in the project's architecture notes — don't assume
localStorage survives inside that webview without checking on a real device.
