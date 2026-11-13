import { Router } from 'express';
import QRCode from 'qrcode';
import { db, getAllSettings } from '../db.ts';

const router = Router();

router.get('/restaurant', (_req, res) => {
  const settings = getAllSettings();
  res.json({
    restaurant_name: settings.restaurant_name || 'DineEasy Bistro',
    tagline: settings.restaurant_tagline || 'Good Food, Better Mood',
    address: settings.restaurant_address || '',
    phone: settings.restaurant_phone || '',
    email: settings.restaurant_email || '',
    business_hours: settings.business_hours || '',
    timezone: settings.timezone || 'Asia/Phnom_Penh',
    default_language: settings.default_language || 'en',
    currency: settings.currency || 'USD',
    exchange_rate_khr: Number(settings.exchange_rate_khr || 4050),
    tax_rate: Number(settings.tax_rate || 0),
    service_charge_rate: Number(settings.service_charge_rate || 0),
    enable_cash_payment: settings.enable_cash_payment === 'true',
    enable_expenses_module: settings.enable_expenses_module === 'true',
    khqr_bank_name: settings.khqr_bank_name || 'ABA Bank',
    khqr_account_name: settings.khqr_account_name || 'DINEEASY BISTRO',
    khqr_account_id: settings.khqr_account_id || '',
    khqr_payload: settings.khqr_payload || '',
    hero_image_url: settings.hero_image_url || '/menu-images/hero_restaurant_dining_1794534817922.jpg',
    receipt_footer_en: settings.receipt_footer_en || '',
    receipt_footer_km: settings.receipt_footer_km || '',
  });
});

router.get('/languages', (_req, res) => {
  const rows = db
    .prepare('SELECT language_id, code, name, native_name, direction, is_active, is_default FROM languages WHERE is_active = 1 ORDER BY is_default DESC, language_id ASC')
    .all();
  res.json({ languages: rows });
});

router.get('/translations/:lang', (req, res) => {
  const lang = req.params.lang || 'en';
  const langInfo = db.prepare('SELECT code, name, native_name, direction FROM languages WHERE code = ? AND is_active = 1').get(lang) as
    | { code: string; name: string; native_name: string; direction: string }
    | undefined;

  const fallbackRows = db
    .prepare("SELECT translation_key, translation_value FROM ui_translations WHERE language_code = 'en'")
    .all() as Array<{ translation_key: string; translation_value: string }>;

  const map: Record<string, string> = {};
  for (const r of fallbackRows) {
    map[r.translation_key] = r.translation_value;
  }

  if (lang !== 'en') {
    const targetRows = db
      .prepare('SELECT translation_key, translation_value FROM ui_translations WHERE language_code = ?')
      .all(lang) as Array<{ translation_key: string; translation_value: string }>;
    for (const r of targetRows) {
      if (r.translation_value) {
        map[r.translation_key] = r.translation_value;
      }
    }
  }

  res.json({
    language: langInfo || { code: 'en', name: 'English', native_name: 'English', direction: 'ltr' },
    translations: map,
  });
});

router.get('/tables/qr/:token', (req, res) => {
  const table = db
    .prepare('SELECT table_id, table_number, label, capacity, qr_token, is_active FROM tables WHERE qr_token = ?')
    .get(req.params.token) as
    | { table_id: number; table_number: number; label: string; capacity: number; qr_token: string; is_active: number }
    | undefined;

  if (!table) {
    res.status(404).json({ error: 'Invalid QR code. This table could not be identified.' });
    return;
  }
  if (!table.is_active) {
    res.status(403).json({ error: 'This table is currently inactive. Please ask a staff member for assistance.' });
    return;
  }
  res.json({ table });
});

router.get('/tables/demo-links', (_req, res) => {
  const tables = db
    .prepare('SELECT table_id, table_number, label, capacity, qr_token FROM tables WHERE is_active = 1 ORDER BY table_number ASC LIMIT 10')
    .all();
  res.json({ tables });
});

router.get('/categories', (req, res) => {
  const lang = typeof req.query.lang === 'string' ? req.query.lang : 'en';
  const rows = db
    .prepare(
      `SELECT c.category_id, c.slug, c.image_url, c.is_active, c.display_order,
              COALESCE(ct.name, ct_en.name, c.slug) AS name,
              COALESCE(ct.description, ct_en.description, '') AS description
       FROM categories c
       LEFT JOIN category_translations ct ON ct.category_id = c.category_id AND ct.language_code = ?
       LEFT JOIN category_translations ct_en ON ct_en.category_id = c.category_id AND ct_en.language_code = 'en'
       WHERE c.is_active = 1
       ORDER BY c.display_order ASC, c.category_id ASC`
    )
    .all(lang);
  res.json({ categories: rows });
});

function loadItemOptions(menuItemId: number) {
  const options = db
    .prepare('SELECT option_id, menu_item_id, name, name_km, selection_type, is_required, display_order FROM menu_item_options WHERE menu_item_id = ? ORDER BY display_order ASC')
    .all(menuItemId) as Array<{
    option_id: number;
    menu_item_id: number;
    name: string;
    name_km: string;
    selection_type: 'single' | 'multiple';
    is_required: number;
    display_order: number;
  }>;

  return options.map((opt) => {
    const values = db
      .prepare('SELECT value_id, option_id, label, label_km, price_delta, is_default, display_order FROM menu_item_option_values WHERE option_id = ? ORDER BY display_order ASC')
      .all(opt.option_id);
    return { ...opt, values };
  });
}

router.get('/menu-items', (req, res) => {
  const lang = typeof req.query.lang === 'string' ? req.query.lang : 'en';
  const categoryId = req.query.category_id ? Number(req.query.category_id) : null;
  const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';

  let sql = `
    SELECT m.menu_item_id, m.category_id, m.slug, m.price, m.image_url,
           m.is_available, m.is_popular, m.is_recommended, m.is_new, m.is_special_offer,
           m.prep_time_minutes, m.display_order,
           COALESCE(mt.name, mt_en.name, m.slug) AS name,
           COALESCE(mt.description, mt_en.description, '') AS description,
           COALESCE(ct.name, ct_en.name, c.slug) AS category_name
    FROM menu_items m
    JOIN categories c ON c.category_id = m.category_id
    LEFT JOIN menu_item_translations mt ON mt.menu_item_id = m.menu_item_id AND mt.language_code = ?
    LEFT JOIN menu_item_translations mt_en ON mt_en.menu_item_id = m.menu_item_id AND mt_en.language_code = 'en'
    LEFT JOIN category_translations ct ON ct.category_id = c.category_id AND ct.language_code = ?
    LEFT JOIN category_translations ct_en ON ct_en.category_id = c.category_id AND ct_en.language_code = 'en'
    WHERE c.is_active = 1
  `;
  const params: Array<string | number> = [lang, lang];

  if (categoryId) {
    sql += ' AND m.category_id = ?';
    params.push(categoryId);
  }
  if (search) {
    sql += ' AND (LOWER(COALESCE(mt.name, mt_en.name, m.slug)) LIKE ? OR LOWER(COALESCE(mt.description, mt_en.description, \'\')) LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  sql += ' ORDER BY m.display_order ASC, m.menu_item_id ASC';

  const items = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
  const enriched = items.map((item) => ({
    ...item,
    options: loadItemOptions(Number(item.menu_item_id)),
  }));

  res.json({ menu_items: enriched });
});

router.get('/menu-items/:id', (req, res) => {
  const lang = typeof req.query.lang === 'string' ? req.query.lang : 'en';
  const item = db
    .prepare(
      `SELECT m.*, COALESCE(mt.name, mt_en.name, m.slug) AS name,
              COALESCE(mt.description, mt_en.description, '') AS description
       FROM menu_items m
       LEFT JOIN menu_item_translations mt ON mt.menu_item_id = m.menu_item_id AND mt.language_code = ?
       LEFT JOIN menu_item_translations mt_en ON mt_en.menu_item_id = m.menu_item_id AND mt_en.language_code = 'en'
       WHERE m.menu_item_id = ?`
    )
    .get(lang, Number(req.params.id)) as Record<string, unknown> | undefined;

  if (!item) {
    res.status(404).json({ error: 'Menu item not found' });
    return;
  }

  res.json({
    menu_item: {
      ...item,
      options: loadItemOptions(Number(item.menu_item_id)),
    },
  });
});

router.get('/qr', async (req, res) => {
  const data = typeof req.query.data === 'string' ? req.query.data : '';
  if (!data) {
    res.status(400).json({ error: 'Missing QR data query parameter' });
    return;
  }
  try {
    const svg = await QRCode.toString(data, { type: 'svg', margin: 2, width: 280 });
    res.setHeader('Content-Type', 'image/svg+xml');
    res.send(svg);
  } catch {
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

export default router;
