import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB } from './config/db.js';
import authRoutes from './routes/auth.js'; 
import farmRoutes from './routes/farm.js'; // ДОДАНО: імпорт маршрутів ферми
import gameConfigRoutes from './routes/gameConfig.js';
import socialRoutes from './routes/social.js';
import adminRoutes from './routes/admin.js';
import { loadGameItemPriceOverrides, restorePermanentlyDeletedGameItem } from './services/gameCatalog.js';

dotenv.config();

const app = express();
const clientOrigins = (process.env.CLIENT_ORIGINS ?? '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

app.use(cors({
    origin(origin, callback) {
        if (!origin || process.env.NODE_ENV !== 'production' || clientOrigins.includes(origin)) {
            return callback(null, true);
        }
        return callback(new Error('Origin is not allowed by CORS'));
    }
}));
app.use(express.json({ limit: '256kb' }));

app.use('/api/auth', authRoutes); 
app.use('/api/farm', farmRoutes); // ДОДАНО: підключення маршрутів ферми
app.use('/api/game-config', gameConfigRoutes);
app.use('/api/social', socialRoutes);
app.use('/api/admin', adminRoutes);

app.get('/', (req, res) => {
    res.send('API Ферми працює! 🚜');
});

app.get('/health', (_req, res) => {
    res.status(200).json({ ok: true });
});

const PORT = process.env.PORT || 5000;

const startServer = async () => {
    await connectDB();
    await loadGameItemPriceOverrides();
    const restoredMill = await restorePermanentlyDeletedGameItem('mill');
    if (restoredMill) console.info('Стандартний млин відновлено в каталозі гри.');
    app.listen(PORT, () => {
        console.log(`🚀 Сервер запущено на порту ${PORT}`);
    });
};

startServer().catch(error => {
    console.error('❌ Не вдалося запустити сервер:', error.message);
    process.exit(1);
});