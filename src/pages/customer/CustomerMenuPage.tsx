import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  Search,
  ShoppingCart,
  Home,
  UtensilsCrossed,
  ClipboardList,
  Plus,
  Minus,
  Trash2,
  X,
  CheckCircle2,
  Clock,
  Receipt,
  QrCode,
  Sparkles,
  AlertCircle,
} from 'lucide-react';
import { apiRequest, formatCurrency } from '../../services/api';
import { useI18n } from '../../contexts/I18nContext';
import { useRealtime } from '../../hooks/useRealtime';
import { LanguageSelector } from '../../components/LanguageSelector';
import { FoodImage } from '../../components/FoodImage';
import { ReceiptModal } from '../../components/ReceiptModal';
import type {
  CartItem,
  Category,
  MenuItem,
  Order,
  ReceiptData,
  RestaurantInfo,
  RestaurantTable,
  TableSession,
} from '../../types';

type TabView = 'home' | 'menu' | 'cart' | 'orders';

export function CustomerMenuPage() {
  const { token: paramToken } = useParams<{ token?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const qrToken = paramToken || searchParams.get('token') || '';
  const { lang, t } = useI18n();

  const [tab, setTab] = useState<TabView>('menu');
  const [restaurant, setRestaurant] = useState<RestaurantInfo | null>(null);
  const [table, setTable] = useState<RestaurantTable | null>(null);
  const [session, setSession] = useState<TableSession | null>(null);
  const [sessionOrders, setSessionOrders] = useState<Order[]>([]);
  const [sessionReceipts, setSessionReceipts] = useState<Array<{ receipt_id: number; receipt_number: string; receipt_data_json: string }>>([]);
  const [demoTables, setDemoTables] = useState<RestaurantTable[]>([]);

  const [categories, setCategories] = useState<Category[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  // Customization modal state
  const [activeItem, setActiveItem] = useState<MenuItem | null>(null);
  const [selectedOptionValues, setSelectedOptionValues] = useState<Record<number, number[]>>({});
  const [itemQty, setItemQty] = useState(1);
  const [itemInstructions, setItemInstructions] = useState('');

  // Cart state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orderNotes, setOrderNotes] = useState('');
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [orderBanner, setOrderBanner] = useState('');
  const [requestingCheckout, setRequestingCheckout] = useState(false);
  const [viewingReceipt, setViewingReceipt] = useState<ReceiptData | null>(null);
  const [currencyMode, setCurrencyMode] = useState<'USD' | 'KHR'>('USD');

  const loadMenuAndInfo = useCallback(async () => {
    try {
      const [restRes, catRes, itemRes] = await Promise.all([
        apiRequest<RestaurantInfo>('/api/restaurant'),
        apiRequest<{ categories: Category[] }>(`/api/categories?lang=${encodeURIComponent(lang)}`),
        apiRequest<{ menu_items: MenuItem[] }>(`/api/menu-items?lang=${encodeURIComponent(lang)}`),
      ]);
      setRestaurant(restRes);
      setCurrencyMode(restRes.currency || 'USD');
      setCategories(catRes.categories);
      setMenuItems(itemRes.menu_items);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load menu.');
    }
  }, [lang]);

  const initTableSession = useCallback(async () => {
    if (!qrToken) {
      try {
        const res = await apiRequest<{ tables: RestaurantTable[] }>('/api/tables/demo-links');
        setDemoTables(res.tables);
      } catch {
        // ignore
      }
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMsg('');
    try {
      const res = await apiRequest<{
        table: RestaurantTable;
        session: TableSession;
        orders: Order[];
        receipts: Array<{ receipt_id: number; receipt_number: string; receipt_data_json: string }>;
      }>('/api/customer/sessions', {
        method: 'POST',
        body: JSON.stringify({ qr_token: qrToken }),
      });
      setTable(res.table);
      setSession(res.session);
      setSessionOrders(res.orders);
      setSessionReceipts(res.receipts || []);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Invalid table QR code.');
    } finally {
      setLoading(false);
    }
  }, [qrToken]);

  const refreshSession = useCallback(async () => {
    if (!session?.session_id) return;
    try {
      const res = await apiRequest<{
        session: TableSession;
        orders: Order[];
        receipts: Array<{ receipt_id: number; receipt_number: string; receipt_data_json: string }>;
      }>(`/api/customer/sessions/${session.session_id}`);
      setSession(res.session);
      setSessionOrders(res.orders);
      setSessionReceipts(res.receipts || []);
    } catch {
      // ignore background poll failures
    }
  }, [session?.session_id]);

  useEffect(() => {
    void loadMenuAndInfo();
  }, [loadMenuAndInfo]);

  useEffect(() => {
    void initTableSession();
  }, [initTableSession]);

  useRealtime({
    role: 'customer',
    sessionId: session?.session_id,
    tableId: table?.table_id,
    onEvent: (event) => {
      if (event.startsWith('order:') || event === 'payment:verified' || event === 'checkout:requested') {
        void refreshSession();
      } else if (event === 'menu:updated') {
        void loadMenuAndInfo();
      }
    },
    onFallbackPoll: () => {
      void refreshSession();
    },
  });

  const filteredItems = useMemo(() => {
    return menuItems.filter((item) => {
      const matchesCat = selectedCategory === null || item.category_id === selectedCategory;
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.category_name.toLowerCase().includes(q);
      return matchesCat && matchesSearch;
    });
  }, [menuItems, selectedCategory, searchQuery]);

  const popularItems = useMemo(() => menuItems.filter((m) => m.is_popular && m.is_available), [menuItems]);
  const recommendedItems = useMemo(() => menuItems.filter((m) => m.is_recommended && m.is_available), [menuItems]);

  const openItemModal = (item: MenuItem) => {
    if (!item.is_available) return;
    const defaults: Record<number, number[]> = {};
    for (const opt of item.options) {
      const defVals = opt.values.filter((v) => v.is_default).map((v) => v.value_id);
      if (defVals.length > 0) {
        defaults[opt.option_id] = defVals;
      } else if (opt.is_required && opt.values.length > 0) {
        defaults[opt.option_id] = [opt.values[0].value_id];
      } else {
        defaults[opt.option_id] = [];
      }
    }
    setSelectedOptionValues(defaults);
    setItemQty(1);
    setItemInstructions('');
    setActiveItem(item);
  };

  const toggleOptionValue = (optionId: number, valueId: number, type: 'single' | 'multiple') => {
    setSelectedOptionValues((prev) => {
      const current = prev[optionId] || [];
      if (type === 'single') {
        return { ...prev, [optionId]: [valueId] };
      }
      if (current.includes(valueId)) {
        return { ...prev, [optionId]: current.filter((id) => id !== valueId) };
      }
      return { ...prev, [optionId]: [...current, valueId] };
    });
  };

  const computeModalUnitPrice = () => {
    if (!activeItem) return 0;
    let total = Number(activeItem.price);
    for (const opt of activeItem.options) {
      const chosenIds = selectedOptionValues[opt.option_id] || [];
      for (const val of opt.values) {
        if (chosenIds.includes(val.value_id)) {
          total += Number(val.price_delta);
        }
      }
    }
    return Number(total.toFixed(2));
  };

  const addItemToCart = (item: MenuItem, qty: number, optionIds: number[], instructions: string) => {
    let unitPrice = Number(item.price);
    const summary: Array<{ option_name: string; value_label: string; price_delta: number }> = [];
    for (const opt of item.options) {
      for (const val of opt.values) {
        if (optionIds.includes(val.value_id)) {
          unitPrice += Number(val.price_delta);
          summary.push({
            option_name: lang === 'km' && opt.name_km ? opt.name_km : opt.name,
            value_label: lang === 'km' && val.label_km ? val.label_km : val.label,
            price_delta: Number(val.price_delta),
          });
        }
      }
    }
    unitPrice = Number(unitPrice.toFixed(2));
    const sortedIds = [...optionIds].sort((a, b) => a - b);
    const cartKey = `${item.menu_item_id}-${sortedIds.join(',')}-${instructions.trim()}`;

    setCart((prev) => {
      const idx = prev.findIndex((c) => c.cartKey === cartKey);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], quantity: copy[idx].quantity + qty };
        return copy;
      }
      return [
        ...prev,
        {
          cartKey,
          menu_item: item,
          quantity: qty,
          selectedOptionValueIds: sortedIds,
          selectedOptionsSummary: summary,
          unitPrice,
          specialInstructions: instructions.trim(),
        },
      ];
    });
  };

  const quickAdd = (item: MenuItem) => {
    if (!item.is_available) return;
    if (item.options.length > 0) {
      openItemModal(item);
      return;
    }
    addItemToCart(item, 1, [], '');
    setOrderBanner(`${item.name} ${t('customer.added_to_cart', 'added to cart')}`);
    window.setTimeout(() => setOrderBanner(''), 2400);
  };

  const cartCount = cart.reduce((s, c) => s + c.quantity, 0);
  const cartTotal = Number(cart.reduce((s, c) => s + c.unitPrice * c.quantity, 0).toFixed(2));

  const handlePlaceOrder = async () => {
    if (!session || cart.length === 0 || submittingOrder) return;
    setSubmittingOrder(true);
    setErrorMsg('');
    try {
      const idempotencyKey = `ord-${session.session_id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const res = await apiRequest<{ order: Order }>('/api/customer/orders', {
        method: 'POST',
        body: JSON.stringify({
          session_id: session.session_id,
          qr_token: qrToken,
          notes: orderNotes,
          idempotency_key: idempotencyKey,
          items: cart.map((c) => ({
            menu_item_id: c.menu_item.menu_item_id,
            quantity: c.quantity,
            option_value_ids: c.selectedOptionValueIds,
            special_instructions: c.specialInstructions,
          })),
        }),
      });
      setCart([]);
      setOrderNotes('');
      setOrderBanner(`${t('customer.order_success', 'Order placed successfully!')} (${res.order.order_number})`);
      await refreshSession();
      setTab('orders');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to submit order.');
    } finally {
      setSubmittingOrder(false);
    }
  };

  const handleRequestCheckout = async () => {
    if (!session || requestingCheckout) return;
    setRequestingCheckout(true);
    try {
      await apiRequest(`/api/customer/sessions/${session.session_id}/request-checkout`, { method: 'POST' });
      await refreshSession();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to request checkout.');
    } finally {
      setRequestingCheckout(false);
    }
  };

  const formatMoney = (usd: number) =>
    formatCurrency(usd, currencyMode, restaurant?.exchange_rate_khr || 4050);

  // If no QR token in URL, show clean Table QR Selector screen (cannot manually change once locked)
  if (!qrToken && !loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <div className="max-w-lg w-full bg-white rounded-3xl border border-slate-200 p-8 text-center space-y-6 shadow-sm">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center mx-auto">
            <QrCode className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Scan Your Table QR Code</h1>
            <p className="text-sm text-slate-600 mt-1.5">
              For security, each customer menu is locked to the table QR code scanned. Select a sample table QR below to preview the customer experience.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {demoTables.map((tb) => (
              <button
                key={tb.table_id}
                onClick={() => setSearchParams({ token: tb.qr_token })}
                className="py-3 px-3 rounded-xl border border-slate-200 hover:border-emerald-600 hover:bg-emerald-50 text-sm font-semibold text-slate-800 transition-colors cursor-pointer"
              >
                Table {tb.table_number}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-sm font-medium text-slate-500">{t('common.loading', 'Loading...')}</div>
      </div>
    );
  }

  if (errorMsg && !table) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-2xl border border-red-200 p-6 text-center space-y-3">
          <AlertCircle className="w-10 h-10 text-red-500 mx-auto" />
          <h2 className="text-lg font-bold text-slate-900">Table Verification Error</h2>
          <p className="text-sm text-slate-600">{errorMsg}</p>
        </div>
      </div>
    );
  }

  const sessionTotal = sessionOrders
    .filter((o) => o.status !== 'cancelled')
    .reduce((sum, o) => sum + Number(o.total_amount), 0);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-24 lg:pb-10">
      {/* Compact Sticky Top Header (<= 56px) */}
      <header className="sticky top-0 z-30 h-14 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 h-full flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-lg font-extrabold tracking-tight text-emerald-700 whitespace-nowrap">
              {restaurant?.restaurant_name || 'DineEasy'}
            </span>
            <span className="text-slate-300" aria-hidden="true">|</span>
            <span className="text-sm font-semibold text-slate-800 whitespace-nowrap">
              {t('customer.table', 'Table')} {table?.table_number}
            </span>
          </div>

          {/* Desktop Inline Tabs */}
          <nav className="hidden lg:flex items-center gap-6 text-sm font-medium text-slate-600">
            <button onClick={() => setTab('home')} className={`cursor-pointer ${tab === 'home' ? 'text-emerald-700 font-semibold' : 'hover:text-slate-900'}`}>
              {t('nav.home', 'Home')}
            </button>
            <button onClick={() => setTab('menu')} className={`cursor-pointer ${tab === 'menu' ? 'text-emerald-700 font-semibold' : 'hover:text-slate-900'}`}>
              {t('nav.menu', 'Menu')}
            </button>
            <button onClick={() => setTab('orders')} className={`cursor-pointer ${tab === 'orders' ? 'text-emerald-700 font-semibold' : 'hover:text-slate-900'}`}>
              {t('nav.orders', 'Orders')} ({sessionOrders.length})
            </button>
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setCurrencyMode((m) => (m === 'USD' ? 'KHR' : 'USD'))}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-mono font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              title="Toggle Currency"
            >
              {currencyMode}
            </button>
            <LanguageSelector />
            <button
              onClick={() => setTab('cart')}
              className="hidden lg:inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              <span>{t('nav.cart', 'Cart')} ({cartCount})</span>
            </button>
          </div>
        </div>
      </header>

      {/* Toast Feedback Banner */}
      {orderBanner && (
        <div className="max-w-5xl mx-auto px-4 mt-3">
          <div className="p-3 rounded-xl bg-emerald-600 text-white text-xs font-semibold flex items-center justify-between">
            <span>{orderBanner}</span>
            <button onClick={() => setOrderBanner('')} className="cursor-pointer"><X className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="max-w-5xl mx-auto px-4 mt-3">
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium flex items-center justify-between">
            <span>{errorMsg}</span>
            <button onClick={() => setErrorMsg('')} className="cursor-pointer"><X className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      <main className="max-w-5xl mx-auto px-4 pt-5 space-y-6">
        {/* HOME TAB */}
        {tab === 'home' && (
          <div className="space-y-6">
            <div className="relative rounded-3xl overflow-hidden border border-slate-200 min-h-[240px] flex items-end">
              <FoodImage
                src={restaurant?.hero_image_url}
                alt={restaurant?.restaurant_name || 'Restaurant Dining'}
                className="absolute inset-0 w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
              <div className="relative z-10 p-6 sm:p-8 text-white max-w-xl">
                <div className="text-xs font-semibold text-emerald-300 mb-1">
                  {t('customer.table', 'Table')} {table?.table_number} · {restaurant?.business_hours}
                </div>
                <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight">
                  {t('customer.welcome_title', 'Good Food, Better Mood')}
                </h1>
                <p className="text-sm text-slate-200 mt-2 leading-relaxed">
                  {t('customer.welcome_subtitle')}
                </p>
                <button
                  onClick={() => setTab('menu')}
                  className="mt-4 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors cursor-pointer"
                >
                  {t('customer.browse_menu', 'Browse Menu')}
                </button>
              </div>
            </div>

            {popularItems.length > 0 && (
              <section>
                <h2 className="text-lg font-bold text-slate-900 mb-3">{t('customer.popular', 'Popular')}</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {popularItems.slice(0, 3).map((item) => (
                    <div
                      key={item.menu_item_id}
                      onClick={() => openItemModal(item)}
                      className="bg-white rounded-2xl border border-slate-200 overflow-hidden cursor-pointer hover:border-emerald-500 transition-colors flex flex-col"
                    >
                      <div className="h-40 bg-slate-100 overflow-hidden">
                        <FoodImage src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                      </div>
                      <div className="p-4 flex-1 flex flex-col justify-between">
                        <div>
                          <div className="text-xs text-slate-500">{item.category_name} · {item.prep_time_minutes} min</div>
                          <h3 className="font-bold text-slate-900 mt-0.5">{item.name}</h3>
                        </div>
                        <div className="mt-3 flex items-center justify-between">
                          <span className="font-mono font-bold text-emerald-700 tabular-nums">{formatMoney(item.price)}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              quickAdd(item);
                            }}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
                          >
                            {t('customer.add_to_cart', 'Add to Cart')}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {recommendedItems.length > 0 && (
              <section>
                <h2 className="text-lg font-bold text-slate-900 mb-3">{t('customer.recommended', 'Chef Recommended')}</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {recommendedItems.slice(0, 4).map((item) => (
                    <div
                      key={item.menu_item_id}
                      onClick={() => openItemModal(item)}
                      className="bg-white rounded-2xl border border-slate-200 p-3 flex items-center gap-4 cursor-pointer hover:border-emerald-500 transition-colors"
                    >
                      <div className="w-24 h-24 rounded-xl overflow-hidden shrink-0 bg-slate-100">
                        <FoodImage src={item.image_url} alt={item.name} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-emerald-700 font-medium">{item.category_name}</div>
                        <h3 className="font-bold text-slate-900 truncate">{item.name}</h3>
                        <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">{item.description}</p>
                        <div className="mt-2 flex items-center justify-between">
                          <span className="font-mono font-bold text-slate-900 tabular-nums">{formatMoney(item.price)}</span>
                          <span className="text-xs font-semibold text-emerald-700">+ {t('customer.add_to_cart', 'Add')}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <footer className="bg-white rounded-2xl border border-slate-200 p-5 text-xs text-slate-600 space-y-1">
              <div className="font-bold text-slate-900 text-sm">{restaurant?.restaurant_name}</div>
              <div>{restaurant?.address}</div>
              <div>Tel: {restaurant?.phone} · Hours: {restaurant?.business_hours}</div>
            </footer>
          </div>
        )}

        {/* MENU TAB */}
        {tab === 'menu' && (
          <div className="space-y-5">
            {/* Search Bar */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('customer.search_placeholder', 'Search dishes, drinks, soups...')}
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-white border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {/* Category Filter Strip */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              <button
                onClick={() => setSelectedCategory(null)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  selectedCategory === null
                    ? 'bg-emerald-600 text-white'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                {t('customer.all_categories', 'All')}
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.category_id}
                  onClick={() => setSelectedCategory(cat.category_id)}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    selectedCategory === cat.category_id
                      ? 'bg-emerald-600 text-white'
                      : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>

            {/* Menu Items Grid */}
            {filteredItems.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-sm text-slate-500">
                No dishes match your search or category filter.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredItems.map((item) => {
                  const available = Boolean(item.is_available);
                  return (
                    <div
                      key={item.menu_item_id}
                      onClick={() => available && openItemModal(item)}
                      className={`bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col transition-all ${
                        available ? 'cursor-pointer hover:border-emerald-500' : 'opacity-65 cursor-not-allowed'
                      }`}
                    >
                      <div className="h-44 bg-slate-100 relative overflow-hidden">
                        <FoodImage src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                        {!available && (
                          <div className="absolute inset-0 bg-slate-900/55 flex items-center justify-center">
                            <span className="px-3 py-1 rounded-lg bg-slate-900 text-white text-xs font-semibold">
                              {t('customer.unavailable', 'Unavailable')}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="p-4 flex-1 flex flex-col justify-between">
                        <div>
                          <div className="text-xs text-slate-500 flex items-center gap-1.5">
                            <span>{item.category_name}</span>
                            <span aria-hidden="true">·</span>
                            <span>{item.prep_time_minutes} min</span>
                            {Boolean(item.is_popular) && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="text-emerald-700 font-semibold">{t('customer.popular', 'Popular')}</span>
                              </>
                            )}
                          </div>
                          <h3 className="text-base font-bold text-slate-900 mt-1">{item.name}</h3>
                          <p className="text-xs text-slate-600 mt-1 line-clamp-2 leading-relaxed">{item.description}</p>
                        </div>

                        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                          <span className="text-base font-bold font-mono tabular-nums text-slate-900">
                            {formatMoney(item.price)}
                          </span>
                          <button
                            type="button"
                            disabled={!available}
                            onClick={(e) => {
                              e.stopPropagation();
                              quickAdd(item);
                            }}
                            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-xs font-semibold transition-colors cursor-pointer"
                          >
                            {available ? t('customer.add_to_cart', 'Add to Cart') : t('customer.unavailable', 'Unavailable')}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* CART TAB */}
        {tab === 'cart' && (
          <div className="max-w-2xl mx-auto bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">{t('customer.your_cart', 'Your Cart')}</h2>
              {cart.length > 0 && (
                <button
                  onClick={() => setCart([])}
                  className="text-xs font-semibold text-red-600 hover:text-red-700 cursor-pointer"
                >
                  {t('customer.clear_cart', 'Clear Cart')}
                </button>
              )}
            </div>

            {cart.length === 0 ? (
              <div className="py-10 text-center space-y-3">
                <ShoppingCart className="w-10 h-10 text-slate-300 mx-auto" />
                <div className="text-sm font-semibold text-slate-700">{t('customer.cart_empty', 'Your cart is empty')}</div>
                <p className="text-xs text-slate-500">{t('customer.cart_empty_hint')}</p>
                <button
                  onClick={() => setTab('menu')}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
                >
                  {t('customer.continue_browsing', 'Continue Browsing')}
                </button>
              </div>
            ) : (
              <>
                <div className="divide-y divide-slate-100">
                  {cart.map((c) => (
                    <div key={c.cartKey} className="py-4 flex items-start gap-3.5">
                      <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-100 shrink-0">
                        <FoodImage src={c.menu_item.image_url} alt={c.menu_item.name} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-bold text-sm text-slate-900">{c.menu_item.name}</h3>
                          <span className="font-mono font-bold text-sm tabular-nums text-slate-900">
                            {formatMoney(c.unitPrice * c.quantity)}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 font-mono tabular-nums">
                          {formatMoney(c.unitPrice)} each
                        </div>
                        {c.selectedOptionsSummary.length > 0 && (
                          <div className="text-xs text-slate-600 mt-1">
                            {c.selectedOptionsSummary.map((o) => `${o.option_name}: ${o.value_label}`).join(' · ')}
                          </div>
                        )}
                        {c.specialInstructions && (
                          <div className="text-xs text-amber-700 mt-0.5">Note: {c.specialInstructions}</div>
                        )}

                        <div className="mt-2.5 flex items-center justify-between">
                          <div className="inline-flex items-center border border-slate-200 rounded-lg">
                            <button
                              onClick={() =>
                                setCart((prev) =>
                                  prev
                                    .map((it) =>
                                      it.cartKey === c.cartKey ? { ...it, quantity: it.quantity - 1 } : it
                                    )
                                    .filter((it) => it.quantity > 0)
                                )
                              }
                              className="w-8 h-8 flex items-center justify-center text-slate-600 hover:bg-slate-50 cursor-pointer"
                              aria-label="Decrease quantity"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="px-3 text-xs font-mono font-bold tabular-nums">{c.quantity}</span>
                            <button
                              onClick={() =>
                                setCart((prev) =>
                                  prev.map((it) =>
                                    it.cartKey === c.cartKey ? { ...it, quantity: it.quantity + 1 } : it
                                  )
                                )
                              }
                              className="w-8 h-8 flex items-center justify-center text-slate-600 hover:bg-slate-50 cursor-pointer"
                              aria-label="Increase quantity"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <button
                            onClick={() => setCart((prev) => prev.filter((it) => it.cartKey !== c.cartKey))}
                            className="p-1.5 text-slate-400 hover:text-red-600 cursor-pointer"
                            aria-label="Remove item"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">
                    {t('customer.order_notes', 'Order Notes')}
                  </label>
                  <textarea
                    rows={2}
                    value={orderNotes}
                    onChange={(e) => setOrderNotes(e.target.value)}
                    placeholder="Allergies, cutlery request, serve together..."
                    className="w-full p-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="pt-4 border-t border-slate-200 space-y-3">
                  <div className="flex items-center justify-between text-base font-bold text-slate-900">
                    <span>{t('customer.total', 'Total')}</span>
                    <span className="font-mono tabular-nums text-lg">{formatMoney(cartTotal)}</span>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => setTab('menu')}
                      className="py-3 px-4 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                    >
                      {t('customer.continue_browsing', 'Browse')}
                    </button>
                    <button
                      onClick={handlePlaceOrder}
                      disabled={submittingOrder || session?.status === 'closed'}
                      className="flex-1 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-bold transition-colors cursor-pointer"
                    >
                      {submittingOrder ? t('customer.placing_order', 'Submitting...') : t('customer.place_order', 'Order Now')}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ORDERS TRACKING TAB */}
        {tab === 'orders' && (
          <div className="max-w-2xl mx-auto space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="text-xs text-slate-500">
                  {t('customer.table', 'Table')} {table?.table_number} · Session {session?.session_code}
                </div>
                <div className="text-xl font-bold text-slate-900 mt-0.5 tabular-nums">
                  Session Total: {formatMoney(sessionTotal)}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {sessionReceipts.length > 0 && (
                  <button
                    onClick={() => setViewingReceipt(JSON.parse(sessionReceipts[0].receipt_data_json) as ReceiptData)}
                    className="py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Receipt className="w-4 h-4" />
                    {t('customer.download_receipt', 'View PDF Receipt')}
                  </button>
                )}
                {session?.status === 'active' && sessionOrders.length > 0 && (
                  <button
                    onClick={handleRequestCheckout}
                    disabled={requestingCheckout}
                    className="py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
                  >
                    {t('customer.request_checkout', 'Request Checkout')}
                  </button>
                )}
              </div>
            </div>

            {session?.status === 'checkout_requested' && (
              <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200 text-blue-900 text-xs font-medium">
                {t('customer.checkout_requested', 'Checkout requested — staff is coming to your table.')}
              </div>
            )}

            {session?.status === 'closed' && (
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-medium flex items-center justify-between">
                <span>This table session is settled and closed. Thank you for dining with us!</span>
                <button
                  onClick={() => void initTableSession()}
                  className="px-3 py-1.5 rounded-lg bg-emerald-700 text-white font-semibold cursor-pointer"
                >
                  Start New Session
                </button>
              </div>
            )}

            {sessionOrders.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-3">
                <ClipboardList className="w-10 h-10 text-slate-300 mx-auto" />
                <div className="text-sm text-slate-600">{t('customer.no_orders_yet', 'No orders yet.')}</div>
                <button
                  onClick={() => setTab('menu')}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-semibold cursor-pointer"
                >
                  {t('customer.browse_menu', 'Browse Menu')}
                </button>
              </div>
            ) : (
              sessionOrders.map((ord) => {
                const steps: Array<{ key: Order['status']; label: string }> = [
                  { key: 'placed', label: t('status.placed', 'Order Placed') },
                  { key: 'confirmed', label: t('status.confirmed', 'Confirmed') },
                  { key: 'cooking', label: t('status.cooking', 'Preparing') },
                  { key: 'ready', label: t('status.ready', 'Ready') },
                  { key: 'served', label: t('status.served', 'Delivered') },
                ];
                const orderIdx =
                  ord.status === 'completed'
                    ? 4
                    : steps.findIndex((s) => s.key === ord.status);

                return (
                  <div key={ord.order_id} className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-mono font-bold text-slate-900">{ord.order_number}</div>
                        <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                          <Clock className="w-3.5 h-3.5" />
                          <span>{ord.created_at}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono font-bold text-emerald-700 tabular-nums">
                          {formatMoney(ord.total_amount)}
                        </div>
                        <div className="text-xs font-semibold text-slate-700 capitalize">
                          {t(`status.${ord.status}`, ord.status)}
                        </div>
                      </div>
                    </div>

                    {/* Vertical / Stepper Status Timeline */}
                    {ord.status !== 'cancelled' && (
                      <div className="grid grid-cols-5 gap-1 pt-2">
                        {steps.map((step, i) => {
                          const done = i <= orderIdx;
                          return (
                            <div key={step.key} className="text-center">
                              <div
                                className={`h-1.5 rounded-full mb-1.5 ${
                                  done ? 'bg-emerald-600' : 'bg-slate-200'
                                }`}
                              />
                              <div className={`text-[11px] font-medium ${done ? 'text-emerald-700' : 'text-slate-400'}`}>
                                {step.label}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div className="pt-3 border-t border-slate-100 space-y-2 text-xs">
                      {ord.items.map((it) => (
                        <div key={it.order_item_id} className="flex justify-between">
                          <div>
                            <span className="font-semibold text-slate-800">
                              {it.quantity}× {it.item_name_snapshot}
                            </span>
                            {it.selected_options?.length > 0 && (
                              <span className="text-slate-500 ml-1">
                                ({it.selected_options.map((o) => o.value_label).join(', ')})
                              </span>
                            )}
                          </div>
                          <span className="font-mono tabular-nums text-slate-700">{formatMoney(it.subtotal)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </main>

      {/* Mobile Bottom Navigation Bar (Fixed <= 64px height) */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 h-16 bg-white/95 backdrop-blur-md border-t border-slate-200 grid grid-cols-4 items-center">
        <button
          onClick={() => setTab('home')}
          className={`flex flex-col items-center justify-center h-full cursor-pointer ${
            tab === 'home' ? 'text-emerald-700' : 'text-slate-500'
          }`}
        >
          <Home className="w-5 h-5" />
          <span className="text-[11px] font-medium mt-0.5">{t('nav.home', 'Home')}</span>
        </button>
        <button
          onClick={() => setTab('menu')}
          className={`flex flex-col items-center justify-center h-full cursor-pointer ${
            tab === 'menu' ? 'text-emerald-700' : 'text-slate-500'
          }`}
        >
          <UtensilsCrossed className="w-5 h-5" />
          <span className="text-[11px] font-medium mt-0.5">{t('nav.menu', 'Menu')}</span>
        </button>
        <button
          onClick={() => setTab('cart')}
          className={`flex flex-col items-center justify-center h-full relative cursor-pointer ${
            tab === 'cart' ? 'text-emerald-700' : 'text-slate-500'
          }`}
        >
          <ShoppingCart className="w-5 h-5" />
          <span className="text-[11px] font-medium mt-0.5">
            {t('nav.cart', 'Cart')} {cartCount > 0 ? `(${cartCount})` : ''}
          </span>
        </button>
        <button
          onClick={() => setTab('orders')}
          className={`flex flex-col items-center justify-center h-full cursor-pointer ${
            tab === 'orders' ? 'text-emerald-700' : 'text-slate-500'
          }`}
        >
          <ClipboardList className="w-5 h-5" />
          <span className="text-[11px] font-medium mt-0.5">
            {t('nav.orders', 'Orders')} {sessionOrders.length > 0 ? `(${sessionOrders.length})` : ''}
          </span>
        </button>
      </nav>

      {/* Item Customization Bottom Sheet / Modal */}
      {activeItem && (
        <div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="relative h-52 bg-slate-100 shrink-0">
              <FoodImage src={activeItem.image_url} alt={activeItem.name} />
              <button
                onClick={() => setActiveItem(null)}
                className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white/90 text-slate-800 flex items-center justify-center shadow cursor-pointer"
                aria-label="Close customization"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-5 flex-1">
              <div>
                <div className="text-xs text-slate-500">
                  {activeItem.category_name} · {activeItem.prep_time_minutes} min
                </div>
                <div className="flex items-start justify-between gap-2 mt-1">
                  <h2 className="text-xl font-bold text-slate-900">{activeItem.name}</h2>
                  <span className="text-lg font-mono font-bold text-emerald-700 tabular-nums">
                    {formatMoney(activeItem.price)}
                  </span>
                </div>
                <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">{activeItem.description}</p>
              </div>

              {activeItem.options.map((opt) => {
                const chosen = selectedOptionValues[opt.option_id] || [];
                return (
                  <div key={opt.option_id} className="space-y-2 pt-3 border-t border-slate-100">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-slate-900">
                        {lang === 'km' && opt.name_km ? opt.name_km : opt.name}
                      </span>
                      <span className="text-xs text-slate-500">
                        {opt.is_required ? 'Required' : 'Optional'} · {opt.selection_type === 'single' ? 'Pick 1' : 'Multi-select'}
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {opt.values.map((val) => {
                        const checked = chosen.includes(val.value_id);
                        return (
                          <button
                            key={val.value_id}
                            type="button"
                            onClick={() => toggleOptionValue(opt.option_id, val.value_id, opt.selection_type)}
                            className={`w-full px-3.5 py-2.5 rounded-xl border text-left text-sm flex items-center justify-between transition-colors cursor-pointer ${
                              checked
                                ? 'border-emerald-600 bg-emerald-50 text-emerald-900 font-medium'
                                : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <span>{lang === 'km' && val.label_km ? val.label_km : val.label}</span>
                            <span className="font-mono text-xs tabular-nums text-slate-600">
                              {val.price_delta > 0 ? `+${formatMoney(val.price_delta)}` : 'Included'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              <div className="pt-3 border-t border-slate-100">
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  {t('customer.special_instructions', 'Special Instructions')}
                </label>
                <input
                  type="text"
                  value={itemInstructions}
                  onChange={(e) => setItemInstructions(e.target.value)}
                  placeholder="No onions, less spicy, extra sauce..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center gap-3">
              <div className="inline-flex items-center bg-white border border-slate-200 rounded-xl">
                <button
                  onClick={() => setItemQty((q) => Math.max(1, q - 1))}
                  className="w-10 h-10 flex items-center justify-center text-slate-700 cursor-pointer"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="px-3 font-mono font-bold text-sm tabular-nums">{itemQty}</span>
                <button
                  onClick={() => setItemQty((q) => Math.min(99, q + 1))}
                  className="w-10 h-10 flex items-center justify-center text-slate-700 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <button
                onClick={() => {
                  const optionIds = Object.values(selectedOptionValues).flat();
                  addItemToCart(activeItem, itemQty, optionIds, itemInstructions);
                  setOrderBanner(`${activeItem.name} ${t('customer.added_to_cart', 'added to cart')}`);
                  setActiveItem(null);
                }}
                className="flex-1 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold cursor-pointer"
              >
                {t('customer.add_to_cart', 'Add to Cart')} · {formatMoney(computeModalUnitPrice() * itemQty)}
              </button>
            </div>
          </div>
        </div>
      )}

      <ReceiptModal receipt={viewingReceipt} onClose={() => setViewingReceipt(null)} />
    </div>
  );
}
