const mongoose = require('mongoose');

module.exports = async function connectDB() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI manquant dans .env');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('MongoDB connecté');
};
