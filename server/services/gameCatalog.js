import GameItemPrice from '../models/GameItemPrice.js';
import { GAME_ITEMS, listGameItems as listBaseGameItems } from '../config/gameItems/index.js';

const priceOverrides = new Map();

export const loadGameItemPriceOverrides = async () => {
    const records = await GameItemPrice.find({}).lean();
    priceOverrides.clear();
    for (const record of records) {
        priceOverrides.set(record.itemId, {
            ...(record.config && typeof record.config === 'object' ? record.config : {}),
            ...(Number.isSafeInteger(record.price) ? { price: record.price } : {}),
            ...(Number.isSafeInteger(record.sellPrice) ? { sellPrice: record.sellPrice } : {}),
        });
    }
};

export const getGameItem = (itemId) => {
    const item = GAME_ITEMS[itemId];
    const override = priceOverrides.get(itemId);
    if (!item) return override?.custom ? { ...override } : null;
    return override ? { ...item, ...override } : item;
};

export const listGameItems = () => {
    const items = [
        ...listBaseGameItems().map((item) => getGameItem(item.id)),
        ...Array.from(priceOverrides.entries())
            .filter(([itemId, config]) => !GAME_ITEMS[itemId] && config.custom)
            .map(([, config]) => ({ ...config })),
    ];
    const nextDefaultPositionByType = new Map();

    return items
        .map((item) => {
            const fallbackPosition = (nextDefaultPositionByType.get(item.type) ?? 0) + 1;
            nextDefaultPositionByType.set(item.type, fallbackPosition);
            return {
                ...item,
                sortOrder: Number.isSafeInteger(item.sortOrder) ? item.sortOrder : fallbackPosition,
            };
        });
};

export const createGameItem = async (item) => {
    if (!item?.id || GAME_ITEMS[item.id] || priceOverrides.has(item.id)) return null;

    const record = await GameItemPrice.create({
        itemId: item.id,
        config: item,
        price: item.price,
        ...(Number.isSafeInteger(item.sellPrice) ? { sellPrice: item.sellPrice } : {}),
    });
    priceOverrides.set(item.id, {
        ...(record.config && typeof record.config === 'object' ? record.config : {}),
        ...(Number.isSafeInteger(record.price) ? { price: record.price } : {}),
        ...(Number.isSafeInteger(record.sellPrice) ? { sellPrice: record.sellPrice } : {}),
    });
    return getGameItem(item.id);
};

export const updateGameItemPrices = async (itemId, updates) => {
    const item = getGameItem(itemId);
    if (!item) return null;

    const current = priceOverrides.get(itemId) ?? {};
    const next = { ...current, ...updates };
    const record = await GameItemPrice.findOneAndUpdate(
        { itemId },
        { $set: { itemId, ...next } },
        { new: true, upsert: true, runValidators: true }
    ).lean();

    priceOverrides.set(itemId, {
        ...(record.config && typeof record.config === 'object' ? record.config : {}),
        ...(Number.isSafeInteger(record.price) ? { price: record.price } : {}),
        ...(Number.isSafeInteger(record.sellPrice) ? { sellPrice: record.sellPrice } : {}),
    });
    return getGameItem(itemId);
};

export const updateGameItemConfig = async (itemId, updates) => {
    const item = getGameItem(itemId);
    if (!item) return null;

    const current = priceOverrides.get(itemId) ?? {};
    const next = { ...current, ...updates };
    const indexedPrices = {
        ...(Number.isSafeInteger(next.price) ? { price: next.price } : {}),
        ...(Number.isSafeInteger(next.sellPrice) ? { sellPrice: next.sellPrice } : {}),
    };
    const record = await GameItemPrice.findOneAndUpdate(
        { itemId },
        { $set: { itemId, config: next, ...indexedPrices } },
        { new: true, upsert: true, runValidators: true }
    ).lean();

    priceOverrides.set(itemId, {
        ...(record.config && typeof record.config === 'object' ? record.config : {}),
        ...(Number.isSafeInteger(record.price) ? { price: record.price } : {}),
        ...(Number.isSafeInteger(record.sellPrice) ? { sellPrice: record.sellPrice } : {}),
    });
    return getGameItem(itemId);
};

export const reorderGameItem = async (itemId, requestedPosition) => {
    const item = getGameItem(itemId);
    if (!item || !Number.isSafeInteger(requestedPosition) || requestedPosition < 1) return null;
    const items = listGameItems()
        .filter((entry) => entry.type === item.type)
        .sort((left, right) => left.sortOrder - right.sortOrder);
    const sourceIndex = items.findIndex((entry) => entry.id === itemId);
    if (sourceIndex < 0) return null;

    const destinationIndex = Math.min(requestedPosition - 1, items.length - 1);
    if (sourceIndex === destinationIndex) return getGameItem(itemId);

    const [movedItem] = items.splice(sourceIndex, 1);
    items.splice(destinationIndex, 0, movedItem);
    const firstChangedIndex = Math.min(sourceIndex, destinationIndex);
    const lastChangedIndex = Math.max(sourceIndex, destinationIndex);
    const changedItems = items.slice(firstChangedIndex, lastChangedIndex + 1);

    await Promise.all(changedItems.map((item, offset) =>
        updateGameItemConfig(item.id, { sortOrder: firstChangedIndex + offset + 1 })
    ));

    return getGameItem(itemId);
};
