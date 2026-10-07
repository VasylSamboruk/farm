import mongoose from 'mongoose';

export const USER_STARTING_COINS = 1000;

const adminGiftSchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, default: '', trim: true, maxlength: 300 },
    items: {
        type: [{
            kind: { type: String, enum: ['item', 'coins', 'rubies', 'xp', 'level'], required: true },
            itemId: { type: String, default: '' },
            amount: { type: Number, min: 1, max: 100000, required: true },
        }],
        required: true,
        validate: (items) => items.length > 0 && items.length <= 20,
    },
    claimed: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
}, { _id: true });

const socialGiftSchema = new mongoose.Schema({
    senderId: { type: mongoose.Schema.Types.ObjectId, required: true },
    senderName: { type: String, required: true },
    senderAvatar: { type: String, default: '' },
    senderLevel: { type: Number, default: 1 },
    itemId: { type: String, required: true },
    itemName: { type: String, required: true },
    image: { type: String, default: '' },
    type: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    priceCurrency: { type: String, enum: ['coins', 'rubies'], required: true },
    sentAt: { type: Date, default: Date.now },
    status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
    resolvedAt: { type: Date, default: null },
}, { _id: true });

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, default: 'user' }, // 'user' або 'admin'
    isBanned: { type: Boolean, default: false },
    banUntil: { type: Date, default: null },
    banReason: { type: String, default: '' },
    bannedAt: { type: Date, default: null },
    bannedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    coins: { type: Number, default: USER_STARTING_COINS },
    rubies: { type: Number, default: 25 },
    xp: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
    lastSeenAt: { type: Date, default: null },
    inventory: { type: Map, of: Number, default: {} },
    itemInventory: { type: Map, of: Number, default: {} },
    claimedLevelRewards: { type: [Number], default: [] },
    adminGifts: { type: [adminGiftSchema], default: [] },
    pendingSocialGifts: { type: [socialGiftSchema], default: [] },
    socialGiftCooldowns: { type: Map, of: Date, default: {} },
    refundedSocialGiftIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    avatar: { type: String, default: '' },
    friends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    friendRequestsReceived: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    friendRequestsSent: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
}, { timestamps: true });

export default mongoose.model('User', userSchema);