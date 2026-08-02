# invite-member

Admin/coach-only Edge Function for inviting members and listing pending
(incomplete) invites.

This is the **only** place in the KCPT Portal project that uses the
`service_role` key. See [AGENTS.md](../../AGENTS.md) for the documented
exception. Both POST (invite) and GET (pending list) need `listUsers` /
admin auth APIs, so they stay in this same function.

## Behaviour

### POST — send / resend invite

1. Authorize the caller (admin/coach) via Bearer JWT + `profiles.role`.
2. If a `profiles` row already exists for the email → **409** (already a
   registered member).
3. If a pending `auth.users` row exists (invited but never completed
   registration — no `profiles` row) → delete it, then send a fresh invite.
   This is how expired / unused invite links are re-sent.
4. Call `inviteUserByEmail()` with `INVITE_SET_PASSWORD_REDIRECT_URL`.

### GET — list pending invites

1. Same caller authorization as POST.
2. Load all `profiles.email` values (service_role).
3. Page through all `auth.admin.listUsers()` results.
4. Return auth users whose email is **not** in the profiles set, with status:
   - `not_opened` — `email_confirmed_at` is null (invite not opened)
   - `incomplete` — email confirmed but no `profiles` row (setup not finished)
5. Sorted by `created_at` descending (`invited_at` in the response).

This GET requires service_role for `listUsers`, so it remains inside the same
documented exception — do not split it into a separate Edge Function.

## Request

### POST

```http
POST /functions/v1/invite-member
Authorization: Bearer <caller-jwt>
Content-Type: application/json

{ "email": "member@example.com" }
```

### GET

```http
GET /functions/v1/invite-member
Authorization: Bearer <caller-jwt>
```

Example response:

```json
{
  "data": [
    {
      "email": "jamie.morgan@email.com",
      "invited_at": "2026-08-01T12:00:00.000Z",
      "status": "not_opened"
    },
    {
      "email": "alex@email.com",
      "invited_at": "2026-07-28T09:30:00.000Z",
      "status": "incomplete"
    }
  ]
}
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
| `INVITE_SET_PASSWORD_REDIRECT_URL` | Edge Function secret (manual) | Full URL to the set-password page (POST only) |

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
| 200 | `{ "success": true, "email": "..." }` | POST: invite sent (new or resent) |
| 200 | `{ "data": [ { email, invited_at, status } ] }` | GET: pending invites |
| 400 | `{ "error": "..." }` | Invalid/missing email (POST) |
| 403 | `{ "error": "Forbidden" }` | No valid session or caller is not admin/coach |
| 405 | `{ "error": "Method not allowed" }` | Not GET or POST |
| 409 | `{ "error": "This email is already registered" }` | Email already has a `profiles` row |
| 500 | `{ "error": "Unable to send invite" }` / `{ "error": "Unable to load pending invites" }` | Server failure (details logged server-side) |
