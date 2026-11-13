import React, { useCallback, useEffect, useState } from 'react';
import { jsPDF } from 'jspdf';
import { Download, Plus, Save } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { apiRequest } from '../../services/api';
import { useI18n } from '../../contexts/I18nContext';
import type { Language } from '../../types';

interface AdminAnalyticsAndSettingsProps {
  mode: 'reports' | 'languages' | 'settings';
  onRefreshGlobal: () => Promise<void>;
}

interface ReportResponse {
  range: { from: string; to: string };
  expenses_enabled: boolean;
  summary: {
    order_count: number;
    gross_revenue: number;
    avg_order_value: number;
    collected_revenue: number;
    paid_transactions: number;
    total_expenses: number | null;
    net_profit: number | null;
  };
  payment_mix: Array<{ method: string; count: number; total: number }>;
  daily_series: Array<{ period: string; orders: number; revenue: number }>;
  item_performance: Array<{ menu_item_id: number; name: string; category_name: string; qty_sold: number; revenue: number }>;
  category_sales: Array<{ category_name: string; qty_sold: number; revenue: number }>;
  table_usage: Array<{ table_number: number; sessions: number; revenue: number }>;
}

export function AdminAnalyticsAndSettings({ mode, onRefreshGlobal }: AdminAnalyticsAndSettingsProps) {
  const { refreshLanguages } = useI18n();
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  // Reports state
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date(Date.now() - 30 * 86400000);
    return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [report, setReport] = useState<ReportResponse | null>(null);

  // Languages & Translations state
  const [languages, setLanguages] = useState<Language[]>([]);
  const [selectedLang, setSelectedLang] = useState('km');
  const [translationEntries, setTranslationEntries] = useState<Array<{ key: string; en_value: string; target_value: string }>>([]);
  const [newLangCode, setNewLangCode] = useState('');
  const [newLangName, setNewLangName] = useState('');
  const [newLangNative, setNewLangNative] = useState('');
  const [newLangDir, setNewLangDir] = useState<'ltr' | 'rtl'>('ltr');

  // Settings state
  const [settings, setSettings] = useState<Record<string, string>>({});

  const loadReports = useCallback(async () => {
    const res = await apiRequest<ReportResponse>(`/api/admin/reports?from=${fromDate}&to=${toDate}`);
    setReport(res);
  }, [fromDate, toDate]);

  const loadLanguagesAndTrans = useCallback(async () => {
    const [langRes, transRes] = await Promise.all([
      apiRequest<{ languages: Language[] }>('/api/admin/languages'),
      apiRequest<{ entries: Array<{ key: string; en_value: string; target_value: string }> }>(`/api/admin/translations?lang=${selectedLang}`),
    ]);
    setLanguages(langRes.languages);
    setTranslationEntries(transRes.entries);
  }, [selectedLang]);

  const loadSettings = useCallback(async () => {
    const res = await apiRequest<{ settings: Record<string, string> }>('/api/admin/settings');
    setSettings(res.settings);
  }, []);

  useEffect(() => {
    if (mode === 'reports') void loadReports();
    else if (mode === 'languages') void loadLanguagesAndTrans();
    else if (mode === 'settings') void loadSettings();
  }, [mode, loadReports, loadLanguagesAndTrans, loadSettings]);

  const exportReportPdf = () => {
    if (!report) return;
    const doc = new jsPDF();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('DineEasy Sales & Operations Report', 14, 18);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Date Range: ${report.range.from} to ${report.range.to}`, 14, 26);

    let y = 36;
    const lines = [
      `Total Orders: ${report.summary.order_count}`,
      `Gross Order Revenue: $${report.summary.gross_revenue.toFixed(2)}`,
      `Collected Paid Revenue: $${report.summary.collected_revenue.toFixed(2)}`,
      `Average Order Value: $${report.summary.avg_order_value.toFixed(2)}`,
      ...(report.expenses_enabled && report.summary.total_expenses !== null
        ? [
            `Recorded Expenses: $${report.summary.total_expenses.toFixed(2)}`,
            `Net Profit: $${(report.summary.net_profit ?? 0).toFixed(2)}`,
          ]
        : []),
    ];
    for (const l of lines) {
      doc.text(l, 14, y);
      y += 7;
    }

    y += 5;
    doc.setFont('helvetica', 'bold');
    doc.text('Top Performing Items', 14, y);
    y += 7;
    doc.setFont('helvetica', 'normal');
    for (const item of report.item_performance.slice(0, 10)) {
      doc.text(`${item.name} (${item.category_name}) — Qty: ${item.qty_sold} · $${Number(item.revenue).toFixed(2)}`, 14, y);
      y += 6;
    }
    doc.save(`dineeasy-report-${report.range.from}-to-${report.range.to}.pdf`);
  };

  const exportReportCsv = () => {
    if (!report) return;
    const headers = ['Dish', 'Category', 'Qty Sold', 'Revenue'];
    const csv = [
      headers.join(','),
      ...report.item_performance.map((i) => `"${i.name}","${i.category_name}",${i.qty_sold},${Number(i.revenue).toFixed(2)}`),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dineeasy-sales-${report.range.from}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const addLanguage = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      await apiRequest('/api/admin/languages', {
        method: 'POST',
        body: JSON.stringify({ code: newLangCode, name: newLangName, native_name: newLangNative, direction: newLangDir }),
      });
      setNewLangCode('');
      setNewLangName('');
      setNewLangNative('');
      setMsg('New language added.');
      await loadLanguagesAndTrans();
      await refreshLanguages();
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Failed to add language.');
    }
  };

  const saveTranslations = async () => {
    await apiRequest('/api/admin/translations', {
      method: 'PUT',
      body: JSON.stringify({
        language_code: selectedLang,
        entries: translationEntries.map((e) => ({ key: e.key, value: e.target_value })),
      }),
    });
    setMsg(`Saved ${translationEntries.length} translation keys for "${selectedLang}".`);
  };

  const saveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiRequest('/api/admin/settings', {
      method: 'PUT',
      body: JSON.stringify({ settings }),
    });
    setMsg('Restaurant settings saved.');
    await onRefreshGlobal();
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

      {/* REPORTS */}
      {mode === 'reports' && report && (
        <div className="space-y-5">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-500">From</label>
                <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-mono" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500">To</label>
                <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-mono" />
              </div>
              <button onClick={() => void loadReports()} className="mt-4 px-4 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold cursor-pointer">
                Apply Range
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={exportReportCsv} className="px-3.5 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer">
                <Download className="w-3.5 h-3.5" />
                Export CSV
              </button>
              <button onClick={exportReportPdf} className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer">
                <Download className="w-3.5 h-3.5" />
                Export PDF
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="text-xs text-slate-500">Collected Revenue</div>
              <div className="text-2xl font-extrabold font-mono tabular-nums mt-1">${report.summary.collected_revenue.toFixed(2)}</div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="text-xs text-slate-500">Orders Count</div>
              <div className="text-2xl font-extrabold font-mono tabular-nums mt-1">{report.summary.order_count}</div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="text-xs text-slate-500">Avg. Order Value</div>
              <div className="text-2xl font-extrabold font-mono tabular-nums mt-1">${report.summary.avg_order_value.toFixed(2)}</div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="text-xs text-slate-500">
                {report.expenses_enabled ? 'Net Profit (After Expenses)' : 'Gross Order Volume'}
              </div>
              <div className="text-2xl font-extrabold font-mono tabular-nums mt-1 text-emerald-700">
                ${(report.expenses_enabled && report.summary.net_profit !== null ? report.summary.net_profit : report.summary.gross_revenue).toFixed(2)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-5">
              <h3 className="text-sm font-bold text-slate-900 mb-4">Daily Revenue Trend</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={report.daily_series}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="revenue" fill="#4f46e5" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
              <h3 className="text-sm font-bold text-slate-900">Revenue by Payment Method</h3>
              <div className="space-y-3">
                {report.payment_mix.map((pm) => (
                  <div key={pm.method} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <div>
                      <div className="font-bold text-sm uppercase">{pm.method}</div>
                      <div className="text-xs text-slate-500">{pm.count} transactions</div>
                    </div>
                    <div className="font-mono font-bold text-base tabular-nums">${Number(pm.total).toFixed(2)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 font-bold text-sm">Item Sales Ranking (Best to Least)</div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                    <th className="text-left py-2.5 px-4">Dish</th>
                    <th className="text-left py-2.5 px-4">Category</th>
                    <th className="text-right py-2.5 px-4">Qty</th>
                    <th className="text-right py-2.5 px-4">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.item_performance.map((it) => (
                    <tr key={it.menu_item_id}>
                      <td className="py-2.5 px-4 font-semibold">{it.name}</td>
                      <td className="py-2.5 px-4 text-slate-500">{it.category_name}</td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums">{it.qty_sold}</td>
                      <td className="py-2.5 px-4 text-right font-mono font-bold tabular-nums">${Number(it.revenue).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 font-bold text-sm">Table Utilization</div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                    <th className="text-left py-2.5 px-4">Table</th>
                    <th className="text-right py-2.5 px-4">Sessions</th>
                    <th className="text-right py-2.5 px-4">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.table_usage.map((tu) => (
                    <tr key={tu.table_number}>
                      <td className="py-2.5 px-4 font-semibold">Table {tu.table_number}</td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums">{tu.sessions}</td>
                      <td className="py-2.5 px-4 text-right font-mono font-bold tabular-nums">${Number(tu.revenue).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* LANGUAGES & TRANSLATIONS */}
      {mode === 'languages' && (
        <div className="space-y-5">
          <form onSubmit={addLanguage} className="bg-white rounded-2xl border border-slate-200 p-5 grid grid-cols-1 sm:grid-cols-5 gap-3 items-end">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">ISO Code</label>
              <input required value={newLangCode} onChange={(e) => setNewLangCode(e.target.value)} placeholder="ar / th / es" className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">English Name</label>
              <input required value={newLangName} onChange={(e) => setNewLangName(e.target.value)} placeholder="Arabic" className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Native Name</label>
              <input required value={newLangNative} onChange={(e) => setNewLangNative(e.target.value)} placeholder="العربية" className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Text Direction</label>
              <select value={newLangDir} onChange={(e) => setNewLangDir(e.target.value as 'ltr' | 'rtl')} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm">
                <option value="ltr">LTR (Left-to-Right)</option>
                <option value="rtl">RTL (Right-to-Left)</option>
              </select>
            </div>
            <button type="submit" className="py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer">
              <Plus className="w-4 h-4" />
              Add Language
            </button>
          </form>

          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <label className="text-xs font-bold text-slate-700">Edit Verified UI Translations for:</label>
                <select
                  value={selectedLang}
                  onChange={(e) => setSelectedLang(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold"
                >
                  {languages.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.native_name} ({l.code.toUpperCase()} · {l.direction.toUpperCase()})
                    </option>
                  ))}
                </select>
              </div>
              <button onClick={() => void saveTranslations()} className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer">
                <Save className="w-3.5 h-3.5" />
                Save All Translations
              </button>
            </div>

            <div className="max-h-[460px] overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
              {translationEntries.map((entry, idx) => (
                <div key={entry.key} className="grid grid-cols-1 md:grid-cols-12 gap-3 p-3 items-center text-xs">
                  <div className="md:col-span-3 font-mono text-slate-500 truncate">{entry.key}</div>
                  <div className="md:col-span-4 text-slate-700">{entry.en_value}</div>
                  <div className="md:col-span-5">
                    <input
                      value={entry.target_value}
                      onChange={(e) => {
                        const next = [...translationEntries];
                        next[idx].target_value = e.target.value;
                        setTranslationEntries(next);
                      }}
                      placeholder={`Fallback: ${entry.en_value}`}
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-sm"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SETTINGS */}
      {mode === 'settings' && (
        <form onSubmit={saveSettings} className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">Restaurant & System Settings</h2>
              <p className="text-xs text-slate-500">Configure currency, KHQR details, tax, service charge, and optional modules</p>
            </div>
            <button type="submit" className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer">
              <Save className="w-4 h-4" />
              Save Settings
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Restaurant Name</label>
              <input value={settings.restaurant_name || ''} onChange={(e) => setSettings({ ...settings, restaurant_name: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-200" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Phone</label>
              <input value={settings.restaurant_phone || ''} onChange={(e) => setSettings({ ...settings, restaurant_phone: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-200" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Address</label>
              <input value={settings.restaurant_address || ''} onChange={(e) => setSettings({ ...settings, restaurant_address: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-200" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">KHQR Bank Name</label>
              <input value={settings.khqr_bank_name || ''} onChange={(e) => setSettings({ ...settings, khqr_bank_name: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-200" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">KHQR Account Name</label>
              <input value={settings.khqr_account_name || ''} onChange={(e) => setSettings({ ...settings, khqr_account_name: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-200" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Static KHQR EMV Payload</label>
              <input value={settings.khqr_payload || ''} onChange={(e) => setSettings({ ...settings, khqr_payload: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-200 font-mono text-xs" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Default Currency</label>
              <select value={settings.currency || 'USD'} onChange={(e) => setSettings({ ...settings, currency: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-200">
                <option value="USD">USD ($)</option>
                <option value="KHR">KHR (៛)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">USD to KHR Exchange Rate</label>
              <input type="number" value={settings.exchange_rate_khr || '4050'} onChange={(e) => setSettings({ ...settings, exchange_rate_khr: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-200 font-mono" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Tax Rate (%)</label>
              <input type="number" step="0.5" value={settings.tax_rate || '0'} onChange={(e) => setSettings({ ...settings, tax_rate: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-200 font-mono" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Service Charge (%)</label>
              <input type="number" step="0.5" value={settings.service_charge_rate || '0'} onChange={(e) => setSettings({ ...settings, service_charge_rate: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-200 font-mono" />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 flex flex-wrap gap-6 text-sm">
            <label className="flex items-center gap-2 font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={settings.enable_cash_payment === 'true'}
                onChange={(e) => setSettings({ ...settings, enable_cash_payment: e.target.checked ? 'true' : 'false' })}
              />
              Enable Cash Payments at Checkout
            </label>
            <label className="flex items-center gap-2 font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={settings.enable_expenses_module === 'true'}
                onChange={(e) => setSettings({ ...settings, enable_expenses_module: e.target.checked ? 'true' : 'false' })}
              />
              Enable Expense Management & Profit Calculation
            </label>
          </div>
        </form>
      )}
    </div>
  );
}
