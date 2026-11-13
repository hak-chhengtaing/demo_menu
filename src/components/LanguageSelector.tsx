import { Globe } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';

interface LanguageSelectorProps {
  variant?: 'light' | 'dark';
}

export function LanguageSelector({ variant = 'light' }: LanguageSelectorProps) {
  const { lang, languages, setLanguage } = useI18n();

  const baseClass =
    variant === 'dark'
      ? 'bg-slate-800/90 text-slate-100 border-slate-700 hover:bg-slate-800'
      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50';

  return (
    <div className="relative inline-flex items-center">
      <Globe
        className={`w-4 h-4 pointer-events-none absolute left-2.5 ${
          variant === 'dark' ? 'text-slate-400' : 'text-slate-500'
        }`}
      />
      <select
        aria-label="Select Language"
        value={lang}
        onChange={(e) => setLanguage(e.target.value)}
        className={`pl-8 pr-6 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500 ${baseClass}`}
      >
        {languages.length === 0 ? (
          <>
            <option value="en">English</option>
            <option value="km">ភាសាខ្មែរ</option>
          </>
        ) : (
          languages.map((l) => (
            <option key={l.code} value={l.code}>
              {l.native_name} ({l.code.toUpperCase()})
            </option>
          ))
        )}
      </select>
    </div>
  );
}
