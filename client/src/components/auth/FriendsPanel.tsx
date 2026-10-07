import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { ArrowLeft, Bell, Check, ChevronDown, ChevronUp, ClipboardCheck, Copy, Gift, House, MoreVertical, Search, UserRoundMinus, UserRoundPlus, Users, X } from 'lucide-react';
import { getLevelProgress } from '../../config/progression';
import { socialApi, type FriendFarm, type ReceivedSocialGift, type SocialGiftProduct, type SocialPlayer } from '../../api/social.api';
import { loadGameImage, preloadGameImages } from '../../game/sprites';
import { useGameConfigStore } from '../../store/useGameConfigStore';
import { useAuthStore } from '../../store/authStore';
import type { TileData } from '../../store/useFarmStore';
import { FarmCanvas } from '../game/FarmCanvas';
import { GiftShopModal } from '../game/GiftShopModal';
import { ReceivedGiftModal } from '../game/ReceivedGiftModal';

const loadSocialLists = async () => Promise.all([socialApi.getFriends(), socialApi.getRequests()]);
const shortenPlayerId = (id: string) => id.length > 15 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
const formatGiftCooldown = (until: string | undefined, now: number) => {
  if (!until) return '';
  const remaining = new Date(until).getTime() - now;
  if (remaining <= 0) return '';
  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);
  return `${hours} год ${String(minutes).padStart(2, '0')} хв ${String(seconds).padStart(2, '0')} с`;
};
const formatCompactGiftCooldown = (until: string | undefined, now: number) => {
  if (!until) return '';
  const remaining = new Date(until).getTime() - now;
  if (remaining <= 0) return '';
  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  return `${hours}г ${minutes}х`;
};
const formatLastOnline = (player: SocialPlayer) => {
  if (player.isOnline) return 'Зараз онлайн';
  if (!player.lastOnlineAt) return 'Ще не заходив';
  const lastSeen = new Date(player.lastOnlineAt);
  const elapsed = Date.now() - lastSeen.getTime();
  if (!Number.isFinite(elapsed)) return 'Час невідомий';
  if (elapsed < 60_000) return 'Був(ла) щойно';
  if (elapsed < 3_600_000) return `Був(ла) ${Math.floor(elapsed / 60_000)} хв тому`;
  const time = new Intl.DateTimeFormat('uk-UA', { hour: '2-digit', minute: '2-digit' }).format(lastSeen);
  if (lastSeen.toDateString() === new Date().toDateString()) return `Сьогодні о ${time}`;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (lastSeen.toDateString() === yesterday.toDateString()) return `Вчора о ${time}`;
  return `Був(ла) ${new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(lastSeen)}`;
};

const getErrorMessage = (error: unknown) => {
  if (axios.isAxiosError<{ message?: string }>(error)) {
    return error.response?.data?.message ?? 'Не вдалося виконати запит до сервера.';
  }
  return error instanceof Error ? error.message : 'Сталася невідома помилка.';
};

const toTileMap = (tiles: FriendFarm['tiles']): Record<string, TileData> => {
  const tileMap: Record<string, TileData> = {};
  for (const tile of tiles) {
    if (tile.isDirt) {
      tileMap[`${tile.y},${tile.x},-1`] = { type: 'dirt', flipX: tile.flipX ?? false };
      continue;
    }

    tileMap[`${tile.y},${tile.x},${tile.quadrant}`] = {
      type: 'item',
      itemId: tile.itemId,
      stage: tile.stage,
      quadrant: tile.quadrant,
      occupiedQuadrants: tile.occupiedQuadrants?.length ? tile.occupiedQuadrants : [tile.quadrant],
      occupiedCells: tile.occupiedCells?.map((cell) => ({ row: cell.y, col: cell.x, quadrant: cell.quadrant })),
      flipX: tile.flipX ?? false,
      placedAt: tile.placedAt,
      lastHarvestedAt: tile.lastHarvestedAt,
      factoryQueuedUnits: tile.factoryQueuedUnits,
      factoryStartedAt: tile.factoryStartedAt,
      factoryInputItemId: tile.factoryInputItemId,
    };
  }
  return tileMap;
};

export const FriendsPanel: React.FC<{
  isInGame?: boolean;
  onRequestCountChange?: (count: number) => void;
}> = ({ isInGame = false, onRequestCountChange }) => {
  const gameItems = useGameConfigStore((state) => state.items);
  const loadGameItems = useGameConfigStore((state) => state.loadItems);
  const [friends, setFriends] = useState<SocialPlayer[]>([]);
  const [requests, setRequests] = useState<SocialPlayer[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SocialPlayer[]>([]);
  const [loadingLists, setLoadingLists] = useState(true);
  const [searching, setSearching] = useState(false);
  const [busyPlayerId, setBusyPlayerId] = useState<string | null>(null);
  const [friendToRemoveId, setFriendToRemoveId] = useState<string | null>(null);
  const [openFriendMenuId, setOpenFriendMenuId] = useState<string | null>(null);
  const [openingFriend, setOpeningFriend] = useState(false);
  const [selectedFarm, setSelectedFarm] = useState<FriendFarm | null>(null);
  const [showFarmContents, setShowFarmContents] = useState(false);
  const [copiedFriendId, setCopiedFriendId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [giftToast, setGiftToast] = useState<{ kind: 'success' | 'error'; title: string; message: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'friends' | 'requests' | 'gifts' | 'search'>('friends');
  const [receivedGifts, setReceivedGifts] = useState<ReceivedSocialGift[]>([]);
  const [giftProducts, setGiftProducts] = useState<SocialGiftProduct[]>([]);
  const [giftCooldowns, setGiftCooldowns] = useState<Record<string, string>>({});
  const [selectedGiftFriend, setSelectedGiftFriend] = useState<SocialPlayer | null>(null);
  const [sendingGiftItemId, setSendingGiftItemId] = useState<string | null>(null);
  const [busyGiftId, setBusyGiftId] = useState<string | null>(null);
  const [selectedReceivedGift, setSelectedReceivedGift] = useState<ReceivedSocialGift | null>(null);
  const [giftClock, setGiftClock] = useState(Date.now);
  const updateUser = useAuthStore((state) => state.updateUser);
  const hasGiftCooldowns = Object.keys(giftCooldowns).length > 0;

  useEffect(() => {
    if (!giftToast) return;
    const timeoutId = window.setTimeout(() => setGiftToast(null), 4200);
    return () => window.clearTimeout(timeoutId);
  }, [giftToast]);

  useEffect(() => {
    if (!hasGiftCooldowns) return;
    const intervalId = window.setInterval(() => setGiftClock(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, [hasGiftCooldowns]);

  useEffect(() => {
    let active = true;
    const refreshAll = async () => {
      const [[loadedFriends, loadedRequests], giftData, products] = await Promise.all([
        loadSocialLists(),
        socialApi.getGifts(),
        socialApi.getGiftShop(),
      ]);
        if (!active) return;
        setFriends(loadedFriends);
        setRequests(loadedRequests);
        setReceivedGifts(giftData.gifts);
        setGiftCooldowns(giftData.cooldowns);
        setGiftProducts(products);
        onRequestCountChange?.(loadedRequests.length + giftData.gifts.length);
    };
    void refreshAll()
      .catch((error: unknown) => { if (active) setNotice(getErrorMessage(error)); })
      .finally(() => { if (active) setLoadingLists(false); });
    const intervalId = window.setInterval(() => {
      void refreshAll().catch((error: unknown) => { if (active) setNotice(getErrorMessage(error)); });
    }, 20_000);
    const onFocus = () => void refreshAll().catch((error: unknown) => { if (active) setNotice(getErrorMessage(error)); });
    window.addEventListener('focus', onFocus);
    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', onFocus);
    };
  }, [onRequestCountChange]);

  const refreshLists = async () => {
    const [[loadedFriends, loadedRequests], giftData] = await Promise.all([loadSocialLists(), socialApi.getGifts()]);
    setFriends(loadedFriends);
    setRequests(loadedRequests);
    setReceivedGifts(giftData.gifts);
    setGiftCooldowns(giftData.cooldowns);
    onRequestCountChange?.(loadedRequests.length + giftData.gifts.length);
  };

  const sendGift = async (item: SocialGiftProduct) => {
    if (!selectedGiftFriend || sendingGiftItemId) return;
    setSendingGiftItemId(item.itemId);
    setNotice('');
    try {
      const result = await socialApi.sendGift(selectedGiftFriend.id, item.itemId);
      updateUser({ coins: result.coins, rubies: result.rubies });
      setGiftCooldowns((current) => ({ ...current, [selectedGiftFriend.id]: result.cooldownUntil }));
      setSelectedGiftFriend(null);
      setGiftToast({ kind: 'success', title: 'Подарунок надіслано!', message: `${item.name} вже прямує до ${selectedGiftFriend.username}.` });
      void refreshLists().catch((refreshError: unknown) => setNotice(getErrorMessage(refreshError)));
    } catch (error) {
      setGiftToast({ kind: 'error', title: 'Не вдалося надіслати подарунок', message: getErrorMessage(error) });
      void refreshLists().catch((refreshError: unknown) => setNotice(getErrorMessage(refreshError)));
    } finally {
      setSendingGiftItemId(null);
    }
  };

  const respondToGift = async (gift: ReceivedSocialGift, accept: boolean) => {
    setBusyGiftId(gift.id);
    setNotice('');
    try {
      if (accept) {
        const result = await socialApi.acceptGift(gift.id);
        updateUser({ itemInventory: result.itemInventory });
        setGiftToast({ kind: 'success', title: 'Подарунок прийнято!', message: `${gift.itemName} додано до твого інвентаря.` });
      } else {
        await socialApi.rejectGift(gift.id);
        setGiftToast({ kind: 'success', title: 'Подарунок відхилено', message: 'Оплату повернено другові.' });
      }
      setSelectedReceivedGift(null);
      void refreshLists().catch((refreshError: unknown) => setNotice(getErrorMessage(refreshError)));
    } catch (error) {
      setGiftToast({ kind: 'error', title: 'Не вдалося обробити подарунок', message: getErrorMessage(error) });
    } finally {
      setBusyGiftId(null);
    }
  };

  const searchPlayers = async (event: React.FormEvent) => {
    event.preventDefault();
    setNotice('');
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      setNotice('Введи щонайменше 2 символи логіна або ID.');
      return;
    }

    setSearching(true);
    try {
      setSearchResults(await socialApi.search(searchQuery.trim()));
    } catch (error) {
      setNotice(getErrorMessage(error));
    } finally {
      setSearching(false);
    }
  };

  const runPlayerAction = async (player: SocialPlayer, action: 'send' | 'accept' | 'decline' | 'remove') => {
    setBusyPlayerId(player.id);
    setNotice('');
    try {
      if (action === 'send') await socialApi.sendRequest(player.id);
      if (action === 'accept') await socialApi.acceptRequest(player.id);
      if (action === 'decline') await socialApi.declineRequest(player.id);
      if (action === 'remove') await socialApi.removeFriend(player.id);
      await refreshLists();
      if (action === 'send') setSearchResults(await socialApi.search(searchQuery.trim()));
      if (action === 'remove') {
        setSelectedFarm(null);
        setFriendToRemoveId(null);
      }
    } catch (error) {
      setNotice(getErrorMessage(error));
    } finally {
      setBusyPlayerId(null);
    }
  };

  const openFriendFarm = async (friend: SocialPlayer) => {
    setOpeningFriend(true);
    setNotice('');
    try {
      await loadGameItems(true);
      const config = useGameConfigStore.getState();
      if (config.error) throw new Error(config.error);
      await Promise.all([
        loadGameImage('/assets/fonik1.png'),
        loadGameImage('/assets/tiles/grass_tile.png'),
        loadGameImage('/assets/tiles/dirt_tile.png'),
        preloadGameImages(Object.values(config.items)),
      ]);
      setSelectedFarm(await socialApi.getFriendFarm(friend.id));
      setShowFarmContents(false);
    } catch (error) {
      setNotice(getErrorMessage(error));
    } finally {
      setOpeningFriend(false);
    }
  };

  const copyFriendId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      setCopiedFriendId(id);
      window.setTimeout(() => setCopiedFriendId(null), 1400);
    } catch {
      setNotice('Не вдалося скопіювати ID.');
    }
  };

  const displayedTiles = selectedFarm ? toTileMap(selectedFarm.tiles) : {};
  const placedItems = selectedFarm?.tiles.filter((tile) => !tile.isDirt) ?? [];
  const plantedSummary = new Map<string, number>();
  for (const tile of placedItems) {
    const item = gameItems[tile.itemId];
    const itemName = item?.name ?? tile.itemId;
    plantedSummary.set(itemName, (plantedSummary.get(itemName) ?? 0) + 1);
  }

  return (
    <section className={`friends-section${isInGame ? ' game-friends-panel' : ''}`} aria-labelledby="friends-heading">
      {isInGame ? (
        <nav className="game-friends-tabs" id="friends-heading" aria-label="Розділи друзів">
          <button type="button" className={activeTab === 'friends' ? 'is-active' : ''} onClick={() => setActiveTab('friends')}>
            <Users size={16} /><span>Мої друзі</span><small>{friends.length}</small>
          </button>
          <button type="button" className={`${activeTab === 'requests' ? 'is-active' : ''}${requests.length > 0 ? ' has-new' : ''}`} onClick={() => setActiveTab('requests')}>
            <Bell size={16} /><span>Запити</span><small>{requests.length}</small>
          </button>
          <button type="button" className={`${activeTab === 'gifts' ? 'is-active' : ''}${receivedGifts.length > 0 ? ' has-new' : ''}`} onClick={() => setActiveTab('gifts')}>
            <Gift size={16} /><span>Подарунки</span><small>{receivedGifts.length}</small>
          </button>
          <button type="button" className={activeTab === 'search' ? 'is-active' : ''} onClick={() => setActiveTab('search')}>
            <Search size={16} /><span>Пошук</span>
          </button>
        </nav>
      ) : (
        <div className="friends-heading-row">
          <div>
            <p className="player-label">ГОСПОДАРСТВО ПОРУЧ</p>
            <h2 id="friends-heading">Друзі</h2>
          </div>
          <span className="friends-count">{friends.length}</span>
        </div>
      )}

      {notice && <p className="social-notice" role="status">{notice}</p>}

      {(!isInGame || activeTab === 'search') && (
        <form className="friend-search" onSubmit={searchPlayers}>
          <Search size={17} aria-hidden="true" />
          <input
            aria-label="Пошук гравця за логіном або ID"
            placeholder="Знайти за логіном або ID"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          <button className="friend-add-button" type="submit" disabled={searching}>
            <UserRoundPlus size={17} />
            <span>{searching ? 'Шукаємо...' : 'Знайти'}</span>
          </button>
        </form>
      )}

      {(!isInGame || activeTab === 'search') && searchResults.length > 0 && (
        <div className="social-list search-results" aria-label="Результати пошуку">
          {searchResults.map((player) => (
            <div className="social-player-row" key={player.id}>
              <PlayerIdentity player={player} hideId={isInGame} />
              {player.relation === 'none' && (
                <button className="social-icon-button" type="button" onClick={() => void runPlayerAction(player, 'send')} disabled={busyPlayerId === player.id} aria-label={`Надіслати запит ${player.username}`} title="Додати в друзі"><UserRoundPlus size={17} /></button>
              )}
              {player.relation === 'pending_sent' && <span className="social-state">Запит надіслано</span>}
              {player.relation === 'pending_received' && <button className="social-text-action" type="button" onClick={() => void runPlayerAction(player, 'accept')} disabled={busyPlayerId === player.id}>Прийняти</button>}
              {player.relation === 'friend' && <span className="social-state">У друзях</span>}
            </div>
          ))}
        </div>
      )}
      {(!isInGame || activeTab === 'search') && !searching && searchQuery.trim().length >= 2 && searchResults.length === 0 && <p className="social-empty">Гравців не знайдено.</p>}

      {(!isInGame || activeTab === 'requests') && requests.length > 0 && (
        <div className="friends-subsection">
          {!isInGame && <h3>Запити в друзі <span>{requests.length}</span></h3>}
          <div className="social-list">
            {requests.map((player) => (
              <div className="social-player-row" key={player.id}>
                <PlayerIdentity player={player} hideId={isInGame} />
                <button className="social-icon-button accept-button" type="button" onClick={() => void runPlayerAction(player, 'accept')} disabled={busyPlayerId === player.id} aria-label={`Прийняти запит від ${player.username}`} title="Прийняти"><Check size={17} /></button>
                <button className="social-icon-button reject-button" type="button" onClick={() => void runPlayerAction(player, 'decline')} disabled={busyPlayerId === player.id} aria-label={`Відхилити запит від ${player.username}`} title="Відхилити"><X size={17} /></button>
              </div>
            ))}
          </div>
        </div>
      )}
      {isInGame && activeTab === 'requests' && requests.length === 0 && !loadingLists && (
        <div className="game-friends-empty"><Bell size={25} /><strong>Нових запитів немає</strong><span>Коли хтось запросить у друзі, запит з’явиться тут.</span></div>
      )}

      {isInGame && activeTab === 'gifts' && (
        <div className="friends-subsection">
          {receivedGifts.length === 0 ? (
            <div className="game-friends-empty"><Gift size={27} /><strong>Подарунків поки немає</strong><span>Коли друг надішле подарунок, він з’явиться тут.</span></div>
          ) : (
            <div className="social-list received-gifts-list">
              {receivedGifts.map((gift) => (
                <article className="received-gift-row" key={gift.id}>
                  <div className="received-gift-card-sender">
                    <span className="received-gift-mini-avatar">{gift.senderAvatar ? <img src={gift.senderAvatar} alt="" /> : gift.senderName.slice(0, 1).toUpperCase()}</span>
                    <span className="received-gift-sender-details">
                      <small>ПОДАРУНОК ВІД</small>
                      <strong>{gift.senderName}</strong>
                    </span>
                    <span className="received-gift-level"><img src="/assets/ui/lvl_ico.png" alt="" /> Рівень {gift.senderLevel}</span>
                  </div>
                  <div className="received-gift-card-content">
                    <div className="received-gift-image">{gift.image ? <img src={gift.image} alt="" draggable={false} /> : <Gift size={28} />}</div>
                    <div className="received-gift-card-copy">
                      <small>ДЛЯ ТВОЄЇ ФЕРМИ</small>
                      <strong>{gift.itemName}</strong>
                    </div>
                    <button className="received-gift-open" type="button" onClick={() => setSelectedReceivedGift(gift)}><Gift size={15} /><span>Відкрити</span></button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      {(!isInGame || activeTab === 'friends') && <div className="friends-subsection">
        {!isInGame && <h3>Мої друзі <span>{friends.length}</span></h3>}
        {loadingLists ? <p className="social-empty">Завантажуємо список друзів...</p> : friends.length === 0 ? (
          isInGame
            ? <div className="game-friends-empty"><Users size={27} /><strong>Тут будуть твої друзі</strong><span>Знайди гравців і запроси їх до свого кола.</span><button type="button" onClick={() => setActiveTab('search')}><Search size={15} />Знайти друзів</button></div>
            : <p className="social-empty">Додай гравців, щоб навідуватися на їхні ферми.</p>
        ) : (
          <div className="social-list friends-grid">
            {friends.map((friend) => (
              <div className="social-player-row" key={friend.id}>
                <PlayerIdentity player={friend} hideId={isInGame} />
                {friendToRemoveId === friend.id ? (
                  <div className="remove-friend-confirm" aria-label={`Підтвердити видалення ${friend.username}`}>
                    <span className="remove-friend-prompt">Видалити?</span>
                    <button className="social-text-action reject-button" type="button" onClick={() => void runPlayerAction(friend, 'remove')} disabled={busyPlayerId === friend.id}>Так</button>
                    <button className="social-text-action" type="button" onClick={() => setFriendToRemoveId(null)}>Ні</button>
                  </div>
                ) : (
                  <div className="friend-row-actions">
                    {isInGame && (() => {
                      const remaining = formatGiftCooldown(giftCooldowns[friend.id], giftClock);
                      return <button className={`friend-gift-button${remaining ? ' is-cooling' : ''}`} type="button" aria-disabled={Boolean(remaining)} onClick={() => setSelectedGiftFriend(friend)} aria-label={remaining ? `Подарувати ${friend.username}. Доступно через ${remaining}` : `Подарувати ${friend.username}`} title={remaining ? `Наступний подарунок через ${remaining}` : `Подарувати ${friend.username}`}><Gift size={16} />{remaining && <span>{formatCompactGiftCooldown(giftCooldowns[friend.id], giftClock)}</span>}</button>;
                    })()}
                    <button className="friend-visit-button" type="button" onClick={() => void openFriendFarm(friend)} disabled={openingFriend} aria-label={`Відвідати ферму ${friend.username}`}><House size={16} /><span>В гості</span></button>
                    <div className="friend-menu-wrap">
                      <button className="friend-menu-button" type="button" onClick={() => setOpenFriendMenuId((openId) => openId === friend.id ? null : friend.id)} aria-expanded={openFriendMenuId === friend.id} aria-label={`Дії для друга ${friend.username}`} title="Інші дії"><MoreVertical size={18} /></button>
                      {openFriendMenuId === friend.id && (
                        <div className="friend-action-menu">
                          <button type="button" onClick={() => { setFriendToRemoveId(friend.id); setOpenFriendMenuId(null); }}><UserRoundMinus size={15} /><span>Видалити друга</span></button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>}

      {openingFriend && <div className="friend-loading" role="status">Відкриваємо профіль і ферму...</div>}

      {selectedGiftFriend && (
        <GiftShopModal
          friend={selectedGiftFriend}
          items={giftProducts}
          cooldownUntil={giftCooldowns[selectedGiftFriend.id]}
          sendingItemId={sendingGiftItemId}
          onClose={() => setSelectedGiftFriend(null)}
          onSend={(item) => void sendGift(item)}
        />
      )}

      {selectedReceivedGift && (
        <ReceivedGiftModal
          gift={selectedReceivedGift}
          busy={busyGiftId === selectedReceivedGift.id}
          onClose={() => setSelectedReceivedGift(null)}
          onAccept={() => void respondToGift(selectedReceivedGift, true)}
          onReject={() => void respondToGift(selectedReceivedGift, false)}
        />
      )}

      {giftToast && createPortal(
        <div className={`gift-feedback-toast is-${giftToast.kind}`} role={giftToast.kind === 'error' ? 'alert' : 'status'}>
          <span className="gift-feedback-icon">{giftToast.kind === 'success' ? <Check size={19} /> : <X size={19} />}</span>
          <span><strong>{giftToast.title}</strong><small>{giftToast.message}</small></span>
          <button type="button" onClick={() => setGiftToast(null)} aria-label="Закрити повідомлення"><X size={15} /></button>
        </div>,
        document.querySelector('.app-shell') ?? document.body
      )}

      {selectedFarm && createPortal(
        <div className={`friend-farm-overlay${isInGame ? ' game-friend-farm-overlay' : ''}`}>
          <FarmCanvas readOnly previewTiles={displayedTiles} farmSize={selectedFarm.size} />
          <div className="friend-farm-toolbar">
            <button className="friend-back-button" type="button" onClick={() => setSelectedFarm(null)} aria-label="Повернутися до профілю" title="Повернутися до профілю"><ArrowLeft size={20} /></button>
            <div className="friend-farm-player">
              <div className="friend-farm-identity">
                {selectedFarm.profile.avatar ? <img src={selectedFarm.profile.avatar} alt="" /> : <span>{selectedFarm.profile.username.slice(0, 1).toUpperCase()}</span>}
                <div className="friend-farm-identity-copy">
                  <strong>{selectedFarm.profile.username}</strong>
                  <button className="friend-id-copy" type="button" onClick={() => void copyFriendId(selectedFarm.profile.id)} aria-label={copiedFriendId === selectedFarm.profile.id ? 'ID скопійовано' : 'Скопіювати ID друга'} title="Скопіювати повний ID">
                    <small>ID: {shortenPlayerId(selectedFarm.profile.id)}</small>
                    {copiedFriendId === selectedFarm.profile.id ? <ClipboardCheck size={13} /> : <Copy size={13} />}
                  </button>
                </div>
              </div>
              <div className="friend-farm-stats">
                <div className="friend-level-medallion">
                  <img src="/assets/ui/lvl_ico.png" alt="" />
                  <strong>{getLevelProgress(selectedFarm.profile.xp).level}</strong>
                </div>
                <span className="friend-total-xp">{selectedFarm.profile.xp.toLocaleString('uk-UA')} XP</span>
              </div>
            </div>
          </div>
          <div className="friend-farm-contents-control">
            {showFarmContents && (
              <aside className="friend-farm-inventory">
                <h2>На фермі</h2>
                {placedItems.length === 0 ? <p>Ділянка поки порожня.</p> : (
                  <ul>
                    {[...plantedSummary.entries()].map(([name, count]) => <li key={name}><span>{name}</span><strong>×{count}</strong></li>)}
                  </ul>
                )}
              </aside>
            )}
            <button className="friend-contents-toggle" type="button" onClick={() => setShowFarmContents((visible) => !visible)} aria-expanded={showFarmContents} aria-label={showFarmContents ? 'Згорнути інформацію про ферму' : 'Показати що є на фермі'} title={showFarmContents ? 'Згорнути інформацію про ферму' : 'Показати що є на фермі'}>
              {showFarmContents ? <ChevronDown size={19} /> : <ChevronUp size={19} />}
            </button>
          </div>
        </div>,
        document.querySelector('.app-shell') ?? document.body
      )}
    </section>
  );
};

const PlayerIdentity: React.FC<{ player: SocialPlayer; hideId?: boolean }> = ({ player, hideId = false }) => (
  <div className="social-player-identity">
    <div className={`social-avatar${player.isOnline ? ' is-online' : ''}`} title={formatLastOnline(player)}>
      {player.avatar ? <img src={player.avatar} alt="" /> : <span>{player.username.slice(0, 1).toUpperCase()}</span>}
    </div>
    <div className="social-player-copy">
      <strong>{player.username}</strong>
      <small className={`social-last-online${player.isOnline ? ' is-online' : ''}`}><span className="social-presence-dot" aria-hidden="true" />{formatLastOnline(player)}</small>
      {!hideId && <small>ID: {player.id}</small>}
    </div>
    <span className="social-player-level" aria-label={`Рівень ${getLevelProgress(player.xp).level}`}>
      <img src="/assets/ui/lvl_ico.png" alt="" />
      <strong>{getLevelProgress(player.xp).level}</strong>
    </span>
  </div>
);
