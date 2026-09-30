import express from 'express';
import { listGameItems } from '../services/gameCatalog.js';

const router = express.Router();

router.get('/', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(listGameItems().map(item => ({
        ...item,
        requiredLevel: item.requiredLevel ?? 1,
        sortOrder: item.sortOrder,
    })));
});

export default router;