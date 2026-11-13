import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, RefreshCw, Printer, ExternalLink, Trash2, Upload, Download } from 'lucide-react';
import { apiRequest } from '../../services/api';
import type { AuthUser, Order, RestaurantTable } from '../../types';

interface AdminOperationsProps {
  mode: 'tables' | 'users' | 'orders' | 'payments' | 'expenses';
  tables: Array<RestaurantTable & { recent_sessions?: Array<{ session_id: number; session_code: string; status: string; order_count: number; total_amount: number; opened_at: string }> }>;
  users: AuthUser[];
  orders: Order[];
  payments: Array<Record<string, unknown>>;
  expenses: Array<Record<string, unknown>>;
  expenseCategories: Array<{ expense_category_id: number; name: string }>;
  onRefresh: () => Promise<void>;
}

export function AdminOperationsSection({
  mode,
  tables,
  users,
  orders,
  payments,
  expenses,
  expenseCategories,
  onRefresh,
}: AdminOperationsProps) {
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  // New Table state
  const [newTableNum, setNewTableNum] = useState('');
  const [newTableCap, setNewTableCap] = useState('4');

  // New User state
  const [uName, setUName] = useState('');
  const [uUsername, setUUsername] = useState('');
  const [uEmail, setUEmail] = useState('');
  const [uPassword, setUPassword] = useState('');
  const [uRole, setURole] = useState<'staff' | 'chef' | 'admin'>('staff');

  // Order filter
  const [orderSearch, setOrderSearch] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState('all');

  // Expense form
  const [expCatId, setExpCatId] = useState(expenseCategories[0]?.expense_category_id || 1);
  const [expDesc, setExpDesc] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expDate, setExpDate] = useState(new Date().toISOString().slice(0, 10));
  const [expReceiptUrl, setExpReceiptUrl] = useState('');

  const createTable = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      await apiRequest('/api/admin/tables', {
        method: 'POST',
        body: JSON.stringify({ table_number: Number(newTableNum), capacity: Number(newTableCap) }),
      });
      setNewTableNum('');
      setMsg('Table created with unique QR token.');
      await onRefresh();
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Failed to create table.');
    }
  };

  const regenerateQr = async (tableId: number) => {
    await apiRequest(`/api/admin/tables/${tableId}`, {
      method: 'PUT',
      body: JSON.stringify({ regenerate_qr: true }),
    });
    setMsg('QR token rotated.');
    await onRefresh();
  };

  const toggleTableActive = async (tbl: RestaurantTable) => {
    await apiRequest(`/api/admin/tables/${tbl.table_id}`, {
      method: 'PUT',
      body: JSON.stringify({ is_active: !tbl.is_active }),
    });
    await onRefresh();
  };

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      await apiRequest('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({ name: uName, username: uUsername, email: uEmail, password: uPassword, role: uRole }),
      });
      setUName('');
      setUUsername('');
      setUEmail('');
      setUPassword('');
      setMsg(`Created ${uRole} account for ${uName}.`);
      await onRefresh();
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Failed to create user.');
    }
  };

  const toggleUserActive = async (u: AuthUser) => {
    setErr('');
    try {
      await apiRequest(`/api/admin/users/${u.user_id}`, {
        method: 'PUT',
        body: JSON.stringify({ is_active: !u.is_active }),
      });
      await onRefresh();
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Failed to update account.');
    }
  };

  const resetUserPassword = async (u: AuthUser) => {
    const newPass = 'Reset123!';
    await apiRequest(`/api/admin/users/${u.user_id}`, {
      method: 'PUT',
      body: JSON.stringify({ password: newPass }),
    });
    setMsg(`Password for ${u.username} reset to "${newPass}".`);
  };

  const createExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      await apiRequest('/api/admin/expenses', {
        method: 'POST',
        body: JSON.stringify({
          expense_category_id: Number(expCatId || expenseCategories[0]?.expense_category_id || 1),
          description: expDesc,
          amount: Number(expAmount),
          expense_date: expDate,
          receipt_url: expReceiptUrl,
        }),
      });
      setExpDesc('');
      setExpAmount('');
      setExpReceiptUrl('');
      setMsg('Expense recorded.');
      await onRefresh();
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Failed to add expense.');
    }
  };

  const exportCsv = (filename: string, rows: Array<Record<string, unknown>>) => {
    if (!rows.length) return;
    const headers = Object.keys(rows[0]);
    const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      {msg && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex justify-between">
          <span>{msg}</span>
          <button onClick={() => setMsg('')} className="cursor-pointer">Dismiss</button>
        </div>
      )}
      {err && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex justify-between">
          <span>{err}</span>
          <button onClick={() => setErr('')} className="cursor-pointer">Dismiss</button>
        </div>
      )}

      {/* TABLES & QR */}
      {mode === 'tables' && (
        <div className="space-y-5">
          <form onSubmit={createTable} className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Table Number</label>
              <input
                type="number"
                required
                min={1}
                value={newTableNum}
                onChange={(e) => setNewTableNum(e.target.value)}
                placeholder="e.g. 11"
                className="w-32 px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Seats</label>
              <input
                type="number"
                min={1}
                value={newTableCap}
                onChange={(e) => setNewTableCap(e.target.value)}
                className="w-24 px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono"
              />
            </div>
            <button type="submit" className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer">
              <Plus className="w-4 h-4" />
              Add Table & Generate QR
            </button>
            <button type="button" onClick={() => window.print()} className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer">
              <Printer className="w-4 h-4" />
              Print All QR Cards
            </button>
          </form>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {tables.map((tbl) => {
              const menuUrl = `${window.location.origin}/menu?token=${encodeURIComponent(tbl.qr_token)}`;
              const qrSvgUrl = `/api/qr?data=${encodeURIComponent(menuUrl)}`;
              return (
                <div key={tbl.table_id} className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col justify-between space-y-4">
                  <div className="flex items-start gap-4">
                    <img src={qrSvgUrl} alt={`Table ${tbl.table_number} QR`} className="w-24 h-24 rounded-xl border border-slate-200 p-1 shrink-0" />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center justify-between">
                        <h3 className="font-bold text-slate-900">Table {tbl.table_number}</h3>
                        <button
                          onClick={() => void toggleTableActive(tbl)}
                          className={`text-xs font-semibold px-2 py-0.5 rounded cursor-pointer ${
                            tbl.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {tbl.is_active ? 'Active' : 'Inactive'}
                        </button>
                      </div>
                      <div className="text-xs text-slate-500">{tbl.capacity} seats</div>
                      <div className="text-[11px] font-mono text-slate-400 break-all">{tbl.qr_token}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-3 border-t border-slate-100 text-xs">
                    <Link
                      to={`/menu?token=${encodeURIComponent(tbl.qr_token)}`}
                      className="flex-1 py-1.5 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold inline-flex items-center justify-center gap-1"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Open Menu
                    </Link>
                    <a
                      href={qrSvgUrl}
                      download={`table-${tbl.table_number}-qr.svg`}
                      className="py-1.5 px-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold inline-flex items-center gap-1"
                    >
                      <Download className="w-3.5 h-3.5" />
                      QR
                    </a>
                    <button
                      onClick={() => void regenerateQr(tbl.table_id)}
                      className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 cursor-pointer"
                      title="Rotate QR Token"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* STAFF & USERS */}
      {mode === 'users' && (
        <div className="space-y-5">
          <form onSubmit={createUser} className="bg-white rounded-2xl border border-slate-200 p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
              <input required value={uName} onChange={(e) => setUName(e.target.value)} placeholder="Dara" className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Username</label>
              <input required value={uUsername} onChange={(e) => setUUsername(e.target.value)} placeholder="dara" className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Email</label>
              <input required type="email" value={uEmail} onChange={(e) => setUEmail(e.target.value)} placeholder="dara@dineeasy.kh" className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Password</label>
              <input required type="password" minLength={6} value={uPassword} onChange={(e) => setUPassword(e.target.value)} placeholder="Min 6 chars" className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Role</label>
              <select value={uRole} onChange={(e) => setURole(e.target.value as 'staff' | 'chef' | 'admin')} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm">
                <option value="staff">Staff</option>
                <option value="chef">Chef</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <button type="submit" className="py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer">
              Create Account
            </button>
          </form>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                  <th className="text-left py-3 px-4 font-semibold">Name</th>
                  <th className="text-left py-3 px-4 font-semibold">Username / Email</th>
                  <th className="text-left py-3 px-4 font-semibold">Role</th>
                  <th className="text-left py-3 px-4 font-semibold">Last Login</th>
                  <th className="text-center py-3 px-4 font-semibold">Status</th>
                  <th className="text-right py-3 px-4 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => (
                  <tr key={u.user_id}>
                    <td className="py-3 px-4 font-semibold text-slate-900">{u.name}</td>
                    <td className="py-3 px-4 text-xs text-slate-600">
                      <div className="font-mono">{u.username}</div>
                      <div>{u.email}</div>
                    </td>
                    <td className="py-3 px-4 capitalize font-medium text-slate-800">{u.role}</td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-500">{u.last_login_at || 'Never'}</td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => void toggleUserActive(u)}
                        className={`px-2.5 py-1 rounded text-xs font-semibold cursor-pointer ${
                          u.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                        }`}
                      >
                        {u.is_active ? 'Active' : 'Disabled'}
                      </button>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => void resetUserPassword(u)}
                        className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
                      >
                        Reset Password
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ORDERS HISTORY */}
      {mode === 'orders' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={orderSearch}
                onChange={(e) => setOrderSearch(e.target.value)}
                placeholder="Search order # or table..."
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs w-52"
              />
              <select
                value={orderStatusFilter}
                onChange={(e) => setOrderStatusFilter(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs"
              >
                <option value="all">All Statuses</option>
                <option value="placed">Placed</option>
                <option value="confirmed">Confirmed</option>
                <option value="cooking">Cooking</option>
                <option value="ready">Ready</option>
                <option value="served">Served</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <button
              onClick={() => exportCsv('orders-report.csv', orders as unknown as Array<Record<string, unknown>>)}
              className="px-3.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold cursor-pointer"
            >
              Export CSV
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                  <th className="text-left py-3 px-4 font-semibold">Order #</th>
                  <th className="text-left py-3 px-4 font-semibold">Table</th>
                  <th className="text-left py-3 px-4 font-semibold">Items</th>
                  <th className="text-right py-3 px-4 font-semibold">Total</th>
                  <th className="text-left py-3 px-4 font-semibold">Status</th>
                  <th className="text-left py-3 px-4 font-semibold">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders
                  .filter((o) => orderStatusFilter === 'all' || o.status === orderStatusFilter)
                  .filter((o) => !orderSearch || o.order_number.toLowerCase().includes(orderSearch.toLowerCase()) || String(o.table_number) === orderSearch)
                  .map((o) => (
                    <tr key={o.order_id}>
                      <td className="py-3 px-4 font-mono font-semibold text-slate-900">{o.order_number}</td>
                      <td className="py-3 px-4">Table {o.table_number}</td>
                      <td className="py-3 px-4 text-xs text-slate-600">
                        {o.items?.map((i) => `${i.quantity}× ${i.item_name_snapshot}`).join(', ')}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold tabular-nums">${Number(o.total_amount).toFixed(2)}</td>
                      <td className="py-3 px-4 capitalize text-xs font-semibold">{o.status}</td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-500">{o.created_at}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PAYMENTS HISTORY */}
      {mode === 'payments' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">Payment Records ({payments.length})</h2>
            <button
              onClick={() => exportCsv('payments-report.csv', payments)}
              className="px-3.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold cursor-pointer"
            >
              Export CSV
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                  <th className="text-left py-3 px-4 font-semibold">Receipt #</th>
                  <th className="text-left py-3 px-4 font-semibold">Table</th>
                  <th className="text-left py-3 px-4 font-semibold">Method</th>
                  <th className="text-right py-3 px-4 font-semibold">Amount</th>
                  <th className="text-left py-3 px-4 font-semibold">Verified By</th>
                  <th className="text-left py-3 px-4 font-semibold">Paid At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payments.map((p) => (
                  <tr key={String(p.payment_id)}>
                    <td className="py-3 px-4 font-mono text-xs font-semibold">{String(p.receipt_number || '-')}</td>
                    <td className="py-3 px-4">Table {String(p.table_number)}</td>
                    <td className="py-3 px-4 uppercase font-mono text-xs font-bold">{String(p.method)}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold tabular-nums">${Number(p.amount).toFixed(2)}</td>
                    <td className="py-3 px-4 text-xs text-slate-700">{String(p.verified_by_name || 'Staff')}</td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-500">{String(p.paid_at || p.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* EXPENSES */}
      {mode === 'expenses' && (
        <div className="space-y-5">
          <form onSubmit={createExpense} className="bg-white rounded-2xl border border-slate-200 p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Category</label>
              <select
                value={expCatId}
                onChange={(e) => setExpCatId(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
              >
                {expenseCategories.map((ec) => (
                  <option key={ec.expense_category_id} value={ec.expense_category_id}>{ec.name}</option>
                ))}
              </select>
            </div>
            <div className="lg:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
              <input required value={expDesc} onChange={(e) => setExpDesc(e.target.value)} placeholder="Fresh produce / gas refill..." className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Amount (USD)</label>
              <input required type="number" step="0.01" min="0" value={expAmount} onChange={(e) => setExpAmount(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Date</label>
              <input required type="date" value={expDate} onChange={(e) => setExpDate(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono" />
            </div>
            <div className="flex gap-2">
              <label className="px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                Receipt
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const fd = new FormData();
                    fd.append('file', f);
                    const res = await apiRequest<{ url: string }>('/api/admin/upload', { method: 'POST', body: fd });
                    setExpReceiptUrl(res.url);
                    setMsg('Expense receipt uploaded.');
                  }}
                />
              </label>
              <button type="submit" className="flex-1 py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer">
                Add
              </button>
            </div>
          </form>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                  <th className="text-left py-3 px-4 font-semibold">Date</th>
                  <th className="text-left py-3 px-4 font-semibold">Category</th>
                  <th className="text-left py-3 px-4 font-semibold">Description</th>
                  <th className="text-right py-3 px-4 font-semibold">Amount</th>
                  <th className="text-left py-3 px-4 font-semibold">Recorded By</th>
                  <th className="text-right py-3 px-4 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {expenses.map((ex) => (
                  <tr key={String(ex.expense_id)}>
                    <td className="py-3 px-4 font-mono text-xs">{String(ex.expense_date)}</td>
                    <td className="py-3 px-4 text-xs font-medium">{String(ex.category_name)}</td>
                    <td className="py-3 px-4 text-slate-800">{String(ex.description)}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold tabular-nums">${Number(ex.amount).toFixed(2)}</td>
                    <td className="py-3 px-4 text-xs text-slate-500">{String(ex.created_by_name || 'Admin')}</td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={async () => {
                          await apiRequest(`/api/admin/expenses/${ex.expense_id}`, { method: 'DELETE' });
                          await onRefresh();
                        }}
                        className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
