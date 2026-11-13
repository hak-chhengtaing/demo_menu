export interface RestaurantInfo {
  restaurant_name: string;
  tagline: string;
  address: string;
  phone: string;
  email: string;
  business_hours: string;
  timezone: string;
  default_language: string;
  currency: 'USD' | 'KHR';
  exchange_rate_khr: number;
  tax_rate: number;
  service_charge_rate: number;
  enable_cash_payment: boolean;
  enable_expenses_module: boolean;
  khqr_bank_name: string;
  khqr_account_name: string;
  khqr_account_id: string;
  khqr_payload: string;
  hero_image_url: string;
  receipt_footer_en: string;
  receipt_footer_km: string;
}

export interface Language {
  language_id: number;
  code: string;
  name: string;
  native_name: string;
  direction: 'ltr' | 'rtl';
  is_active: number;
  is_default: number;
}

export interface AuthUser {
  user_id: number;
  name: string;
  username: string;
  email: string;
  role: 'admin' | 'staff' | 'chef';
  is_active?: number;
  last_login_at?: string;
}

export interface Category {
  category_id: number;
  slug: string;
  image_url: string;
  is_active: number;
  display_order: number;
  name: string;
  description: string;
  item_count?: number;
  translations?: Array<{ language_code: string; name: string; description: string }>;
}

export interface MenuOptionValue {
  value_id: number;
  option_id: number;
  label: string;
  label_km: string;
  price_delta: number;
  is_default: number;
  display_order: number;
}

export interface MenuOption {
  option_id: number;
  menu_item_id: number;
  name: string;
  name_km: string;
  selection_type: 'single' | 'multiple';
  is_required: number;
  display_order: number;
  values: MenuOptionValue[];
}

export interface MenuItem {
  menu_item_id: number;
  category_id: number;
  slug: string;
  price: number;
  image_url: string;
  is_available: number;
  is_popular: number;
  is_recommended: number;
  is_new: number;
  is_special_offer: number;
  prep_time_minutes: number;
  display_order: number;
  name: string;
  description: string;
  category_name: string;
  options: MenuOption[];
  translations?: Array<{ language_code: string; name: string; description: string }>;
}

export interface CartItem {
  cartKey: string;
  menu_item: MenuItem;
  quantity: number;
  selectedOptionValueIds: number[];
  selectedOptionsSummary: Array<{ option_name: string; value_label: string; price_delta: number }>;
  unitPrice: number;
  specialInstructions: string;
}

export interface OrderItem {
  order_item_id: number;
  order_id: number;
  menu_item_id: number;
  item_name_snapshot: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  selected_options: Array<{ option_name: string; value_label: string; price_delta: number }>;
  special_instructions: string;
}

export type OrderStatus = 'placed' | 'confirmed' | 'cooking' | 'ready' | 'served' | 'completed' | 'cancelled';

export interface Order {
  order_id: number;
  session_id: number;
  staff_id: number | null;
  staff_name?: string;
  order_number: string;
  status: OrderStatus;
  notes: string;
  total_amount: number;
  table_number?: number;
  table_id?: number;
  confirmed_at: string | null;
  cooking_started_at: string | null;
  ready_at: string | null;
  served_at: string | null;
  created_at: string;
  updated_at: string;
  items: OrderItem[];
}

export interface RestaurantTable {
  table_id: number;
  table_number: number;
  label: string;
  capacity: number;
  qr_token: string;
  is_active: number;
  live_status?: string;
  active_session?: TableSession | null;
  active_orders_count?: number;
  unpaid_total?: number;
}

export interface TableSession {
  session_id: number;
  table_id: number;
  session_code: string;
  opened_at: string;
  closed_at: string | null;
  status: 'active' | 'checkout_requested' | 'closed';
  table_number?: number;
  label?: string;
}

export interface ReceiptData {
  receipt_number: string;
  table_number: number;
  session_code: string;
  order_numbers: string[];
  items: Array<{ name: string; qty: number; price: number; subtotal: number }>;
  subtotal: number;
  discount: number;
  discount_label?: string;
  service_charge: number;
  tax: number;
  total: number;
  paid_amount: number;
  received_amount: number;
  change_amount: number;
  method: 'khqr' | 'cash';
  staff_name: string;
  paid_at: string;
  restaurant_name: string;
  restaurant_address: string;
  restaurant_phone: string;
  footer_en: string;
  footer_km: string;
  exchange_rate_khr: number;
}

export interface NotificationItem {
  notification_id: number;
  target_role: string;
  type: string;
  title: string;
  message: string;
  order_id: number | null;
  table_id: number | null;
  is_read: number;
  created_at: string;
}
