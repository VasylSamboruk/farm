import React, { useState, useEffect } from 'react';
import { ArrowLeft, Gift, Moon, Sparkles, Sun } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useFarmStore } from '../../store/useFarmStore';
import { useToolStore } from '../../store/useToolStore';
import { ShopModal } from './ShopModal'; // НЕ ЗАБУДЬ імпортувати ShopModal якщо його ще тут немає
import { InventoryModal } from './InventoryModal.tsx';
import { getLevelProgress } from '../../config/progression';
import { formatGameDuration } from '../../game/trees';
import { gameApi } from '../../api/game.api';
import type { AdminGiftEntry, LevelRewardEntry } from '../../types/game';
import { useGameConfigStore } from '../../store/useGameConfigStore';

type ToolType = 'shovel' | 'trash' | 'move' | 'rotate' | null;

interface GameHUDProps {
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onReturnToProfile: () => void;
}

export const GameHUD: React.FC<GameHUDProps> = ({ theme, onToggleTheme, onReturnToProfile }) => {
  const { user } = useAuthStore();
  const { activeTool, setActiveTool, isSettingsOpen, setSettingsOpen, cancelInteraction } = useToolStore();
  const gameMessage = useFarmStore((state) => state.gameMessage);
  const dismissGameMessage = useFarmStore((state) => state.dismissGameMessage);
  const notifyGameMessage = useFarmStore((state) => state.notifyGameMessage);
  const updateUser = useAuthStore((state) => state.updateUser);
  const gameItems = useGameConfigStore((state) => state.items);
  
  const [showXpBar, setShowXpBar] = useState(false);
  const [isShopOpen, setIsShopOpen] = useState(false); // Стан для модалки
  const [isInventoryOpen, setIsInventoryOpen] = useState(false);
  const [pendingRewards, setPendingRewards] = useState<LevelRewardEntry[]>([]);
  const [claimingReward, setClaimingReward] = useState(false);
  const [pendingAdminGifts, setPendingAdminGifts] = useState<AdminGiftEntry[]>([]);
  const [claimingAdminGift, setClaimingAdminGift] = useState(false);

  const toggleTool = (tool: ToolType) => {
    if (activeTool === tool) {
      cancelInteraction();
    } else {
      setActiveTool(tool);
      if (tool === 'shovel' || tool === 'trash') setSettingsOpen(false);
    }
  };

  const toggleSettings = () => {
    if (isSettingsOpen) {
      cancelInteraction();
      return;
    }
    setActiveTool(null);
    setSettingsOpen(true);
  };

  const handleReturnToProfile = () => {
    cancelInteraction();
    setIsShopOpen(false);
    setIsInventoryOpen(false);
    onReturnToProfile();
  };

  const handleSunflowerClick = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setShowXpBar((prev) => !prev);
  };

  useEffect(() => {
    if (showXpBar) {
      const timer = setTimeout(() => setShowXpBar(false), 3500);
      return () => clearTimeout(timer);
    }
  }, [showXpBar]);

  useEffect(() => {
    if (!gameMessage) return;
    const timer = setTimeout(dismissGameMessage, 3200);
    return () => clearTimeout(timer);
  }, [gameMessage, dismissGameMessage]);

  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    void gameApi.getPendingLevelRewards()
      .then((rewards) => { if (active) setPendingRewards(rewards); })
      .catch((error: unknown) => console.error('Не вдалося завантажити нагороди рівня:', error));
    return () => { active = false; };
  }, [user?.id, user?.xp, user?.level]);

  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    const refreshAdminGifts = async () => {
      try {
        const gifts = await gameApi.getPendingAdminGifts();
        if (active) setPendingAdminGifts(gifts);
      } catch (error) {
        console.error('Не вдалося завантажити подарунки адміністратора:', error);
      }
    };
    void refreshAdminGifts();
    const intervalId = window.setInterval(() => void refreshAdminGifts(), 30_000);
    window.addEventListener('focus', refreshAdminGifts);
    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshAdminGifts);
    };
  }, [user?.id]);

  const claimLevelReward = async () => {
    const reward = pendingRewards[0];
    if (!reward || claimingReward) return;
    setClaimingReward(true);
    try {
      const updatedUser = await gameApi.claimLevelReward(reward.level);
      updateUser(updatedUser);
      setPendingRewards((current) => current.filter((entry) => entry.level !== reward.level));
    } catch (error) {
      notifyGameMessage(error instanceof Error ? error.message : 'Не вдалося забрати нагороду.');
    } finally {
      setClaimingReward(false);
    }
  };

  const claimAdminGift = async () => {
    const gift = pendingAdminGifts[0];
    if (!gift || claimingAdminGift) return;
    setClaimingAdminGift(true);
    try {
      const updatedUser = await gameApi.claimAdminGift(gift.id);
      updateUser(updatedUser);
      setPendingAdminGifts((current) => current.filter((entry) => entry.id !== gift.id));
    } catch (error) {
      notifyGameMessage(error instanceof Error ? error.message : 'Не вдалося забрати подарунок.');
    } finally {
      setClaimingAdminGift(false);
    }
  };

  const progression = getLevelProgress(user?.xp ?? 0);
  const xpPercent = (progression.xpInLevel / progression.xpToNextLevel) * 100;
  return (
    <div style={styles.hudOverlay}>
      {gameMessage && <div style={styles.gameToast} role="status">{gameMessage}</div>}
      {pendingRewards[0] && (
        <div className="level-reward-overlay">
          <section className="level-reward-dialog" role="dialog" aria-modal="true" aria-labelledby="level-reward-title">
            <div className="level-reward-gift"><Gift size={30} /></div>
            <span className="level-reward-kicker">НОВИЙ РІВЕНЬ</span>
            <h2 id="level-reward-title">Вітаємо з новим рівнем!</h2>
            <strong className="level-reward-level">Рівень {pendingRewards[0].level}</strong>
            <div className="level-reward-items">
              {pendingRewards[0].rewards.map((reward, index) => {
                const item = reward.kind === 'item' ? gameItems[reward.itemId] : undefined;
                const icon = reward.kind === 'coins' ? '/assets/ui/coin.png' : reward.kind === 'rubies' ? '/assets/ui/rubin.png' : item?.shopImage ?? item?.growthImages?.at(-1);
                const label = reward.kind === 'coins' ? 'Монети' : reward.kind === 'rubies' ? 'Рубіни' : item?.name ?? reward.itemId;
                return <div className="level-reward-item" key={`${reward.kind}-${reward.kind === 'item' ? reward.itemId : index}`}>
                  <span className="level-reward-item-icon">{icon ? <img src={icon} alt="" draggable={false} /> : <span>{item?.shopIcon ?? '🎁'}</span>}</span>
                  <strong>{label}</strong><span>× {reward.amount}</span>
                </div>;
              })}
            </div>
            <button className="level-reward-claim" type="button" onClick={() => void claimLevelReward()} disabled={claimingReward}>
              {claimingReward ? 'Забираємо…' : 'Забрати'}
            </button>
          </section>
        </div>
      )}
      {!pendingRewards[0] && pendingAdminGifts[0] && (
        <div className="level-reward-overlay">
          <section className="level-reward-dialog admin-gift-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-gift-title">
            <div className="level-reward-gift"><Gift size={30} /></div>
            <span className="level-reward-kicker">ПОДАРУНОК</span>
            <h2 id="admin-gift-title">{pendingAdminGifts[0].title}</h2>
            {pendingAdminGifts[0].description && <p className="admin-gift-description">{pendingAdminGifts[0].description}</p>}
            <div className="level-reward-items">
              {pendingAdminGifts[0].items.map((giftItem, index) => {
                const item = giftItem.kind === 'item' ? gameItems[giftItem.itemId] : undefined;
                const icon = giftItem.kind === 'coins' ? '/assets/ui/coin.png'
                  : giftItem.kind === 'rubies' ? '/assets/ui/rubin.png'
                    : giftItem.kind === 'level' ? '/assets/ui/lvl_ico.png'
                      : item?.shopImage ?? item?.growthImages?.at(-1);
                const label = giftItem.kind === 'coins' ? 'Монети'
                  : giftItem.kind === 'rubies' ? 'Рубіни'
                    : giftItem.kind === 'xp' ? 'Досвід'
                      : giftItem.kind === 'level' ? 'Рівень'
                        : giftItem.kind === 'item' ? item?.name ?? giftItem.itemId : 'Подарунок';
                const amountLabel = giftItem.kind === 'level' ? `До ${giftItem.amount}`
                  : giftItem.kind === 'item' ? `× ${giftItem.amount}` : `+${giftItem.amount}`;
                return <div className="level-reward-item" key={giftItem.kind === 'item' ? giftItem.itemId : `${giftItem.kind}-${index}`}>
                  <span className="level-reward-item-icon">{icon ? <img src={icon} alt="" draggable={false} /> : giftItem.kind === 'xp' ? <Sparkles size={23} /> : <span>{item?.shopIcon ?? '🎁'}</span>}</span>
                  <strong>{label}</strong><span>{amountLabel}</span>
                </div>;
              })}
            </div>
            <button className="level-reward-claim" type="button" onClick={() => void claimAdminGift()} disabled={claimingAdminGift}>
              {claimingAdminGift ? 'Забираємо…' : 'Забрати'}
            </button>
          </section>
        </div>
      )}
      {activeTool && (
        <div className="game-touch-hint" role="status">
          <span>
            {activeTool === 'move' ? 'Обери предмет, а потім вкажи нове місце або перетягни його'
              : activeTool === 'rotate' ? 'Натисни на предмет, щоб перевернути його'
                : activeTool === 'shovel' ? 'Натисни на вільну клітинку, щоб створити грядку'
                  : activeTool === 'trash' ? 'Натисни на предмет або грядку, щоб прибрати її'
                  : activeTool.startsWith('fertilize_') ? `Обери рослину, тварину або будівлю з твариною для добрива${gameItems[activeTool.slice('fertilize_'.length)]?.accelerationMs ? ` · прискорення ${formatGameDuration(gameItems[activeTool.slice('fertilize_'.length)].accelerationMs ?? 0)}` : ''}`
                    : activeTool.startsWith('place_') ? 'Обери вільну клітинку для розміщення'
                    : null}
          </span>
          <button type="button" onClick={cancelInteraction}>Скасувати</button>
        </div>
      )}
      
      {/* ВЕРХНІЙ ЛІВИЙ КУТОК */}
      <div style={styles.topLeftWrapper}>
        <div className="game-level-control" style={styles.levelContainer} onClick={handleSunflowerClick} onMouseEnter={() => setShowXpBar(true)} onMouseLeave={() => setShowXpBar(false)} onContextMenu={(event) => event.preventDefault()}>
          <img src="/assets/ui/lvl_ico.png" alt="Рівень" style={styles.sunflowerImg} draggable={false} />
          <span style={styles.levelNumberCenter}>{progression.level}</span>
        </div>

        <div className="game-xp-tooltip" style={{ ...styles.xpTooltip, opacity: showXpBar ? 1 : 0, transform: showXpBar ? 'translateY(0) scale(1)' : 'translateY(-10px) scale(0.9)' }}>
          <div className="game-xp-text-row" style={styles.xpTextRow}>
            <span style={styles.xpLabel}>ДОСВІД</span>
            <span className="game-xp-value" style={styles.xpValue}>{progression.xpInLevel}/{progression.xpToNextLevel}</span>
          </div>
          <div style={styles.progressBarTrack}>
            <div style={{ ...styles.progressBarFill, width: `${xpPercent}%` }} />
          </div>
        </div>
      </div>

      {/* ВЕРХНІЙ ПРАВИЙ КУТОК */}
      <div style={styles.topRightContainer}>
        <div style={styles.currencyBar}>
          <div className="game-currency-chip game-coin-chip">
            <img src="/assets/ui/coin.png" alt="" draggable={false} />
            <span style={styles.currencyValue}>{(user?.coins ?? 0).toLocaleString('uk-UA')}</span>
          </div>
          <div className="game-currency-chip game-ruby-chip">
            <img src="/assets/ui/rubin.png" alt="" draggable={false} />
            <span style={styles.currencyValue}>{(user?.rubies ?? 25).toLocaleString('uk-UA')}</span>
          </div>
        </div>
        <div style={styles.topRightActions}>
          <button
            style={styles.settingsBtn}
            onClick={handleReturnToProfile}
            aria-label="Повернутися до профілю"
            title="Повернутися до профілю"
          >
            <ArrowLeft size={18} />
          </button>
          <button
            className="game-theme-toggle"
            style={styles.themeToggleBtn}
            onClick={onToggleTheme}
            aria-label={`Увімкнути ${theme === 'dark' ? 'світлу' : 'темну'} тему`}
            title={`Увімкнути ${theme === 'dark' ? 'світлу' : 'темну'} тему`}
          >
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>
        </div>
      </div>

      {/* НИЖНЯ ПАНЕЛЬ ІКОНОК */}
      <div style={{ ...styles.actionPanel, opacity: isSettingsOpen ? 1 : 0, transform: isSettingsOpen ? 'translate(-50%, 0)' : 'translate(-50%, 10px)', pointerEvents: isSettingsOpen ? 'auto' : 'none' }}>
        <button
          className="hud-pressable"
          style={activeTool === 'move' ? { ...styles.actionIconBtn, ...styles.activeToolGlow } : styles.actionIconBtn}
          onClick={() => toggleTool('move')}
          aria-label="Переміщення"
          title="Переміщення"
        >
          <img src="/assets/ui/drapdrog.png" alt="Переміщення" style={styles.bottomIconImg} draggable={false} />
          {activeTool === 'move' && <span style={styles.toolCancelBadge}>×</span>}
        </button>
        <button
          className="hud-pressable"
          style={activeTool === 'rotate' ? { ...styles.actionIconBtn, ...styles.activeToolGlow } : styles.actionIconBtn}
          onClick={() => toggleTool('rotate')}
          aria-label="Переворот"
          title="Переворот"
        >
          <img src="/assets/ui/rotate.png" alt="Переворот" style={styles.bottomIconImg} draggable={false} />
          {activeTool === 'rotate' && <span style={styles.toolCancelBadge}>×</span>}
        </button>
      </div>

      <div style={styles.bottomPanelNoBg}>
        <button 
          className="hud-pressable"
          style={activeTool === 'shovel' ? { ...styles.cleanIconBtn, ...styles.activeToolGlow } : styles.cleanIconBtn}
          onClick={() => toggleTool('shovel')}
          aria-label={activeTool === 'shovel' ? 'Скасувати створення грядки' : 'Лопата'}
          title={activeTool === 'shovel' ? 'Скасувати' : 'Створити грядку'}
        >
          <img src="/assets/ui/lopata_ico.png" alt="Лопата" style={styles.bottomIconImg} draggable={false} />
          {activeTool === 'shovel' && <span style={styles.toolCancelBadge}>×</span>}
        </button>

        <button 
          className="hud-pressable"
          style={activeTool === 'trash' ? { ...styles.cleanIconBtn, ...styles.activeToolGlow } : styles.cleanIconBtn}
          onClick={() => toggleTool('trash')}
          aria-label={activeTool === 'trash' ? 'Скасувати видалення' : 'Смітник'}
          title={activeTool === 'trash' ? 'Скасувати' : 'Видалити предмет'}
        >
          <img src="/assets/ui/musor_ico.png" alt="Смітник" style={styles.bottomIconImg} draggable={false} />
          {activeTool === 'trash' && <span style={styles.toolCancelBadge}>×</span>}
        </button>

        <button
          className="hud-pressable"
          style={isSettingsOpen ? { ...styles.cleanIconBtn, ...styles.activeToolGlow } : styles.cleanIconBtn}
          onClick={toggleSettings}
          aria-label={isSettingsOpen ? 'Закрити налаштування інструментів' : 'Налаштування інструментів'}
          title={isSettingsOpen ? 'Закрити налаштування інструментів' : 'Налаштування інструментів'}
        >
          <img src="/assets/ui/setings.png" alt="Налаштування" style={styles.bottomIconImg} draggable={false} />
          {isSettingsOpen && <span style={styles.toolCancelBadge}>×</span>}
        </button>

        {/* КНОПКА МАГАЗИНУ (Або скасувати якщо вибрано дерево) */}
        <button className="hud-pressable" style={styles.cleanIconBtn} onClick={() => {
            if (activeTool && activeTool.startsWith('place_')) {
                cancelInteraction();
            } else {
                cancelInteraction();
                setIsShopOpen(true); // Відкриваємо магазин
            }
        }}>
          {activeTool && activeTool.startsWith('place_') ? (
             <>
               <img src="/assets/ui/shop_ico.png" alt="Магазин" style={styles.bottomIconImg} draggable={false} />
               <span style={styles.toolCancelBadge}>×</span>
             </>
          ) : (
             <img src="/assets/ui/shop_ico.png" alt="Магазин" style={styles.bottomIconImg} draggable={false} />
          )}
        </button>

        <button className="hud-pressable" style={styles.cleanIconBtn} onClick={() => {
          if (activeTool?.startsWith('fertilize_')) {
            cancelInteraction();
          } else {
            cancelInteraction();
            setIsInventoryOpen(true);
          }
        }} aria-label={activeTool?.startsWith('fertilize_') ? 'Скасувати вибір цілі добрива' : 'Відкрити інвентар'}>
          <img src="/assets/ui/cklad.png" alt="Склад" style={styles.bottomIconImg} draggable={false} />
          {activeTool?.startsWith('fertilize_') && <span style={styles.toolCancelBadge}>×</span>}
        </button>
      </div>

      <ShopModal isOpen={isShopOpen} onClose={() => setIsShopOpen(false)} />
      <InventoryModal isOpen={isInventoryOpen} onClose={() => setIsInventoryOpen(false)} />
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  hudOverlay: { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 10, fontFamily: '"Inter", sans-serif', userSelect: 'none' },
  gameToast: { position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', maxWidth: 'min(360px, calc(100vw - 32px))', padding: '12px 18px', border: '1px solid rgba(255, 210, 130, 0.75)', borderRadius: '9px', background: 'rgba(42, 30, 20, 0.96)', color: '#fff4dd', boxShadow: '0 10px 30px rgba(0,0,0,0.45)', textAlign: 'center', fontSize: '14px', fontWeight: '700', pointerEvents: 'none' },
  topLeftWrapper: { position: 'absolute', top: '12px', left: '12px', display: 'flex', flexDirection: 'column', gap: '6px', pointerEvents: 'auto', zIndex: 20 },
  levelContainer: { position: 'relative', width: '75px', height: '75px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.4))' },
  sunflowerImg: { width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' },
  levelNumberCenter: { position: 'absolute', color: '#ffffff', fontWeight: '900', fontSize: '16px', textShadow: '-1.5px -1.5px 0 #000, 1.5px -1.5px 0 #000, -1.5px 1.5px 0 #000, 1.5px 1.5px 0 #000, 0 3px 6px rgba(0,0,0,0.8)' },
  xpTooltip: { background: 'linear-gradient(145deg, rgba(255, 248, 224, 0.98), rgba(237, 210, 160, 0.97))', backdropFilter: 'blur(10px)', border: '3px solid #81512a', borderRadius: '10px', padding: '8px 12px', width: 'min(200px, calc(100vw - 24px))', color: '#402b1a', boxShadow: 'inset 0 0 0 1px #d7a95f, 0 4px 0 #5d391f, 0 8px 16px rgba(24, 34, 22, 0.34)', transition: 'all 0.25s' },
  xpTextRow: { display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '4px 8px', marginBottom: '4px' },
  xpLabel: { flex: '0 0 auto', fontSize: '10px', fontWeight: '800', color: '#805329' },
  xpValue: { flex: '0 0 auto', minWidth: 0, whiteSpace: 'nowrap', overflowWrap: 'normal', textAlign: 'right', fontSize: '11px', fontWeight: '800', color: '#4b311b' },
  progressBarTrack: { width: '100%', height: '8px', backgroundColor: '#e6c276', border: '1px solid #aa7132', borderRadius: '8px', overflow: 'hidden' },
  progressBarFill: { height: '100%', background: 'linear-gradient(180deg, #a4e644, #4eaa27)', borderRadius: '8px', transition: 'width 0.3s ease' },
  topRightContainer: { position: 'absolute', top: '12px', right: '12px', display: 'flex', alignItems: 'flex-start', gap: '8px', pointerEvents: 'auto', zIndex: 15 },
  currencyBar: { display: 'flex', alignItems: 'flex-start', gap: '8px' },
  currencyValue: { color: '#fff4d4', fontWeight: '900', fontSize: '13px', textShadow: '0 1px 2px #342114' },
  settingsBtn: { display: 'grid', placeItems: 'center', background: 'linear-gradient(180deg, #a36a36, #60391f)', border: '2px solid #3f2819', borderRadius: '12px', width: '40px', height: '40px', color: '#fff0c9', cursor: 'pointer', outline: 'none', boxShadow: 'inset 0 1px 0 rgba(255, 222, 164, 0.45), 0 3px 0 rgba(31, 23, 15, 0.65)' },
  topRightActions: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' },
  themeToggleBtn: { display: 'grid', placeItems: 'center', background: 'linear-gradient(180deg, #976030, #57331d)', border: '2px solid #3f2819', borderRadius: '12px', width: '40px', height: '40px', color: '#fff0c9', cursor: 'pointer', outline: 'none', boxShadow: 'inset 0 1px 0 rgba(255, 222, 164, 0.45), 0 3px 0 rgba(31, 23, 15, 0.65)' },
  actionPanel: { position: 'absolute', bottom: 'calc(20px + clamp(48px, 15vw, 64px) + 8px)', left: '50%', display: 'flex', flexDirection: 'column', gap: '3px', pointerEvents: 'auto', transition: 'opacity 0.18s ease, transform 0.18s ease' },
  bottomPanelNoBg: { position: 'absolute', bottom: '20px', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 'clamp(6px, 2vw, 18px)', pointerEvents: 'auto' },
  cleanIconBtn: { position: 'relative', background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 'clamp(48px, 15vw, 64px)', height: 'clamp(48px, 15vw, 64px)', outline: 'none', transition: 'transform 0.15s ease' },
  actionIconBtn: { position: 'relative', background: 'rgba(15, 22, 18, 0.42)', border: '1px solid rgba(255, 255, 255, 0.12)', borderRadius: '12px', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 'clamp(40px, 11vw, 52px)', height: 'clamp(40px, 11vw, 52px)', outline: 'none', transition: 'transform 0.18s ease, background 0.18s ease' },
  toolCancelBadge: { position: 'absolute', top: '-4px', right: '-4px', width: '18px', height: '18px', borderRadius: '50%', background: '#ef5350', border: '2px solid #fff1d0', color: '#fff', fontSize: '16px', lineHeight: '13px', fontWeight: '900', boxShadow: '0 2px 8px rgba(0,0,0,0.5)', pointerEvents: 'none' },
  bottomIconImg: { width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none', filter: 'drop-shadow(0 5px 8px rgba(0,0,0,0.5))' },
  activeToolGlow: { transform: 'scale(1.1)', filter: 'drop-shadow(0 0 12px rgba(239, 83, 80, 0.9))' },
};