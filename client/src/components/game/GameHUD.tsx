import React, { useState, useEffect } from 'react';
import { ArrowLeft, Plus } from 'lucide-react';
import { API_BASE_URL } from '../../api/axios';
import { useAuthStore } from '../../store/authStore';
import { useFarmStore } from '../../store/useFarmStore';
import { useToolStore } from '../../store/useToolStore';
import { ShopModal } from './ShopModal'; // НЕ ЗАБУДЬ імпортувати ShopModal якщо його ще тут немає
import { InventoryModal } from './InventoryModal.tsx';
import { getLevelProgress } from '../../config/progression';

type ToolType = 'shovel' | 'trash' | 'move' | 'rotate' | null;

interface GameHUDProps {
  onReturnToProfile: () => void;
}

export const GameHUD: React.FC<GameHUDProps> = ({ onReturnToProfile }) => {
  const { user } = useAuthStore();
  const { activeTool, setActiveTool } = useToolStore();
  const gameMessage = useFarmStore((state) => state.gameMessage);
  const dismissGameMessage = useFarmStore((state) => state.dismissGameMessage);
  
  const [showXpBar, setShowXpBar] = useState(false);
  const [isShopOpen, setIsShopOpen] = useState(false); // Стан для модалки
  const [isInventoryOpen, setIsInventoryOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const toggleTool = (tool: ToolType) => {
    if (activeTool === tool) {
      setActiveTool(null);
    } else {
      setActiveTool(tool);
    }
  };

  const toggleSettings = () => {
    setIsSettingsOpen((isOpen) => {
      if (isOpen) setActiveTool(null);
      return !isOpen;
    });
  };

  const handleReturnToProfile = () => {
    setActiveTool(null);
    setIsSettingsOpen(false);
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

  // ФУНКЦІЯ: Накрутити 100 монет для тесту
  const addTestCoins = async () => {
    if (!user) return;
    try {
      const res = await fetch(`${API_BASE_URL}/farm/add-coins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, amount: 100 })
      });
      const data = await res.json();
      if (data.success) {
        useAuthStore.setState({ user: { ...user, coins: data.coins } });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const progression = getLevelProgress(user?.xp ?? 0);
  const xpPercent = (progression.xpInLevel / progression.xpToNextLevel) * 100;
  return (
    <div style={styles.hudOverlay}>
      {gameMessage && <div style={styles.gameToast} role="status">{gameMessage}</div>}
      
      {/* ВЕРХНІЙ ЛІВИЙ КУТОК */}
      <div style={styles.topLeftWrapper}>
        <div style={styles.levelContainer} onClick={handleSunflowerClick} onMouseEnter={() => setShowXpBar(true)} onMouseLeave={() => setShowXpBar(false)}>
          <img src="/assets/ui/lvl_ico.png" alt="Рівень" style={styles.sunflowerImg} draggable={false} />
          <span style={styles.levelNumberCenter}>{progression.level}</span>
        </div>

        <div style={{ ...styles.xpTooltip, opacity: showXpBar ? 1 : 0, transform: showXpBar ? 'translateY(0) scale(1)' : 'translateY(-10px) scale(0.9)' }}>
          <div style={styles.xpTextRow}>
            <span style={styles.xpLabel}>ДОСВІД</span>
            <span style={styles.xpValue}>{progression.xpInLevel}/{progression.xpToNextLevel}</span>
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
            <button onClick={addTestCoins} style={styles.addCoinsBtn} aria-label="Додати 100 монет" title="Додати 100 монет"><Plus size={15} strokeWidth={3} /></button>
          </div>
          <div className="game-currency-chip game-ruby-chip">
            <img src="/assets/ui/rubin.png" alt="" draggable={false} />
            <span style={styles.currencyValue}>25</span>
          </div>
        </div>
        <button
          style={styles.settingsBtn}
          onClick={handleReturnToProfile}
          aria-label="Повернутися до профілю"
          title="Повернутися до профілю"
        >
          <ArrowLeft size={18} />
        </button>
      </div>

      {/* НИЖНЯ ПАНЕЛЬ ІКОНОК */}
      <div style={{ ...styles.actionPanel, opacity: isSettingsOpen ? 1 : 0, transform: isSettingsOpen ? 'translate(-50%, 0)' : 'translate(-50%, 10px)', pointerEvents: isSettingsOpen ? 'auto' : 'none' }}>
        <button
          style={activeTool === 'move' ? { ...styles.actionIconBtn, ...styles.activeToolGlow } : styles.actionIconBtn}
          onClick={() => toggleTool('move')}
          aria-label="Переміщення"
          title="Переміщення"
        >
          <img src="/assets/ui/drapdrog.png" alt="Переміщення" style={styles.bottomIconImg} draggable={false} />
          {activeTool === 'move' && <span style={styles.toolCancelBadge}>×</span>}
        </button>
        <button
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
          style={activeTool === 'shovel' ? { ...styles.cleanIconBtn, ...styles.activeToolGlow } : styles.cleanIconBtn}
          onClick={() => toggleTool('shovel')}
        >
          {activeTool === 'shovel' ? <span style={styles.cancelEmoji}>❌</span> : <img src="/assets/ui/lopata_ico.png" alt="Лопата" style={styles.bottomIconImg} draggable={false} />}
        </button>

        <button 
          style={activeTool === 'trash' ? { ...styles.cleanIconBtn, ...styles.activeToolGlow } : styles.cleanIconBtn}
          onClick={() => toggleTool('trash')}
        >
          {activeTool === 'trash' ? <span style={styles.cancelEmoji}>❌</span> : <img src="/assets/ui/musor_ico.png" alt="Смітник" style={styles.bottomIconImg} draggable={false} />}
        </button>

        <button
          style={isSettingsOpen ? { ...styles.cleanIconBtn, ...styles.activeToolGlow } : styles.cleanIconBtn}
          onClick={toggleSettings}
          aria-label="Налаштування предмета"
          title="Налаштування предмета"
        >
          {isSettingsOpen ? <span style={styles.cancelEmoji}>❌</span> : <img src="/assets/ui/setings.png" alt="Налаштування" style={styles.bottomIconImg} draggable={false} />}
        </button>

        {/* КНОПКА МАГАЗИНУ (Або скасувати якщо вибрано дерево) */}
        <button style={styles.cleanIconBtn} onClick={() => {
            if (activeTool && activeTool.startsWith('place_')) {
                setActiveTool(null); // Скасовуємо посадку
            } else {
                setIsShopOpen(true); // Відкриваємо магазин
            }
        }}>
          {activeTool && activeTool.startsWith('place_') ? (
             <span style={styles.cancelEmoji}>❌</span>
          ) : (
             <img src="/assets/ui/shop_ico.png" alt="Магазин" style={styles.bottomIconImg} draggable={false} />
          )}
        </button>

        <button style={styles.cleanIconBtn} onClick={() => setIsInventoryOpen(true)} aria-label="Відкрити інвентар">
          <img src="/assets/ui/cklad.png" alt="Склад" style={styles.bottomIconImg} draggable={false} />
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
  xpTooltip: { background: 'linear-gradient(145deg, rgba(255, 248, 224, 0.98), rgba(237, 210, 160, 0.97))', backdropFilter: 'blur(10px)', border: '3px solid #81512a', borderRadius: '10px', padding: '8px 12px', width: '150px', color: '#402b1a', boxShadow: 'inset 0 0 0 1px #d7a95f, 0 4px 0 #5d391f, 0 8px 16px rgba(24, 34, 22, 0.34)', transition: 'all 0.25s' },
  xpTextRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' },
  xpLabel: { fontSize: '10px', fontWeight: '800', color: '#805329' },
  xpValue: { fontSize: '11px', fontWeight: '800', color: '#4b311b' },
  progressBarTrack: { width: '100%', height: '8px', backgroundColor: '#e6c276', border: '1px solid #aa7132', borderRadius: '8px', overflow: 'hidden' },
  progressBarFill: { height: '100%', background: 'linear-gradient(180deg, #a4e644, #4eaa27)', borderRadius: '8px', transition: 'width 0.3s ease' },
  topRightContainer: { position: 'absolute', top: '12px', right: '12px', display: 'flex', alignItems: 'center', gap: '8px', pointerEvents: 'auto', zIndex: 15 },
  currencyBar: { display: 'flex', alignItems: 'center', gap: '8px' },
  currencyValue: { color: '#fff4d4', fontWeight: '900', fontSize: '13px', textShadow: '0 1px 2px #342114' },
  addCoinsBtn: { display: 'grid', placeItems: 'center', width: '25px', height: '25px', background: 'linear-gradient(180deg, #8ede4c, #398d28)', border: '2px solid #2c6d22', borderRadius: '50%', color: '#fffbe1', padding: 0, cursor: 'pointer', marginLeft: '2px', boxShadow: 'inset 0 1px 0 rgba(239, 255, 193, 0.75), 0 2px 0 #254f1c' },
  settingsBtn: { display: 'grid', placeItems: 'center', background: 'linear-gradient(180deg, #a36a36, #60391f)', border: '2px solid #3f2819', borderRadius: '12px', width: '40px', height: '40px', color: '#fff0c9', cursor: 'pointer', outline: 'none', boxShadow: 'inset 0 1px 0 rgba(255, 222, 164, 0.45), 0 3px 0 rgba(31, 23, 15, 0.65)' },
  actionPanel: { position: 'absolute', bottom: 'calc(20px + clamp(48px, 15vw, 64px) + 8px)', left: '50%', display: 'flex', flexDirection: 'column', gap: '3px', pointerEvents: 'auto', transition: 'opacity 0.18s ease, transform 0.18s ease' },
  bottomPanelNoBg: { position: 'absolute', bottom: '20px', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 'clamp(6px, 2vw, 18px)', pointerEvents: 'auto' },
  cleanIconBtn: { background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 'clamp(48px, 15vw, 64px)', height: 'clamp(48px, 15vw, 64px)', outline: 'none', transition: 'transform 0.15s ease' },
  actionIconBtn: { position: 'relative', background: 'rgba(15, 22, 18, 0.42)', border: '1px solid rgba(255, 255, 255, 0.12)', borderRadius: '12px', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 'clamp(40px, 11vw, 52px)', height: 'clamp(40px, 11vw, 52px)', outline: 'none', transition: 'transform 0.18s ease, background 0.18s ease' },
  toolCancelBadge: { position: 'absolute', top: '-4px', right: '-4px', width: '18px', height: '18px', borderRadius: '50%', background: '#ef5350', border: '2px solid #fff1d0', color: '#fff', fontSize: '16px', lineHeight: '13px', fontWeight: '900', boxShadow: '0 2px 8px rgba(0,0,0,0.5)', pointerEvents: 'none' },
  bottomIconImg: { width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none', filter: 'drop-shadow(0 5px 8px rgba(0,0,0,0.5))' },
  activeToolGlow: { transform: 'scale(1.1)', filter: 'drop-shadow(0 0 12px rgba(239, 83, 80, 0.9))' },
  cancelEmoji: { fontSize: '38px' },
};