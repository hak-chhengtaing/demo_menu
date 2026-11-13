import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { QrCode, Smartphone, CreditCard, ChefHat, BarChart3, ArrowRight, Globe } from 'lucide-react';
import { apiRequest } from '../services/api';
import { LanguageSelector } from '../components/LanguageSelector';
import { useI18n } from '../contexts/I18nContext';

interface DemoTable {
  table_id: number;
  table_number: number;
  label: string;
  capacity: number;
  qr_token: string;
}

export function PortalPage() {
  const { t } = useI18n();
  const [tables, setTables] = useState<DemoTable[]>([]);
  const [selectedTable, setSelectedTable] = useState<DemoTable | null>(null);

  useEffect(() => {
    apiRequest<{ tables: DemoTable[] }>('/api/tables/demo-links')
      .then((res) => {
        setTables(res.tables);
        const t5 = res.tables.find((tb) => tb.table_number === 5) || res.tables[0] || null;
        setSelectedTable(t5);
      })
      .catch(() => {});
  }, []);

  const menuUrl = selectedTable
    ? `${window.location.origin}/menu?token=${encodeURIComponent(selectedTable.qr_token)}`
    : `${window.location.origin}/menu`;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Top Bar Contract: 3 zones */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <Link to="/" className="text-xl font-extrabold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
            DineEasy
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <Link to={selectedTable ? `/menu?token=${selectedTable.qr_token}` : '/menu'} className="hover:text-emerald-700 transition-colors whitespace-nowrap shrink-0">
              {t('nav.menu', 'Customer Menu')}
            </Link>
            <Link to="/staff" className="hover:text-blue-700 transition-colors whitespace-nowrap shrink-0">
              {t('nav.checkout', 'Staff Console')}
            </Link>
            <Link to="/chef" className="hover:text-amber-600 transition-colors whitespace-nowrap shrink-0">
              {t('nav.kitchen', 'Chef KDS')}
            </Link>
            <Link to="/admin" className="hover:text-indigo-700 transition-colors whitespace-nowrap shrink-0">
              {t('nav.dashboard', 'Admin Dashboard')}
            </Link>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <LanguageSelector />
            <Link
              to={selectedTable ? `/menu?token=${selectedTable.qr_token}` : '/menu'}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
            >
              Open Table {selectedTable?.table_number || 5} Menu
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10 space-y-12">
        {/* Hero Split */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-8 flex flex-col justify-between">
            <div>
              <div className="text-xs font-semibold text-emerald-700 mb-3 flex items-center gap-2">
                <span>Digital Restaurant Operations</span>
                <span aria-hidden="true">·</span>
                <span>Multilingual EN / KM / ZH / VI / JA / KO / FR</span>
              </div>
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 leading-tight max-w-2xl">
                Complete Digital Menu, Kitchen Display, Static KHQR Checkout & Restaurant Analytics
              </h1>
              <p className="mt-4 text-base text-slate-600 leading-relaxed max-w-xl">
                Every interface connects in real time via WebSockets and a normalized relational database. Scan a table QR code to order, confirm in Staff Console, cook in Chef KDS, and settle via verified Static KHQR or cash with bilingual PDF receipts.
              </p>
            </div>

            <div className="mt-8 pt-6 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <div className="text-2xl font-bold tabular-nums text-slate-900">4</div>
                <div className="text-xs text-slate-500">Integrated Interfaces</div>
              </div>
              <div>
                <div className="text-2xl font-bold tabular-nums text-slate-900">7+</div>
                <div className="text-xs text-slate-500">Languages & RTL Ready</div>
              </div>
              <div>
                <div className="text-2xl font-bold tabular-nums text-slate-900">10</div>
                <div className="text-xs text-slate-500">QR-Enabled Tables</div>
              </div>
              <div>
                <div className="text-2xl font-bold tabular-nums text-slate-900">KHQR</div>
                <div className="text-xs text-slate-500">Staff-Verified Flow</div>
              </div>
            </div>
          </div>

          {/* Interactive Table QR Launcher */}
          <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Live Table QR Code Launcher</h2>
                  <p className="text-xs text-slate-500">Scan with phone camera or open directly</p>
                </div>
                <QrCode className="w-5 h-5 text-emerald-600" />
              </div>

              <div className="flex flex-wrap gap-1.5 mb-5">
                {tables.slice(0, 8).map((tbl) => (
                  <button
                    key={tbl.table_id}
                    onClick={() => setSelectedTable(tbl)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      selectedTable?.table_id === tbl.table_id
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    Table {tbl.table_number}
                  </button>
                ))}
              </div>

              {selectedTable && (
                <div className="flex flex-col sm:flex-row items-center gap-5 p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <img
                    src={`/api/qr?data=${encodeURIComponent(menuUrl)}`}
                    alt={`QR Code for Table ${selectedTable.table_number}`}
                    className="w-32 h-32 rounded-lg bg-white p-1.5 border border-slate-200 shrink-0"
                  />
                  <div className="space-y-2 text-center sm:text-left min-w-0">
                    <div className="text-sm font-bold text-slate-900">
                      Table {selectedTable.table_number} · {selectedTable.capacity} Seats
                    </div>
                    <div className="text-xs font-mono text-slate-500 break-all">
                      Token: {selectedTable.qr_token}
                    </div>
                    <Link
                      to={`/menu?token=${encodeURIComponent(selectedTable.qr_token)}`}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors"
                    >
                      Launch Table {selectedTable.table_number} Menu
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* 4 Interfaces Grid */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Link
            to={selectedTable ? `/menu?token=${encodeURIComponent(selectedTable.qr_token)}` : '/menu'}
            className="group bg-white rounded-2xl border border-slate-200 p-6 hover:border-emerald-500 transition-all flex flex-col justify-between"
          >
            <div>
              <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center mb-4">
                <Smartphone className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900">1. Customer Mobile Menu</h3>
              <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">
                Green mobile-first QR menu with dish customization, cart, multi-order sessions, and live tracking.
              </p>
            </div>
            <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-emerald-700">
              <span>No login required (QR Token)</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>

          <Link
            to="/staff"
            className="group bg-white rounded-2xl border border-slate-200 p-6 hover:border-blue-500 transition-all flex flex-col justify-between"
          >
            <div>
              <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center mb-4">
                <CreditCard className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900">2. Staff Order & Checkout</h3>
              <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">
                Confirm orders, manage table sessions, display Static KHQR, verify payments, and issue PDF receipts.
              </p>
            </div>
            <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-blue-700">
              <span className="font-mono">sokha / staff123</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>

          <Link
            to="/chef"
            className="group bg-slate-900 text-slate-100 rounded-2xl border border-slate-800 p-6 hover:border-amber-500 transition-all flex flex-col justify-between"
          >
            <div>
              <div className="w-11 h-11 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center mb-4">
                <ChefHat className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white">3. Chef KDS Display</h3>
              <p className="text-sm text-slate-400 mt-1.5 leading-relaxed">
                High-contrast dark kitchen display with live timers, sound alerts, Start Cooking & Mark Ready actions.
              </p>
            </div>
            <div className="mt-5 pt-4 border-t border-slate-800 flex items-center justify-between text-xs font-semibold text-amber-400">
              <span className="font-mono">chef / chef123</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>

          <Link
            to="/admin"
            className="group bg-white rounded-2xl border border-slate-200 p-6 hover:border-indigo-500 transition-all flex flex-col justify-between"
          >
            <div>
              <div className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center mb-4">
                <BarChart3 className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900">4. Admin Dashboard</h3>
              <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">
                Revenue charts, menu & modifier CRUD, QR generator, staff accounts, reports, expenses & translations.
              </p>
            </div>
            <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-indigo-700">
              <span className="font-mono">admin / admin123</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>
        </section>

        <footer className="pt-6 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-slate-400" />
            <span>DineEasy Digital Restaurant System · Timezone: Asia/Phnom_Penh</span>
          </div>
          <div>Full-stack React + TypeScript + Express + WebSockets + SQLite</div>
        </footer>
      </main>
    </div>
  );
}
