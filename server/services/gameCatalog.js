import GameItemPrice from '../models/GameItemPrice.js';
import { GAME_ITEMS, listGameItems as listBaseGameItems } from '../config/gameItems/index.js';

const priceOverrides = new Map();

export const loadGameItemPriceOverrides = async () => {
    const records = await GameItemPrice.find({}).lean();
    priceOverrides.clear();
    for (const record of records) {
        priceOverrides.set(record.itemId, {
            ...(Number.isSafeInteger(record.price) ? { price: record.price } : {}),
            ...(Number.isSafeInteger(record.sellPrice) ? { sellPrice: record.sellPrice } : {}),
        });
    }
};

export const getGameItem = (itemId) => {
    const item = GAME_ITEMS[itemId];
    if (!item) return null;
    const override = priceOverrides.get(itemId);
    return override ? { ...item, ...override } : item;
};

export const listGameItems = () => listBaseGameItems().map((item) => getGameItem(item.id));

export const updateGameItemPrices = async (itemId, updates) => {
    const item = GAME_ITEMS[itemId];
    if (!item) return null;

    const current = priceOverrides.get(itemId) ?? {};
    const next = { ...current, ...updates };
    const record = await GameItemPrice.findOneAndUpdate(
        { itemId },
        { $set: { itemId, ...next } },
        { new: true, upsert: true, runValidators: true }
    ).lean();

    priceOverrides.set(itemId, {
        ...(Number.isSafeInteger(record.price) ? { price: record.price } : {}),
        ...(Number.isSafeInteger(record.sellPrice) ? { sellPrice: record.sellPrice } : {}),
    });
    return getGameItem(itemId);
};
