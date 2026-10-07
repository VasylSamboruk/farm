import mongoose from 'mongoose';

const giftShopItemSchema = new mongoose.Schema({
    itemId: { type: String, required: true, unique: true },
    price: { type: Number, required: true, min: 0, max: 1_000_000_000 },
    priceCurrency: { type: String, enum: ['coins', 'rubies'], default: 'coins' },
    enabled: { type: Boolean, default: true },
}, { timestamps: true });

export default mongoose.model('GiftShopItem', giftShopItemSchema);
