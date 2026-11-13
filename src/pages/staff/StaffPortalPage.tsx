import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bell,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  Grid3X3,
  LogOut,
  Printer,
  Download,
  Utensils,
  XCircle,
  ArrowLeft,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useI18n } from '../../contexts/I18nContext';
import { useRealtime } from '../../hooks/useRealtime';
import { apiRequest } from '../../services/api';
import { LoginPanel } from '../../components/LoginPanel';
import { LanguageSelector } from '../../components/LanguageSelector';
import { ReceiptModal } from '../../components/ReceiptModal';
import { downloadReceiptPDF } from '../../utils/pdfReceipt';
import type { NotificationItem, Order, ReceiptData, RestaurantInfo, RestaurantTable } from '../../types';

type StaffSection = 'orders' | 'tables' | 'checkout';

interface CheckoutData {
  session: { session_id: number; table_id: number; session_code: string; table_number: number; status: string };
  orders: Order[];
  subtotal: number;
  discount_amount: number;
  service_charge_rate: number;
  service_charge_amount: number;
  tax_rate: number;
  tax_amount: number;
  grand_total: number;
  already_paid: number;
  balance_due: number;
  balance_due_khr: number;
  exchange_rate_khr: number;
  discounts: Array<{ discount_id: number; code: string; label: string; discount_type: string; value: number }>;
  receipts: Array<{ receipt_id: number; receipt_number: string; receipt_data_json: string }>;
}

export function StaffPortalPage() {
  const { user, loading: authLoading, logout } = useAuth();
  const { t } = useI18n();

  const [section, setSection] = useState<StaffSection>('orders');
  const [orderFilter, setOrderFilter] = useState<string>('all');
  const [orders, setOrders] = useState<Order[]>([]);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [showNotifs, setShowNotifs] = useState(false);
  const [restaurant, setRestaurant] = useState<RestaurantInfo | null>(null);

  // Checkout state
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [checkoutData, setCheckoutData] = useState<CheckoutData | null>(null);
  const [selectedDiscountId, setSelectedDiscountId] = useState<number | ''>('');
  const [paymentMethod, setPaymentMethod] = useState<'khqr' | 'cash'>('khqr');
  const [cashReceived, setCashReceived] = useState<string>('');
  const [referenceNote, setReferenceNote] = useState<string>('');
  const [bankVerifiedCheck, setBankVerifiedCheck] = useState(false);
  const [verifyingPayment, setVerifyingPayment] = useState(false);
  const [activeReceipt, setActiveReceipt] = useState<ReceiptData | null>(null);
  const [feedback, setFeedback] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const isAuthorized = user && (user.role === 'staff' || user.role === 'admin');

  const loadAll = useCallback(async () => {
    if (!isAuthorized) return;
    try {
      const [ordRes, tblRes, notifRes, restRes] = await Promise.all([
        apiRequest<{ orders: Order[] }>(`/api/staff/orders?status=${encodeURIComponent(orderFilter)}`),
        apiRequest<{ tables: RestaurantTable[] }>('/api/staff/tables'),
        apiRequest<{ notifications: NotificationItem[] }>('/api/staff/notifications'),
        apiRequest<RestaurantInfo>('/api/restaurant'),
      ]);
      setOrders(ordRes.orders);
      setTables(tblRes.tables);
      setNotifications(notifRes.notifications);
      setRestaurant(restRes);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load staff data.');
    }
  }, [isAuthorized, orderFilter]);

  const loadCheckout = useCallback(
    async (sessionId: number, discountId?: number | '') => {
      try {
        const q = discountId ? `?discount_id=${discountId}` : '';
        const res = await apiRequest<CheckoutData>(`/api/staff/checkout/${sessionId}${q}`);
        setCheckoutData(res);
        setCashReceived(res.balance_due > 0 ? res.balance_due.toFixed(2) : '');
        setBankVerifiedCheck(false);
        setReferenceNote('');
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Failed to load checkout details.');
      }
    },
    []
  );

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (selectedSessionId) {
      void loadCheckout(selectedSessionId, selectedDiscountId);
    }
  }, [selectedSessionId, selectedDiscountId, loadCheckout]);

  const { connected } = useRealtime({
    role: 'staff',
    onEvent: (event) => {
      if (event.startsWith('order:') || event === 'checkout:requested' || event === 'payment:verified' || event === 'notification:created') {
        void loadAll();
        if (selectedSessionId) {
          void loadCheckout(selectedSessionId, selectedDiscountId);
        }
      }
    },
    onFallbackPoll: () => {
      void loadAll();
    },
  });

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-sm text-slate-500">Loading...</div>;
  }

  if (!isAuthorized) {
    return (
      <LoginPanel
        expectedRole="staff"
        title="Staff Order & Checkout Console"
        subtitle="Sign in with your staff account to confirm orders and verify payments."
        accentColor="blue"
      />
    );
  }

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const handleConfirmOrder = async (orderId: number) => {
    try {
      await apiRequest(`/api/staff/orders/${orderId}/confirm`, { method: 'POST' });
      setFeedback('Order confirmed and sent to Kitchen Display.');
      await loadAll();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to confirm order.');
    }
  };

  const handleMarkServed = async (orderId: number) => {
    try {
      await apiRequest(`/api/staff/orders/${orderId}/served`, { method: 'POST' });
      setFeedback('Order marked as served.');
      await loadAll();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to mark order served.');
    }
  };

  const handleCancelOrder = async (orderId: number) => {
    try {
      await apiRequest(`/api/staff/orders/${orderId}/cancel`, { method: 'POST' });
      setFeedback('Order cancelled.');
      await loadAll();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to cancel order.');
    }
  };

  const handleOpenCheckout = (sessionId: number) => {
    setSelectedSessionId(sessionId);
    setSelectedDiscountId('');
    setSection('checkout');
  };

  const handleVerifyPayment = async () => {
    if (!checkoutData || verifyingPayment) return;
    if (paymentMethod === 'khqr' && !bankVerifiedCheck) {
      setErrorMsg('Please verify the incoming transfer in your banking app and check the confirmation box first.');
      return;
    }

    setVerifyingPayment(true);
    setErrorMsg('');
    try {
      const res = await apiRequest<{ receipt: ReceiptData; receipt_number: string }>('/api/staff/payments/verify', {
        method: 'POST',
        body: JSON.stringify({
          session_id: checkoutData.session.session_id,
          method: paymentMethod,
          discount_id: selectedDiscountId || null,
          received_amount: paymentMethod === 'cash' ? Number(cashReceived) : checkoutData.balance_due,
          reference_note: referenceNote,
          close_session: true,
        }),
      });
      setActiveReceipt(res.receipt);
      setFeedback(`Payment verified (${res.receipt_number}). Table session closed.`);
      await loadAll();
      await loadCheckout(checkoutData.session.session_id, selectedDiscountId);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Payment verification failed.');
    } finally {
      setVerifyingPayment(false);
    }
  };

  const activeUnpaidTables = tables.filter((tb) => tb.active_session);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col lg:flex-row">
      {/* Blue-Slate Staff Sidebar (Showcase #3) */}
      <aside className="lg:w-64 bg-slate-900 text-slate-100 flex flex-col justify-between shrink-0">
        <div>
          <div className="p-5 border-b border-slate-800 flex items-center justify-between">
            <div>
              <div className="text-lg font-extrabold tracking-tight text-white">DineEasy</div>
              <div className="text-xs text-slate-400">Staff Operations</div>
            </div>
            <Link to="/" className="text-xs text-slate-400 hover:text-white" title="Portal Home">
              <ArrowLeft className="w-4 h-4" />
            </Link>
          </div>

          <nav className="p-3 space-y-1">
            <button
              onClick={() => setSection('orders')}
              className={`w-full px-3.5 py-2.5 rounded-xl text-sm font-medium flex items-center justify-between transition-colors cursor-pointer ${
                section === 'orders' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <ClipboardList className="w-4 h-4" />
                {t('nav.orders', 'Orders')}
              </span>
              <span className="text-xs font-mono tabular-nums">
                {orders.filter((o) => o.status === 'placed' || o.status === 'ready').length}
              </span>
            </button>

            <button
              onClick={() => setSection('tables')}
              className={`w-full px-3.5 py-2.5 rounded-xl text-sm font-medium flex items-center justify-between transition-colors cursor-pointer ${
                section === 'tables' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Grid3X3 className="w-4 h-4" />
                {t('nav.tables', 'Tables')}
              </span>
              <span className="text-xs font-mono tabular-nums">{activeUnpaidTables.length}</span>
            </button>

            <button
              onClick={() => {
                setSection('checkout');
                if (!selectedSessionId && activeUnpaidTables[0]?.active_session) {
                  setSelectedSessionId(activeUnpaidTables[0].active_session.session_id);
                }
              }}
              className={`w-full px-3.5 py-2.5 rounded-xl text-sm font-medium flex items-center justify-between transition-colors cursor-pointer ${
                section === 'checkout' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <CreditCard className="w-4 h-4" />
                {t('nav.checkout', 'Checkout')}
              </span>
            </button>
          </nav>
        </div>

        <div className="p-4 border-t border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-white">{user.name}</div>
              <div className="text-xs text-slate-400 capitalize">{user.role}</div>
            </div>
            <button
              onClick={() => void logout()}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              title={t('nav.logout', 'Log out')}
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold text-slate-900 capitalize">
              {section === 'orders' ? 'Order Queue' : section === 'tables' ? 'Restaurant Tables' : 'Table Checkout & KHQR'}
            </h1>
            <span className="text-xs text-slate-500">
              {connected ? 'Live Sync Active' : 'Polling Sync'}
            </span>
          </div>

          <div className="flex items-center gap-3 relative">
            <LanguageSelector />
            <button
              onClick={() => {
                setShowNotifs((s) => !s);
                if (!showNotifs && unreadCount > 0) {
                  void apiRequest('/api/staff/notifications/read', { method: 'POST' }).then(() => loadAll());
                }
              }}
              className="relative p-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 cursor-pointer"
              aria-label="Notifications"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 px-1.5 py-0.5 text-[10px] font-bold bg-red-600 text-white rounded-full">
                  {unreadCount}
                </span>
              )}
            </button>

            {showNotifs && (
              <div className="absolute right-0 top-12 w-80 bg-white rounded-2xl border border-slate-200 shadow-xl z-40 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 font-semibold text-xs text-slate-700">
                  Recent Notifications
                </div>
                <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                  {notifications.length === 0 ? (
                    <div className="p-4 text-xs text-slate-500 text-center">No notifications yet.</div>
                  ) : (
                    notifications.slice(0, 10).map((n) => (
                      <div key={n.notification_id} className="p-3 text-xs space-y-0.5">
                        <div className="font-semibold text-slate-900">{n.title}</div>
                        <div className="text-slate-600">{n.message}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </header>

        <main className="p-6 space-y-5 flex-1">
          {feedback && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center justify-between">
              <span>{feedback}</span>
              <button onClick={() => setFeedback('')} className="cursor-pointer">Dismiss</button>
            </div>
          )}
          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex items-center justify-between">
              <span>{errorMsg}</span>
              <button onClick={() => setErrorMsg('')} className="cursor-pointer">Dismiss</button>
            </div>
          )}

          {/* SECTION 1: ORDERS */}
          {section === 'orders' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-xl w-fit">
                {[
                  ['all', 'All Active'],
                  ['placed', 'New Orders'],
                  ['confirmed', 'Confirmed'],
                  ['cooking', 'Cooking'],
                  ['ready', 'Ready to Serve'],
                  ['served', 'Served'],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setOrderFilter(key)}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      orderFilter === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {orders.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-sm text-slate-500">
                  No orders in this filter right now.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {orders.map((ord) => (
                    <div key={ord.order_id} className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col justify-between space-y-4">
                      <div className="space-y-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="text-base font-bold text-slate-900">Table {ord.table_number}</div>
                            <div className="text-xs font-mono text-slate-500">{ord.order_number} · {ord.created_at}</div>
                          </div>
                          <span
                            className={`text-xs font-bold px-2.5 py-1 rounded-md capitalize ${
                              ord.status === 'placed'
                                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                : ord.status === 'ready'
                                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                  : ord.status === 'cooking'
                                    ? 'bg-blue-50 text-blue-800 border border-blue-200'
                                    : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {t(`status.${ord.status}`, ord.status)}
                          </span>
                        </div>

                        <div className="divide-y divide-slate-100 text-xs">
                          {ord.items.map((it) => (
                            <div key={it.order_item_id} className="py-2 flex justify-between gap-2">
                              <div>
                                <div className="font-semibold text-slate-800">
                                  {it.quantity}× {it.item_name_snapshot}
                                </div>
                                {it.selected_options?.length > 0 && (
                                  <div className="text-slate-500">
                                    {it.selected_options.map((o) => o.value_label).join(', ')}
                                  </div>
                                )}
                                {it.special_instructions && (
                                  <div className="text-amber-700">Note: {it.special_instructions}</div>
                                )}
                              </div>
                              <div className="font-mono tabular-nums text-slate-700">${Number(it.subtotal).toFixed(2)}</div>
                            </div>
                          ))}
                        </div>

                        {ord.notes && (
                          <div className="p-2.5 rounded-lg bg-amber-50 text-amber-900 text-xs">
                            Order Note: {ord.notes}
                          </div>
                        )}
                      </div>

                      <div className="pt-3 border-t border-slate-100 space-y-2.5">
                        <div className="flex items-center justify-between text-sm font-bold">
                          <span>Total</span>
                          <span className="font-mono tabular-nums">${Number(ord.total_amount).toFixed(2)}</span>
                        </div>

                        <div className="flex items-center gap-2">
                          {ord.status === 'placed' && (
                            <button
                              onClick={() => void handleConfirmOrder(ord.order_id)}
                              className="flex-1 py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              {t('staff.confirm_order', 'Confirm Order')}
                            </button>
                          )}
                          {ord.status === 'ready' && (
                            <button
                              onClick={() => void handleMarkServed(ord.order_id)}
                              className="flex-1 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                              <Utensils className="w-3.5 h-3.5" />
                              {t('staff.mark_served', 'Mark Served')}
                            </button>
                          )}
                          {!['completed', 'cancelled'].includes(ord.status) && (
                            <button
                              onClick={() => handleOpenCheckout(ord.session_id)}
                              className="py-2 px-3 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer"
                            >
                              Checkout
                            </button>
                          )}
                          {ord.status === 'placed' && (
                            <button
                              onClick={() => void handleCancelOrder(ord.order_id)}
                              className="p-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 cursor-pointer"
                              title="Cancel Order"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* SECTION 2: TABLES */}
          {section === 'tables' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {tables.map((tbl) => (
                <div key={tbl.table_id} className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col justify-between space-y-4">
                  <div>
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-bold text-slate-900">Table {tbl.table_number}</h3>
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded capitalize ${
                          tbl.live_status === 'available'
                            ? 'bg-slate-100 text-slate-600'
                            : tbl.live_status === 'checkout'
                              ? 'bg-red-50 text-red-700 border border-red-200'
                              : tbl.live_status === 'ready'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-blue-50 text-blue-700 border border-blue-200'
                        }`}
                      >
                        {tbl.live_status}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1">Capacity: {tbl.capacity} seats</div>
                    {tbl.active_session ? (
                      <div className="mt-3 pt-3 border-t border-slate-100 space-y-1 text-xs">
                        <div className="flex justify-between">
                          <span className="text-slate-500">Session</span>
                          <span className="font-mono text-slate-800">{tbl.active_session.session_code}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Orders</span>
                          <span className="font-mono font-semibold text-slate-800">{tbl.active_orders_count}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Unpaid Total</span>
                          <span className="font-mono font-bold text-slate-900 tabular-nums">${Number(tbl.unpaid_total || 0).toFixed(2)}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-4 text-xs text-slate-400">No active dining session</div>
                    )}
                  </div>

                  {tbl.active_session && (
                    <button
                      onClick={() => handleOpenCheckout(tbl.active_session!.session_id)}
                      className="w-full py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
                    >
                      Open Checkout
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* SECTION 3: CHECKOUT & STATIC KHQR (Showcase #3 Split Layout) */}
          {section === 'checkout' && (
            <div className="space-y-4">
              {/* Session selector */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-slate-500 mr-2">Select Active Table:</span>
                {activeUnpaidTables.length === 0 ? (
                  <span className="text-xs text-slate-500">No active sessions awaiting checkout.</span>
                ) : (
                  activeUnpaidTables.map((tb) => (
                    <button
                      key={tb.table_id}
                      onClick={() => setSelectedSessionId(tb.active_session!.session_id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                        selectedSessionId === tb.active_session?.session_id
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      Table {tb.table_number} (${Number(tb.unpaid_total || 0).toFixed(2)})
                    </button>
                  ))
                )}
              </div>

              {checkoutData ? (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  {/* Left: Order Summary */}
                  <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                      <div>
                        <h2 className="text-lg font-bold text-slate-900">
                          {t('staff.order_summary', 'Order Summary')} · Table {checkoutData.session.table_number}
                        </h2>
                        <div className="text-xs font-mono text-slate-500 mt-0.5">
                          Session {checkoutData.session.session_code} · Status: {checkoutData.session.status}
                        </div>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 text-xs text-slate-500">
                            <th className="text-left py-2 font-medium">Dish</th>
                            <th className="text-right py-2 font-medium">Qty</th>
                            <th className="text-right py-2 font-medium">Price</th>
                            <th className="text-right py-2 font-medium">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {checkoutData.orders.flatMap((o) => o.items).map((it) => (
                            <tr key={it.order_item_id}>
                              <td className="py-3 pr-3">
                                <div className="font-medium text-slate-900">{it.item_name_snapshot}</div>
                                {it.selected_options?.length > 0 && (
                                  <div className="text-xs text-slate-500">
                                    {it.selected_options.map((o) => o.value_label).join(', ')}
                                  </div>
                                )}
                              </td>
                              <td className="py-3 text-right font-mono tabular-nums text-slate-700">{it.quantity}</td>
                              <td className="py-3 text-right font-mono tabular-nums text-slate-700">${Number(it.unit_price).toFixed(2)}</td>
                              <td className="py-3 text-right font-mono tabular-nums font-semibold text-slate-900">${Number(it.subtotal).toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="pt-3 border-t border-slate-200 space-y-2 text-sm">
                      <div className="flex items-center justify-between gap-4 pb-2">
                        <label className="text-xs font-medium text-slate-600">Apply Discount</label>
                        <select
                          value={selectedDiscountId}
                          onChange={(e) => setSelectedDiscountId(e.target.value ? Number(e.target.value) : '')}
                          className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs"
                        >
                          <option value="">No discount</option>
                          {checkoutData.discounts.map((d) => (
                            <option key={d.discount_id} value={d.discount_id}>
                              {d.label} ({d.code})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex justify-between text-slate-600">
                        <span>Subtotal</span>
                        <span className="font-mono tabular-nums">${checkoutData.subtotal.toFixed(2)}</span>
                      </div>
                      {checkoutData.discount_amount > 0 && (
                        <div className="flex justify-between text-emerald-700">
                          <span>Discount</span>
                          <span className="font-mono tabular-nums">-${checkoutData.discount_amount.toFixed(2)}</span>
                        </div>
                      )}
                      {checkoutData.service_charge_amount > 0 && (
                        <div className="flex justify-between text-slate-600">
                          <span>Service Charge ({checkoutData.service_charge_rate}%)</span>
                          <span className="font-mono tabular-nums">${checkoutData.service_charge_amount.toFixed(2)}</span>
                        </div>
                      )}
                      {checkoutData.tax_amount > 0 && (
                        <div className="flex justify-between text-slate-600">
                          <span>Tax ({checkoutData.tax_rate}%)</span>
                          <span className="font-mono tabular-nums">${checkoutData.tax_amount.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-lg font-bold text-slate-900 pt-2 border-t border-slate-200">
                        <span>Total Due</span>
                        <span className="font-mono tabular-nums">${checkoutData.balance_due.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-xs text-slate-500">
                        <span>KHR Equivalent (@ {checkoutData.exchange_rate_khr})</span>
                        <span className="font-mono tabular-nums">{checkoutData.balance_due_khr.toLocaleString()} ៛</span>
                      </div>
                    </div>

                    {checkoutData.receipts.length > 0 && (
                      <div className="pt-4 border-t border-slate-200 flex gap-3">
                        <button
                          onClick={() => setActiveReceipt(JSON.parse(checkoutData.receipts[0].receipt_data_json) as ReceiptData)}
                          className="flex-1 py-2.5 px-4 rounded-xl border border-slate-300 hover:bg-slate-50 text-xs font-semibold inline-flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <Printer className="w-4 h-4" />
                          {t('staff.print_receipt', 'View & Print Receipt')}
                        </button>
                        <button
                          onClick={() => downloadReceiptPDF(JSON.parse(checkoutData.receipts[0].receipt_data_json) as ReceiptData)}
                          className="flex-1 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <Download className="w-4 h-4" />
                          {t('staff.download_pdf', 'Download PDF Receipt')}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Right: Payment & Static KHQR Verification */}
                  <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
                    <h2 className="text-lg font-bold text-slate-900">{t('staff.payment_method', 'Payment')}</h2>

                    <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
                      <button
                        onClick={() => setPaymentMethod('khqr')}
                        className={`py-2 px-3 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                          paymentMethod === 'khqr' ? 'bg-blue-600 text-white' : 'text-slate-700 hover:text-slate-900'
                        }`}
                      >
                        Static KHQR
                      </button>
                      <button
                        disabled={restaurant?.enable_cash_payment === false}
                        onClick={() => setPaymentMethod('cash')}
                        className={`py-2 px-3 rounded-lg text-xs font-bold transition-colors cursor-pointer disabled:opacity-40 ${
                          paymentMethod === 'cash' ? 'bg-blue-600 text-white' : 'text-slate-700 hover:text-slate-900'
                        }`}
                      >
                        Cash {restaurant?.enable_cash_payment === false ? '(Disabled)' : ''}
                      </button>
                    </div>

                    {checkoutData.balance_due <= 0 ? (
                      <div className="p-6 rounded-2xl bg-emerald-50 border border-emerald-200 text-center space-y-2">
                        <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
                        <div className="font-bold text-emerald-900">Bill Paid & Verified</div>
                        <div className="text-xs text-emerald-700">This table session has zero unpaid balance.</div>
                      </div>
                    ) : paymentMethod === 'khqr' ? (
                      <div className="space-y-4">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-center space-y-3">
                          <div className="text-xs font-bold tracking-wider text-red-700">KHQR · {t('staff.scan_to_pay', 'Scan to Pay')}</div>
                          <img
                            src={`/api/qr?data=${encodeURIComponent(restaurant?.khqr_payload || 'DINEEASY-KHQR')}`}
                            alt="Static KHQR Code"
                            className="w-48 h-48 mx-auto bg-white p-2 rounded-xl border border-slate-200"
                          />
                          <div>
                            <div className="text-xs font-semibold text-slate-700">{restaurant?.khqr_bank_name} · {restaurant?.khqr_account_name}</div>
                            <div className="text-xs font-mono text-slate-500">Acct: {restaurant?.khqr_account_id}</div>
                          </div>
                          <div className="pt-2 border-t border-slate-200">
                            <div className="text-xs text-slate-500">Customer enters exact amount:</div>
                            <div className="text-2xl font-extrabold font-mono text-slate-900 tabular-nums">
                              ${checkoutData.balance_due.toFixed(2)}
                            </div>
                          </div>
                        </div>

                        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-2">
                          <div className="font-bold flex items-center gap-1.5">
                            <ShieldCheck className="w-4 h-4 text-amber-700" />
                            Manual Static KHQR Verification Required
                          </div>
                          <p>Static KHQR does not auto-confirm. Inspect your restaurant banking app to verify funds arrived before marking paid.</p>
                          <label className="flex items-start gap-2 pt-1 cursor-pointer font-semibold">
                            <input
                              type="checkbox"
                              checked={bankVerifiedCheck}
                              onChange={(e) => setBankVerifiedCheck(e.target.checked)}
                              className="mt-0.5 rounded border-amber-400 text-blue-600"
                            />
                            <span>I confirm ${checkoutData.balance_due.toFixed(2)} was received in {restaurant?.khqr_bank_name}.</span>
                          </label>
                        </div>

                        <input
                          type="text"
                          value={referenceNote}
                          onChange={(e) => setReferenceNote(e.target.value)}
                          placeholder="Optional bank transfer ref / note"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs"
                        />

                        <button
                          onClick={() => void handleVerifyPayment()}
                          disabled={verifyingPayment || !bankVerifiedCheck}
                          className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-bold cursor-pointer"
                        >
                          {verifyingPayment ? 'Recording Payment...' : t('staff.mark_paid', 'Mark as Paid & Issue Receipt')}
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1.5">Cash Received (USD)</label>
                          <input
                            type="number"
                            step="0.01"
                            min={checkoutData.balance_due}
                            value={cashReceived}
                            onChange={(e) => setCashReceived(e.target.value)}
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-mono text-base font-bold"
                          />
                        </div>
                        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex justify-between text-sm">
                          <span className="text-slate-600">Change Due</span>
                          <span className="font-mono font-bold text-slate-900 tabular-nums">
                            ${Math.max(0, Number(cashReceived || 0) - checkoutData.balance_due).toFixed(2)}
                          </span>
                        </div>
                        <input
                          type="text"
                          value={referenceNote}
                          onChange={(e) => setReferenceNote(e.target.value)}
                          placeholder="Optional cashier note"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs"
                        />
                        <button
                          onClick={() => void handleVerifyPayment()}
                          disabled={verifyingPayment || Number(cashReceived) < checkoutData.balance_due}
                          className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-bold cursor-pointer"
                        >
                          {verifyingPayment ? 'Processing...' : t('staff.mark_paid', 'Confirm Cash Payment & Issue Receipt')}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-sm text-slate-500">
                  Select an active table above to view its consolidated bill and process KHQR or cash checkout.
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      <ReceiptModal receipt={activeReceipt} onClose={() => setActiveReceipt(null)} />
    </div>
  );
}
