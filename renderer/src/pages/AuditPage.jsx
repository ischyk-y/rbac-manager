import React, { useEffect, useState } from 'react';
import SectionCard from '../components/SectionCard';
import Pagination from '../components/Pagination';
import LoadingState from '../components/LoadingState';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import useDebounced from '../hooks/useDebounced';
import { formatDate, jsonDiffSummary } from '../utils/format';

export default function AuditPage({ actor, onNotify, refreshToken }) {
  const [query, setQuery] = useState({
    search: '',
    action: 'all',
    entityType: 'all',
    sortDir: 'desc',
    page: 1,
    pageSize: 10
  });

  const debouncedSearch = useDebounced(query.search, 260);
  const [state, setState] = useState({ loading: true, error: '', data: null });

  const load = async () => {
    setState((prev) => ({ ...prev, loading: true, error: '' }));
    try {
      const data = await window.api.rbac.getAuditLogs({ ...query, search: debouncedSearch });
      setState({ loading: false, error: '', data });
    } catch (error) {
      setState({ loading: false, error: error.message || 'Не вдалося завантажити журнал', data: null });
    }
  };

  useEffect(() => {
    load();
  }, [query.page, query.pageSize, query.action, query.entityType, query.sortDir, debouncedSearch, refreshToken]);

  const exportLog = async () => {
    try {
      const result = await window.api.rbac.exportAuditLogs({ actor });
      if (result.canceled) {
        onNotify('Експорт скасовано', 'info');
        return;
      }

      await window.api.native.notify({
        title: 'Журнал аудиту експортовано',
        body: `Збережено рядків: ${result.rowCount}`
      });

      onNotify(`Експортовано до ${result.filePath}`, 'success');
      await load();
    } catch (error) {
      onNotify(error.message || 'Не вдалося експортувати', 'error');
    }
  };

  return (
    <SectionCard
      title="Журнал аудиту"
      subtitle="Хто, що і коли змінював у правах та ролях"
      actions={<button className="btn" onClick={exportLog}>Експорт CSV</button>}
    >
      <div className="filters-row">
        <input
          placeholder="Пошук за автором, дією або сутністю"
          value={query.search}
          onChange={(event) => setQuery((prev) => ({ ...prev, search: event.target.value, page: 1 }))}
        />

        <select
          value={query.action}
          onChange={(event) => setQuery((prev) => ({ ...prev, action: event.target.value, page: 1 }))}
        >
          <option value="all">Усі дії</option>
          {(state.data?.filters.actions || []).map((action) => (
            <option key={action} value={action}>{action}</option>
          ))}
        </select>

        <select
          value={query.entityType}
          onChange={(event) => setQuery((prev) => ({ ...prev, entityType: event.target.value, page: 1 }))}
        >
          <option value="all">Усі сутності</option>
          {(state.data?.filters.entityTypes || []).map((entityType) => (
            <option key={entityType} value={entityType}>{entityType}</option>
          ))}
        </select>

        <select
          value={query.sortDir}
          onChange={(event) => setQuery((prev) => ({ ...prev, sortDir: event.target.value, page: 1 }))}
        >
          <option value="desc">Спочатку нові</option>
          <option value="asc">Спочатку старі</option>
        </select>
      </div>

      {state.loading ? <LoadingState /> : null}
      {state.error ? <ErrorState text={state.error} onRetry={load} /> : null}

      {!state.loading && !state.error && state.data?.rows.length === 0 ? (
        <EmptyState text="Немає подій за обраними фільтрами" />
      ) : null}

      {!state.loading && !state.error && state.data?.rows.length > 0 ? (
        <>
          <table className="table">
            <thead>
              <tr>
                <th>Час</th>
                <th>Автор</th>
                <th>Дія</th>
                <th>Сутність</th>
                <th>Зміни</th>
              </tr>
            </thead>
            <tbody>
              {state.data.rows.map((row) => (
                <tr key={row.id}>
                  <td>{formatDate(row.created_at)}</td>
                  <td>{row.actor}</td>
                  <td>{row.action}</td>
                  <td>{row.entity_type}{row.entity_id ? ` #${row.entity_id}` : ''}</td>
                  <td className="mono">{jsonDiffSummary(row.before, row.after)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <Pagination
            page={query.page}
            totalPages={state.data.totalPages}
            onChange={(nextPage) => setQuery((prev) => ({ ...prev, page: nextPage }))}
          />
        </>
      ) : null}
    </SectionCard>
  );
}
