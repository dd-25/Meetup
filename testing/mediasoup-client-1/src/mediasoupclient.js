import * as mediasoupClient from 'mediasoup-client';

let device;
let socket;
let sendTransport;
let recvTransport;
const consumers = new Map();

export function initSocket(sock) {
  socket = sock;
  console.log('🧩 Socket initialized in mediasoupclient.js');
}

export async function joinRoom(roomId, userId, teamId) {
  return new Promise((resolve, reject) => {
    console.log(`📨 Sending join-room: room=${roomId}, user=${userId}, team=${teamId}`);
    socket.emit('join-room', { roomId, userId, teamId });

    socket.once('joined', (res) => {
      console.log('✅ Backend responded: joined room');
      resolve(res);
    });

    socket.once('error', (err) => {
      console.error('❌ join-room failed:', err);
      reject(err);
    });
  });
}

export async function createDevice() {
  return new Promise((resolve, reject) => {
    console.log('📡 Requesting RTP capabilities');
    socket.emit('get-rtp-capabilities');

    socket.once('get-rtp-capabilities', async (caps) => {
      try {
        device = new mediasoupClient.Device();
        await device.load({ routerRtpCapabilities: caps });
        console.log('📦 Device loaded with RTP caps');
        resolve();
      } catch (err) {
        console.error('❌ Device load failed', err);
        reject(err);
      }
    });

    socket.once('error', reject);
  });
}

export async function createSendTransport() {
  return new Promise((resolve, reject) => {
    console.log('🚧 Creating send transport');
    socket.emit('create-send-transport');

    socket.once('parameters', async (params) => {
      try {
        sendTransport = device.createSendTransport(params);

        sendTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
          console.log('🔗 Connecting send transport');
          socket.emit('connect-send-transport', {
            transportId: sendTransport.id,
            dtlsParameters,
          });
          socket.once('send-transport-connected', callback);
        });

        sendTransport.on('produce', ({ kind, rtpParameters }, callback) => {
          console.log(`📤 Producing ${kind}`);
          socket.emit('produce', {
            transportId: sendTransport.id,
            kind,
            rtpParameters,
          });

          socket.once('produced', ({ producerId }) => {
            console.log(`✅ Produced ${kind} with ID ${producerId}`);
            callback({ id: producerId });
          });
        });

        resolve();
      } catch (err) {
        console.error('❌ Send transport creation failed', err);
        reject(err);
      }
    });

    socket.once('error', reject);
  });
}

export async function createRecvTransport() {
  return new Promise((resolve, reject) => {
    console.log('🚧 Creating recv transport');
    socket.emit('create-recv-transport');

    socket.once('recv-transport-created', async (params) => {
      try {
        recvTransport = device.createRecvTransport(params);

        recvTransport.on('connect', ({ dtlsParameters }, callback) => {
          console.log('🔗 Connecting recv transport');
          socket.emit('connect-recv-transport', {
            transportId: recvTransport.id,
            dtlsParameters,
          });
          socket.once('connected', callback);
        });

        console.log('✅ Recv transport created');
        resolve();
      } catch (err) {
        console.error('❌ Recv transport creation failed', err);
        reject(err);
      }
    });

    socket.once('error', reject);
  });
}

export async function produceStream(kind, track) {
  if (!sendTransport) throw new Error('Send transport not ready');
  const producer = await sendTransport.produce({ track });
  console.log(`🎙️ Produced ${kind} stream: ${track.label}`);
  return producer;
}

export async function consumeStream(producerId) {
  if (!recvTransport) throw new Error('Recv transport not ready');
  if (consumers.has(producerId)) return consumers.get(producerId);
  console.log("yaha bhi pahuch gaya");

  return new Promise((resolve, reject) => {
    socket.emit('consume', {
      transportId: recvTransport.id,
      producerId,
      rtpCapabilities: device.rtpCapabilities,
    });

    // Listen for consumed data
    socket.once('consumed', async (params) => {
      try {
        if (!params || params.error) return reject(new Error(params?.error || 'Invalid consumer params'));

        const consumer = await recvTransport.consume(params);
        const stream = new MediaStream();
        stream.addTrack(consumer.track);
        consumers.set(producerId, stream);

        consumer.on('transportclose', () => consumers.delete(producerId));
        consumer.on('trackended', () => consumers.delete(producerId));

        console.log(`📥 Consumed stream from producer ${producerId}`);
        resolve(stream);
      } catch (err) {
        console.error(`❌ Failed to consume ${producerId}`, err);
        reject(err);
      }
    });

    // Error case
    socket.once('error', reject);
  });
}
