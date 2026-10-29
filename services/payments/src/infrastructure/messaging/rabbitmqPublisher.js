
const amqp = require('amqplib');

const QUEUE_NAME = 'payment.events';

let connection;
let channel;
let connectionPromise;

async function connectToRabbitMQ() {
  if (channel) {
    return channel;
  }

  if (connectionPromise) {
    return connectionPromise;
  }

  connectionPromise = (async () => {
    const brokerUrl = process.env.BROKER_URL;

    if (!brokerUrl) {
      throw new Error('No se configuró BROKER_URL');
    }

    const newConnection = await amqp.connect(brokerUrl);

    try {
      const newChannel = await newConnection.createConfirmChannel();

      await newChannel.assertQueue(QUEUE_NAME, {
        durable: true
      });

      newConnection.on('error', (error) => {
        console.error('[RabbitMQ] Error de conexión:', error.message);
      });

      newConnection.on('close', () => {
        if (connection === newConnection) {
          connection = undefined;
          channel = undefined;
        }
      });

      connection = newConnection;
      channel = newChannel;

      console.log(`[RabbitMQ] Conectado. Cola: ${QUEUE_NAME}`);

      return channel;
    } catch (error) {
      await newConnection.close().catch(() => {});
      throw error;
    }
  })();

  try {
    return await connectionPromise;
  } finally {
    connectionPromise = undefined;
  }
}

async function publishPaymentEvent(paymentResult) {
  const currentChannel = await connectToRabbitMQ();

  const event = {
    eventId: `${paymentResult.payment.orderId}:${paymentResult.payment.status}`,
    eventType: paymentResult.approved
      ? 'payment.approved'
      : 'payment.rejected',
    occurredAt: new Date().toISOString(),
    data: paymentResult.payment
  };

  currentChannel.sendToQueue(
    QUEUE_NAME,
    Buffer.from(JSON.stringify(event)),
    {
      persistent: true,
      contentType: 'application/json',
      messageId: event.eventId,
      type: event.eventType
    }
  );

  await currentChannel.waitForConfirms();

  console.log(`[RabbitMQ] Evento publicado: ${event.eventType}`);

  return event;
}

async function closeRabbitMQ() {
  const oldChannel = channel;
  const oldConnection = connection;

  channel = undefined;
  connection = undefined;

  if (oldChannel) {
    await oldChannel.close().catch(() => {});
  }

  if (oldConnection) {
    await oldConnection.close().catch(() => {});
  }
}

module.exports = {
  publishPaymentEvent,
  closeRabbitMQ
};
