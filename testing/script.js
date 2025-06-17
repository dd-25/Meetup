let socket, device;
let localStream, producerTransport, videoProducer;
let consumerTransport, videoConsumer;
let roomId, userId;

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');

async function joinRoom() {
  roomId = document.getElementById('roomId').value;
  userId = document.getElementById('userId').value;

  socket = io('http://localhost:5000', {
    transports: ['websocket'],
  });

  socket.on('connect', async () => {
    console.log('Connected to signaling server');

    // 1. Get RTP Capabilities
    const data = await fetch(`/mediasoup/rtp-capabilities`).then(res => res.json());

    // 2. Load Device
    device = new mediasoupClient.Device();
    await device.load({ routerRtpCapabilities: data });

    // 3. Create producer transport
    const transportOptions = await fetch(`/mediasoup/create-transport?roomId=${roomId}`).then(res => res.json());
    producerTransport = device.createSendTransport(transportOptions);

    producerTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
      fetch(`/mediasoup/connect-transport`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, transportId: producerTransport.id, dtlsParameters }),
      }).then(callback).catch(errback);
    });

    producerTransport.on('produce', async ({ kind, rtpParameters }, callback, errback) => {
      const res = await fetch(`/mediasoup/produce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, transportId: producerTransport.id, kind, rtpParameters }),
      });
      const data = await res.json();
      callback({ id: data.id });
    });

    // 4. Get media
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;

    const track = localStream.getVideoTracks()[0];
    videoProducer = await producerTransport.produce({ track });

    // 5. Create consumer transport
    const consumeTransportOptions = await fetch(`/mediasoup/create-transport?roomId=${roomId}`).then(res => res.json());
    consumerTransport = device.createRecvTransport(consumeTransportOptions);

    consumerTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
      fetch(`/mediasoup/connect-transport`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, transportId: consumerTransport.id, dtlsParameters }),
      }).then(callback).catch(errback);
    });

    // 6. Consume video
    const res = await fetch(`/mediasoup/consume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomId,
        transportId: consumerTransport.id,
        producerId: videoProducer.id,
        rtpCapabilities: device.rtpCapabilities,
      }),
    });
    const { id, kind, rtpParameters } = await res.json();

    videoConsumer = await consumerTransport.consume({ id, producerId: videoProducer.id, kind, rtpParameters });
    const remoteStream = new MediaStream([videoConsumer.track]);
    remoteVideo.srcObject = remoteStream;
  });
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
