import React from 'react';
import { useBanStore } from '../../store/banStore';
import { useAuthStore } from '../../store/authStore';

const formatBanUntil = (banUntil: string | null) => {
  if (!banUntil) return 'Назавжди';
  const date = new Date(banUntil);
  return Number.isNaN(date.getTime()) ? 'Назавжди' : date.toLocaleString('uk-UA', { dateStyle: 'long', timeStyle: 'short' });
};

export const BanNotice: React.FC = () => {
  const ban = useBanStore((state) => state.ban);
  const dismiss = useBanStore((state) => state.dismiss);
  if (!ban) return null;
  return (
    <div className="level-reward-overlay ban-notice-overlay">
      <section className="level-reward-dialog notice-card notice-ban" role="alertdialog" aria-modal="true" aria-labelledby="ban-notice-title">
        <header className="notice-card-banner" aria-hidden="true" />
        <div className="notice-card-icon"><img src="/assets/ui/admin/ban.png" alt="" draggable={false} /></div>
        <h2 id="ban-notice-title">Акаунт заблоковано</h2>
        <p className="admin-gift-description">Адміністратор заблокував цей акаунт. Грати поки що не можна.</p>
        <dl className="ban-notice-details">
          <div><dt><img src="/assets/ui/admin/mail.png" alt="" />Причина</dt><dd>{ban.reason || 'Не вказана'}</dd></div>
          <div><dt><img src="/assets/ui/shop/clock.png" alt="" />Діє до</dt><dd>{formatBanUntil(ban.banUntil)}</dd></div>
        </dl>
        <button className="level-reward-claim" type="button" onClick={() => { useAuthStore.getState().logout(); dismiss(); }}>Вийти з акаунта</button>
      </section>
    </div>
  );
};
