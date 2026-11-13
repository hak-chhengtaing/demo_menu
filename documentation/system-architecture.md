# DineEasy System Architecture

## Overview
DineEasy is a four-interface, real-time Digital Restaurant Menu and Management System designed around a single normalized relational database and a central REST + WebSocket API server.

## Four Role-Based Interfaces
1. **Customer Mobile Digital Menu (`/menu`, `/menu/t/:token`)**: Green-themed mobile-first interface locked to the scanned table's secure QR token. Supports multi-language switching, item modifiers, cart management, server-validated order submission, multi-order table sessions, live order status tracking, checkout request, and digital PDF receipt downloads.
2. **Staff Order Management & Checkout (`/staff`)**: Blue-slate operations interface for receiving real-time order alerts, confirming orders to the kitchen, marking ready orders as served, monitoring live table statuses, calculating consolidated session bills, displaying Static KHQR / cash checkout, manually verifying payments, and generating PDF receipts.
3. **Chef Kitchen Display System (`/chef`)**: Dark high-contrast tablet screen displaying confirmed tickets sorted oldest-first, with audible Web Audio alerts, live elapsed prep timers, modifier/instruction highlights, and `Start Cooking` / `Mark Ready` workflow actions.
4. **Admin Dashboard & Management (`/admin`)**: Indigo/purple executive console featuring KPI metrics, Recharts revenue & category analytics, menu/category/modifier CRUD with image upload, QR code generator per table, staff/chef/admin account management, date-range sales reports (CSV/PDF export), toggleable expense tracking, multilingual translation editor (LTR/RTL), and system settings.

## Real-Time Synchronization
- **WebSocket Server (`/ws`)**: Attached to the HTTP server on port `3000`. Clients subscribe by role (`customer`, `staff`, `chef`, `admin`) and optional `sessionId`/`tableId`.
- **Events**: `order:created`, `order:confirmed`, `order:cooking`, `order:ready`, `order:served`, `checkout:requested`, `payment:verified`, `menu:updated`, `notification:created`.
- **Polling Fallback**: Every client runs a 15-second fallback sync so state remains consistent across proxy drops or sleep wakeups.

## Security Controls
- Passwords hashed with `bcryptjs` (cost 10).
- Cryptographic session tokens stored as HMAC-SHA256 digests in `auth_sessions` with HTTP-only cookies and Bearer support.
- Role-Based Access Control (`admin`, `staff`, `chef`) enforced server-side on every protected endpoint.
- Server-side price calculation from authoritative `menu_items` and `menu_item_option_values` rows with `unit_price` snapshots on `order_items`.
- Idempotency keys (`idempotency_key`) prevent duplicate order submissions.
- Audit log table (`audit_logs`) tracks logins, order transitions, payments, menu changes, and settings updates.
