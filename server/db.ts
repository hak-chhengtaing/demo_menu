import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const dbPath = process.env.DB_PATH || path.resolve(process.cwd(), 'database', 'restaurant.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new DatabaseSync(dbPath);

// Enforce foreign keys and WAL mode for concurrency & integrity
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');

export function runMigrations(): void {
  db.exec(`
    -- 1. USERS (admin, staff, chef)
    CREATE TABLE IF NOT EXISTS users (
      user_id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'staff', 'chef')),
      is_active INTEGER NOT NULL DEFAULT 1,
      last_login_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 2. AUTH SESSIONS (secure server-side tokens)
    CREATE TABLE IF NOT EXISTS auth_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
    );

    -- 3. RESTAURANT TABLES
    CREATE TABLE IF NOT EXISTS tables (
      table_id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_number INTEGER NOT NULL UNIQUE,
      label TEXT NOT NULL DEFAULT '',
      capacity INTEGER NOT NULL DEFAULT 4,
      qr_token TEXT NOT NULL UNIQUE,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 4. TABLE SESSIONS
    CREATE TABLE IF NOT EXISTS table_sessions (
      session_id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_id INTEGER NOT NULL,
      session_code TEXT NOT NULL UNIQUE,
      opened_at TEXT NOT NULL DEFAULT (datetime('now')),
      closed_at TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'checkout_requested', 'closed')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (table_id) REFERENCES tables(table_id) ON DELETE RESTRICT
    );

    -- 5. LANGUAGES
    CREATE TABLE IF NOT EXISTS languages (
      language_id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      native_name TEXT NOT NULL,
      direction TEXT NOT NULL DEFAULT 'ltr' CHECK (direction IN ('ltr', 'rtl')),
      is_active INTEGER NOT NULL DEFAULT 1,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 6. UI TRANSLATIONS
    CREATE TABLE IF NOT EXISTS ui_translations (
      translation_id INTEGER PRIMARY KEY AUTOINCREMENT,
      language_code TEXT NOT NULL,
      translation_key TEXT NOT NULL,
      translation_value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (language_code, translation_key),
      FOREIGN KEY (language_code) REFERENCES languages(code) ON DELETE CASCADE
    );

    -- 7. CATEGORIES
    CREATE TABLE IF NOT EXISTS categories (
      category_id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      image_url TEXT NOT NULL DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      display_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 8. CATEGORY TRANSLATIONS
    CREATE TABLE IF NOT EXISTS category_translations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL,
      language_code TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      UNIQUE (category_id, language_code),
      FOREIGN KEY (category_id) REFERENCES categories(category_id) ON DELETE CASCADE,
      FOREIGN KEY (language_code) REFERENCES languages(code) ON DELETE CASCADE
    );

    -- 9. MENU ITEMS
    CREATE TABLE IF NOT EXISTS menu_items (
      menu_item_id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      price REAL NOT NULL CHECK (price >= 0),
      image_url TEXT NOT NULL DEFAULT '',
      is_available INTEGER NOT NULL DEFAULT 1,
      is_popular INTEGER NOT NULL DEFAULT 0,
      is_recommended INTEGER NOT NULL DEFAULT 0,
      is_new INTEGER NOT NULL DEFAULT 0,
      is_special_offer INTEGER NOT NULL DEFAULT 0,
      prep_time_minutes INTEGER NOT NULL DEFAULT 12,
      display_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (category_id) REFERENCES categories(category_id) ON DELETE RESTRICT
    );

    -- 10. MENU ITEM TRANSLATIONS
    CREATE TABLE IF NOT EXISTS menu_item_translations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      menu_item_id INTEGER NOT NULL,
      language_code TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      UNIQUE (menu_item_id, language_code),
      FOREIGN KEY (menu_item_id) REFERENCES menu_items(menu_item_id) ON DELETE CASCADE,
      FOREIGN KEY (language_code) REFERENCES languages(code) ON DELETE CASCADE
    );

    -- 11. MENU ITEM OPTIONS (CUSTOMIZATION GROUPS)
    CREATE TABLE IF NOT EXISTS menu_item_options (
      option_id INTEGER PRIMARY KEY AUTOINCREMENT,
      menu_item_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      name_km TEXT NOT NULL DEFAULT '',
      selection_type TEXT NOT NULL DEFAULT 'single' CHECK (selection_type IN ('single', 'multiple')),
      is_required INTEGER NOT NULL DEFAULT 0,
      display_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (menu_item_id) REFERENCES menu_items(menu_item_id) ON DELETE CASCADE
    );

    -- 12. MENU ITEM OPTION VALUES
    CREATE TABLE IF NOT EXISTS menu_item_option_values (
      value_id INTEGER PRIMARY KEY AUTOINCREMENT,
      option_id INTEGER NOT NULL,
      label TEXT NOT NULL,
      label_km TEXT NOT NULL DEFAULT '',
      price_delta REAL NOT NULL DEFAULT 0,
      is_default INTEGER NOT NULL DEFAULT 0,
      display_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (option_id) REFERENCES menu_item_options(option_id) ON DELETE CASCADE
    );

    -- 13. ORDERS
    CREATE TABLE IF NOT EXISTS orders (
      order_id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      staff_id INTEGER,
      order_number TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'placed' CHECK (status IN ('placed', 'confirmed', 'cooking', 'ready', 'served', 'completed', 'cancelled')),
      notes TEXT NOT NULL DEFAULT '',
      idempotency_key TEXT UNIQUE,
      total_amount REAL NOT NULL DEFAULT 0,
      confirmed_at TEXT,
      cooking_started_at TEXT,
      ready_at TEXT,
      served_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES table_sessions(session_id) ON DELETE RESTRICT,
      FOREIGN KEY (staff_id) REFERENCES users(user_id) ON DELETE SET NULL
    );

    -- 14. ORDER ITEMS (with mandatory unit_price snapshot)
    CREATE TABLE IF NOT EXISTS order_items (
      order_item_id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      menu_item_id INTEGER NOT NULL,
      item_name_snapshot TEXT NOT NULL,
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      unit_price REAL NOT NULL CHECK (unit_price >= 0),
      subtotal REAL NOT NULL CHECK (subtotal >= 0),
      selected_options_json TEXT NOT NULL DEFAULT '[]',
      special_instructions TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE,
      FOREIGN KEY (menu_item_id) REFERENCES menu_items(menu_item_id) ON DELETE RESTRICT
    );

    -- 15. ORDER ITEM OPTIONS
    CREATE TABLE IF NOT EXISTS order_item_options (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_item_id INTEGER NOT NULL,
      option_name TEXT NOT NULL,
      value_label TEXT NOT NULL,
      price_delta REAL NOT NULL DEFAULT 0,
      FOREIGN KEY (order_item_id) REFERENCES order_items(order_item_id) ON DELETE CASCADE
    );

    -- 16. DISCOUNTS
    CREATE TABLE IF NOT EXISTS discounts (
      discount_id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      discount_type TEXT NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
      value REAL NOT NULL CHECK (value >= 0),
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 17. PAYMENTS
    CREATE TABLE IF NOT EXISTS payments (
      payment_id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      amount REAL NOT NULL CHECK (amount >= 0),
      subtotal_amount REAL NOT NULL DEFAULT 0,
      discount_amount REAL NOT NULL DEFAULT 0,
      tax_amount REAL NOT NULL DEFAULT 0,
      service_charge_amount REAL NOT NULL DEFAULT 0,
      method TEXT NOT NULL CHECK (method IN ('khqr', 'cash')),
      status TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('pending', 'paid', 'voided')),
      verified_by INTEGER,
      reference_note TEXT NOT NULL DEFAULT '',
      paid_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES table_sessions(session_id) ON DELETE RESTRICT,
      FOREIGN KEY (verified_by) REFERENCES users(user_id) ON DELETE SET NULL
    );

    -- 18. RECEIPTS
    CREATE TABLE IF NOT EXISTS receipts (
      receipt_id INTEGER PRIMARY KEY AUTOINCREMENT,
      payment_id INTEGER NOT NULL UNIQUE,
      session_id INTEGER NOT NULL,
      receipt_number TEXT NOT NULL UNIQUE,
      issued_by INTEGER,
      receipt_data_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (payment_id) REFERENCES payments(payment_id) ON DELETE RESTRICT,
      FOREIGN KEY (session_id) REFERENCES table_sessions(session_id) ON DELETE RESTRICT,
      FOREIGN KEY (issued_by) REFERENCES users(user_id) ON DELETE SET NULL
    );

    -- 19. EXPENSE CATEGORIES
    CREATE TABLE IF NOT EXISTS expense_categories (
      expense_category_id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT ''
    );

    -- 20. EXPENSES
    CREATE TABLE IF NOT EXISTS expenses (
      expense_id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_category_id INTEGER NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL CHECK (amount >= 0),
      expense_date TEXT NOT NULL,
      receipt_url TEXT NOT NULL DEFAULT '',
      created_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (expense_category_id) REFERENCES expense_categories(expense_category_id) ON DELETE RESTRICT,
      FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE SET NULL
    );

    -- 21. NOTIFICATIONS
    CREATE TABLE IF NOT EXISTS notifications (
      notification_id INTEGER PRIMARY KEY AUTOINCREMENT,
      target_role TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      order_id INTEGER,
      table_id INTEGER,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 22. AUDIT LOGS
    CREATE TABLE IF NOT EXISTS audit_logs (
      log_id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL DEFAULT '',
      details_json TEXT NOT NULL DEFAULT '{}',
      ip_address TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL
    );

    -- 23. RESTAURANT SETTINGS
    CREATE TABLE IF NOT EXISTS restaurant_settings (
      setting_key TEXT PRIMARY KEY,
      setting_value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- INDEXES
    CREATE INDEX IF NOT EXISTS idx_table_sessions_table ON table_sessions(table_id, status);
    CREATE INDEX IF NOT EXISTS idx_orders_session ON orders(session_id);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
    CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
    CREATE INDEX IF NOT EXISTS idx_payments_session ON payments(session_id, status);
    CREATE INDEX IF NOT EXISTS idx_menu_items_category ON menu_items(category_id, is_available);
    CREATE INDEX IF NOT EXISTS idx_notifications_role ON notifications(target_role, is_read, created_at);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);
  `);
}

export function getSetting(key: string, fallback = ''): string {
  const row = db.prepare('SELECT setting_value FROM restaurant_settings WHERE setting_key = ?').get(key) as { setting_value: string } | undefined;
  return row ? row.setting_value : fallback;
}

export function getAllSettings(): Record<string, string> {
  const rows = db.prepare('SELECT setting_key, setting_value FROM restaurant_settings').all() as Array<{ setting_key: string; setting_value: string }>;
  const map: Record<string, string> = {};
  for (const r of rows) {
    map[r.setting_key] = r.setting_value;
  }
  return map;
}
