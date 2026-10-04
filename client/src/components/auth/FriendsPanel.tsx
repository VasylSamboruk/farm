import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { ArrowLeft, Check, ChevronDown, ChevronUp, ClipboardCheck, Copy, House, MoreVertical, Search, UserRoundMinus, UserRoundPlus, X } from 'lucide-react';
import { getLevelProgress } from '../../config/progression';
import { socialApi, type FriendFarm, type SocialPlayer } from '../../api/social.api';
import { loadGameImage, preloadGameImages } from '../../game/sprites';
import { useGameConfigStore } from '../../store/useGameConfigStore';
import type { TileData } from '../../store/useFarmStore';
import { FarmCanvas } from '../game/FarmCanvas';

const loadSocialLists = async () => Promise.all([socialApi.getFriends(), socialApi.getRequests()]);
const shortenPlayerId = (id: string) => id.length > 15 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;

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
    };
  }
  return tileMap;
};

export const FriendsPanel: React.FC = () => {
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

  useEffect(() => {
    let active = true;
    loadSocialLists()
      .then(([loadedFriends, loadedRequests]) => {
        if (!active) return;
        setFriends(loadedFriends);
        setRequests(loadedRequests);
      })
      .catch((error: unknown) => {
        if (active) setNotice(getErrorMessage(error));
      })
      .finally(() => {
        if (active) setLoadingLists(false);
      });
    return () => { active = false; };
  }, []);

  const refreshLists = async () => {
    const [loadedFriends, loadedRequests] = await loadSocialLists();
    setFriends(loadedFriends);
    setRequests(loadedRequests);
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
    <section className="friends-section" aria-labelledby="friends-heading">
      <div className="friends-heading-row">
        <div>
          <p className="player-label">ГОСПОДАРСТВО ПОРУЧ</p>
          <h2 id="friends-heading">Друзі</h2>
        </div>
        <span className="friends-count">{friends.length}</span>
      </div>

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
          <span>{searching ? 'Шукаємо...' : 'Додати друга'}</span>
        </button>
      </form>

      {notice && <p className="social-notice" role="status">{notice}</p>}

      {searchResults.length > 0 && (
        <div className="social-list search-results" aria-label="Результати пошуку">
          {searchResults.map((player) => (
            <div className="social-player-row" key={player.id}>
              <PlayerIdentity player={player} />
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
      {!searching && searchQuery.trim().length >= 2 && searchResults.length === 0 && <p className="social-empty">Гравців не знайдено.</p>}

      {requests.length > 0 && (
        <div className="friends-subsection">
          <h3>Запити в друзі <span>{requests.length}</span></h3>
          <div className="social-list">
            {requests.map((player) => (
              <div className="social-player-row" key={player.id}>
                <PlayerIdentity player={player} />
                <button className="social-icon-button accept-button" type="button" onClick={() => void runPlayerAction(player, 'accept')} disabled={busyPlayerId === player.id} aria-label={`Прийняти запит від ${player.username}`} title="Прийняти"><Check size={17} /></button>
                <button className="social-icon-button reject-button" type="button" onClick={() => void runPlayerAction(player, 'decline')} disabled={busyPlayerId === player.id} aria-label={`Відхилити запит від ${player.username}`} title="Відхилити"><X size={17} /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="friends-subsection">
        <h3>Мої друзі <span>{friends.length}</span></h3>
        {loadingLists ? <p className="social-empty">Завантажуємо список друзів...</p> : friends.length === 0 ? (
          <p className="social-empty">Додай гравців, щоб навідуватися на їхні ферми.</p>
        ) : (
          <div className="social-list friends-grid">
            {friends.map((friend) => (
              <div className="social-player-row" key={friend.id}>
                <PlayerIdentity player={friend} />
                {friendToRemoveId === friend.id ? (
                  <div className="remove-friend-confirm" aria-label={`Підтвердити видалення ${friend.username}`}>
                    <span className="remove-friend-prompt">Видалити?</span>
                    <button className="social-text-action reject-button" type="button" onClick={() => void runPlayerAction(friend, 'remove')} disabled={busyPlayerId === friend.id}>Так</button>
                    <button className="social-text-action" type="button" onClick={() => setFriendToRemoveId(null)}>Ні</button>
                  </div>
                ) : (
                  <div className="friend-row-actions">
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
      </div>

      {openingFriend && <div className="friend-loading" role="status">Відкриваємо профіль і ферму...</div>}

      {selectedFarm && createPortal(
        <div className="friend-farm-overlay">
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

const PlayerIdentity: React.FC<{ player: SocialPlayer }> = ({ player }) => (
  <div className="social-player-identity">
    <div className="social-avatar">
      {player.avatar ? <img src={player.avatar} alt="" /> : <span>{player.username.slice(0, 1).toUpperCase()}</span>}
    </div>
    <div className="social-player-copy">
      <strong>{player.username}</strong>
      <small>ID: {player.id}</small>
    </div>
    <span className="social-player-level" aria-label={`Рівень ${getLevelProgress(player.xp).level}`}>
      <img src="/assets/ui/lvl_ico.png" alt="" />
      <strong>{getLevelProgress(player.xp).level}</strong>
    </span>
  </div>
);
