import React, { useState, useRef } from 'react';
import io from 'socket.io-client';
import { Device } from 'mediasoup-client';

const SERVER_URL = 'http://localhost:5000';

function App() {
  const [userId, setUserId] = useState('');
  const [roomId, setRoomId] = useState('');
  const localVideoRef = useRef(null);
  const remoteVideosRef = useRef(null);

  const socketRef = useRef(null);
  const deviceRef = useRef(null);
  const localStreamRef = useRef(null);
  const sendTransportRef = useRef(null);
  const recvTransportRef = useRef(null);
  const producerMap = useRef(new Set());

  const connect = () => {
    console.log('🔌 Connecting to server...');
    socketRef.current = io(SERVER_URL);

    socketRef.current.on('connect', async () => {
      console.log('✅ Connected to server with ID:', socketRef.current.id);

      await new Promise((resolve) => {
        console.log('📡 Emitting join-room...');
        socketRef.current.emit('join-room', { roomId, userId, teamId: 'dummy' }, resolve);
      });

      console.log('✅ Joined room:', roomId);
    });

    socketRef.current.on('producer-list', async (producerIds) => {
      console.log('📋 Received producer-list:', producerIds);
      for (const id of producerIds) {
        if (!producerMap.current.has(id)) {
          console.log('📥 Consuming producer from list:', id);
          producerMap.current.add(id);
          await consume(id);
        }
      }
    });

    socketRef.current.on('new-producer', async ({ producerId }) => {
      console.log('🆕 New producer announced:', producerId);
      if (!producerMap.current.has(producerId)) {
        producerMap.current.add(producerId);
        await consume(producerId);
      }
    });
  };

  const startStreaming = async () => {
    try {
      console.log('📷 Requesting user media...');
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      console.log('✅ Local stream captured:', stream);
      localStreamRef.current = stream;
      localVideoRef.current.srcObject = stream;

      console.log('🛰️ Requesting RTP Capabilities...');
      const rtpCapabilities = await new Promise((resolve) => {
        socketRef.current.emit('get-rtp-capabilities', { roomId }, (res) => {
          console.log('📡 RTP Capabilities received:', res);
          resolve(res);
        });
      });

      console.log('📱 Loading Mediasoup device...');
      deviceRef.current = new Device();
      await deviceRef.current.load({ routerRtpCapabilities: rtpCapabilities });
      console.log('✅ Mediasoup device loaded');

      console.log('🔧 Requesting send transport...');
      const sendTransportParams = await new Promise((resolve) => {
        socketRef.current.emit('create-send-transport', (res) => {
          console.log('📦 Send transport params received:', res);
          resolve(res);
        });
      });

      const sendTransport = deviceRef.current.createSendTransport(sendTransportParams);
      console.log('🚚 Send transport created:', sendTransport);
      sendTransportRef.current = sendTransport;

      sendTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
        console.log('🔗 Connecting send transport...');
        socketRef.current.emit(
          'connect-send-transport',
          {
            transportId: sendTransport.id,
            dtlsParameters,
          },
          () => {
            console.log('✅ Send transport connected');
            callback();
          }
        );
      });

      sendTransport.on('produce', ({ kind, rtpParameters }, callback, errback) => {
        console.log(`🚀 Producing ${kind} track...`);
        socketRef.current.emit('produce', {
          transportId: sendTransport.id,
          kind,
          rtpParameters
        }, ({ producerId }) => {
          console.log(`✅ Produced ${kind} track with producerId: ${producerId}`);
          callback({ id: producerId });
        });
      });

      for (const track of stream.getTracks()) {
        console.log('🎙️ Sending track:', track.kind);
        await sendTransport.produce({ track });
      }

      console.log('📤 All local tracks produced, requesting remote producers...');
      socketRef.current.emit('get-producers');

    } catch (err) {
      console.error('❌ Streaming failed:', err);
      alert('Streaming failed: ' + err.message);
    }
  };

  const consume = async (producerId) => {
    try {
      console.log('📥 Consuming producer:', producerId);

      if (!recvTransportRef.current) {
        console.log('🔧 Creating receive transport...');
        const recvTransportParams = await new Promise((resolve) => {
          socketRef.current.emit('create-recv-transport', resolve);
        });
        console.log('🔌 Receive transport params:', recvTransportParams);

        const recvTransport = deviceRef.current.createRecvTransport(recvTransportParams);
        recvTransportRef.current = recvTransport;
        console.log('📦 Receive transport created');

        recvTransport.on('connect', ({ dtlsParameters }, callback) => {
          console.log('🔐 Connecting receive transport...');
          socketRef.current.emit('connect-recv-transport', {
            transportId: recvTransport.id,
            dtlsParameters
          }, callback);
        });
      }

      console.log('📡 Requesting consumer params...');
      const consumerParams = await new Promise((resolve) => {
        socketRef.current.emit('consume', {
          producerId,
          transportId: recvTransportRef.current.id,
          rtpCapabilities: deviceRef.current.rtpCapabilities
        }, resolve);
      });
      console.log('📦 Consumer params received:', consumerParams);

      const consumer = await recvTransportRef.current.consume({
        id: consumerParams.id,
        producerId: consumerParams.producerId,
        kind: consumerParams.kind,
        rtpParameters: consumerParams.rtpParameters,
      });

      console.log('📺 Consumer created:', consumer);

      const remoteStream = new MediaStream([consumer.track]);
      const remoteVideo = document.createElement('video');
      remoteVideo.autoplay = true;
      remoteVideo.playsInline = true;
      remoteVideo.srcObject = remoteStream;

      remoteVideo.onloadedmetadata = () => {
        console.log('📺 Remote video metadata loaded');
        remoteVideo.play();
      };

      remoteVideosRef.current.appendChild(remoteVideo);
      console.log('🖼️ Remote video appended');

      socketRef.current.emit('resume-consumer', { consumerId: consumer.id });
      console.log('▶️ Consumer resumed');
    } catch (err) {
      console.error('❌ Consume error:', err);
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      <h2>Mediasoup Test</h2>
      <div>
        <label>User ID: </label>
        <input value={userId} onChange={e => setUserId(e.target.value)} />
        <br />
        <label>Room ID: </label>
        <input value={roomId} onChange={e => setRoomId(e.target.value)} />
        <br />
        <button onClick={connect}>Connect</button>
        <button onClick={startStreaming}>Start Streaming</button>
      </div>

      <h3>Local Video</h3>
      <video ref={localVideoRef} autoPlay muted playsInline style={{ width: 300 }} />

      <h3>Remote Videos</h3>
      <div ref={remoteVideosRef}></div>
    </div>
  );
}

export default App;
