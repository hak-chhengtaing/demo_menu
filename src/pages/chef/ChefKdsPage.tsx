import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChefHat, Clock, Volume2, VolumeX, LogOut, ArrowLeft, Flame, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useI18n } from '../../contexts/I18nContext';
import { useRealtime } from '../../hooks/useRealtime';
import { apiRequest } from '../../services/api';
import { LoginPanel } from '../../components/LoginPanel';
import { LanguageSelector } from '../../components/LanguageSelector';
import type { Order } from '../../types';

function playKitchenChime() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1174.66, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.42);
  } catch {
    // ignore audio restrictions
  }
}

function formatElapsed(isoOrSql: string, nowMs: number): string {
  const parsed = new Date(isoOrSql.includes('T') ? isoOrSql : `${isoOrSql.replace(' ', 'T')}Z`).getTime();
  if (Number.isNaN(parsed)) return '0m';
  const diffSec = Math.max(0, Math.floor((nowMs - parsed) / 1000));
  const mins = Math.floor(diffSec / 60);
  const secs = diffSec % 60;
  return `${mins}m ${String(secs).padStart(2, '0')}s`;
}

export function ChefKdsPage() {
  const { user, loading: authLoading, logout } = useAuth();
  const { t } = useI18n();

  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState<'active' | 'confirmed' | 'cooking' | 'ready' | 'completed'>('active');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [nowMs, setNowMs] = useState(Date.now());
  const [errorMsg, setErrorMsg] = useState('');
  const soundRef = useRef(soundEnabled);
  soundRef.current = soundEnabled;

  const isAuthorized = user && (user.role === 'chef' || user.role === 'admin');

  const loadOrders = useCallback(async () => {
    if (!isAuthorized) return;
    try {
      const res = await apiRequest<{ orders: Order[] }>(`/api/chef/orders?status=${filter}`);
      setOrders(res.orders);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load kitchen orders.');
    }
  }, [isAuthorized, filter]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const { connected } = useRealtime({
    role: 'chef',
    onEvent: (event) => {
      if (event === 'order:confirmed' && soundRef.current) {
        playKitchenChime();
      }
      if (event.startsWith('order:')) {
        void loadOrders();
      }
    },
    onFallbackPoll: () => {
      void loadOrders();
    },
  });

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-300 text-sm">Loading...</div>;
  }

  if (!isAuthorized) {
    return (
      <LoginPanel
        expectedRole="chef"
        title="Chef Kitchen Display System (KDS)"
        subtitle="Sign in with a Chef account to view confirmed kitchen tickets."
        accentColor="amber"
        dark
      />
    );
  }

  const handleStartCooking = async (orderId: number) => {
    try {
      await apiRequest(`/api/chef/orders/${orderId}/cooking`, { method: 'POST' });
      await loadOrders();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update status.');
    }
  };

  const handleMarkReady = async (orderId: number) => {
    try {
      await apiRequest(`/api/chef/orders/${orderId}/ready`, { method: 'POST' });
      await loadOrders();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to mark ready.');
    }
  };

  const phnomPenhClock = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Phnom_Penh',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    month: 'short',
    day: 'numeric',
  }).format(nowMs);

  const countConfirmed = orders.filter((o) => o.status === 'confirmed').length;
  const countCooking = orders.filter((o) => o.status === 'cooking').length;
  const countReady = orders.filter((o) => o.status === 'ready').length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* KDS Top Bar (Showcase #2) */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link to="/" className="p-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white" title="Portal">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex items-center gap-2.5">
            <ChefHat className="w-6 h-6 text-amber-400" />
            <div>
              <h1 className="text-lg font-extrabold tracking-tight text-white">KDS · Kitchen Display</h1>
              <div className="text-xs text-slate-400">
                {user.name} · {connected ? 'Real-Time Stream' : 'Polling Sync'}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block mr-2">
            <div className="font-mono text-sm font-bold text-white tabular-nums">{phnomPenhClock}</div>
            <div className="text-[11px] text-slate-400">Asia/Phnom_Penh</div>
          </div>

          <button
            onClick={() => setSoundEnabled((s) => !s)}
            className={`px-3 py-2 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
              soundEnabled
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                : 'bg-slate-800 border-slate-700 text-slate-400'
            }`}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            <span>{soundEnabled ? t('chef.sound_on', 'Sound On') : t('chef.sound_off', 'Muted')}</span>
          </button>

          <LanguageSelector variant="dark" />

          <button
            onClick={() => void logout()}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
            title={t('nav.logout', 'Log out')}
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Filter Toolbar */}
      <div className="px-6 py-4 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {[
            ['active', `${t('chef.all_orders', 'All Active')} (${orders.length})`],
            ['confirmed', `Pending (${countConfirmed})`],
            ['cooking', `Cooking (${countCooking})`],
            ['ready', `Ready (${countReady})`],
            ['completed', 'Completed'],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key as typeof filter)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                filter === key
                  ? 'bg-amber-500 text-slate-950'
                  : 'bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="text-xs text-slate-400">Sorted by oldest ticket first</div>
      </div>

      {errorMsg && (
        <div className="mx-6 mt-4 p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs">
          {errorMsg}
        </div>
      )}

      {/* KDS Ticket Cards Grid */}
      <main className="p-6 flex-1">
        {orders.length === 0 ? (
          <div className="h-64 rounded-2xl border border-slate-800 bg-slate-900/50 flex flex-col items-center justify-center text-slate-400 space-y-2">
            <ChefHat className="w-10 h-10 opacity-40" />
            <div className="text-sm font-medium">No kitchen tickets in this queue.</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {orders.map((ord) => {
              const isConfirmed = ord.status === 'confirmed';
              const isCooking = ord.status === 'cooking';
              const isReady = ord.status === 'ready';

              return (
                <div
                  key={ord.order_id}
                  className={`rounded-2xl border p-5 flex flex-col justify-between space-y-5 ${
                    isConfirmed
                      ? 'bg-slate-900 border-slate-700'
                      : isCooking
                        ? 'bg-slate-900 border-amber-500/60'
                        : isReady
                          ? 'bg-slate-900 border-emerald-500/60'
                          : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-2 pb-3 border-b border-slate-800">
                      <div>
                        <div className="text-xl font-extrabold text-white">Table {ord.table_number}</div>
                        <div className="text-xs font-mono text-slate-400 mt-0.5">{ord.order_number}</div>
                      </div>
                      <span
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wide ${
                          isConfirmed
                            ? 'bg-slate-700 text-slate-100'
                            : isCooking
                              ? 'bg-amber-500 text-slate-950'
                              : isReady
                                ? 'bg-emerald-500 text-slate-950'
                                : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {isConfirmed ? 'Pending' : ord.status}
                      </span>
                    </div>

                    <div className="space-y-3">
                      {ord.items.map((it) => (
                        <div key={it.order_item_id} className="p-3 rounded-xl bg-slate-800/70 border border-slate-800">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-base font-bold text-white">{it.item_name_snapshot}</span>
                            <span className="text-base font-mono font-extrabold text-amber-400 shrink-0">
                              ×{it.quantity}
                            </span>
                          </div>
                          {it.selected_options?.length > 0 && (
                            <div className="text-xs text-slate-300 mt-1">
                              {it.selected_options.map((o) => o.value_label).join(' · ')}
                            </div>
                          )}
                          {it.special_instructions && (
                            <div className="text-xs font-semibold text-amber-300 mt-1.5">
                              Note: {it.special_instructions}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {ord.notes && (
                      <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/30 text-xs text-amber-200 font-medium">
                        Ticket Note: {ord.notes}
                      </div>
                    )}
                  </div>

                  <div className="pt-3 border-t border-slate-800 space-y-3">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>{ord.items.reduce((s, i) => s + i.quantity, 0)} items</span>
                      <span className="font-mono font-semibold text-slate-200 flex items-center gap-1.5 tabular-nums">
                        <Clock className="w-3.5 h-3.5 text-amber-400" />
                        {formatElapsed(ord.confirmed_at || ord.created_at, nowMs)}
                      </span>
                    </div>

                    {isConfirmed && (
                      <button
                        onClick={() => void handleStartCooking(ord.order_id)}
                        className="w-full py-3.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-extrabold inline-flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <Flame className="w-4 h-4" />
                        {t('chef.start_cooking', 'Start Cooking')}
                      </button>
                    )}

                    {isCooking && (
                      <button
                        onClick={() => void handleMarkReady(ord.order_id)}
                        className="w-full py-3.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-extrabold inline-flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        {t('chef.mark_ready', 'Mark Ready')}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
