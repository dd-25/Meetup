import React, { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import {
  initSocket,
  joinRoom,
  createDevice,
  createSendTransport,
  createRecvTransport,
  produceStream,
  consumeStream,
} from './mediasoupclient';

const App = () => {
  const localVideoRef = useRef(null);
  const [roomId, setRoomId] = useState('');
  const [userId, setUserId] = useState('');
  const [joined, setJoined] = useState(false);
  const [socket, setSocket] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState([]);

  const handleJoin = async () => {
    if (!roomId || !userId) {
      alert('Please enter Room ID and User ID');
      return;
    }

    const sock = io(`${import.meta.env.VITE_API_URL}`, {
      transports: ['websocket'],
      forceNew: true,
    });

    sock.on('connect', async () => {
      console.log('🔌 Connected to server with ID:', sock.id);
      setSocket(sock);
      initSocket(sock);

      try {
        console.log(`🚶 Joining room: ${roomId} as ${userId}`);
        await joinRoom(roomId, userId, 'team1');
        console.log('✅ Successfully joined room');

        await createDevice();
        console.log('📡 Mediasoup device initialized');

        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        setLocalStream(stream);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        console.log('📸 Local stream captured and displayed');

        await createSendTransport();
        console.log('🚚 Send transport created');
        await produceStream('video', stream.getVideoTracks()[0]);
        await produceStream('audio', stream.getAudioTracks()[0]);
        console.log('📤 Media tracks produced and sent');

        await createRecvTransport();
        console.log('📦 Recv transport ready to consume streams');

        console.log('📡 Requesting list of existing producers');
        sock.emit('get-producers');
        sock.on('producer-list', async (producers) => {
          console.log(`📃 Received ${producers.length} existing producers:`, producers);
          for (const producerId of producers) {
            const remoteStream = await consumeStream(producerId);
            console.log("reomte stream", remoteStream);
            setRemoteStreams((prev) => [...prev, remoteStream]);
          }
          // console.log("producers printed")
        });

        sock.on('new-producer', async ({ producerId }) => {
          console.log('🆕 New producer detected:', producerId);
          const remoteStream = await consumeStream(producerId);
          setRemoteStreams((prev) => [...prev, remoteStream]);
        });

        setJoined(true);
      } catch (err) {
        console.error('❌ Error during join flow:', err.message);
        alert('Failed to join room: ' + err.message);
      }
    });

    sock.on('disconnect', () => {
      console.warn('⚠️ Disconnected');
      setJoined(false);
    });
  };

  useEffect(() => {
    return () => {
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [localStream]);

  return (
    <div style={{ padding: '2rem' }}>
      <h2>🎦 Mediasoup SFU Video Chat</h2>
      {!joined && (
        <div>
          <input
            type="text"
            placeholder="Room ID"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
          />
          <input
            type="text"
            placeholder="User ID"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
          />
          <button onClick={handleJoin}>Join Room</button>
        </div>
      )}

      <div style={{ display: 'flex', marginTop: '2rem', gap: '2rem' }}>
        <div>
          <h4>📷 Local Stream</h4>
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            style={{ width: '300px', background: '#222' }}
          />
        </div>

        <div>
          <h4>🌐 Remote Streams</h4>
          <div id="remote-videos" style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
            {remoteStreams && remoteStreams.map((stream, index) => (
              <video
                key={index}
                autoPlay
                playsInline
                srcObject={stream}
                style={{ width: '300px', background: '#111' }}
                ref={(el) => {
                  if (el && !el.srcObject) {
                    el.srcObject = stream;
                  }
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;