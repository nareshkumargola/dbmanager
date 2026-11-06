// Encrypts connection passwords saved before encryption was added. Safe to run more than once.
// Run from backend/: node scripts/encrypt-connection-secrets.js
require('dotenv').config();
const mongoose = require('mongoose');
const connectAppDb = require('./connectAppDb');
const { encryptSecret, decryptSecret, isEncrypted } = require('../utils/connectionSecrets');

const FIELDS = ['password', 'connectionString'];

(async () => {
  await connectAppDb();
  const collection = mongoose.connection.db.collection('connections');
  const connections = await collection.find({}).toArray();
  let encrypted = 0;

  for (const connection of connections) {
    const changes = {};
    for (const field of FIELDS) {
      const value = connection[field];
      if (typeof value !== 'string' || value === '' || isEncrypted(value)) continue;
      const secret = encryptSecret(value);
      if (decryptSecret(secret) !== value) throw new Error(`Could not verify ${field} on connection ${connection._id}.`);
      changes[field] = secret;
    }
    if (Object.keys(changes).length > 0) {
      await collection.updateOne({ _id: connection._id }, { $set: changes });
      encrypted += Object.keys(changes).length;
    }
  }

  const afterwards = await collection.find({}).toArray();
  const plain = afterwards.flatMap((connection) => FIELDS.filter((field) => connection[field] && !isEncrypted(connection[field])));
  afterwards.forEach((connection) => FIELDS.forEach((field) => decryptSecret(connection[field])));
  console.log(`${connections.length} connections checked, ${encrypted} values encrypted, ${plain.length} left unencrypted.`);
  if (plain.length > 0) process.exitCode = 1;
})()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
