import { useState, useEffect, useRef, useCallback, type FormEvent } from 'react';
import { shortenUrl, login, register, getMyUrls, type ShortenResponse, type UrlHistoryItem } from './api';
import QRCode from 'qrcode';

type Status = 'idle' | 'loading' | 'success' | 'error';
type AuthMode = 'login' | 'register' | null;

function useAnnounce() {
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(''), 100);
    return () => clearTimeout(t);
  }, [message]);
  return { announcement: message, announce: setMessage };
}

function App() {
  const [user, setUser] = useState<{ email: string } | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>(null);
  const [authClosing, setAuthClosing] = useState(false);
  const { announcement, announce } = useAnnounce();
  const [urlHistoryKey, setUrlHistoryKey] = useState(0);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window !== 'undefined') return (localStorage.getItem('theme') as 'dark' | 'light') || 'dark';
    return 'dark';
  });

  useEffect(() => {
    const token = localStorage.getItem('token');
    const email = localStorage.getItem('email');
    if (token && email) setUser({ email });
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(prev => { const next = prev === 'dark' ? 'light' : 'dark'; announce(`Switched to ${next} mode`); return next; });
  }, [announce]);

  const openAuth = useCallback((mode: AuthMode) => setAuthMode(mode), []);
  const closeAuth = useCallback(() => {
    setAuthClosing(true);
    setTimeout(() => { setAuthMode(null); setAuthClosing(false); }, 240);
  }, []);

  const handleSignOut = useCallback(() => {
    localStorage.removeItem('token'); localStorage.removeItem('email');
    setUser(null); announce('Signed out');
  }, [announce]);

  return (
    <>
      <div aria-live="polite" aria-atomic="true" className="sr-only">{announcement}</div>

      <AppHeader user={user} openAuth={openAuth} onSignOut={handleSignOut} theme={theme} toggleTheme={toggleTheme} />

      <main>
        {/* ─── Hero ─── */}
        <section className="hero-section" style={{ textAlign: 'center', overflow: 'hidden' }}>
          <div className="hero-bg" /><div className="hero-grid" />
          <div className="container" style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ animation: 'fadeInUp 0.6s ease-out' }}>
              <span className="hero-badge" style={{ display: 'inline-block', padding: '6px 16px', borderRadius: 100, background: 'var(--surface-glass)', backdropFilter: 'blur(12px)', border: '1px solid var(--border)', fontSize: 13, fontWeight: 600, color: 'var(--primary-soft)', marginBottom: 24, letterSpacing: '0.3px' }}>
                🚀 Free &amp; open source — no account needed
              </span>
              <h1 style={{ fontSize: 'clamp(42px, 8vw, 72px)', fontWeight: 900, letterSpacing: '-1.5px', lineHeight: 1.06, marginBottom: 20 }}>
                Shorten links,{' '}
                <span className="gradient-text">instantly</span>
              </h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: 18, maxWidth: 560, margin: '0 auto 48px', lineHeight: 1.65 }}>
                A blazing fast URL shortener with custom aliases, QR codes, password protection, and expiration dates — no account required.
              </p>
            </div>

            <div style={{ animation: 'fadeInUp 0.6s ease-out 0.15s', animationFillMode: 'both' }}>
              <UrlShortenerBar onSuccess={() => { announce('URL shortened successfully'); setUrlHistoryKey(k => k + 1); }} />
            </div>
          </div>
        </section>

        {/* ─── Features ─── */}
        <section style={{ padding: '80px 24px' }}>
          <div className="container">
            <div className="section-header" style={{ animation: 'fadeInUp 0.6s ease-out', animationFillMode: 'both' }}>
              <h2>Everything you need</h2>
              <p>Designed for speed, privacy, and ease of use.</p>
            </div>
            <div className="features-grid">
              {[
                { icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>, iconBg: 'linear-gradient(135deg, #7c3aed, #a855f7)', title: 'Lightning Fast', desc: 'Redis-powered cache delivers sub-millisecond redirects. Your users won\'t wait.' },
                { icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>, iconBg: 'linear-gradient(135deg, #06b6d4, #2dd4bf)', title: 'Password Protected', desc: 'Lock any link with a password. Visitors must verify before redirecting.' },
                { icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>, iconBg: 'linear-gradient(135deg, #f59e0b, #f97316)', title: 'Auto Expiry', desc: 'Set links to expire automatically. Cleaned from cache and database.' },
                { icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>, iconBg: 'linear-gradient(135deg, #22c55e, #16a34a)', title: 'Custom Aliases', desc: 'Pick your own short code or let us generate a unique one. Your choice.' },
                { icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>, iconBg: 'linear-gradient(135deg, #8b5cf6, #7c3aed)', title: 'QR Codes', desc: 'Generate a QR code for every short link. Download and share anywhere.' },
                { icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>, iconBg: 'linear-gradient(135deg, #6366f1, #4f46e5)', title: 'Dark & Light Mode', desc: 'System-aware theme with smooth transitions and persistent preferences.' },
              ].map((f, i) => (
                <div key={i} className="feature-card" style={{ animation: 'fadeInUp 0.6s ease-out', animationFillMode: 'both', animationDelay: `${0.1 * i}s` }}>
                  <div className="feature-icon" style={{ background: f.iconBg, color: '#fff' }} aria-hidden="true">{f.icon}</div>
                  <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{f.title}</h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6 }}>{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── How It Works ─── */}
        <section style={{ padding: '80px 24px', background: 'var(--surface-raised)' }}>
          <div className="container">
            <div className="section-header">
              <h2>How it works</h2>
              <p>Three simple steps to shorten and share your links.</p>
            </div>
            <div className="steps-row">
              {[
                { step: '1', title: 'Paste your URL', desc: 'Drop any long link into the shortener. We\'ll validate and prepare it.' },
                { step: '2', title: 'Customize & protect', desc: 'Add a custom alias, set an expiration date, or password-lock the link.' },
                { step: '3', title: 'Share anywhere', desc: 'Copy the short link and share it. Anyone can use it — no account needed.' },
              ].map((s, i) => (
                <div key={i} className="step-card" style={{ animation: 'fadeInUp 0.6s ease-out', animationFillMode: 'both', animationDelay: `${0.15 * i}s` }}>
                  <div className="step-number">{s.step}</div>
                  <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{s.title}</h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6 }}>{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── URL History (logged in users) ─── */}
        {user && (
          <UrlHistory key={urlHistoryKey} />
        )}
      </main>

      {/* ─── Auth Modal ─── */}
      {authMode && (
        <AuthModal mode={authMode} closing={authClosing} onClose={closeAuth} switchMode={openAuth} onLogin={setUser} announce={announce} />
      )}

      <footer className="app-footer">
        <span>SnipLink</span><span style={{ margin: '0 8px', color: 'var(--border)' }}>·</span>
        <span>Free &amp; open source</span><span style={{ margin: '0 8px', color: 'var(--border)' }}>·</span>
        <span>Built for speed</span>
      </footer>
    </>
  );
}

/* ─── URL History ─── */
function UrlHistory() {
  const [urls, setUrls] = useState<UrlHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copiedAlias, setCopiedAlias] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError('');
    getMyUrls()
      .then(data => { if (!cancelled) setUrls(data); })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load history'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const handleCopy = async (url: string, alias: string) => {
    await navigator.clipboard.writeText(url);
    setCopiedAlias(alias);
    setTimeout(() => setCopiedAlias(null), 2000);
  };

  if (loading) {
    return (
      <section style={{ padding: '60px 24px' }}>
        <div className="container" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
          <Spinner />&nbsp; Loading your links…
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section style={{ padding: '60px 24px' }}>
        <div className="container"><div className="error-box">{error}</div></div>
      </section>
    );
  }

  if (urls.length === 0) {
    return (
      <section style={{ padding: '60px 24px' }}>
        <div className="container" style={{ textAlign: 'center' }}>
          <div className="section-header">
            <h2>Your Links</h2>
            <p>You haven't created any links yet. Shorten your first URL above!</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section style={{ padding: '80px 24px', background: 'var(--surface-raised)' }}>
      <div className="container">
        <div className="section-header">
          <h2>Your Links</h2>
          <p>{urls.length} link{urls.length !== 1 ? 's' : ''} created</p>
        </div>
        <div className="history-list">
          {urls.map((u, i) => (
            <div key={u.alias} className="history-item" style={{ animation: 'fadeInUp 0.4s ease-out', animationFillMode: 'both', animationDelay: `${i * 0.05}s` }}>
              <div className="history-item-main">
                <div className="history-item-header">
                  <a href={u.short_url} target="_blank" rel="noopener noreferrer" className="history-short-url">{u.short_url}</a>
                  {u.has_password && <span className="history-badge history-badge-locked"><svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Locked</span>}
                  <span className={`history-badge ${u.expires_at ? 'history-badge-expiry' : 'history-badge-permanent'}`}>
                    {u.expires_at
                      ? `Expires ${new Date(u.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                      : 'No expiry'}
                  </span>
                </div>
                <div className="history-long-url" title={u.long_url}>{u.long_url}</div>
                <div className="history-item-meta">
                  <span>Created {u.created_at ? new Date(u.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</span>
                  {u.is_custom && <span className="history-badge history-badge-custom">Custom</span>}
                </div>
              </div>
              <div className="history-item-actions">
                <button onClick={() => handleCopy(u.short_url, u.alias)} className="btn-ghost" style={{ padding: '6px 14px', fontSize: 12 }}>
                  {copiedAlias === u.alias ? 'Copied!' : 'Copy'}
                </button>
                <a href={u.short_url} target="_blank" rel="noopener noreferrer" className="btn-ghost" style={{ padding: '6px 14px', fontSize: 12, textDecoration: 'none' }}>Open</a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Header ─── */
function AppHeader({ user, openAuth, onSignOut, theme, toggleTheme }: {
  user: { email: string } | null;
  openAuth: (m: AuthMode) => void;
  onSignOut: () => void;
  theme: 'dark' | 'light';
  toggleTheme: () => void;
}) {
  return (
    <header className="app-header">
      <div className="container header-inner">
        <a href="/" className="header-brand">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
          </svg>
          SnipLink
        </a>
        <div className="header-actions">
          <button onClick={toggleTheme} className="theme-toggle"
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
            {theme === 'dark' ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            )}
          </button>
          {!user ? (
            <>
              <button type="button" onClick={() => openAuth('login')} className="btn-ghost btn-header">Sign In</button>
              <button type="button" onClick={() => openAuth('register')} className="btn-primary btn-header">Sign Up Free</button>
            </>
          ) : (
            <div className="header-user">
              <span className="header-email">{user.email}</span>
              <button type="button" onClick={onSignOut} className="btn-ghost btn-header">Sign out</button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

/* ─── Inline URL Shortener Bar ─── */
function UrlShortenerBar({ onSuccess }: { onSuccess: () => void }) {
  const [longUrl, setLongUrl] = useState('');
  const [customAlias, setCustomAlias] = useState('');
  const [expiresInDays, setExpiresInDays] = useState('');
  const [password, setPassword] = useState('');
  const [showOptions, setShowOptions] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [result, setResult] = useState<ShortenResponse | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!longUrl.trim()) return;
    setStatus('loading'); setError(''); setResult(null);
    try {
      const data = await shortenUrl(longUrl, customAlias.trim() || undefined, expiresInDays ? Number(expiresInDays) : undefined, password.trim() || undefined);
      setResult(data); setStatus('success');
      setLongUrl(''); setCustomAlias(''); setExpiresInDays(''); setPassword(''); setShowOptions(false);
      onSuccess(); inputRef.current?.focus();
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to shorten URL'); setStatus('error'); }
  };

  const handleCopy = async () => { if (!result) return; await navigator.clipboard.writeText(result.short_url); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  const handleDownloadQr = () => {
    if (!qrDataUrl || !result) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `qr-${result.short_url.split('/').pop()}.png`;
    a.click();
  };

  useEffect(() => {
    if (result) {
      QRCode.toDataURL(result.short_url, { width: 200, margin: 2, color: { dark: '#0d0d16', light: '#ffffff' } })
        .then(setQrDataUrl)
        .catch(() => setQrDataUrl(null));
    } else {
      setQrDataUrl(null);
    }
  }, [result]);

  return (
    <div className="hero-card" role="form" aria-label="URL shortener">
      <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Top bar: input + button */}
        <div className="shortener-row">
          <div className="shortener-input-wrap">
            <label htmlFor="long-url" className="sr-only">Long URL</label>
            <input ref={inputRef} id="long-url" type="text"
              value={longUrl} onChange={e => { setLongUrl(e.target.value); if (error) setError(''); }}
              placeholder="https://example.com/very-long-url..." required
              aria-required="true" aria-invalid={!!error} aria-describedby={error ? 'url-error' : undefined}
              autoComplete="url" inputMode="url"
              className={`input-base ${error ? 'error' : ''}`}
              style={{ paddingLeft: 44 }} />
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
            </svg>
          </div>

          <button type="submit" disabled={status === 'loading'} aria-busy={status === 'loading'} className="btn-primary" style={{ whiteSpace: 'nowrap' }}>
            {status === 'loading' ? <><Spinner /> Shortening</> : 'Shorten'}
          </button>
        </div>

        {/* Error */}
        {error && <div id="url-error" role="alert" className="error-box"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>{error}</div>}

        {/* Options toggle */}
        <button type="button" onClick={() => setShowOptions(!showOptions)} aria-expanded={showOptions} aria-controls="url-options"
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0, transition: 'color var(--transition-fast)' }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--text-secondary)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: showOptions ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform var(--transition-fast)' }}>
            <polyline points="9 18 15 12 9 6"/></svg>
          Advanced options
        </button>

        {showOptions && (
          <div id="url-options" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, animation: 'fadeIn 0.2s ease-out' }}>
            <Field id="custom-alias" label="Custom alias" type="text" value={customAlias} onChange={setCustomAlias} placeholder="my-link" autoComplete="off" minLen={4} maxLen={20} />
            <Field id="expiry-days" label="Expires (days)" type="number" value={expiresInDays} onChange={setExpiresInDays} placeholder="30" min={1} max={365} />
            <Field id="url-password" label="Password" type="password" value={password} onChange={setPassword} placeholder="Protect URL" autoComplete="new-password" minLen={4} />
          </div>
        )}

        {/* Result */}
        {result && (
          <article className="success-card" aria-label="Shortened URL result">
            <div className="success-card-layout">
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, color: 'var(--success)', fontWeight: 700 }}>
                    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    Link ready!
                  </span>
                  {result.has_password && <span style={{ padding: '2px 8px', borderRadius: 6, background: 'rgba(245,158,11,0.15)', color: 'var(--warning)', fontSize: 11, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}><svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Locked</span>}
                  {result.expires_at && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Expires {new Date(result.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', marginBottom: 10 }}>
                  <a href={result.short_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', textDecoration: 'none', fontSize: 15, fontWeight: 600, flex: 1, wordBreak: 'break-all' }}>{result.short_url}</a>
                  <button onClick={handleCopy} aria-label={copied ? 'Copied' : 'Copy link'} className="btn-ghost" style={{ background: copied ? 'var(--success)' : undefined, color: copied ? '#fff' : undefined, border: copied ? 'none' : undefined, padding: '8px 16px', fontSize: 13 }}>
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
              {qrDataUrl && (
                <div className="qr-section">
                  <img src={qrDataUrl} alt="QR code for shortened URL" className="qr-image" />
                  <button onClick={handleDownloadQr} className="btn-ghost qr-download-btn">
                    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    Download QR
                  </button>
                </div>
              )}
            </div>
          </article>
        )}
      </form>
    </div>
  );
}

/* ─── Auth Slide Panel ─── */
function AuthModal({ mode, closing, onClose, switchMode, onLogin, announce }: {
  mode: AuthMode; closing: boolean; onClose: () => void; switchMode: (m: AuthMode) => void;
  onLogin: (u: { email: string }) => void; announce: (m: string) => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault(); setStatus('loading'); setError('');
    try {
      const fn = mode === 'login' ? login : register;
      const data = await fn(email, password);
      localStorage.setItem('token', data.access_token); localStorage.setItem('email', data.email);
      onLogin({ email: data.email });
      announce(mode === 'login' ? 'Signed in successfully' : 'Account created');
      onClose();
    } catch (err) { setError(err instanceof Error ? err.message : 'Something went wrong'); setStatus('error'); }
  };

  const onCloseClick = () => { setEmail(''); setPassword(''); setError(''); setStatus('idle'); onClose(); };

  // Escape key
  useEffect(() => { const h = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') onCloseClick(); }; document.addEventListener('keydown', h); return () => document.removeEventListener('keydown', h); });

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onCloseClick(); }} role="dialog" aria-modal="true" aria-label={mode === 'login' ? 'Sign in' : 'Create account'}>
      <div className={`modal-panel ${closing ? 'closing' : ''}`} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
          <h2 style={{ fontSize: 24, fontWeight: 800 }}>{mode === 'login' ? 'Welcome back' : 'Get started'}</h2>
          <button onClick={onCloseClick} aria-label="Close" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Field id="auth-email" label="Email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" autoComplete="email" />
          <Field id="auth-password" label="Password" type="password" value={password} onChange={setPassword} placeholder={mode === 'register' ? 'At least 8 characters' : 'Enter your password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
          {error && <div role="alert" className="error-box"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>{error}</div>}
          <button type="submit" disabled={status === 'loading'} aria-busy={status === 'loading'} className="btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
            {status === 'loading' ? <><Spinner /> Please wait</> : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <div style={{ marginTop: 24, textAlign: 'center', fontSize: 14, color: 'var(--text-secondary)' }}>
          {mode === 'login' ? (
            <>Don't have an account? <button onClick={() => { setEmail(''); setPassword(''); setError(''); setStatus('idle'); switchMode('register'); }} style={{ background: 'none', border: 'none', color: 'var(--primary)', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>Sign up</button></>
          ) : (
            <>Already have an account? <button onClick={() => { setEmail(''); setPassword(''); setError(''); setStatus('idle'); switchMode('login'); }} style={{ background: 'none', border: 'none', color: 'var(--primary)', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>Sign in</button></>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Shared Components ─── */
function Field({ id, label, type, value, onChange, placeholder, autoComplete, minLen, maxLen, min, max }: {
  id: string; label: string; type: string; value: string; onChange: (v: string) => void;
  placeholder: string; autoComplete?: string; minLen?: number; maxLen?: number; min?: number; max?: number;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label htmlFor={id} style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>{label}</label>
      <input id={id} type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} required
        autoComplete={autoComplete}
        {...(minLen !== undefined ? { minLength: minLen } : {})}
        {...(maxLen !== undefined ? { maxLength: maxLen } : {})}
        {...(min !== undefined ? { min } : {})}
        {...(max !== undefined ? { max } : {})}
        className="input-base" />
    </div>
  );
}

function Spinner() {
  return <span style={{ display: 'inline-block', width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} aria-hidden="true" />;
}

export default App;
