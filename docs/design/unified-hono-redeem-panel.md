# Unified Hono Redeem Panel Design

## Goal

Turn CloudSub into a single-deploy Cloudflare Worker application. The Worker serves the management UI, the user redeem portal, Hono APIs, and the Clash/Mihomo subscription endpoint from one deployment.

## Scope

- Keep the existing Vue management UI as the frontend base.
- Replace the hand-written Worker route dispatcher with Hono.
- Keep current airport, self-node, rule, group, config, and YAML generation features.
- Add redeem-code based subscription users.
- Add a public user portal for redeeming, renewing, and checking one subscription link.
- Do not add payments, multiple profiles, or separate frontend/backend deployments.

## Data Model

Add `sub_users`:

- `id`
- `token`
- `remark`
- `status`
- `plan_name`
- `expires_at`
- `created_at`
- `updated_at`
- `last_access_at`

Add `redeem_codes`:

- `id`
- `code`
- `plan_name`
- `duration_days`
- `status`
- `used_by_user_id`
- `used_at`
- `expires_at`
- `remark`
- `created_at`

The existing global Clash/Mihomo config remains shared by every valid subscription user.

## Subscription Flow

- New user: redeem code only. The API creates a `sub_users` row, generates a secure token, marks the code used, and returns the subscription URL.
- Renewal: token plus redeem code. If the existing subscription has not expired, extend from `expires_at`; otherwise extend from current time.
- View: token or subscription URL returns status, plan, expiry, and remaining days.
- Subscribe: `/subscribe?token=...` validates user token, enabled status, and expiry before generating YAML.

## API Shape

Public:

- `POST /api/portal/redeem`
- `POST /api/portal/renew`
- `POST /api/portal/lookup`
- `GET /subscribe?token=...`

Admin:

- `GET /api/admin/redeem-codes`
- `POST /api/admin/redeem-codes`
- `POST /api/admin/redeem-codes/batch`
- `PATCH /api/admin/redeem-codes/:id`
- `DELETE /api/admin/redeem-codes/:id`
- `GET /api/admin/sub-users`
- `PATCH /api/admin/sub-users/:id`
- `POST /api/admin/sub-users/:id/renew`
- `POST /api/admin/sub-users/:id/reset-token`

The existing legacy endpoints stay available during the first pass for frontend compatibility.

## Historical Fixes

- Use Hono middleware for CORS and admin token checks.
- Use `fetch` instead of axios in Worker services.
- Add real tests for redeem, renewal, expiry, and subscription access.
- Preserve old GET delete endpoints initially, but add RESTful admin endpoints for new features.
- Use `crypto.getRandomValues()` or `crypto.randomUUID()` for tokens and redeem-code generation.

## Deployment

`wrangler.jsonc` binds static assets from the Vue build output. One deploy command builds the UI and deploys the Worker.
