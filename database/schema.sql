-- DineEasy Digital Restaurant Menu & Management System
-- Normalized MySQL 8 / MariaDB Relational Schema

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS users (
  user_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  username VARCHAR(60) NOT NULL UNIQUE,
  email VARCHAR(160) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin', 'staff', 'chef') NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  email VARCHAR(160) PRIMARY KEY,
  token VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tables (
  table_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  table_number INT NOT NULL UNIQUE,
  label VARCHAR(60) NOT NULL DEFAULT '',
  capacity INT NOT NULL DEFAULT 4,
  qr_token VARCHAR(128) NOT NULL UNIQUE,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS table_sessions (
  session_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  table_id BIGINT UNSIGNED NOT NULL,
  session_code VARCHAR(64) NOT NULL UNIQUE,
  opened_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at DATETIME NULL,
  status ENUM('active', 'checkout_requested', 'closed') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_table_sessions_table (table_id, status),
  CONSTRAINT fk_table_sessions_table FOREIGN KEY (table_id) REFERENCES tables(table_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS languages (
  language_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(16) NOT NULL UNIQUE,
  name VARCHAR(80) NOT NULL,
  native_name VARCHAR(80) NOT NULL,
  direction ENUM('ltr', 'rtl') NOT NULL DEFAULT 'ltr',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ui_translations (
  translation_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  language_code VARCHAR(16) NOT NULL,
  translation_key VARCHAR(120) NOT NULL,
  translation_value TEXT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ui_lang_key (language_code, translation_key),
  CONSTRAINT fk_ui_trans_lang FOREIGN KEY (language_code) REFERENCES languages(code) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS categories (
  category_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(100) NOT NULL UNIQUE,
  image_url VARCHAR(500) NOT NULL DEFAULT '',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS category_translations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  category_id BIGINT UNSIGNED NOT NULL,
  language_code VARCHAR(16) NOT NULL,
  name VARCHAR(120) NOT NULL,
  description TEXT NOT NULL,
  UNIQUE KEY uq_cat_lang (category_id, language_code),
  CONSTRAINT fk_cat_trans_cat FOREIGN KEY (category_id) REFERENCES categories(category_id) ON DELETE CASCADE,
  CONSTRAINT fk_cat_trans_lang FOREIGN KEY (language_code) REFERENCES languages(code) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS menu_items (
  menu_item_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  category_id BIGINT UNSIGNED NOT NULL,
  slug VARCHAR(120) NOT NULL UNIQUE,
  price DECIMAL(10, 2) NOT NULL,
  image_url VARCHAR(500) NOT NULL DEFAULT '',
  is_available TINYINT(1) NOT NULL DEFAULT 1,
  is_popular TINYINT(1) NOT NULL DEFAULT 0,
  is_recommended TINYINT(1) NOT NULL DEFAULT 0,
  is_new TINYINT(1) NOT NULL DEFAULT 0,
  is_special_offer TINYINT(1) NOT NULL DEFAULT 0,
  prep_time_minutes INT NOT NULL DEFAULT 12,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_menu_items_category (category_id, is_available),
  CONSTRAINT fk_menu_items_category FOREIGN KEY (category_id) REFERENCES categories(category_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS menu_item_translations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  menu_item_id BIGINT UNSIGNED NOT NULL,
  language_code VARCHAR(16) NOT NULL,
  name VARCHAR(160) NOT NULL,
  description TEXT NOT NULL,
  UNIQUE KEY uq_item_lang (menu_item_id, language_code),
  CONSTRAINT fk_item_trans_item FOREIGN KEY (menu_item_id) REFERENCES menu_items(menu_item_id) ON DELETE CASCADE,
  CONSTRAINT fk_item_trans_lang FOREIGN KEY (language_code) REFERENCES languages(code) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS menu_item_options (
  option_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  menu_item_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(100) NOT NULL,
  name_km VARCHAR(100) NOT NULL DEFAULT '',
  selection_type ENUM('single', 'multiple') NOT NULL DEFAULT 'single',
  is_required TINYINT(1) NOT NULL DEFAULT 0,
  display_order INT NOT NULL DEFAULT 0,
  CONSTRAINT fk_options_item FOREIGN KEY (menu_item_id) REFERENCES menu_items(menu_item_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS menu_item_option_values (
  value_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  option_id BIGINT UNSIGNED NOT NULL,
  label VARCHAR(100) NOT NULL,
  label_km VARCHAR(100) NOT NULL DEFAULT '',
  price_delta DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  display_order INT NOT NULL DEFAULT 0,
  CONSTRAINT fk_option_values_opt FOREIGN KEY (option_id) REFERENCES menu_item_options(option_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS orders (
  order_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  session_id BIGINT UNSIGNED NOT NULL,
  staff_id BIGINT UNSIGNED NULL,
  order_number VARCHAR(40) NOT NULL UNIQUE,
  status ENUM('placed', 'confirmed', 'cooking', 'ready', 'served', 'completed', 'cancelled') NOT NULL DEFAULT 'placed',
  notes TEXT NOT NULL,
  idempotency_key VARCHAR(128) NULL UNIQUE,
  total_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  confirmed_at DATETIME NULL,
  cooking_started_at DATETIME NULL,
  ready_at DATETIME NULL,
  served_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_orders_session (session_id),
  INDEX idx_orders_status (status),
  CONSTRAINT fk_orders_session FOREIGN KEY (session_id) REFERENCES table_sessions(session_id) ON DELETE RESTRICT,
  CONSTRAINT fk_orders_staff FOREIGN KEY (staff_id) REFERENCES users(user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS order_items (
  order_item_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id BIGINT UNSIGNED NOT NULL,
  menu_item_id BIGINT UNSIGNED NOT NULL,
  item_name_snapshot VARCHAR(160) NOT NULL,
  quantity INT NOT NULL,
  unit_price DECIMAL(10, 2) NOT NULL,
  subtotal DECIMAL(10, 2) NOT NULL,
  selected_options_json JSON NOT NULL,
  special_instructions VARCHAR(255) NOT NULL DEFAULT '',
  INDEX idx_order_items_order (order_id),
  CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE,
  CONSTRAINT fk_order_items_menu FOREIGN KEY (menu_item_id) REFERENCES menu_items(menu_item_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS order_item_options (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_item_id BIGINT UNSIGNED NOT NULL,
  option_name VARCHAR(100) NOT NULL,
  value_label VARCHAR(100) NOT NULL,
  price_delta DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  CONSTRAINT fk_order_item_opts_item FOREIGN KEY (order_item_id) REFERENCES order_items(order_item_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS discounts (
  discount_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(40) NOT NULL UNIQUE,
  label VARCHAR(120) NOT NULL,
  discount_type ENUM('percent', 'fixed') NOT NULL,
  value DECIMAL(10, 2) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payments (
  payment_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  session_id BIGINT UNSIGNED NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  subtotal_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  discount_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  tax_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  service_charge_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  method ENUM('khqr', 'cash') NOT NULL,
  status ENUM('pending', 'paid', 'voided') NOT NULL DEFAULT 'paid',
  verified_by BIGINT UNSIGNED NULL,
  reference_note VARCHAR(255) NOT NULL DEFAULT '',
  paid_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_payments_session (session_id, status),
  CONSTRAINT fk_payments_session FOREIGN KEY (session_id) REFERENCES table_sessions(session_id) ON DELETE RESTRICT,
  CONSTRAINT fk_payments_verifier FOREIGN KEY (verified_by) REFERENCES users(user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS receipts (
  receipt_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  payment_id BIGINT UNSIGNED NOT NULL UNIQUE,
  session_id BIGINT UNSIGNED NOT NULL,
  receipt_number VARCHAR(60) NOT NULL UNIQUE,
  issued_by BIGINT UNSIGNED NULL,
  receipt_data_json JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_receipts_payment FOREIGN KEY (payment_id) REFERENCES payments(payment_id) ON DELETE RESTRICT,
  CONSTRAINT fk_receipts_session FOREIGN KEY (session_id) REFERENCES table_sessions(session_id) ON DELETE RESTRICT,
  CONSTRAINT fk_receipts_issuer FOREIGN KEY (issued_by) REFERENCES users(user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS expense_categories (
  expense_category_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  description VARCHAR(255) NOT NULL DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS expenses (
  expense_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  expense_category_id BIGINT UNSIGNED NOT NULL,
  description VARCHAR(255) NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  expense_date DATE NOT NULL,
  receipt_url VARCHAR(500) NOT NULL DEFAULT '',
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_expenses_cat FOREIGN KEY (expense_category_id) REFERENCES expense_categories(expense_category_id) ON DELETE RESTRICT,
  CONSTRAINT fk_expenses_user FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notifications (
  notification_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  target_role VARCHAR(30) NOT NULL,
  type VARCHAR(60) NOT NULL,
  title VARCHAR(160) NOT NULL,
  message TEXT NOT NULL,
  order_id BIGINT UNSIGNED NULL,
  table_id BIGINT UNSIGNED NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_notifications_role (target_role, is_read, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_logs (
  log_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NULL,
  action VARCHAR(80) NOT NULL,
  entity_type VARCHAR(60) NOT NULL,
  entity_id VARCHAR(60) NOT NULL DEFAULT '',
  details_json JSON NOT NULL,
  ip_address VARCHAR(64) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS restaurant_settings (
  setting_key VARCHAR(80) PRIMARY KEY,
  setting_value TEXT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
