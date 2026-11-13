import crypto from 'node:crypto';
import { Router } from 'express';
import { db } from '../db.ts';
import { rateLimit } from '../auth.ts';
import { broadcastEvent, createNotification } from '../realtime.ts';

const router = Router();

function getSessionOrdersWithItems(sessionId: number) {
  const orders = db
    .prepare(
      `SELECT o.*, u.name AS staff_name
       FROM orders o
       LEFT JOIN users u ON u.user_id = o.staff_id
       WHERE o.session_id = ?
       ORDER BY o.created_at DESC, o.order_id DESC`
    )
    .all(sessionId) as Array<Record<string, unknown>>;

  return orders.map((order) => {
    const items = db
      .prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY order_item_id ASC')
      .all(Number(order.order_id)) as Array<Record<string, unknown>>;
    return {
      ...order,
      items: items.map((it) => ({
        ...it,
        selected_options: (() => {
          try {
            return JSON.parse(String(it.selected_options_json || '[]'));
          } catch {
            return [];
          }
        })(),
      })),
    };
  });
}

// Create or reuse active table session using secure QR token
router.post('/sessions', (req, res) => {
  const { qr_token } = req.body as { qr_token?: string };
  if (!qr_token) {
    res.status(400).json({ error: 'QR token is required to open a table session.' });
    return;
  }

  const table = db
    .prepare('SELECT table_id, table_number, label, capacity, is_active FROM tables WHERE qr_token = ?')
    .get(qr_token) as
    | { table_id: number; table_number: number; label: string; capacity: number; is_active: number }
    | undefined;

  if (!table) {
    res.status(404).json({ error: 'Invalid table QR token.' });
    return;
  }
  if (!table.is_active) {
    res.status(403).json({ error: 'Table is currently inactive.' });
    return;
  }

  let session = db
    .prepare("SELECT * FROM table_sessions WHERE table_id = ? AND status IN ('active', 'checkout_requested') ORDER BY session_id DESC LIMIT 1")
    .get(table.table_id) as Record<string, unknown> | undefined;

  if (!session) {
    const sessionCode = `SES-T${table.table_number}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const insertRes = db
      .prepare("INSERT INTO table_sessions (table_id, session_code, status) VALUES (?, ?, 'active')")
      .run(table.table_id, sessionCode);
    session = db.prepare('SELECT * FROM table_sessions WHERE session_id = ?').get(Number(insertRes.lastInsertRowid)) as Record<string, unknown>;
  }

  const orders = getSessionOrdersWithItems(Number(session.session_id));
  const payments = db
    .prepare("SELECT * FROM payments WHERE session_id = ? AND status = 'paid' ORDER BY payment_id DESC")
    .all(Number(session.session_id));
  const receipts = db
    .prepare('SELECT receipt_id, payment_id, receipt_number, receipt_data_json, created_at FROM receipts WHERE session_id = ? ORDER BY receipt_id DESC')
    .all(Number(session.session_id));

  res.json({
    table,
    session,
    orders,
    payments,
    receipts,
  });
});

router.get('/sessions/:id', (req, res) => {
  const sessionId = Number(req.params.id);
  const session = db
    .prepare(
      `SELECT s.*, t.table_number, t.label, t.is_active AS table_active
       FROM table_sessions s
       JOIN tables t ON t.table_id = s.table_id
       WHERE s.session_id = ?`
    )
    .get(sessionId) as Record<string, unknown> | undefined;

  if (!session) {
    res.status(404).json({ error: 'Table session not found' });
    return;
  }

  const orders = getSessionOrdersWithItems(sessionId);
  const payments = db
    .prepare("SELECT * FROM payments WHERE session_id = ? AND status = 'paid' ORDER BY payment_id DESC")
    .all(sessionId);
  const receipts = db
    .prepare('SELECT receipt_id, payment_id, receipt_number, receipt_data_json, created_at FROM receipts WHERE session_id = ? ORDER BY receipt_id DESC')
    .all(sessionId);

  res.json({ session, orders, payments, receipts });
});

router.get('/sessions/:id/orders', (req, res) => {
  const sessionId = Number(req.params.id);
  const orders = getSessionOrdersWithItems(sessionId);
  res.json({ orders });
});

// Submit customer order (server-side price calculation + idempotency + availability checks)
router.post('/orders', rateLimit(30, 60 * 1000), (req, res) => {
  const { session_id, qr_token, items, notes, idempotency_key } = req.body as {
    session_id?: number;
    qr_token?: string;
    items?: Array<{
      menu_item_id: number;
      quantity: number;
      option_value_ids?: number[];
      special_instructions?: string;
    }>;
    notes?: string;
    idempotency_key?: string;
  };

  if (!items || !Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: 'Your cart is empty. Please add at least one item.' });
    return;
  }

  // Prevent duplicate submission from double clicks / retries
  if (idempotency_key) {
    const existingOrder = db.prepare('SELECT * FROM orders WHERE idempotency_key = ?').get(idempotency_key) as Record<string, unknown> | undefined;
    if (existingOrder) {
      const existingItems = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(Number(existingOrder.order_id));
      res.json({ order: { ...existingOrder, items: existingItems }, deduplicated: true });
      return;
    }
  }

  // Validate session & table
  let sessionRow:
    | { session_id: number; table_id: number; status: string; table_number: number; table_active: number }
    | undefined;

  if (session_id) {
    sessionRow = db
      .prepare(
        `SELECT s.session_id, s.table_id, s.status, t.table_number, t.is_active AS table_active
         FROM table_sessions s
         JOIN tables t ON t.table_id = s.table_id
         WHERE s.session_id = ?`
      )
      .get(session_id) as typeof sessionRow;
  } else if (qr_token) {
    sessionRow = db
      .prepare(
        `SELECT s.session_id, s.table_id, s.status, t.table_number, t.is_active AS table_active
         FROM table_sessions s
         JOIN tables t ON t.table_id = s.table_id
         WHERE t.qr_token = ? AND s.status IN ('active', 'checkout_requested')
         ORDER BY s.session_id DESC LIMIT 1`
      )
      .get(qr_token) as typeof sessionRow;
  }

  if (!sessionRow) {
    res.status(400).json({ error: 'Active table session not found. Please scan the table QR code again.' });
    return;
  }
  if (!sessionRow.table_active) {
    res.status(403).json({ error: 'Cannot submit order for an inactive table.' });
    return;
  }
  if (sessionRow.status === 'closed') {
    res.status(400).json({ error: 'This table session is already closed. Please scan QR to start a new session.' });
    return;
  }

  // Calculate prices strictly from DB
  const preparedItems: Array<{
    menu_item_id: number;
    name: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
    selected_options: Array<{ option_name: string; value_label: string; price_delta: number }>;
    special_instructions: string;
  }> = [];

  let orderTotal = 0;

  for (const cartItem of items) {
    const qty = Math.floor(Number(cartItem.quantity));
    if (!Number.isFinite(qty) || qty <= 0 || qty > 99) {
      res.status(400).json({ error: 'Invalid item quantity. Quantity must be between 1 and 99.' });
      return;
    }

    const menuItem = db
      .prepare(
        `SELECT m.menu_item_id, m.price, m.is_available, COALESCE(mt.name, m.slug) AS name
         FROM menu_items m
         LEFT JOIN menu_item_translations mt ON mt.menu_item_id = m.menu_item_id AND mt.language_code = 'en'
         WHERE m.menu_item_id = ?`
      )
      .get(Number(cartItem.menu_item_id)) as
      | { menu_item_id: number; price: number; is_available: number; name: string }
      | undefined;

    if (!menuItem) {
      res.status(404).json({ error: `Menu item #${cartItem.menu_item_id} does not exist.` });
      return;
    }
    if (!menuItem.is_available) {
      res.status(400).json({ error: `${menuItem.name} is currently unavailable.` });
      return;
    }

    let unitPrice = Number(menuItem.price);
    const selectedOptions: Array<{ option_name: string; value_label: string; price_delta: number }> = [];

    if (Array.isArray(cartItem.option_value_ids) && cartItem.option_value_ids.length > 0) {
      for (const valId of cartItem.option_value_ids) {
        const optRow = db
          .prepare(
            `SELECT v.value_id, v.label, v.price_delta, o.name AS option_name, o.menu_item_id
             FROM menu_item_option_values v
             JOIN menu_item_options o ON o.option_id = v.option_id
             WHERE v.value_id = ? AND o.menu_item_id = ?`
          )
          .get(Number(valId), menuItem.menu_item_id) as
          | { value_id: number; label: string; price_delta: number; option_name: string; menu_item_id: number }
          | undefined;

        if (optRow) {
          unitPrice += Number(optRow.price_delta);
          selectedOptions.push({
            option_name: optRow.option_name,
            value_label: optRow.label,
            price_delta: Number(optRow.price_delta),
          });
        }
      }
    }

    unitPrice = Number(unitPrice.toFixed(2));
    const subtotal = Number((unitPrice * qty).toFixed(2));
    orderTotal += subtotal;

    preparedItems.push({
      menu_item_id: menuItem.menu_item_id,
      name: menuItem.name,
      quantity: qty,
      unit_price: unitPrice,
      subtotal,
      selected_options: selectedOptions,
      special_instructions: (cartItem.special_instructions || '').trim().slice(0, 250),
    });
  }

  orderTotal = Number(orderTotal.toFixed(2));
  const orderNumber = `ORD-${Math.floor(1000 + Math.random() * 9000)}-${Date.now().toString().slice(-3)}`;

  let createdOrderId = 0;
  db.exec('BEGIN');
  try {
    const orderRes = db
      .prepare(
        `INSERT INTO orders (session_id, order_number, status, notes, idempotency_key, total_amount)
         VALUES (?, ?, 'placed', ?, ?, ?)`
      )
      .run(sessionRow.session_id, orderNumber, (notes || '').trim().slice(0, 500), idempotency_key || null, orderTotal);

    createdOrderId = Number(orderRes.lastInsertRowid);

    const insertItemStmt = db.prepare(
      `INSERT INTO order_items (order_id, menu_item_id, item_name_snapshot, quantity, unit_price, subtotal, selected_options_json, special_instructions)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insertItemOptStmt = db.prepare(
      'INSERT INTO order_item_options (order_item_id, option_name, value_label, price_delta) VALUES (?, ?, ?, ?)'
    );

    for (const pi of preparedItems) {
      const oiRes = insertItemStmt.run(
        createdOrderId,
        pi.menu_item_id,
        pi.name,
        pi.quantity,
        pi.unit_price,
        pi.subtotal,
        JSON.stringify(pi.selected_options),
        pi.special_instructions
      );
      const oiId = Number(oiRes.lastInsertRowid);
      for (const opt of pi.selected_options) {
        insertItemOptStmt.run(oiId, opt.option_name, opt.value_label, opt.price_delta);
      }
    }

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    console.error('Order creation failed:', err);
    res.status(500).json({ error: 'Failed to submit order. Please try again.' });
    return;
  }

  const order = db.prepare('SELECT * FROM orders WHERE order_id = ?').get(createdOrderId) as Record<string, unknown>;
  const itemSummary = preparedItems.map((i) => `${i.name} x${i.quantity}`).join(', ');

  createNotification({
    targetRole: 'staff',
    type: 'order:created',
    title: `New Order ${orderNumber}`,
    message: `Table ${sessionRow.table_number}: ${itemSummary}`,
    orderId: createdOrderId,
    tableId: sessionRow.table_id,
  });

  broadcastEvent(
    'order:created',
    {
      order: { ...order, items: preparedItems },
      table_number: sessionRow.table_number,
      session_id: sessionRow.session_id,
    },
    { roles: ['staff', 'admin', 'customer'], sessionId: sessionRow.session_id }
  );

  res.status(201).json({ order: { ...order, items: preparedItems } });
});

router.get('/orders/:id', (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE order_id = ?').get(Number(req.params.id)) as Record<string, unknown> | undefined;
  if (!order) {
    res.status(404).json({ error: 'Order not found' });
    return;
  }
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(Number(order.order_id));
  res.json({ order: { ...order, items } });
});

router.post('/sessions/:id/request-checkout', (req, res) => {
  const sessionId = Number(req.params.id);
  const session = db
    .prepare(
      `SELECT s.session_id, s.table_id, s.status, t.table_number
       FROM table_sessions s
       JOIN tables t ON t.table_id = s.table_id
       WHERE s.session_id = ?`
    )
    .get(sessionId) as { session_id: number; table_id: number; status: string; table_number: number } | undefined;

  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  if (session.status === 'closed') {
    res.status(400).json({ error: 'Session is already closed' });
    return;
  }

  db.prepare("UPDATE table_sessions SET status = 'checkout_requested' WHERE session_id = ?").run(sessionId);

  createNotification({
    targetRole: 'staff',
    type: 'checkout:requested',
    title: `Checkout Requested · Table ${session.table_number}`,
    message: `Table ${session.table_number} is ready to settle their bill.`,
    tableId: session.table_id,
  });

  broadcastEvent(
    'checkout:requested',
    { session_id: sessionId, table_id: session.table_id, table_number: session.table_number },
    { roles: ['staff', 'admin', 'customer'], sessionId }
  );

  res.json({ success: true, status: 'checkout_requested' });
});

export default router;
