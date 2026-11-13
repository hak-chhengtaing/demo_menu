import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  LayoutDashboard,
  UtensilsCrossed,
  FolderTree,
  ClipboardList,
  ChefHat,
  Users,
  Grid3X3,
  BarChart3,
  Receipt,
  Wallet,
  Globe,
  Settings,
  LogOut,
  ArrowLeft,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { useAuth } from '../../contexts/AuthContext';
import { useI18n } from '../../contexts/I18nContext';
import { useRealtime } from '../../hooks/useRealtime';
import { apiRequest } from '../../services/api';
import { LoginPanel } from '../../components/LoginPanel';
import { LanguageSelector } from '../../components/LanguageSelector';
import { AdminCatalogSection } from './AdminCatalogSection';
import { AdminOperationsSection } from './AdminOperationsSection';
import { AdminAnalyticsAndSettings } from './AdminAnalyticsAndSettings';
import type { AuthUser, Category, MenuItem, Order, RestaurantTable } from '../../types';

type AdminTab =
  | 'dashboard'
  | 'menu'
  | 'categories'
  | 'orders'
  | 'payments'
  | 'tables'
  | 'users'
  | 'reports'
  | 'expenses'
  | 'languages'
  | 'settings';

interface DashboardPayload {
  kpis: {
    total_sales: number;
    total_orders: number;
    avg_order_value: number;
    active_tables: number;
    unpaid_amount: number;
  };
  daily_sales: Array<{ day: string; revenue: number; orders: number }>;
  revenue_by_category: Array<{ category_name: string; revenue: number; qty_sold: number }>;
  top_selling: Array<{ menu_item_id: number; name: string; category_name: string; qty_sold: number; revenue: number }>;
  recent_orders: Array<{ order_id: number; order_number: string; table_number: number; item_count: number; total_amount: number; status: string }>;
}

const CHART_COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#8b5cf6'];

export function AdminDashboardPage() {
  const { user, loading: authLoading, logout } = useAuth();
  const { t } = useI18n();

  const [tab, setTab] = useState<AdminTab>('dashboard');
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [payments, setPayments] = useState<Array<Record<string, unknown>>>([]);
  const [expenses, setExpenses] = useState<Array<Record<string, unknown>>>([]);
  const [expenseCategories, setExpenseCategories] = useState<Array<{ expense_category_id: number; name: string }>>([]);
  const [expensesEnabled, setExpensesEnabled] = useState(true);

  const isAuthorized = user?.role === 'admin';

  const loadAdminData = useCallback(async () => {
    if (!isAuthorized) return;
    try {
      const [dashRes, catRes, itemRes, tblRes, usrRes, ordRes, payRes, expRes, expCatRes, setRes] = await Promise.all([
        apiRequest<DashboardPayload>('/api/admin/dashboard'),
        apiRequest<{ categories: Category[] }>('/api/admin/categories'),
        apiRequest<{ menu_items: MenuItem[] }>('/api/admin/menu-items'),
        apiRequest<{ tables: RestaurantTable[] }>('/api/admin/tables'),
        apiRequest<{ users: AuthUser[] }>('/api/admin/users'),
        apiRequest<{ orders: Order[] }>('/api/admin/orders'),
        apiRequest<{ payments: Array<Record<string, unknown>> }>('/api/admin/payments'),
        apiRequest<{ expenses: Array<Record<string, unknown>> }>('/api/admin/expenses'),
        apiRequest<{ categories: Array<{ expense_category_id: number; name: string }> }>('/api/admin/expense-categories'),
        apiRequest<{ settings: Record<string, string> }>('/api/admin/settings'),
      ]);
      setDashboard(dashRes);
      setCategories(catRes.categories);
      setMenuItems(itemRes.menu_items);
      setTables(tblRes.tables);
      setUsers(usrRes.users);
      setOrders(ordRes.orders);
      setPayments(payRes.payments);
      setExpenses(expRes.expenses);
      setExpenseCategories(expCatRes.categories);
      setExpensesEnabled(setRes.settings.enable_expenses_module === 'true');
    } catch (err) {
      console.error('Admin load error:', err);
    }
  }, [isAuthorized]);

  useEffect(() => {
    void loadAdminData();
  }, [loadAdminData]);

  useRealtime({
    role: 'admin',
    onEvent: () => {
      void loadAdminData();
    },
    onFallbackPoll: () => {
      void loadAdminData();
    },
  });

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-sm text-slate-500">Loading...</div>;
  }

  if (!isAuthorized) {
    return (
      <LoginPanel
        expectedRole="admin"
        title="Admin Dashboard & Management"
        subtitle="Sign in with an Administrator account to manage menu, tables, staff, and analytics."
        accentColor="indigo"
      />
    );
  }

  const navItems: Array<{ key: AdminTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { key: 'dashboard', label: t('nav.dashboard', 'Dashboard'), icon: LayoutDashboard },
    { key: 'menu', label: t('nav.menu', 'Menu Management'), icon: UtensilsCrossed },
    { key: 'categories', label: t('nav.categories', 'Category'), icon: FolderTree },
    { key: 'orders', label: t('nav.orders', 'Orders'), icon: ClipboardList },
    { key: 'payments', label: t('nav.payments', 'Payments'), icon: Receipt },
    { key: 'tables', label: t('nav.tables', 'Tables & QR'), icon: Grid3X3 },
    { key: 'users', label: t('nav.staff', 'Staff & Users'), icon: Users },
    { key: 'reports', label: t('nav.reports', 'Reports'), icon: BarChart3 },
    ...(expensesEnabled ? [{ key: 'expenses' as AdminTab, label: t('nav.expenses', 'Expenses'), icon: Wallet }] : []),
    { key: 'languages', label: t('nav.languages', 'Languages'), icon: Globe },
    { key: 'settings', label: t('nav.settings', 'Settings'), icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col lg:flex-row">
      {/* Indigo/Purple Admin Sidebar (Showcase #4) */}
      <aside className="lg:w-64 bg-indigo-950 text-indigo-100 flex flex-col justify-between shrink-0">
        <div>
          <div className="p-5 border-b border-indigo-900/70 flex items-center justify-between">
            <div>
              <div className="text-lg font-extrabold tracking-tight text-white">DineEasy</div>
              <div className="text-xs text-indigo-300">Admin Console</div>
            </div>
            <Link to="/" className="text-indigo-300 hover:text-white" title="Portal">
              <ArrowLeft className="w-4 h-4" />
            </Link>
          </div>

          <nav className="p-3 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = tab === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => setTab(item.key)}
                  className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2.5 transition-colors cursor-pointer ${
                    active ? 'bg-indigo-600 text-white' : 'text-indigo-200 hover:bg-indigo-900/70 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}

            <Link
              to="/chef"
              className="w-full px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2.5 text-indigo-200 hover:bg-indigo-900/70 hover:text-white transition-colors"
            >
              <ChefHat className="w-4 h-4 shrink-0" />
              <span>Open Kitchen (KDS)</span>
            </Link>
          </nav>
        </div>

        <div className="p-4 border-t border-indigo-900/70 flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-white">{user.name}</div>
            <div className="text-[11px] text-indigo-300 capitalize">{user.role}</div>
          </div>
          <button
            onClick={() => void logout()}
            className="p-2 rounded-lg text-indigo-300 hover:text-white hover:bg-indigo-900 cursor-pointer"
            title={t('nav.logout', 'Log out')}
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* Main White/Slate Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between gap-4">
          <h1 className="text-lg font-bold text-slate-900 capitalize">
            {navItems.find((n) => n.key === tab)?.label || 'Dashboard'}
          </h1>
          <div className="flex items-center gap-3">
            <LanguageSelector />
            <Link
              to="/staff"
              className="px-3.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700"
            >
              Staff Checkout
            </Link>
          </div>
        </header>

        <main className="p-6 space-y-6 flex-1">
          {tab === 'dashboard' && dashboard && (
            <div className="space-y-6">
              {/* 4 KPI Cards (Showcase #4) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white rounded-2xl border border-slate-200 p-5">
                  <div className="text-xs font-medium text-slate-500">{t('admin.total_sales', 'Total Sales')}</div>
                  <div className="text-2xl font-extrabold font-mono tabular-nums text-slate-900 mt-1">
                    ${dashboard.kpis.total_sales.toFixed(2)}
                  </div>
                  <div className="text-xs text-emerald-700 mt-1">Verified paid revenue</div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 p-5">
                  <div className="text-xs font-medium text-slate-500">{t('admin.total_orders', 'Total Orders')}</div>
                  <div className="text-2xl font-extrabold font-mono tabular-nums text-slate-900 mt-1">
                    {dashboard.kpis.total_orders}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">Across all table sessions</div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 p-5">
                  <div className="text-xs font-medium text-slate-500">{t('admin.avg_order_value', 'Avg. Order Value')}</div>
                  <div className="text-2xl font-extrabold font-mono tabular-nums text-slate-900 mt-1">
                    ${dashboard.kpis.avg_order_value.toFixed(2)}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">Per customer order</div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 p-5">
                  <div className="text-xs font-medium text-slate-500">{t('admin.active_tables', 'Active Tables')}</div>
                  <div className="text-2xl font-extrabold font-mono tabular-nums text-slate-900 mt-1">
                    {dashboard.kpis.active_tables}
                  </div>
                  <div className="text-xs text-amber-700 mt-1">
                    Unpaid open balance: ${dashboard.kpis.unpaid_amount.toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Charts Row */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-5">
                  <h2 className="text-sm font-bold text-slate-900 mb-4">Sales Overview (Last 7 Days)</h2>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={dashboard.daily_sales}>
                        <defs>
                          <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.25} />
                            <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Area type="monotone" dataKey="revenue" stroke="#4f46e5" strokeWidth={2.5} fill="url(#salesGrad)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-5 flex flex-col">
                  <h2 className="text-sm font-bold text-slate-900 mb-4">Revenue by Category</h2>
                  <div className="flex-1 min-h-[220px] flex items-center">
                    <div className="w-1/2 h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={dashboard.revenue_by_category}
                            dataKey="revenue"
                            nameKey="category_name"
                            innerRadius={45}
                            outerRadius={75}
                            paddingAngle={3}
                          >
                            {dashboard.revenue_by_category.map((_, idx) => (
                              <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="w-1/2 space-y-2 pl-2 text-xs">
                      {dashboard.revenue_by_category.map((cat, idx) => (
                        <div key={cat.category_name} className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="w-2.5 h-2.5 rounded-sm shrink-0"
                              style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}
                            />
                            <span className="truncate text-slate-700">{cat.category_name}</span>
                          </div>
                          <span className="font-mono font-semibold tabular-nums">${Number(cat.revenue).toFixed(0)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Tables Row */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-slate-200 font-bold text-sm">Top Selling Dishes</div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                        <th className="text-left py-2.5 px-4">Dish Name</th>
                        <th className="text-left py-2.5 px-4">Category</th>
                        <th className="text-right py-2.5 px-4">Qty</th>
                        <th className="text-right py-2.5 px-4">Revenue</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {dashboard.top_selling.map((d) => (
                        <tr key={d.menu_item_id}>
                          <td className="py-2.5 px-4 font-semibold text-slate-900">{d.name}</td>
                          <td className="py-2.5 px-4 text-slate-500">{d.category_name}</td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums">{d.qty_sold}</td>
                          <td className="py-2.5 px-4 text-right font-mono font-bold tabular-nums">${Number(d.revenue).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-slate-200 font-bold text-sm">Recent Orders</div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                        <th className="text-left py-2.5 px-4">Table</th>
                        <th className="text-left py-2.5 px-4">Order #</th>
                        <th className="text-right py-2.5 px-4">Items</th>
                        <th className="text-right py-2.5 px-4">Total</th>
                        <th className="text-right py-2.5 px-4">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {dashboard.recent_orders.map((ro) => (
                        <tr key={ro.order_id}>
                          <td className="py-2.5 px-4 font-semibold">Table {ro.table_number}</td>
                          <td className="py-2.5 px-4 font-mono text-slate-600">{ro.order_number}</td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums">{ro.item_count}</td>
                          <td className="py-2.5 px-4 text-right font-mono font-bold tabular-nums">${Number(ro.total_amount).toFixed(2)}</td>
                          <td className="py-2.5 px-4 text-right capitalize font-semibold">{ro.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {(tab === 'menu' || tab === 'categories') && (
            <AdminCatalogSection
              mode={tab}
              categories={categories}
              menuItems={menuItems}
              onRefresh={loadAdminData}
            />
          )}

          {(tab === 'tables' || tab === 'users' || tab === 'orders' || tab === 'payments' || tab === 'expenses') && (
            <AdminOperationsSection
              mode={tab}
              tables={tables}
              users={users}
              orders={orders}
              payments={payments}
              expenses={expenses}
              expenseCategories={expenseCategories}
              onRefresh={loadAdminData}
            />
          )}

          {(tab === 'reports' || tab === 'languages' || tab === 'settings') && (
            <AdminAnalyticsAndSettings mode={tab} onRefreshGlobal={loadAdminData} />
          )}
        </main>
      </div>
    </div>
  );
}
