import { Router } from 'express';
import { db, getAllSettings } from '../db.ts';
import { type AuthenticatedRequest, logAudit, requireRole } from '../auth.ts';
import { broadcastEvent, createNotification } from '../realtime.ts';

const router = Router();
router.use(requireRole('staff', 'admin'));

function attachItemsToOrders(
  orders: Array<Record<string, unknown>>
): Array<Record<string, unknown> & { items: Array<Record<string, unknown>> }> {
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

function computeSessionFinancials(sessionId: number, discountId?: number | null) {
  const settings = getAllSettings();
  const taxRate = Number(settings.tax_rate || 0);
  const serviceRate = Number(settings.service_charge_rate || 0);
  const exchangeRateKhr = Number(settings.exchange_rate_khr || 4050);

  const orders = db
    .prepare("SELECT * FROM orders WHERE session_id = ? AND status != 'cancelled' ORDER BY order_id ASC")
    .all(sessionId) as Array<Record<string, unknown>>;

  const subtotal = Number(
    orders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0).toFixed(2)
  );

  let discountAmount = 0;
  let appliedDiscount: Record<string, unknown> | null = null;
  if (discountId) {
    const disc = db.prepare('SELECT * FROM discounts WHERE discount_id = ? AND is_active = 1').get(discountId) as
      | { discount_id: number; code: string; label: string; discount_type: 'percent' | 'fixed'; value: number }
      | undefined;
    if (disc) {
      appliedDiscount = disc;
      if (disc.discount_type === 'percent') {
        discountAmount = Number(((subtotal * disc.value) / 100).toFixed(2));
      } else {
        discountAmount = Math.min(subtotal, Number(disc.value));
      }
    }
  }

  const discountedBase = Math.max(0, subtotal - discountAmount);
  const serviceCharge = Number(((discountedBase * serviceRate) / 100).toFixed(2));
  const taxAmount = Number(((discountedBase * taxRate) / 100).toFixed(2));
  const grandTotal = Number((discountedBase + serviceCharge + taxAmount).toFixed(2));

  const paidRows = db
    .prepare("SELECT COALESCE(SUM(amount), 0) AS total_paid FROM payments WHERE session_id = ? AND status = 'paid'")
    .get(sessionId) as { total_paid: number };
  const alreadyPaid = Number(Number(paidRows.total_paid || 0).toFixed(2));
  const balanceDue = Number(Math.max(0, grandTotal - alreadyPaid).toFixed(2));

  return {
    orders: attachItemsToOrders(orders),
    subtotal,
    discount_amount: discountAmount,
    applied_discount: appliedDiscount,
    service_charge_rate: serviceRate,
    service_charge_amount: serviceCharge,
    tax_rate: taxRate,
    tax_amount: taxAmount,
    grand_total: grandTotal,
    already_paid: alreadyPaid,
    balance_due: balanceDue,
    balance_due_khr: Math.round(balanceDue * exchangeRateKhr),
    exchange_rate_khr: exchangeRateKhr,
  };
}

router.get('/dashboard', (_req, res) => {
  const counts = db
    .prepare(
      `SELECT status, COUNT(*) as count
       FROM orders
       WHERE created_at >= datetime('now', '-24 hours')
       GROUP BY status`
    )
    .all() as Array<{ status: string; count: number }>;

  const statusMap: Record<string, number> = {
    placed: 0,
    confirmed: 0,
    cooking: 0,
    ready: 0,
    served: 0,
    completed: 0,
    cancelled: 0,
  };
  for (const c of counts) statusMap[c.status] = c.count;

  const activeSessions = db
    .prepare("SELECT COUNT(*) as count FROM table_sessions WHERE status IN ('active', 'checkout_requested')")
    .get() as { count: number };

  const notifications = db
    .prepare("SELECT * FROM notifications WHERE target_role IN ('staff', 'all') ORDER BY notification_id DESC LIMIT 20")
    .all();

  res.json({
    order_counts: statusMap,
    active_sessions: activeSessions.count,
    notifications,
  });
});

router.get('/orders', (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : '';
  let sql = `
    SELECT o.*, ts.table_id, ts.status AS session_status, t.table_number, u.name AS staff_name
    FROM orders o
    JOIN table_sessions ts ON ts.session_id = o.session_id
    JOIN tables t ON t.table_id = ts.table_id
    LEFT JOIN users u ON u.user_id = o.staff_id
  `;
  const params: string[] = [];
  if (status && status !== 'all') {
    sql += ' WHERE o.status = ?';
    params.push(status);
  } else {
    sql += " WHERE (o.status NOT IN ('completed', 'cancelled') OR o.created_at >= datetime('now', '-12 hours'))";
  }
  sql += ' ORDER BY o.created_at DESC, o.order_id DESC LIMIT 100';

  const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
  res.json({ orders: attachItemsToOrders(rows) });
});

router.post('/orders/:id/confirm', (req: AuthenticatedRequest, res) => {
  const orderId = Number(req.params.id);
  const order = db
    .prepare(
      `SELECT o.*, ts.table_id, t.table_number
       FROM orders o
       JOIN table_sessions ts ON ts.session_id = o.session_id
       JOIN tables t ON t.table_id = ts.table_id
       WHERE o.order_id = ?`
    )
    .get(orderId) as (Record<string, unknown> & { session_id: number; table_id: number; table_number: number; order_number: string; status: string }) | undefined;

  if (!order) {
    res.status(404).json({ error: 'Order not found' });
    return;
  }
  if (order.status !== 'placed') {
    res.status(400).json({ error: `Cannot confirm order in "${order.status}" status.` });
    return;
  }

  db.prepare(
    "UPDATE orders SET status = 'confirmed', staff_id = ?, confirmed_at = datetime('now'), updated_at = datetime('now') WHERE order_id = ?"
  ).run(req.user!.user_id, orderId);

  logAudit(req.user!.user_id, 'order:confirmed', 'order', orderId, { order_number: order.order_number }, req.ip || '');

  createNotification({
    targetRole: 'chef',
    type: 'order:confirmed',
    title: `Kitchen Ticket · Table ${order.table_number}`,
    message: `Order ${order.order_number} confirmed by ${req.user!.name}`,
    orderId,
    tableId: order.table_id,
  });

  broadcastEvent(
    'order:confirmed',
    { order_id: orderId, order_number: order.order_number, session_id: order.session_id, table_number: order.table_number, status: 'confirmed' },
    { roles: ['staff', 'chef', 'admin', 'customer'], sessionId: order.session_id }
  );

  res.json({ success: true, status: 'confirmed' });
});

router.post('/orders/:id/served', (req: AuthenticatedRequest, res) => {
  const orderId = Number(req.params.id);
  const order = db
    .prepare(
      `SELECT o.*, ts.table_id, t.table_number
       FROM orders o
       JOIN table_sessions ts ON ts.session_id = o.session_id
       JOIN tables t ON t.table_id = ts.table_id
       WHERE o.order_id = ?`
    )
    .get(orderId) as (Record<string, unknown> & { session_id: number; table_id: number; table_number: number; order_number: string; status: string }) | undefined;

  if (!order) {
    res.status(404).json({ error: 'Order not found' });
    return;
  }
  if (!['ready', 'cooking', 'confirmed'].includes(order.status)) {
    res.status(400).json({ error: `Cannot mark order as served from "${order.status}" status.` });
    return;
  }

  db.prepare(
    "UPDATE orders SET status = 'served', staff_id = COALESCE(staff_id, ?), served_at = datetime('now'), updated_at = datetime('now') WHERE order_id = ?"
  ).run(req.user!.user_id, orderId);

  logAudit(req.user!.user_id, 'order:served', 'order', orderId, { order_number: order.order_number }, req.ip || '');

  broadcastEvent(
    'order:served',
    { order_id: orderId, order_number: order.order_number, session_id: order.session_id, table_number: order.table_number, status: 'served' },
    { roles: ['staff', 'chef', 'admin', 'customer'], sessionId: order.session_id }
  );

  res.json({ success: true, status: 'served' });
});

router.post('/orders/:id/cancel', (req: AuthenticatedRequest, res) => {
  const orderId = Number(req.params.id);
  const order = db.prepare('SELECT * FROM orders WHERE order_id = ?').get(orderId) as { order_id: number; session_id: number; status: string; order_number: string } | undefined;
  if (!order) {
    res.status(404).json({ error: 'Order not found' });
    return;
  }
  if (['completed', 'cancelled'].includes(order.status)) {
    res.status(400).json({ error: 'Order cannot be cancelled in its current state.' });
    return;
  }

  db.prepare("UPDATE orders SET status = 'cancelled', updated_at = datetime('now') WHERE order_id = ?").run(orderId);
  logAudit(req.user!.user_id, 'order:cancelled', 'order', orderId, { order_number: order.order_number }, req.ip || '');

  broadcastEvent(
    'order:cancelled',
    { order_id: orderId, session_id: order.session_id, status: 'cancelled' },
    { roles: ['staff', 'chef', 'admin', 'customer'], sessionId: order.session_id }
  );

  res.json({ success: true, status: 'cancelled' });
});

router.get('/tables', (_req, res) => {
  const tables = db.prepare('SELECT * FROM tables ORDER BY table_number ASC').all() as Array<Record<string, unknown>>;
  const enriched = tables.map((tbl) => {
    const activeSession = db
      .prepare("SELECT * FROM table_sessions WHERE table_id = ? AND status IN ('active', 'checkout_requested') ORDER BY session_id DESC LIMIT 1")
      .get(Number(tbl.table_id)) as Record<string, unknown> | undefined;

    if (!activeSession) {
      return {
        ...tbl,
        live_status: tbl.is_active ? 'available' : 'inactive',
        active_session: null,
        active_orders_count: 0,
        unpaid_total: 0,
      };
    }

    const orders = db
      .prepare("SELECT status, total_amount FROM orders WHERE session_id = ? AND status != 'cancelled'")
      .all(Number(activeSession.session_id)) as Array<{ status: string; total_amount: number }>;

    const paidRow = db
      .prepare("SELECT COALESCE(SUM(amount), 0) AS paid FROM payments WHERE session_id = ? AND status = 'paid'")
      .get(Number(activeSession.session_id)) as { paid: number };

    const totalOrdersAmount = orders.reduce((s, o) => s + Number(o.total_amount), 0);
    const unpaidTotal = Math.max(0, Number((totalOrdersAmount - Number(paidRow.paid || 0)).toFixed(2)));

    let liveStatus = 'occupied';
    if (activeSession.status === 'checkout_requested') liveStatus = 'checkout';
    else if (orders.some((o) => o.status === 'ready')) liveStatus = 'ready';
    else if (orders.some((o) => o.status === 'cooking')) liveStatus = 'cooking';
    else if (orders.some((o) => o.status === 'placed' || o.status === 'confirmed')) liveStatus = 'ordering';
    else if (unpaidTotal > 0) liveStatus = 'unpaid';

    return {
      ...tbl,
      live_status: liveStatus,
      active_session: activeSession,
      active_orders_count: orders.length,
      unpaid_total: unpaidTotal,
    };
  });

  res.json({ tables: enriched });
});

router.get('/checkout/:sessionId', (req, res) => {
  const sessionId = Number(req.params.sessionId);
  const discountId = req.query.discount_id ? Number(req.query.discount_id) : null;

  const session = db
    .prepare(
      `SELECT s.*, t.table_number, t.label
       FROM table_sessions s
       JOIN tables t ON t.table_id = s.table_id
       WHERE s.session_id = ?`
    )
    .get(sessionId) as Record<string, unknown> | undefined;

  if (!session) {
    res.status(404).json({ error: 'Table session not found' });
    return;
  }

  const financials = computeSessionFinancials(sessionId, discountId);
  const discounts = db.prepare('SELECT * FROM discounts WHERE is_active = 1 ORDER BY discount_id ASC').all();
  const receipts = db
    .prepare('SELECT receipt_id, payment_id, receipt_number, receipt_data_json, created_at FROM receipts WHERE session_id = ? ORDER BY receipt_id DESC')
    .all(sessionId);

  res.json({
    session,
    ...financials,
    discounts,
    receipts,
  });
});

// Staff manual payment verification (Static KHQR or Cash)
router.post('/payments/verify', (req: AuthenticatedRequest, res) => {
  const { session_id, method, discount_id, received_amount, reference_note, close_session } = req.body as {
    session_id?: number;
    method?: 'khqr' | 'cash';
    discount_id?: number | null;
    received_amount?: number;
    reference_note?: string;
    close_session?: boolean;
  };

  if (!session_id || !method || !['khqr', 'cash'].includes(method)) {
    res.status(400).json({ error: 'Valid session_id and payment method (khqr or cash) are required.' });
    return;
  }

  const settings = getAllSettings();
  if (method === 'cash' && settings.enable_cash_payment !== 'true') {
    res.status(403).json({ error: 'Cash payments are currently disabled in restaurant settings.' });
    return;
  }

  const session = db
    .prepare(
      `SELECT s.*, t.table_number
       FROM table_sessions s
       JOIN tables t ON t.table_id = s.table_id
       WHERE s.session_id = ?`
    )
    .get(session_id) as (Record<string, unknown> & { session_id: number; table_id: number; table_number: number; status: string }) | undefined;

  if (!session) {
    res.status(404).json({ error: 'Table session not found.' });
    return;
  }
  if (session.status === 'closed') {
    res.status(400).json({ error: 'Table session is already closed.' });
    return;
  }

  const financials = computeSessionFinancials(session_id, discount_id);
  if (financials.balance_due <= 0) {
    res.status(400).json({ error: 'There is no unpaid balance remaining for this table session.' });
    return;
  }

  const payAmount = received_amount !== undefined ? Number(Number(received_amount).toFixed(2)) : financials.balance_due;
  if (!Number.isFinite(payAmount) || payAmount <= 0) {
    res.status(400).json({ error: 'Payment amount must be greater than zero.' });
    return;
  }
  if (payAmount < financials.balance_due) {
    res.status(400).json({
      error: `Received amount ($${payAmount.toFixed(2)}) is less than the balance due ($${financials.balance_due.toFixed(2)}).`,
    });
    return;
  }

  const receiptNumber = `RCP-${Date.now().toString().slice(-6)}-${session.table_number}`;
  const paidAt = new Date().toISOString().replace('T', ' ').slice(0, 19);

  const orderItemsFlat: Array<{ name: string; qty: number; price: number; subtotal: number }> = [];
  const orderNumbers: string[] = [];
  for (const ord of financials.orders) {
    orderNumbers.push(String(ord.order_number));
    for (const item of ord.items as Array<Record<string, unknown>>) {
      orderItemsFlat.push({
        name: String(item.item_name_snapshot),
        qty: Number(item.quantity),
        price: Number(item.unit_price),
        subtotal: Number(item.subtotal),
      });
    }
  }

  let paymentId = 0;
  let receiptId = 0;
  const shouldClose = close_session !== false;

  const receiptPayload = {
    receipt_number: receiptNumber,
    table_number: session.table_number,
    session_code: session.session_code,
    order_numbers: orderNumbers,
    items: orderItemsFlat,
    subtotal: financials.subtotal,
    discount: financials.discount_amount,
    discount_label: financials.applied_discount ? String(financials.applied_discount.label) : '',
    service_charge: financials.service_charge_amount,
    tax: financials.tax_amount,
    total: financials.grand_total,
    paid_amount: financials.balance_due,
    received_amount: payAmount,
    change_amount: Number(Math.max(0, payAmount - financials.balance_due).toFixed(2)),
    method,
    staff_name: req.user!.name,
    paid_at: paidAt,
    restaurant_name: settings.restaurant_name || 'DineEasy Bistro',
    restaurant_address: settings.restaurant_address || '',
    restaurant_phone: settings.restaurant_phone || '',
    footer_en: settings.receipt_footer_en || '',
    footer_km: settings.receipt_footer_km || '',
    exchange_rate_khr: financials.exchange_rate_khr,
  };

  db.exec('BEGIN');
  try {
    const pRes = db
      .prepare(
        `INSERT INTO payments (session_id, amount, subtotal_amount, discount_amount, tax_amount, service_charge_amount, method, status, verified_by, reference_note, paid_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'paid', ?, ?, ?)`
      )
      .run(
        session_id,
        financials.balance_due,
        financials.subtotal,
        financials.discount_amount,
        financials.tax_amount,
        financials.service_charge_amount,
        method,
        req.user!.user_id,
        (reference_note || '').trim().slice(0, 250),
        paidAt
      );
    paymentId = Number(pRes.lastInsertRowid);

    const rRes = db
      .prepare(
        'INSERT INTO receipts (payment_id, session_id, receipt_number, issued_by, receipt_data_json) VALUES (?, ?, ?, ?, ?)'
      )
      .run(paymentId, session_id, receiptNumber, req.user!.user_id, JSON.stringify(receiptPayload));
    receiptId = Number(rRes.lastInsertRowid);

    db.prepare(
      "UPDATE orders SET status = 'completed', updated_at = datetime('now') WHERE session_id = ? AND status != 'cancelled'"
    ).run(session_id);

    if (shouldClose) {
      db.prepare("UPDATE table_sessions SET status = 'closed', closed_at = datetime('now') WHERE session_id = ?").run(session_id);
    }

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    console.error('Payment verification error:', err);
    res.status(500).json({ error: 'Failed to record verified payment.' });
    return;
  }

  logAudit(
    req.user!.user_id,
    'payment:verified',
    'payment',
    paymentId,
    { session_id, method, amount: financials.balance_due, receipt_number: receiptNumber },
    req.ip || ''
  );

  broadcastEvent(
    'payment:verified',
    {
      payment_id: paymentId,
      receipt_id: receiptId,
      receipt_number: receiptNumber,
      session_id,
      table_number: session.table_number,
      method,
      amount: financials.balance_due,
      session_closed: shouldClose,
    },
    { roles: ['staff', 'admin', 'customer', 'chef'], sessionId: session_id }
  );

  res.json({
    success: true,
    payment_id: paymentId,
    receipt_id: receiptId,
    receipt_number: receiptNumber,
    receipt: receiptPayload,
    session_closed: shouldClose,
  });
});

router.get('/receipts/:id', (req, res) => {
  const receipt = db
    .prepare('SELECT * FROM receipts WHERE receipt_id = ? OR receipt_number = ?')
    .get(Number(req.params.id) || -1, req.params.id) as { receipt_id: number; receipt_data_json: string; receipt_number: string; created_at: string } | undefined;

  if (!receipt) {
    res.status(404).json({ error: 'Receipt not found' });
    return;
  }
  res.json({
    receipt_id: receipt.receipt_id,
    receipt_number: receipt.receipt_number,
    created_at: receipt.created_at,
    data: JSON.parse(receipt.receipt_data_json),
  });
});

router.get('/notifications', (_req, res) => {
  const rows = db
    .prepare("SELECT * FROM notifications WHERE target_role IN ('staff', 'all') ORDER BY notification_id DESC LIMIT 30")
    .all();
  res.json({ notifications: rows });
});

router.post('/notifications/read', (_req, res) => {
  db.prepare("UPDATE notifications SET is_read = 1 WHERE target_role IN ('staff', 'all')").run();
  res.json({ success: true });
});

export default router;
