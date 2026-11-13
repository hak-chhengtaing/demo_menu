import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { Router } from 'express';
import { db, getAllSettings } from '../db.ts';
import { type AuthenticatedRequest, hashPassword, logAudit, requireRole } from '../auth.ts';
import { broadcastEvent } from '../realtime.ts';

const router = Router();
router.use(requireRole('admin'));

// Secure file upload configuration
const uploadsDir = path.resolve(process.cwd(), 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeExt = ['.png', '.jpg', '.jpeg', '.webp'].includes(ext) ? ext : '.jpg';
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${safeExt}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only PNG, JPEG, and WEBP images are allowed.'));
  },
});

router.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'No image file provided.' });
    return;
  }
  res.json({ url: `/uploads/${req.file.filename}` });
});

// 1. Dashboard Overview
router.get('/dashboard', (_req, res) => {
  const salesTotals = db
    .prepare(
      `SELECT
         COALESCE(SUM(amount), 0) AS total_sales,
         COUNT(*) AS payment_count
       FROM payments
       WHERE status = 'paid'`
    )
    .get() as { total_sales: number; payment_count: number };

  const orderStats = db
    .prepare(
      `SELECT
         COUNT(*) AS total_orders,
         COALESCE(AVG(total_amount), 0) AS avg_order_value
       FROM orders
       WHERE status != 'cancelled'`
    )
    .get() as { total_orders: number; avg_order_value: number };

  const activeTables = db
    .prepare("SELECT COUNT(*) AS cnt FROM table_sessions WHERE status IN ('active', 'checkout_requested')")
    .get() as { cnt: number };

  const unpaidOrders = db
    .prepare(
      `SELECT COALESCE(SUM(o.total_amount), 0) - COALESCE((
         SELECT SUM(p.amount) FROM payments p WHERE p.status = 'paid' AND p.session_id IN (SELECT session_id FROM table_sessions WHERE status IN ('active', 'checkout_requested'))
       ), 0) AS unpaid
       FROM orders o
       JOIN table_sessions ts ON ts.session_id = o.session_id
       WHERE ts.status IN ('active', 'checkout_requested') AND o.status != 'cancelled'`
    )
    .get() as { unpaid: number };

  const dailySales = db
    .prepare(
      `SELECT date(created_at) AS day, COALESCE(SUM(total_amount), 0) AS revenue, COUNT(*) AS orders
       FROM orders
       WHERE status != 'cancelled' AND created_at >= datetime('now', '-7 days')
       GROUP BY date(created_at)
       ORDER BY day ASC`
    )
    .all();

  const hourlyToday = db
    .prepare(
      `SELECT strftime('%H:00', created_at) AS hour, COALESCE(SUM(total_amount), 0) AS today_revenue
       FROM orders
       WHERE status != 'cancelled' AND date(created_at) = date('now')
       GROUP BY strftime('%H', created_at)
       ORDER BY hour ASC`
    )
    .all();

  const revenueByCategory = db
    .prepare(
      `SELECT COALESCE(ct.name, c.slug) AS category_name,
              COALESCE(SUM(oi.subtotal), 0) AS revenue,
              COALESCE(SUM(oi.quantity), 0) AS qty_sold
       FROM order_items oi
       JOIN orders o ON o.order_id = oi.order_id
       JOIN menu_items m ON m.menu_item_id = oi.menu_item_id
       JOIN categories c ON c.category_id = m.category_id
       LEFT JOIN category_translations ct ON ct.category_id = c.category_id AND ct.language_code = 'en'
       WHERE o.status != 'cancelled'
       GROUP BY c.category_id
       ORDER BY revenue DESC`
    )
    .all();

  const topSelling = db
    .prepare(
      `SELECT oi.menu_item_id, oi.item_name_snapshot AS name,
              COALESCE(ct.name, c.slug) AS category_name,
              SUM(oi.quantity) AS qty_sold,
              SUM(oi.subtotal) AS revenue
       FROM order_items oi
       JOIN orders o ON o.order_id = oi.order_id
       JOIN menu_items m ON m.menu_item_id = oi.menu_item_id
       JOIN categories c ON c.category_id = m.category_id
       LEFT JOIN category_translations ct ON ct.category_id = c.category_id AND ct.language_code = 'en'
       WHERE o.status != 'cancelled'
       GROUP BY oi.menu_item_id
       ORDER BY qty_sold DESC
       LIMIT 6`
    )
    .all();

  const recentOrders = db
    .prepare(
      `SELECT o.order_id, o.order_number, o.status, o.total_amount, o.created_at,
              t.table_number,
              (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.order_id) AS item_count
       FROM orders o
       JOIN table_sessions ts ON ts.session_id = o.session_id
       JOIN tables t ON t.table_id = ts.table_id
       ORDER BY o.created_at DESC, o.order_id DESC
       LIMIT 8`
    )
    .all();

  const paymentMethods = db
    .prepare(
      `SELECT method, COUNT(*) AS count, COALESCE(SUM(amount), 0) AS total
       FROM payments
       WHERE status = 'paid'
       GROUP BY method`
    )
    .all();

  res.json({
    kpis: {
      total_sales: Number(salesTotals.total_sales || 0),
      total_orders: Number(orderStats.total_orders || 0),
      avg_order_value: Number(Number(orderStats.avg_order_value || 0).toFixed(2)),
      active_tables: Number(activeTables.cnt || 0),
      unpaid_amount: Math.max(0, Number(Number(unpaidOrders.unpaid || 0).toFixed(2))),
    },
    daily_sales: dailySales,
    hourly_today: hourlyToday,
    revenue_by_category: revenueByCategory,
    top_selling: topSelling,
    recent_orders: recentOrders,
    payment_methods: paymentMethods,
  });
});

// 2. Menu Items CRUD (with multilingual translations & options)
router.get('/menu-items', (_req, res) => {
  const items = db
    .prepare(
      `SELECT m.*, COALESCE(mt.name, m.slug) AS name, COALESCE(mt.description, '') AS description,
              COALESCE(ct.name, c.slug) AS category_name
       FROM menu_items m
       JOIN categories c ON c.category_id = m.category_id
       LEFT JOIN menu_item_translations mt ON mt.menu_item_id = m.menu_item_id AND mt.language_code = 'en'
       LEFT JOIN category_translations ct ON ct.category_id = c.category_id AND ct.language_code = 'en'
       ORDER BY m.display_order ASC, m.menu_item_id ASC`
    )
    .all() as Array<Record<string, unknown>>;

  const enriched = items.map((item) => {
    const translations = db
      .prepare('SELECT language_code, name, description FROM menu_item_translations WHERE menu_item_id = ?')
      .all(Number(item.menu_item_id));
    const options = db
      .prepare('SELECT * FROM menu_item_options WHERE menu_item_id = ? ORDER BY display_order ASC')
      .all(Number(item.menu_item_id)) as Array<Record<string, unknown>>;
    const optionsWithVals = options.map((o) => ({
      ...o,
      values: db
        .prepare('SELECT * FROM menu_item_option_values WHERE option_id = ? ORDER BY display_order ASC')
        .all(Number(o.option_id)),
    }));
    return { ...item, translations, options: optionsWithVals };
  });

  res.json({ menu_items: enriched });
});

router.post('/menu-items', (req: AuthenticatedRequest, res) => {
  const {
    category_id,
    price,
    image_url,
    is_available = true,
    is_popular = false,
    is_recommended = false,
    is_new = false,
    is_special_offer = false,
    prep_time_minutes = 12,
    translations,
    options = [],
  } = req.body as {
    category_id: number;
    price: number;
    image_url?: string;
    is_available?: boolean;
    is_popular?: boolean;
    is_recommended?: boolean;
    is_new?: boolean;
    is_special_offer?: boolean;
    prep_time_minutes?: number;
    translations: Array<{ language_code: string; name: string; description?: string }>;
    options?: Array<{
      name: string;
      name_km?: string;
      selection_type?: 'single' | 'multiple';
      is_required?: boolean;
      values?: Array<{ label: string; label_km?: string; price_delta?: number; is_default?: boolean }>;
    }>;
  };

  if (!category_id || price === undefined || !translations?.length || !translations[0].name) {
    res.status(400).json({ error: 'Category, price, and at least one translated name are required.' });
    return;
  }

  const baseName = translations.find((t) => t.language_code === 'en')?.name || translations[0].name;
  const slug = `${baseName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${Date.now().toString().slice(-4)}`;

  let menuItemId = 0;
  db.exec('BEGIN');
  try {
    const r = db
      .prepare(
        `INSERT INTO menu_items (category_id, slug, price, image_url, is_available, is_popular, is_recommended, is_new, is_special_offer, prep_time_minutes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        Number(category_id),
        slug,
        Number(price),
        image_url || '/menu-images/food_beef_burger_1794534818679.jpg',
        is_available ? 1 : 0,
        is_popular ? 1 : 0,
        is_recommended ? 1 : 0,
        is_new ? 1 : 0,
        is_special_offer ? 1 : 0,
        Number(prep_time_minutes || 12)
      );
    menuItemId = Number(r.lastInsertRowid);

    const insT = db.prepare(
      'INSERT INTO menu_item_translations (menu_item_id, language_code, name, description) VALUES (?, ?, ?, ?)'
    );
    for (const t of translations) {
      if (t.name?.trim()) {
        insT.run(menuItemId, t.language_code, t.name.trim(), (t.description || '').trim());
      }
    }

    const insOpt = db.prepare(
      'INSERT INTO menu_item_options (menu_item_id, name, name_km, selection_type, is_required, display_order) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const insVal = db.prepare(
      'INSERT INTO menu_item_option_values (option_id, label, label_km, price_delta, is_default, display_order) VALUES (?, ?, ?, ?, ?, ?)'
    );
    options.forEach((opt, idx) => {
      if (!opt.name?.trim()) return;
      const oRes = insOpt.run(menuItemId, opt.name.trim(), opt.name_km || '', opt.selection_type || 'single', opt.is_required ? 1 : 0, idx + 1);
      const optId = Number(oRes.lastInsertRowid);
      (opt.values || []).forEach((v, vIdx) => {
        if (!v.label?.trim()) return;
        insVal.run(optId, v.label.trim(), v.label_km || '', Number(v.price_delta || 0), v.is_default ? 1 : 0, vIdx + 1);
      });
    });

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to create menu item.' });
    return;
  }

  logAudit(req.user!.user_id, 'menu_item:created', 'menu_item', menuItemId, { name: baseName, price });
  broadcastEvent('menu:updated', { menu_item_id: menuItemId });
  res.status(201).json({ menu_item_id: menuItemId });
});

router.put('/menu-items/:id', (req: AuthenticatedRequest, res) => {
  const menuItemId = Number(req.params.id);
  const {
    category_id,
    price,
    image_url,
    is_available,
    is_popular,
    is_recommended,
    is_new,
    is_special_offer,
    prep_time_minutes,
    translations,
    options,
  } = req.body as Record<string, unknown>;

  const existing = db.prepare('SELECT * FROM menu_items WHERE menu_item_id = ?').get(menuItemId) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Menu item not found.' });
    return;
  }

  db.exec('BEGIN');
  try {
    db.prepare(
      `UPDATE menu_items
       SET category_id = COALESCE(?, category_id),
           price = COALESCE(?, price),
           image_url = COALESCE(?, image_url),
           is_available = COALESCE(?, is_available),
           is_popular = COALESCE(?, is_popular),
           is_recommended = COALESCE(?, is_recommended),
           is_new = COALESCE(?, is_new),
           is_special_offer = COALESCE(?, is_special_offer),
           prep_time_minutes = COALESCE(?, prep_time_minutes),
           updated_at = datetime('now')
       WHERE menu_item_id = ?`
    ).run(
      category_id !== undefined ? Number(category_id) : null,
      price !== undefined ? Number(price) : null,
      image_url !== undefined ? String(image_url) : null,
      is_available !== undefined ? (is_available ? 1 : 0) : null,
      is_popular !== undefined ? (is_popular ? 1 : 0) : null,
      is_recommended !== undefined ? (is_recommended ? 1 : 0) : null,
      is_new !== undefined ? (is_new ? 1 : 0) : null,
      is_special_offer !== undefined ? (is_special_offer ? 1 : 0) : null,
      prep_time_minutes !== undefined ? Number(prep_time_minutes) : null,
      menuItemId
    );

    if (Array.isArray(translations)) {
      const upsert = db.prepare(
        `INSERT INTO menu_item_translations (menu_item_id, language_code, name, description)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(menu_item_id, language_code) DO UPDATE SET name = excluded.name, description = excluded.description`
      );
      for (const t of translations as Array<{ language_code: string; name: string; description?: string }>) {
        if (t.name?.trim()) {
          upsert.run(menuItemId, t.language_code, t.name.trim(), (t.description || '').trim());
        }
      }
    }

    if (Array.isArray(options)) {
      db.prepare('DELETE FROM menu_item_options WHERE menu_item_id = ?').run(menuItemId);
      const insOpt = db.prepare(
        'INSERT INTO menu_item_options (menu_item_id, name, name_km, selection_type, is_required, display_order) VALUES (?, ?, ?, ?, ?, ?)'
      );
      const insVal = db.prepare(
        'INSERT INTO menu_item_option_values (option_id, label, label_km, price_delta, is_default, display_order) VALUES (?, ?, ?, ?, ?, ?)'
      );
      (
        options as Array<{
          name: string;
          name_km?: string;
          selection_type?: 'single' | 'multiple';
          is_required?: boolean;
          values?: Array<{ label: string; label_km?: string; price_delta?: number; is_default?: boolean }>;
        }>
      ).forEach((opt, idx) => {
        if (!opt.name?.trim()) return;
        const oRes = insOpt.run(menuItemId, opt.name.trim(), opt.name_km || '', opt.selection_type || 'single', opt.is_required ? 1 : 0, idx + 1);
        const optId = Number(oRes.lastInsertRowid);
        (opt.values || []).forEach((v, vIdx) => {
          if (!v.label?.trim()) return;
          insVal.run(optId, v.label.trim(), v.label_km || '', Number(v.price_delta || 0), v.is_default ? 1 : 0, vIdx + 1);
        });
      });
    }

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to update menu item.' });
    return;
  }

  logAudit(req.user!.user_id, 'menu_item:updated', 'menu_item', menuItemId, {});
  broadcastEvent('menu:updated', { menu_item_id: menuItemId });
  res.json({ success: true });
});

router.delete('/menu-items/:id', (req: AuthenticatedRequest, res) => {
  const menuItemId = Number(req.params.id);
  const used = db.prepare('SELECT COUNT(*) as cnt FROM order_items WHERE menu_item_id = ?').get(menuItemId) as { cnt: number };
  if (used.cnt > 0) {
    // Preserve order history integrity: disable availability instead of breaking foreign keys
    db.prepare('UPDATE menu_items SET is_available = 0 WHERE menu_item_id = ?').run(menuItemId);
    res.json({ success: true, soft_disabled: true, message: 'Item has historical orders and was marked unavailable to preserve order integrity.' });
    return;
  }
  db.prepare('DELETE FROM menu_items WHERE menu_item_id = ?').run(menuItemId);
  logAudit(req.user!.user_id, 'menu_item:deleted', 'menu_item', menuItemId, {});
  broadcastEvent('menu:updated', { menu_item_id: menuItemId });
  res.json({ success: true });
});

// 3. Categories CRUD
router.get('/categories', (_req, res) => {
  const cats = db
    .prepare(
      `SELECT c.*, COALESCE(ct.name, c.slug) AS name, COALESCE(ct.description, '') AS description,
              (SELECT COUNT(*) FROM menu_items m WHERE m.category_id = c.category_id) AS item_count
       FROM categories c
       LEFT JOIN category_translations ct ON ct.category_id = c.category_id AND ct.language_code = 'en'
       ORDER BY c.display_order ASC, c.category_id ASC`
    )
    .all() as Array<Record<string, unknown>>;

  const enriched = cats.map((c) => ({
    ...c,
    translations: db
      .prepare('SELECT language_code, name, description FROM category_translations WHERE category_id = ?')
      .all(Number(c.category_id)),
  }));
  res.json({ categories: enriched });
});

router.post('/categories', (req: AuthenticatedRequest, res) => {
  const { image_url = '', is_active = true, display_order = 0, translations = [] } = req.body as {
    image_url?: string;
    is_active?: boolean;
    display_order?: number;
    translations: Array<{ language_code: string; name: string; description?: string }>;
  };

  if (!translations.length || !translations[0].name) {
    res.status(400).json({ error: 'Category name is required.' });
    return;
  }

  const baseName = translations.find((t) => t.language_code === 'en')?.name || translations[0].name;
  const slug = `${baseName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString().slice(-3)}`;

  const r = db
    .prepare('INSERT INTO categories (slug, image_url, is_active, display_order) VALUES (?, ?, ?, ?)')
    .run(slug, image_url, is_active ? 1 : 0, Number(display_order || 0));
  const categoryId = Number(r.lastInsertRowid);

  const insT = db.prepare('INSERT INTO category_translations (category_id, language_code, name, description) VALUES (?, ?, ?, ?)');
  for (const t of translations) {
    if (t.name?.trim()) insT.run(categoryId, t.language_code, t.name.trim(), (t.description || '').trim());
  }

  logAudit(req.user!.user_id, 'category:created', 'category', categoryId, { name: baseName });
  broadcastEvent('menu:updated', { category_id: categoryId });
  res.status(201).json({ category_id: categoryId });
});

router.put('/categories/:id', (req: AuthenticatedRequest, res) => {
  const categoryId = Number(req.params.id);
  const { image_url, is_active, display_order, translations } = req.body as {
    image_url?: string;
    is_active?: boolean;
    display_order?: number;
    translations?: Array<{ language_code: string; name: string; description?: string }>;
  };

  db.prepare(
    `UPDATE categories
     SET image_url = COALESCE(?, image_url),
         is_active = COALESCE(?, is_active),
         display_order = COALESCE(?, display_order)
     WHERE category_id = ?`
  ).run(
    image_url !== undefined ? image_url : null,
    is_active !== undefined ? (is_active ? 1 : 0) : null,
    display_order !== undefined ? Number(display_order) : null,
    categoryId
  );

  if (Array.isArray(translations)) {
    const upsert = db.prepare(
      `INSERT INTO category_translations (category_id, language_code, name, description)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(category_id, language_code) DO UPDATE SET name = excluded.name, description = excluded.description`
    );
    for (const t of translations) {
      if (t.name?.trim()) upsert.run(categoryId, t.language_code, t.name.trim(), (t.description || '').trim());
    }
  }

  logAudit(req.user!.user_id, 'category:updated', 'category', categoryId, {});
  broadcastEvent('menu:updated', { category_id: categoryId });
  res.json({ success: true });
});

router.delete('/categories/:id', (req: AuthenticatedRequest, res) => {
  const categoryId = Number(req.params.id);
  const count = db.prepare('SELECT COUNT(*) as cnt FROM menu_items WHERE category_id = ?').get(categoryId) as { cnt: number };
  if (count.cnt > 0) {
    res.status(400).json({ error: 'Cannot delete a category that still contains menu items.' });
    return;
  }
  db.prepare('DELETE FROM categories WHERE category_id = ?').run(categoryId);
  logAudit(req.user!.user_id, 'category:deleted', 'category', categoryId, {});
  broadcastEvent('menu:updated', { category_id: categoryId });
  res.json({ success: true });
});

// 4. Tables & QR Management
router.get('/tables', (_req, res) => {
  const tables = db.prepare('SELECT * FROM tables ORDER BY table_number ASC').all() as Array<Record<string, unknown>>;
  const enriched = tables.map((t) => {
    const sessions = db
      .prepare(
        `SELECT ts.*,
                (SELECT COUNT(*) FROM orders o WHERE o.session_id = ts.session_id) AS order_count,
                (SELECT COALESCE(SUM(o.total_amount), 0) FROM orders o WHERE o.session_id = ts.session_id AND o.status != 'cancelled') AS total_amount
         FROM table_sessions ts
         WHERE ts.table_id = ?
         ORDER BY ts.session_id DESC LIMIT 5`
      )
      .all(Number(t.table_id));
    return { ...t, recent_sessions: sessions };
  });
  res.json({ tables: enriched });
});

router.post('/tables', (req: AuthenticatedRequest, res) => {
  const { table_number, label, capacity = 4, is_active = true } = req.body as {
    table_number: number;
    label?: string;
    capacity?: number;
    is_active?: boolean;
  };
  if (!table_number || Number(table_number) <= 0) {
    res.status(400).json({ error: 'Valid positive table number is required.' });
    return;
  }
  const existing = db.prepare('SELECT table_id FROM tables WHERE table_number = ?').get(Number(table_number));
  if (existing) {
    res.status(400).json({ error: `Table ${table_number} already exists.` });
    return;
  }
  const qrToken = `tbl-${table_number}-${crypto.randomBytes(6).toString('hex')}`;
  const r = db
    .prepare('INSERT INTO tables (table_number, label, capacity, qr_token, is_active) VALUES (?, ?, ?, ?, ?)')
    .run(Number(table_number), label || `Table ${table_number}`, Number(capacity || 4), qrToken, is_active ? 1 : 0);

  logAudit(req.user!.user_id, 'table:created', 'table', Number(r.lastInsertRowid), { table_number });
  res.status(201).json({ table_id: Number(r.lastInsertRowid), qr_token: qrToken });
});

router.put('/tables/:id', (req: AuthenticatedRequest, res) => {
  const tableId = Number(req.params.id);
  const { table_number, label, capacity, is_active, regenerate_qr } = req.body as {
    table_number?: number;
    label?: string;
    capacity?: number;
    is_active?: boolean;
    regenerate_qr?: boolean;
  };

  let newToken: string | null = null;
  if (regenerate_qr) {
    newToken = `tbl-${tableId}-${crypto.randomBytes(6).toString('hex')}`;
  }

  db.prepare(
    `UPDATE tables
     SET table_number = COALESCE(?, table_number),
         label = COALESCE(?, label),
         capacity = COALESCE(?, capacity),
         is_active = COALESCE(?, is_active),
         qr_token = COALESCE(?, qr_token),
         updated_at = datetime('now')
     WHERE table_id = ?`
  ).run(
    table_number !== undefined ? Number(table_number) : null,
    label !== undefined ? label : null,
    capacity !== undefined ? Number(capacity) : null,
    is_active !== undefined ? (is_active ? 1 : 0) : null,
    newToken,
    tableId
  );

  logAudit(req.user!.user_id, 'table:updated', 'table', tableId, { regenerate_qr: Boolean(regenerate_qr) });
  res.json({ success: true, qr_token: newToken });
});

router.delete('/tables/:id', (req: AuthenticatedRequest, res) => {
  const tableId = Number(req.params.id);
  const used = db.prepare('SELECT COUNT(*) as cnt FROM table_sessions WHERE table_id = ?').get(tableId) as { cnt: number };
  if (used.cnt > 0) {
    db.prepare('UPDATE tables SET is_active = 0 WHERE table_id = ?').run(tableId);
    res.json({ success: true, soft_disabled: true, message: 'Table has session history and was deactivated.' });
    return;
  }
  db.prepare('DELETE FROM tables WHERE table_id = ?').run(tableId);
  logAudit(req.user!.user_id, 'table:deleted', 'table', tableId, {});
  res.json({ success: true });
});

// 5. Users / Staff / Chef CRUD
router.get('/users', (_req, res) => {
  const users = db
    .prepare('SELECT user_id, name, username, email, role, is_active, last_login_at, created_at FROM users ORDER BY user_id ASC')
    .all();
  res.json({ users });
});

router.post('/users', (req: AuthenticatedRequest, res) => {
  const { name, username, email, password, role, is_active = true } = req.body as {
    name: string;
    username: string;
    email: string;
    password: string;
    role: 'admin' | 'staff' | 'chef';
    is_active?: boolean;
  };
  if (!name || !username || !email || !password || !['admin', 'staff', 'chef'].includes(role)) {
    res.status(400).json({ error: 'Name, username, email, password, and valid role are required.' });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: 'Password must be at least 6 characters.' });
    return;
  }

  try {
    const r = db
      .prepare('INSERT INTO users (name, username, email, password_hash, role, is_active) VALUES (?, ?, ?, ?, ?, ?)')
      .run(name.trim(), username.trim().toLowerCase(), email.trim().toLowerCase(), hashPassword(password), role, is_active ? 1 : 0);
    logAudit(req.user!.user_id, 'user:created', 'user', Number(r.lastInsertRowid), { username, role });
    res.status(201).json({ user_id: Number(r.lastInsertRowid) });
  } catch {
    res.status(400).json({ error: 'Username or email already exists.' });
  }
});

router.put('/users/:id', (req: AuthenticatedRequest, res) => {
  const userId = Number(req.params.id);
  const { name, email, role, is_active, password } = req.body as {
    name?: string;
    email?: string;
    role?: 'admin' | 'staff' | 'chef';
    is_active?: boolean;
    password?: string;
  };

  if (userId === req.user!.user_id && is_active === false) {
    res.status(400).json({ error: 'You cannot disable your own active administrator account.' });
    return;
  }

  db.prepare(
    `UPDATE users
     SET name = COALESCE(?, name),
         email = COALESCE(?, email),
         role = COALESCE(?, role),
         is_active = COALESCE(?, is_active),
         password_hash = COALESCE(?, password_hash),
         updated_at = datetime('now')
     WHERE user_id = ?`
  ).run(
    name !== undefined ? name.trim() : null,
    email !== undefined ? email.trim().toLowerCase() : null,
    role !== undefined && ['admin', 'staff', 'chef'].includes(role) ? role : null,
    is_active !== undefined ? (is_active ? 1 : 0) : null,
    password && password.length >= 6 ? hashPassword(password) : null,
    userId
  );

  logAudit(req.user!.user_id, 'user:updated', 'user', userId, { role, is_active, password_reset: Boolean(password) });
  res.json({ success: true });
});

// 6. Orders, Payments & Audit Logs
router.get('/orders', (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : '';
  const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
  let sql = `
    SELECT o.*, t.table_number, u.name AS staff_name
    FROM orders o
    JOIN table_sessions ts ON ts.session_id = o.session_id
    JOIN tables t ON t.table_id = ts.table_id
    LEFT JOIN users u ON u.user_id = o.staff_id
    WHERE 1=1
  `;
  const params: string[] = [];
  if (status && status !== 'all') {
    sql += ' AND o.status = ?';
    params.push(status);
  }
  if (search) {
    sql += ' AND (LOWER(o.order_number) LIKE ? OR CAST(t.table_number AS TEXT) = ?)';
    params.push(`%${search}%`, search);
  }
  sql += ' ORDER BY o.created_at DESC, o.order_id DESC LIMIT 200';
  const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
  const enriched = rows.map((o) => ({
    ...o,
    items: db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(Number(o.order_id)),
  }));
  res.json({ orders: enriched });
});

router.get('/payments', (_req, res) => {
  const payments = db
    .prepare(
      `SELECT p.*, t.table_number, ts.session_code, u.name AS verified_by_name, r.receipt_id, r.receipt_number
       FROM payments p
       JOIN table_sessions ts ON ts.session_id = p.session_id
       JOIN tables t ON t.table_id = ts.table_id
       LEFT JOIN users u ON u.user_id = p.verified_by
       LEFT JOIN receipts r ON r.payment_id = p.payment_id
       ORDER BY p.created_at DESC, p.payment_id DESC
       LIMIT 200`
    )
    .all();
  res.json({ payments });
});

router.get('/audit-logs', (_req, res) => {
  const logs = db
    .prepare(
      `SELECT a.*, u.name AS user_name, u.role AS user_role
       FROM audit_logs a
       LEFT JOIN users u ON u.user_id = a.user_id
       ORDER BY a.log_id DESC LIMIT 100`
    )
    .all();
  res.json({ logs });
});

// 7. Reports & Analytics (with date range & optional expenses profit calculation)
router.get('/reports', (req, res) => {
  const from = typeof req.query.from === 'string' && req.query.from ? req.query.from : '2020-01-01';
  const to = typeof req.query.to === 'string' && req.query.to ? req.query.to : '2099-12-31';
  const settings = getAllSettings();
  const expensesEnabled = settings.enable_expenses_module === 'true';

  const summary = db
    .prepare(
      `SELECT COUNT(*) AS order_count,
              COALESCE(SUM(total_amount), 0) AS gross_revenue,
              COALESCE(AVG(total_amount), 0) AS avg_order_value
       FROM orders
       WHERE status != 'cancelled' AND date(created_at) BETWEEN date(?) AND date(?)`
    )
    .get(from, to) as { order_count: number; gross_revenue: number; avg_order_value: number };

  const paidRevenue = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS collected_revenue, COUNT(*) AS paid_transactions
       FROM payments
       WHERE status = 'paid' AND date(COALESCE(paid_at, created_at)) BETWEEN date(?) AND date(?)`
    )
    .get(from, to) as { collected_revenue: number; paid_transactions: number };

  const paymentMix = db
    .prepare(
      `SELECT method, COUNT(*) AS count, COALESCE(SUM(amount), 0) AS total
       FROM payments
       WHERE status = 'paid' AND date(COALESCE(paid_at, created_at)) BETWEEN date(?) AND date(?)
       GROUP BY method`
    )
    .all(from, to);

  const dailySeries = db
    .prepare(
      `SELECT date(created_at) AS period, COUNT(*) AS orders, COALESCE(SUM(total_amount), 0) AS revenue
       FROM orders
       WHERE status != 'cancelled' AND date(created_at) BETWEEN date(?) AND date(?)
       GROUP BY date(created_at)
       ORDER BY period ASC`
    )
    .all(from, to);

  const itemPerformance = db
    .prepare(
      `SELECT m.menu_item_id, COALESCE(mt.name, m.slug) AS name,
              COALESCE(ct.name, c.slug) AS category_name,
              COALESCE(SUM(CASE WHEN o.order_id IS NOT NULL THEN oi.quantity ELSE 0 END), 0) AS qty_sold,
              COALESCE(SUM(CASE WHEN o.order_id IS NOT NULL THEN oi.subtotal ELSE 0 END), 0) AS revenue
       FROM menu_items m
       JOIN categories c ON c.category_id = m.category_id
       LEFT JOIN menu_item_translations mt ON mt.menu_item_id = m.menu_item_id AND mt.language_code = 'en'
       LEFT JOIN category_translations ct ON ct.category_id = c.category_id AND ct.language_code = 'en'
       LEFT JOIN order_items oi ON oi.menu_item_id = m.menu_item_id
       LEFT JOIN orders o ON o.order_id = oi.order_id AND o.status != 'cancelled' AND date(o.created_at) BETWEEN date(?) AND date(?)
       GROUP BY m.menu_item_id
       ORDER BY qty_sold DESC`
    )
    .all(from, to);

  const categorySales = db
    .prepare(
      `SELECT COALESCE(ct.name, c.slug) AS category_name,
              COALESCE(SUM(oi.quantity), 0) AS qty_sold,
              COALESCE(SUM(oi.subtotal), 0) AS revenue
       FROM order_items oi
       JOIN orders o ON o.order_id = oi.order_id
       JOIN menu_items m ON m.menu_item_id = oi.menu_item_id
       JOIN categories c ON c.category_id = m.category_id
       LEFT JOIN category_translations ct ON ct.category_id = c.category_id AND ct.language_code = 'en'
       WHERE o.status != 'cancelled' AND date(o.created_at) BETWEEN date(?) AND date(?)
       GROUP BY c.category_id
       ORDER BY revenue DESC`
    )
    .all(from, to);

  const tableUsage = db
    .prepare(
      `SELECT t.table_number, COUNT(DISTINCT ts.session_id) AS sessions,
              COALESCE(SUM(o.total_amount), 0) AS revenue
       FROM tables t
       LEFT JOIN table_sessions ts ON ts.table_id = t.table_id AND date(ts.opened_at) BETWEEN date(?) AND date(?)
       LEFT JOIN orders o ON o.session_id = ts.session_id AND o.status != 'cancelled'
       GROUP BY t.table_id
       ORDER BY t.table_number ASC`
    )
    .all(from, to);

  let totalExpenses: number | null = null;
  let netProfit: number | null = null;
  if (expensesEnabled) {
    const expRow = db
      .prepare('SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE date(expense_date) BETWEEN date(?) AND date(?)')
      .get(from, to) as { total: number };
    totalExpenses = Number(expRow.total || 0);
    netProfit = Number((Number(paidRevenue.collected_revenue || 0) - totalExpenses).toFixed(2));
  }

  res.json({
    range: { from, to },
    expenses_enabled: expensesEnabled,
    summary: {
      order_count: Number(summary.order_count || 0),
      gross_revenue: Number(summary.gross_revenue || 0),
      avg_order_value: Number(Number(summary.avg_order_value || 0).toFixed(2)),
      collected_revenue: Number(paidRevenue.collected_revenue || 0),
      paid_transactions: Number(paidRevenue.paid_transactions || 0),
      total_expenses: totalExpenses,
      net_profit: netProfit,
    },
    payment_mix: paymentMix,
    daily_series: dailySeries,
    item_performance: itemPerformance,
    category_sales: categorySales,
    table_usage: tableUsage,
  });
});

// 8. Expenses Module
router.get('/expense-categories', (_req, res) => {
  const categories = db.prepare('SELECT * FROM expense_categories ORDER BY expense_category_id ASC').all();
  res.json({ categories });
});

router.post('/expense-categories', (req, res) => {
  const { name, description = '' } = req.body as { name: string; description?: string };
  if (!name?.trim()) {
    res.status(400).json({ error: 'Category name is required.' });
    return;
  }
  const r = db.prepare('INSERT INTO expense_categories (name, description) VALUES (?, ?)').run(name.trim(), description.trim());
  res.status(201).json({ expense_category_id: Number(r.lastInsertRowid) });
});

router.get('/expenses', (_req, res) => {
  const expenses = db
    .prepare(
      `SELECT e.*, ec.name AS category_name, u.name AS created_by_name
       FROM expenses e
       JOIN expense_categories ec ON ec.expense_category_id = e.expense_category_id
       LEFT JOIN users u ON u.user_id = e.created_by
       ORDER BY e.expense_date DESC, e.expense_id DESC`
    )
    .all();
  res.json({ expenses });
});

router.post('/expenses', (req: AuthenticatedRequest, res) => {
  const { expense_category_id, description, amount, expense_date, receipt_url = '' } = req.body as {
    expense_category_id: number;
    description: string;
    amount: number;
    expense_date: string;
    receipt_url?: string;
  };
  if (!expense_category_id || !description?.trim() || Number(amount) < 0 || !expense_date) {
    res.status(400).json({ error: 'Category, description, valid amount, and date are required.' });
    return;
  }
  const r = db
    .prepare('INSERT INTO expenses (expense_category_id, description, amount, expense_date, receipt_url, created_by) VALUES (?, ?, ?, ?, ?, ?)')
    .run(Number(expense_category_id), description.trim(), Number(amount), expense_date, receipt_url, req.user!.user_id);

  logAudit(req.user!.user_id, 'expense:created', 'expense', Number(r.lastInsertRowid), { amount, description });
  res.status(201).json({ expense_id: Number(r.lastInsertRowid) });
});

router.delete('/expenses/:id', (req: AuthenticatedRequest, res) => {
  db.prepare('DELETE FROM expenses WHERE expense_id = ?').run(Number(req.params.id));
  logAudit(req.user!.user_id, 'expense:deleted', 'expense', req.params.id, {});
  res.json({ success: true });
});

// 9. Languages & Translations Management
router.get('/languages', (_req, res) => {
  const languages = db.prepare('SELECT * FROM languages ORDER BY is_default DESC, language_id ASC').all();
  res.json({ languages });
});

router.post('/languages', (req: AuthenticatedRequest, res) => {
  const { code, name, native_name, direction = 'ltr', is_active = true } = req.body as {
    code: string;
    name: string;
    native_name: string;
    direction?: 'ltr' | 'rtl';
    is_active?: boolean;
  };
  if (!code?.trim() || !name?.trim() || !native_name?.trim()) {
    res.status(400).json({ error: 'Language code, name, and native name are required.' });
    return;
  }
  try {
    const r = db
      .prepare('INSERT INTO languages (code, name, native_name, direction, is_active, is_default) VALUES (?, ?, ?, ?, ?, 0)')
      .run(code.trim().toLowerCase(), name.trim(), native_name.trim(), direction === 'rtl' ? 'rtl' : 'ltr', is_active ? 1 : 0);
    logAudit(req.user!.user_id, 'language:created', 'language', code, { name, direction });
    res.status(201).json({ language_id: Number(r.lastInsertRowid) });
  } catch {
    res.status(400).json({ error: 'Language code already exists.' });
  }
});

router.put('/languages/:id', (req: AuthenticatedRequest, res) => {
  const langId = Number(req.params.id);
  const { is_active, direction, native_name, name } = req.body as {
    is_active?: boolean;
    direction?: 'ltr' | 'rtl';
    native_name?: string;
    name?: string;
  };
  db.prepare(
    `UPDATE languages
     SET is_active = COALESCE(?, is_active),
         direction = COALESCE(?, direction),
         native_name = COALESCE(?, native_name),
         name = COALESCE(?, name)
     WHERE language_id = ?`
  ).run(
    is_active !== undefined ? (is_active ? 1 : 0) : null,
    direction !== undefined ? (direction === 'rtl' ? 'rtl' : 'ltr') : null,
    native_name || null,
    name || null,
    langId
  );
  res.json({ success: true });
});

router.get('/translations', (req, res) => {
  const lang = typeof req.query.lang === 'string' ? req.query.lang : 'km';
  const enRows = db
    .prepare("SELECT translation_key, translation_value FROM ui_translations WHERE language_code = 'en' ORDER BY translation_key ASC")
    .all() as Array<{ translation_key: string; translation_value: string }>;
  const targetRows = db
    .prepare('SELECT translation_key, translation_value FROM ui_translations WHERE language_code = ?')
    .all(lang) as Array<{ translation_key: string; translation_value: string }>;
  const targetMap = new Map(targetRows.map((r) => [r.translation_key, r.translation_value]));

  const entries = enRows.map((r) => ({
    key: r.translation_key,
    en_value: r.translation_value,
    target_value: targetMap.get(r.translation_key) || '',
  }));

  res.json({ language_code: lang, entries });
});

router.put('/translations', (req: AuthenticatedRequest, res) => {
  const { language_code, entries } = req.body as {
    language_code: string;
    entries: Array<{ key: string; value: string }>;
  };
  if (!language_code || !Array.isArray(entries)) {
    res.status(400).json({ error: 'language_code and entries array are required.' });
    return;
  }

  const upsert = db.prepare(
    `INSERT INTO ui_translations (language_code, translation_key, translation_value, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(language_code, translation_key) DO UPDATE SET translation_value = excluded.translation_value, updated_at = datetime('now')`
  );
  db.exec('BEGIN');
  try {
    for (const e of entries) {
      if (e.key && e.value !== undefined) {
        upsert.run(language_code, e.key, e.value);
      }
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to save translations.' });
    return;
  }

  logAudit(req.user!.user_id, 'translations:updated', 'language', language_code, { count: entries.length });
  res.json({ success: true });
});

// 10. Restaurant Settings
router.get('/settings', (_req, res) => {
  res.json({ settings: getAllSettings() });
});

router.put('/settings', (req: AuthenticatedRequest, res) => {
  const { settings } = req.body as { settings: Record<string, string | boolean | number> };
  if (!settings || typeof settings !== 'object') {
    res.status(400).json({ error: 'Settings object is required.' });
    return;
  }

  const upsert = db.prepare(
    `INSERT INTO restaurant_settings (setting_key, setting_value, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = datetime('now')`
  );
  db.exec('BEGIN');
  try {
    for (const [key, val] of Object.entries(settings)) {
      upsert.run(key, String(val));
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to update settings.' });
    return;
  }

  logAudit(req.user!.user_id, 'settings:updated', 'settings', 'global', { keys: Object.keys(settings) });
  res.json({ success: true });
});

export default router;
