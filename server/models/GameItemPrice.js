import mongoose from 'mongoose';

const gameItemPriceSchema = new mongoose.Schema({
    itemId: { type: String, required: true, unique: true },
    price: { type: Number, min: 0 },
    sellPrice: { type: Number, min: 0 },
    config: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

export default mongoose.model('GameItemPrice', gameItemPriceSchema);
