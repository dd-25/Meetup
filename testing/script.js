let socket;
let device;
let producerTransport;
let consumerTransport;
let localStream;
let roomId, userId, teamId;

async function start() {
  roomId = document.getElementById('roomId').value;
  userId = document.getElementById('userId').value;
  teamId = document.getElementById('teamId').value;

  socket = io('http://localhost:5000'); // Change if backend is hosted elsewhere

  socket.on('connect', async () => {
    console.log('Connected to backend');

    socket.emit('join-room', { roomId, userId, teamId });

    socket.on('joined', async ({ clientId }) => {
      console.log('Joined room as:', clientId);
      await loadDevice();
      await sendMedia();
    });

    socket.on('new-producer', async ({ producerId }) => {
      console.log('New producer:', producerId);
      await consume(producerId);
    });

    socket.on('producer-list', async (producers) => {
      for (const pid of producers) {
        await consume(pid);
      }
    });
  });
}

async function loadDevice() {
  const rtpCapabilities = await socketRequest('get-rtp-capabilities');
  device = new mediasoupClient.Device();
  await device.load({ routerRtpCapabilities: rtpCapabilities });
}

async function sendMedia() {
  localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
  document.getElementById('localVideo').srcObject = localStream;

  // 1. Create send transport
  await socketRequest('create-send-transport');

  socket.once('parameters', async (params) => {
    producerTransport = device.createSendTransport(params);

    producerTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
      socket.emit('connect-send-transport', { transportId: producerTransport.id, dtlsParameters });
      socket.once('send-transport-connected', callback);
    });

    producerTransport.on('produce', async ({ kind, rtpParameters }, callback) => {
      socket.emit('produce', {
        transportId: producerTransport.id,
        kind,
        rtpParameters,
      });

      socket.once('produced', ({ producerId }) => {
        callback({ id: producerId });
      });
    });

    for (const track of localStream.getTracks()) {
      await producerTransport.produce({ track });
    }
  });
}

async function consume(producerId) {
  // 1. Create receive transport
  await socketRequest('create-recv-transport');

  socket.once('recv-transport-created', async (params) => {
    consumerTransport = device.createRecvTransport(params);

    consumerTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
      socket.emit('connect-recv-transport', {
        transportId: consumerTransport.id,
        dtlsParameters
      });
      socket.once('connected', callback);
    });

    const { rtpCapabilities } = device;
    socket.emit('consume', {
      transportId: consumerTransport.id,
      producerId,
      rtpCapabilities
    });

    socket.once('consumed', async ({ id, kind, rtpParameters }) => {
      const consumer = await consumerTransport.consume({
        id,
        producerId,
        kind,
        rtpParameters,
      });

      const stream = new MediaStream([consumer.track]);
      const video = document.createElement('video');
      video.autoplay = true;
      video.playsInline = true;
      video.srcObject = stream;

      document.getElementById('remoteVideos').appendChild(video);
      await socketRequest('resume-consumer', { consumerId: id });
    });
  });
}

function socketRequest(event, data = {}) {
  return new Promise((resolve) => {
    socket.emit(event, data);
    socket.once(event, resolve);
  });
}
