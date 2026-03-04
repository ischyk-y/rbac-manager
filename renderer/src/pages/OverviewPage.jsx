import React, { useEffect, useState } from 'react';
import SectionCard from '../components/SectionCard';
import LoadingState from '../components/LoadingState';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import { formatDate } from '../utils/format';

export default function OverviewPage({ refreshToken }) {
  const [state, setState] = useState({ loading: true, error: '', data: null });

  const load = async () => {
    setState((prev) => ({ ...prev, loading: true, error: '' }));
    try {
      const data = await window.api.rbac.getOverview();
      setState({ loading: false, error: '', data });
    } catch (error) {
      setState({ loading: false, error: error.message || 'Не вдалося завантажити', data: null });
    }
  };

  useEffect(() => {
    load();
  }, [refreshToken]);

  if (state.loading) return <LoadingState />;
  if (state.error) return <ErrorState text={state.error} onRetry={load} />;

  const metrics = state.data.metrics;

  return (
    <div className="grid-2">
      <SectionCard title="Стан системи" subtitle="Поточний стан моделі доступу">
        <div className="metrics-grid">
          <div className="metric">
            <span>Користувачі</span>
            <strong>{metrics.usersCount}</strong>
          </div>
          <div className="metric">
            <span>Ролі</span>
            <strong>{metrics.rolesCount}</strong>
          </div>
          <div className="metric">
            <span>Аудит за 24 год</span>
            <strong>{metrics.audit24h}</strong>
          </div>
          <div className="metric">
            <span>Правила високого ризику</span>
            <strong>{metrics.highRiskRules}</strong>
          </div>
          <div className="metric">
            <span>Користувачі з попередженнями</span>
            <strong>{metrics.warningUsers}</strong>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Недавні події аудиту" subtitle="Хто що і коли змінював">
        {state.data.recentAudit.length === 0 ? (
          <EmptyState text="Поки немає подій аудиту" />
        ) : (
          <table className="table compact">
            <thead>
              <tr>
                <th>Час</th>
                <th>Автор</th>
                <th>Дія</th>
                <th>Сутність</th>
              </tr>
            </thead>
            <tbody>
              {state.data.recentAudit.map((row) => (
                <tr key={row.id}>
                  <td>{formatDate(row.created_at)}</td>
                  <td>{row.actor}</td>
                  <td>{row.action}</td>
                  <td>{row.entity_type}{row.entity_id ? ` #${row.entity_id}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>

      <SectionCard title="UX-запобіжники" subtitle="Як інтерфейс запобігає помилкам адміністратора">
        <ul className="plain-list">
          <li>Матриця прав використовує поступове розкриття: у сітці показуємо кількість, повне редагування — у боковій панелі.</li>
          <li>Призначення ролей потребує явного підтвердження перед застосуванням.</li>
          <li>Видалення користувача затримується на 5 секунд з можливістю «Скасувати», щоб уникнути випадкових втрат.</li>
          <li>Перегляд ефективних прав показує реальний доступ після прямих ролей.</li>
        </ul>
      </SectionCard>

      <SectionCard title="Комунікація станів" subtitle="Як показуємо асинхронні стани">
        <ul className="plain-list">
          <li>Під час завантаження показуємо плейсхолдери.</li>
          <li>Порожні стани явно показують, що даних немає.</li>
          <li>Стан помилки містить кнопку «Спробувати ще раз», щоб відновитись без виходу зі сторінки.</li>
        </ul>
      </SectionCard>

      <SectionCard title="UX-обґрунтування" subtitle="Чому саме так організовано критичні екрани">
        <ul className="plain-list">
          <li>Таблиця користувачів: пошук за ім’ям/ел. поштою та фільтр статусу відповідають найчастішим запитам адміністратора — «знайти конкретну людину» та «перевірити активних/призупинених».</li>
          <li>Сортування за ім’ям або ел. поштою дозволяє швидко відсіяти дублікати й знайти потрібний запис у великих списках.</li>
          <li>Форма користувача: порядок «ім’я → ел. пошта → статус» відображає пріоритет ідентифікації над операційним станом.</li>
          <li>Критичні дії: видалення має 5-секундний undo як менш руйнівний варіант, а призначення ролей підтверджується діалогом, бо впливає на доступ негайно.</li>
          <li>Журнал аудиту потрібен керівникам і службам безпеки для відстеження відповідальності та відновлення контексту змін.</li>
          <li>Теми світла/темна важливі для desktop-роботи з тривалими сесіями та різним освітленням.</li>
          <li>Нативні сповіщення й експорт через main process зменшують ризик пропустити критичні зміни та спрощують передачу звітів.</li>
        </ul>
      </SectionCard>
    </div>
  );
}
