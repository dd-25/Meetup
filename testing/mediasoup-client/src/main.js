import * as mediasoupClient from 'mediasoup-client';
import { io } from 'socket.io-client';

let socket, device;
let localStream, producerTransport, videoProducer;
let consumerTransport;
let roomId, userId;

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');

const BASE_URL = 'http://localhost:5000';

async function joinRoom() {
  roomId = document.getElementById('roomId').value;
  userId = document.getElementById('userId').value;

  socket = io(BASE_URL, {
    transports: ['websocket'],
  });

  socket.on('connect', async () => {
    console.log('Connected to signaling server');

    // Join room on server
    socket.emit('join-room', { roomId, userId });

    // Load RTP capabilities
    const res = await fetch(`${BASE_URL}/api/mediasoup/rtp-capabilities?roomId=${roomId}`);
    if (!res.ok) {
      const errText = await res.text();
      throw new Error('Failed to fetch RTP capabilities: ' + errText);
    }
    const routerRtpCapabilities = await res.json();

    device = new mediasoupClient.Device();
    await device.load({ routerRtpCapabilities });

    // Get user media
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;

    // === Create Producer Transport ===
    const producerTransportOptions = await fetch(`${BASE_URL}/api/mediasoup/create-transport?roomId=${roomId}`)
      .then(res => res.json());

    producerTransport = device.createSendTransport(producerTransportOptions);

    producerTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
      fetch(`${BASE_URL}/api/mediasoup/connect-transport`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, transportId: producerTransport.id, dtlsParameters }),
      }).then(callback).catch(errback);
    });

    producerTransport.on('produce', async ({ kind, rtpParameters }, callback, errback) => {
      const res = await fetch(`${BASE_URL}/api/mediasoup/produce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, transportId: producerTransport.id, kind, rtpParameters }),
      });
      const data = await res.json();
      callback({ id: data.id });

      // Notify server of new producer
      socket.emit('producer-ready', data.id);
    });

    const videoTrack = localStream.getVideoTracks()[0];
    videoProducer = await producerTransport.produce({ track: videoTrack });

    // === Create Consumer Transport ===
    const consumerTransportOptions = await fetch(`${BASE_URL}/api/mediasoup/create-transport?roomId=${roomId}`)
      .then(res => res.json());

    consumerTransport = device.createRecvTransport(consumerTransportOptions);

    consumerTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
      fetch(`${BASE_URL}/api/mediasoup/connect-transport`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, transportId: consumerTransport.id, dtlsParameters }),
      }).then(callback).catch(errback);
    });

    // === Ask for existing producers ===
    socket.emit('get-producers', { roomId });
  });

  // === Handle existing producers when joining ===
  socket.on('producers-list', async (producers) => {
    for (const producerId of producers) {
      await consumeRemote(producerId);
    }
  });

  // === Handle new producers after join ===
  socket.on('new-producer', async (producerId) => {
    await consumeRemote(producerId);
  });
}

async function consumeRemote(producerId) {
  if (!consumerTransport) return;

  const res = await fetch(`${BASE_URL}/api/mediasoup/consume`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      roomId,
      transportId: consumerTransport.id,
      producerId,
      rtpCapabilities: device.rtpCapabilities,
    }),
  });

  const { id, kind, rtpParameters } = await res.json();

  const consumer = await consumerTransport.consume({
    id,
    producerId,
    kind,
    rtpParameters,
  });

  const remoteStream = new MediaStream([consumer.track]);
  remoteVideo.srcObject = remoteStream;
}

function leaveRoom() {
  if (producerTransport) producerTransport.close();
  if (consumerTransport) consumerTransport.close();
  if (localStream) localStream.getTracks().forEach(track => track.stop());
  if (socket) socket.disconnect();

  localVideo.srcObject = null;
  remoteVideo.srcObject = null;

  console.log('Left room');
}

window.joinRoom = joinRoom;
window.leaveRoom = leaveRoom;
