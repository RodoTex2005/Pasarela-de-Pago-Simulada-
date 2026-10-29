
const { createClient } = require('redis');
const { randomUUID } = require('node:crypto');

const RESULT_TTL_SECONDS = 24 * 60 * 60;
const LOCK_TTL_SECONDS = 120;

let client;
let connectionPromise;

async function getRedisClient() {
  if (client?.isReady) {
    return client;
  }

  if (connectionPromise) {
    return connectionPromise;
  }

  connectionPromise = (async () => {
    const url = process.env.REDIS_URL;

    if (!url) {
      throw new Error('No se configuró REDIS_URL');
    }

    const redisClient = createClient({
      url,
      socket: {
        connectTimeout: 5000,
        reconnectStrategy: false
      }
    });

    redisClient.on('error', (error) => {
      console.error('[Redis] Error:', error.message);
    });

    await redisClient.connect();

    client = redisClient;
    console.log('[Redis] Conectado para idempotencia');

    return client;
  })();

  try {
    return await connectionPromise;
  } finally {
    connectionPromise = undefined;
  }
}

function resultKey(orderId) {
  return `payment:result:${orderId}`;
}

function lockKey(orderId) {
  return `payment:lock:${orderId}`;
}

async function getCachedResult(orderId) {
  const redis = await getRedisClient();
  const cached = await redis.get(resultKey(orderId));

  return cached ? JSON.parse(cached) : null;
}

async function acquirePaymentLock(orderId) {
  const redis = await getRedisClient();
  const token = randomUUID();

  const acquired = await redis.set(
    lockKey(orderId),
    token,
    {
      NX: true,
      EX: LOCK_TTL_SECONDS
    }
  );

  return acquired === 'OK' ? token : null;
}

async function saveCachedResult(orderId, token, result) {
  const redis = await getRedisClient();

  const script = `
    if redis.call('GET', KEYS[1]) == ARGV[1] then
      redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[3])
      redis.call('DEL', KEYS[1])
      return 1
    end
    return 0
  `;

  const saved = await redis.eval(script, {
    keys: [lockKey(orderId), resultKey(orderId)],
    arguments: [
      token,
      JSON.stringify(result),
      String(RESULT_TTL_SECONDS)
    ]
  });

  if (saved !== 1) {
    throw new Error(
      'No se pudo confirmar la idempotencia del pago en Redis'
    );
  }
}

async function releasePaymentLock(orderId, token) {
  const redis = await getRedisClient();

  const script = `
    if redis.call('GET', KEYS[1]) == ARGV[1] then
      return redis.call('DEL', KEYS[1])
    end
    return 0
  `;

  await redis.eval(script, {
    keys: [lockKey(orderId)],
    arguments: [token]
  });
}

async function closeRedisConnection() {
  if (client) {
    const oldClient = client;
    client = undefined;
    await oldClient.quit().catch(() => {});
  }
}

module.exports = {
  getCachedResult,
  acquirePaymentLock,
  saveCachedResult,
  releasePaymentLock,
  closeRedisConnection
};
