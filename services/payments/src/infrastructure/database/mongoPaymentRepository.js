
const { MongoClient } = require('mongodb');

let client;
let paymentsCollection;

async function connectToDatabase() {
  if (paymentsCollection) {
    return paymentsCollection;
  }

  const uri = process.env.PAYMENTS_DB_URL;

  if (!uri) {
    throw new Error('No se configuró PAYMENTS_DB_URL');
  }

  client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 5000
  });

  try {
    await client.connect();

    const database = client.db();
    paymentsCollection = database.collection('payments');

    await paymentsCollection.createIndex(
      { orderId: 1 },
      { unique: true }
    );

    return paymentsCollection;
  } catch (error) {
    await client.close().catch(() => {});
    client = undefined;
    paymentsCollection = undefined;
    throw error;
  }
}

async function savePayment(payment) {
  const collection = await connectToDatabase();

  // Nunca guardar el número completo de la tarjeta.
  const { cardNumber, ...safePayment } = payment;

  const document = {
    ...safePayment,
    cardLast4: cardNumber ? cardNumber.slice(-4) : undefined
  };

  await collection.insertOne(document);

  return document;
}

async function closeDatabaseConnection() {
  if (client) {
    await client.close();
  }

  client = undefined;
  paymentsCollection = undefined;
}

module.exports = {
  savePayment,
  closeDatabaseConnection
};
