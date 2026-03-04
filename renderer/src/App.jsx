import React, { useEffect, useState } from 'react';
import { PAGE_ITEMS } from './utils/constants';
import usePersistedState from './hooks/usePersistedState';
import OverviewPage from './pages/OverviewPage';
import UsersPage from './pages/UsersPage';
import RolesPage from './pages/RolesPage';
import AuditPage from './pages/AuditPage';
import ConfirmDialog from './components/ConfirmDialog';

const PAGE_BY_SHORTCUT = {
  '1': 'overview',
  '2': 'users',
  '3': 'roles',
  '4': 'audit'
};

const AUTO_REFRESH_OPTIONS = [
  { value: 0, label: 'Вимкнено' },
  { value: 5000, label: '5 сек' },
  { value: 10000, label: '10 сек' },
  { value: 30000, label: '30 сек' },
  { value: 60000, label: '60 сек' }
];

function isEditableTarget(target) {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tag = String(target.tagName || '').toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select';
}

function App() {
  const [page, setPage] = useState('overview');
  const [theme, setTheme] = usePersistedState('rbac_theme', 'light');
  const [actor, setActor] = usePersistedState('rbac_actor', 'admin.local');
  const [autoRefreshMsRaw, setAutoRefreshMsRaw] = usePersistedState('rbac_auto_refresh_ms', '0');
  const [refreshToken, setRefreshToken] = useState(0);
  const [flash, setFlash] = useState(null);
  const [confirmConfig, setConfirmConfig] = useState(null);

  const hasApi = Boolean(window.api && window.api.rbac);
  const parsedInterval = Number(autoRefreshMsRaw);
  const autoRefreshMs = Number.isFinite(parsedInterval) && parsedInterval > 0 ? parsedInterval : 0;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (!flash) return;
    const timeout = setTimeout(() => setFlash(null), 4000);
    return () => clearTimeout(timeout);
  }, [flash]);

  const notify = (message, type = 'info') => {
    setFlash({ id: Date.now(), message, type });
  };

  const triggerRefresh = (source = 'manual') => {
    setRefreshToken((value) => value + 1);
    if (source === 'manual') {
      notify('Дані оновлено', 'info');
    }
  };

  const askConfirm = (config) => setConfirmConfig(config);
  const closeConfirm = () => setConfirmConfig(null);

  useEffect(() => {
    if (autoRefreshMs <= 0 || !hasApi) return;
    const intervalId = setInterval(() => {
      setRefreshToken((value) => value + 1);
    }, autoRefreshMs);
    return () => clearInterval(intervalId);
  }, [autoRefreshMs, hasApi]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.defaultPrevented) return;

      if (event.key === 'Escape' && confirmConfig) {
        event.preventDefault();
        closeConfirm();
        return;
      }

      if (isEditableTarget(event.target)) return;

      const key = String(event.key || '').toLowerCase();
      const navPage = PAGE_BY_SHORTCUT[key];
      if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && navPage) {
        event.preventDefault();
        setPage(navPage);
        return;
      }

      const withCommand = event.metaKey || event.ctrlKey;
      if (withCommand && event.shiftKey && key === 'r') {
        event.preventDefault();
        triggerRefresh('manual');
        return;
      }

      if (withCommand && event.shiftKey && key === 't') {
        event.preventDefault();
        setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [confirmConfig]);

  if (!hasApi) {
    return (
      <div className="unsupported">
        <h1>Preload API Electron не знайдено</h1>
        <p>Запустіть застосунок через `npm run dev` та відкрийте в Electron, а не лише в браузері.</p>
      </div>
    );
  }

  const currentPageLabel = PAGE_ITEMS.find((item) => item.id === page)?.label;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <strong>Керування доступом</strong>
          <span>Менеджер RBAC</span>
        </div>

        <nav className="nav-list">
          {PAGE_ITEMS.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${page === item.id ? 'active' : ''}`}
              onClick={() => setPage(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="theme-switcher">
          <label>Тема</label>
          <div className="segmented">
            <button className={theme === 'light' ? 'on' : ''} onClick={() => setTheme('light')}>Світла</button>
            <button className={theme === 'dark' ? 'on' : ''} onClick={() => setTheme('dark')}>Темна</button>
          </div>
        </div>
      </aside>

      <div className="content-shell">
        <header className="topbar">
          <div>
            <div className="crumbs">Головна / {currentPageLabel}</div>
            <h1>{currentPageLabel}</h1>
          </div>
          <div className="topbar-controls">
            <div className="refresh-box">
              <label>Автооновлення</label>
              <div className="refresh-row">
                <select
                  value={String(autoRefreshMs)}
                  onChange={(event) => setAutoRefreshMsRaw(String(Number(event.target.value) || 0))}
                >
                  {AUTO_REFRESH_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <button className="btn ghost" onClick={() => triggerRefresh('manual')}>
                  Оновити
                </button>
              </div>
              <div className="hotkeys-hint">
                Alt+1..4: вкладки | Ctrl/Cmd+Shift+R: refresh | Ctrl/Cmd+Shift+T: тема
              </div>
            </div>

            <div className="actor-box">
              <label>Працюю як</label>
              <input value={actor} onChange={(event) => setActor(event.target.value)} />
            </div>
          </div>
        </header>

        {flash ? <div className={`flash ${flash.type}`}>{flash.message}</div> : null}

        <main className="page">
          {page === 'overview' ? (
            <OverviewPage refreshToken={refreshToken} />
          ) : null}

          {page === 'users' ? (
            <UsersPage
              actor={actor}
              onDataChanged={() => setRefreshToken((value) => value + 1)}
              onNotify={notify}
              askConfirm={askConfirm}
              refreshToken={refreshToken}
            />
          ) : null}

          {page === 'roles' ? (
            <RolesPage
              actor={actor}
              onDataChanged={() => setRefreshToken((value) => value + 1)}
              onNotify={notify}
              askConfirm={askConfirm}
              refreshToken={refreshToken}
            />
          ) : null}

          {page === 'audit' ? (
            <AuditPage actor={actor} onNotify={notify} refreshToken={refreshToken} />
          ) : null}
        </main>
      </div>

      <ConfirmDialog config={confirmConfig} onClose={closeConfirm} />
    </div>
  );
}

export default App;
