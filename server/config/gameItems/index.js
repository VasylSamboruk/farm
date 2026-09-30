import { animals } from './animals.js';
import { buildings } from './buildings.js';
import { crops } from './crops.js';
import { trees } from './trees.js';

const items = [...trees, ...crops, ...animals, ...buildings];

export const GAME_ITEMS = Object.fromEntries(items.map((item) => [item.id, item]));

export const listGameItems = () => items;

export const getGameItem = (itemId) => GAME_ITEMS[itemId] ?? null;
