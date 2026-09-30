import mongoose from 'mongoose';

export const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI);
        console.log(`✅ MongoDB Підключено: ${conn.connection.host}`);
    } catch (error) {
        console.error(`❌ Помилка підключення до MongoDB: ${error.message}`);
        process.exit(1);
    }
};