import express from 'express';
import { listGameItems } from '../services/gameCatalog.js';
import { getLevelIcons, getMediaSettings, resolveGameItemImages } from '../services/mediaStorage.js';

const router = express.Router();

router.get('/', async (_req, res, next) => {
    try {
        const settings = await getMediaSettings();
    res.set('Cache-Control', 'no-store');
    res.json(listGameItems().map(item => ({
        ...resolveGameItemImages(item, settings),
        requiredLevel: item.requiredLevel ?? 1,
        sortOrder: item.sortOrder,
    })));
    } catch (error) {
        next(error);
    }
});

router.get('/level-icons', async (_req, res, next) => {
    try {
        res.set('Cache-Control', 'no-store');
        return res.json({ levelIcons: await getLevelIcons() });
    } catch (error) {
        return next(error);
    }
});

export default router;