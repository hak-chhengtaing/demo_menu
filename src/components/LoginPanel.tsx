import React, { useState } from 'react';
import { Lock, User as UserIcon, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LanguageSelector } from './LanguageSelector';

interface LoginPanelProps {
  expectedRole: 'staff' | 'chef' | 'admin';
  title: string;
  subtitle: string;
  accentColor?: 'blue' | 'amber' | 'indigo';
  dark?: boolean;
}

export function LoginPanel({
  expectedRole,
  title,
  subtitle,
  accentColor = 'blue',
  dark = false,
}: LoginPanelProps) {
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const demoAccounts: Record<'staff' | 'chef' | 'admin', { user: string; pass: string; label: string }> = {
    staff: { user: 'sokha', pass: 'staff123', label: 'Staff Demo (sokha)' },
    chef: { user: 'chef', pass: 'chef123', label: 'Chef Demo (chef)' },
    admin: { user: 'admin', pass: 'admin123', label: 'Admin Demo (admin)' },
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const loggedIn = await login(identifier, password, rememberMe);
      if (expectedRole === 'admin' && loggedIn.role !== 'admin') {
        setError('Access denied: Administrator role is required for this dashboard.');
      } else if (expectedRole === 'chef' && loggedIn.role !== 'chef' && loggedIn.role !== 'admin') {
        setError('Access denied: Chef or Administrator role is required.');
      } else if (expectedRole === 'staff' && loggedIn.role !== 'staff' && loggedIn.role !== 'admin') {
        setError('Access denied: Staff or Administrator role is required.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const buttonTheme =
    accentColor === 'indigo'
      ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
      : accentColor === 'amber'
        ? 'bg-amber-500 hover:bg-amber-600 text-slate-950'
        : 'bg-blue-600 hover:bg-blue-700 text-white';

  return (
    <div
      className={`min-h-screen flex flex-col justify-center items-center p-6 ${
        dark ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'
      }`}
    >
      <div className="w-full max-w-md mb-4 flex items-center justify-between">
        <Link
          to="/"
          className={`inline-flex items-center gap-1.5 text-sm font-medium transition-colors ${
            dark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Portal
        </Link>
        <LanguageSelector variant={dark ? 'dark' : 'light'} />
      </div>

      <div
        className={`w-full max-w-md rounded-2xl p-8 border ${
          dark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
        }`}
      >
        <div className="mb-6">
          <div className="text-xs font-semibold tracking-wide text-emerald-600 mb-1">DineEasy Restaurant System</div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          <p className={`text-sm mt-1 ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{subtitle}</p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-500 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">Username or Email</label>
            <div className="relative">
              <UserIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="Enter username or email"
                className={`w-full pl-10 pr-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  dark
                    ? 'bg-slate-800 border-slate-700 text-white placeholder-slate-500'
                    : 'bg-white border-slate-200 text-slate-900'
                }`}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className={`w-full pl-10 pr-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  dark
                    ? 'bg-slate-800 border-slate-700 text-white placeholder-slate-500'
                    : 'bg-white border-slate-200 text-slate-900'
                }`}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span className={dark ? 'text-slate-300' : 'text-slate-600'}>Remember this device</span>
          </label>

          <button
            type="submit"
            disabled={submitting}
            className={`w-full py-2.5 px-4 rounded-lg font-semibold text-sm transition-colors disabled:opacity-50 cursor-pointer ${buttonTheme}`}
          >
            {submitting ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className={`mt-6 pt-5 border-t ${dark ? 'border-slate-800' : 'border-slate-100'}`}>
          <div className={`text-xs mb-2 ${dark ? 'text-slate-400' : 'text-slate-500'}`}>
            Demo credentials for testing:
          </div>
          <button
            type="button"
            onClick={() => {
              const demo = demoAccounts[expectedRole];
              setIdentifier(demo.user);
              setPassword(demo.pass);
            }}
            className={`w-full py-2 px-3 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
              dark
                ? 'border-slate-700 text-slate-300 hover:bg-slate-800'
                : 'border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            Fill {demoAccounts[expectedRole].label} · Password: {demoAccounts[expectedRole].pass}
          </button>
        </div>
      </div>
    </div>
  );
}
