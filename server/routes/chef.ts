import { Router } from 'express';
import { db } from '../db.ts';
import { type AuthenticatedRequest, logAudit, requireRole } from '../auth.ts';
import { broadcastEvent, createNotification } from '../realtime.ts';

const router = Router();
router.use(requireRole('chef', 'admin'));

router.get('/orders', (req, res) => {
  const filter = typeof req.query.status === 'string' ? req.query.status : 'active';
  let where = "o.status IN ('confirmed', 'cooking', 'ready')";
  if (filter === 'all') {
    where = "o.status IN ('confirmed', 'cooking', 'ready', 'served', 'completed') AND o.created_at >= datetime('now', '-12 hours')";
  } else if (filter === 'confirmed') {
    where = "o.status = 'confirmed'";
  } else if (filter === 'cooking') {
    where = "o.status = 'cooking'";
  } else if (filter === 'ready') {
    where = "o.status = 'ready'";
  } else if (filter === 'completed') {
    where = "o.status IN ('served', 'completed') AND o.created_at >= datetime('now', '-12 hours')";
  }

  const orders = db
    .prepare(
      `SELECT o.*, ts.table_id, t.table_number, u.name AS staff_name
       FROM orders o
       JOIN table_sessions ts ON ts.session_id = o.session_id
       JOIN tables t ON t.table_id = ts.table_id
       LEFT JOIN users u ON u.user_id = o.staff_id
       WHERE ${where}
       ORDER BY CASE o.status WHEN 'confirmed' THEN 1 WHEN 'cooking' THEN 2 WHEN 'ready' THEN 3 ELSE 4 END, o.created_at ASC`
    )
    .all() as Array<Record<string, unknown>>;

  const enriched = orders.map((order) => {
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

  res.json({ orders: enriched });
});

router.post('/orders/:id/cooking', (req: AuthenticatedRequest, res) => {
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
  if (order.status !== 'confirmed') {
    res.status(400).json({ error: `Cannot start cooking order in "${order.status}" status.` });
    return;
  }

  db.prepare(
    "UPDATE orders SET status = 'cooking', cooking_started_at = datetime('now'), updated_at = datetime('now') WHERE order_id = ?"
  ).run(orderId);

  logAudit(req.user!.user_id, 'order:cooking', 'order', orderId, { order_number: order.order_number }, req.ip || '');

  broadcastEvent(
    'order:cooking',
    { order_id: orderId, order_number: order.order_number, session_id: order.session_id, table_number: order.table_number, status: 'cooking' },
    { roles: ['staff', 'chef', 'admin', 'customer'], sessionId: order.session_id }
  );

  res.json({ success: true, status: 'cooking' });
});

router.post('/orders/:id/ready', (req: AuthenticatedRequest, res) => {
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
  if (!['cooking', 'confirmed'].includes(order.status)) {
    res.status(400).json({ error: `Cannot mark order ready from "${order.status}" status.` });
    return;
  }

  db.prepare(
    "UPDATE orders SET status = 'ready', ready_at = datetime('now'), updated_at = datetime('now') WHERE order_id = ?"
  ).run(orderId);

  logAudit(req.user!.user_id, 'order:ready', 'order', orderId, { order_number: order.order_number }, req.ip || '');

  createNotification({
    targetRole: 'staff',
    type: 'order:ready',
    title: `Order Ready · Table ${order.table_number}`,
    message: `${order.order_number} is ready for delivery to Table ${order.table_number}.`,
    orderId,
    tableId: order.table_id,
  });

  broadcastEvent(
    'order:ready',
    { order_id: orderId, order_number: order.order_number, session_id: order.session_id, table_number: order.table_number, status: 'ready' },
    { roles: ['staff', 'chef', 'admin', 'customer'], sessionId: order.session_id }
  );

  res.json({ success: true, status: 'ready' });
});

export default router;
