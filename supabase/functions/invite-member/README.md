# invite-member

Admin/coach-only Edge Function that invites a new member by email via
`supabase.auth.admin.inviteUserByEmail()`.

This is the **only** place in the KCPT Portal project that uses the
`service_role` key. See [AGENTS.md](../../AGENTS.md) for the documented
exception.

## Behaviour

1. Authorize the caller (admin/coach) via Bearer JWT + `profiles.role`.
2. If a `profiles` row already exists for the email → **409** (already a
   registered member).
3. If a pending `auth.users` row exists (invited but never completed
   registration — no `profiles` row) → delete it, then send a fresh invite.
   This is how expired / unused invite links are re-sent.
4. Call `inviteUserByEmail()` with `INVITE_SET_PASSWORD_REDIRECT_URL`.

## Request

```http
POST /functions/v1/invite-member
Authorization: Bearer <caller-jwt>
Content-Type: application/json

{ "email": "member@example.com" }
```

The Bearer token is the **calling** admin/coach's JWT, not the invited
person's.

## Required environment secrets

Set these via the Supabase Dashboard (Project Settings → Edge Functions →
Secrets) or the CLI. Do **not** add `SUPABASE_SERVICE_ROLE_KEY` to Vercel,
`.env.local`, or any frontend config.

| Variable | Source | Purpose |
|----------|--------|---------|
| `SUPABASE_URL` | Auto-injected by Supabase runtime | Project URL |
| `SUPABASE_ANON_KEY` | Auto-injected by Supabase runtime | Caller-scoped client for RLS role check |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Function secret (manual) | Admin invite / listUsers / deleteUser |
| `INVITE_SET_PASSWORD_REDIRECT_URL` | Edge Function secret (manual) | Full URL to the set-password page (e.g. `https://your-app.vercel.app/set-password`) |

Example CLI:

```bash
supabase secrets set \
  SUPABASE_SERVICE_ROLE_KEY=your-service-role-key \
  INVITE_SET_PASSWORD_REDIRECT_URL=https://your-app.vercel.app/set-password
```

## Deploy

```bash
supabase functions deploy invite-member
```

Deploy with JWT verification enabled (default). The function performs its
own role check against `profiles` in addition to gateway JWT validation.

## Responses

| Status | Body | Meaning |
|--------|------|---------|
| 200 | `{ "success": true, "email": "..." }` | Invite sent (new or resent after clearing pending auth user) |
| 400 | `{ "error": "..." }` | Invalid/missing email |
| 403 | `{ "error": "Forbidden" }` | No valid session or caller is not admin/coach |
| 405 | `{ "error": "Method not allowed" }` | Non-POST request |
| 409 | `{ "error": "This email is already registered" }` | Email already has a `profiles` row |
| 500 | `{ "error": "Unable to send invite" }` | Server/invite failure (details logged server-side) |
