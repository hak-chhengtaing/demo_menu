# DineEasy REST API Documentation

Base URL: `/api`

## Authentication
- `POST /api/auth/login` — Body: `{ identifier, password, remember_me }`. Sets HTTP-only session cookie and returns `{ token, user }`.
- `POST /api/auth/logout` — Revokes current session token.
- `GET /api/auth/me` — Returns authenticated user profile.

## Public Restaurant & Menu
- `GET /api/restaurant` — Restaurant settings, KHQR bank details, currency, and tax/service rates.
- `GET /api/languages` — Active languages (`code`, `name`, `native_name`, `direction`).
- `GET /api/translations/:lang` — UI translation dictionary with automatic English fallback.
- `GET /api/tables/qr/:token` — Validates QR token and returns table metadata.
- `GET /api/categories?lang=en` — Active categories translated to `:lang`.
- `GET /api/menu-items?lang=en&category_id=&search=` — Menu items with translated names, descriptions, and modifier options.
- `GET /api/qr?data=...` — Generates SVG QR code.

## Customer Ordering
- `POST /api/customer/sessions` — Body: `{ qr_token }`. Creates or reuses active `table_session`.
- `GET /api/customer/sessions/:id` — Returns session, orders, payments, and receipts.
- `POST /api/customer/orders` — Body: `{ session_id, qr_token, items, notes, idempotency_key }`. Validates availability and calculates prices strictly on the server.
- `POST /api/customer/sessions/:id/request-checkout` — Marks session `checkout_requested` and alerts Staff.

## Staff Operations (`staff` or `admin`)
- `GET /api/staff/dashboard` — Order status counts, active sessions, notifications.
- `GET /api/staff/orders?status=all` — Orders queue.
- `POST /api/staff/orders/:id/confirm` — Confirms `placed` order and sends to Chef KDS.
- `POST /api/staff/orders/:id/served` — Marks `ready` order as `served`.
- `POST /api/staff/orders/:id/cancel` — Cancels uncompleted order.
- `GET /api/staff/tables` — All tables with live session status and unpaid balance.
- `GET /api/staff/checkout/:sessionId?discount_id=` — Consolidated session bill calculation.
- `POST /api/staff/payments/verify` — Manual Staff verification of Static KHQR or Cash payment; generates immutable receipt and closes session.
- `GET /api/staff/receipts/:id` — Fetch receipt JSON snapshot.

## Chef KDS (`chef` or `admin`)
- `GET /api/chef/orders?status=active` — Kitchen tickets sorted oldest-first.
- `POST /api/chef/orders/:id/cooking` — Transitions `confirmed` -> `cooking`.
- `POST /api/chef/orders/:id/ready` — Transitions `cooking` -> `ready` and notifies Staff.

## Admin Management (`admin` only)
- `GET /api/admin/dashboard` — KPIs, sales series, category breakdown, top dishes, recent orders.
- `POST /api/admin/upload` — Multipart image upload (`PNG`, `JPEG`, `WEBP`, max 5MB).
- `GET/POST/PUT/DELETE /api/admin/menu-items` — Menu item + translation + modifier CRUD.
- `GET/POST/PUT/DELETE /api/admin/categories` — Category + translation CRUD.
- `GET/POST/PUT/DELETE /api/admin/tables` — Table & QR token CRUD.
- `GET/POST/PUT /api/admin/users` — Staff/Chef/Admin account CRUD & password reset.
- `GET /api/admin/orders`, `GET /api/admin/payments`, `GET /api/admin/audit-logs`.
- `GET /api/admin/reports?from=&to=` — Date-range analytics & profit report.
- `GET/POST/DELETE /api/admin/expenses`, `GET/POST /api/admin/expense-categories`.
- `GET/POST/PUT /api/admin/languages`, `GET/PUT /api/admin/translations`.
- `GET/PUT /api/admin/settings`.
