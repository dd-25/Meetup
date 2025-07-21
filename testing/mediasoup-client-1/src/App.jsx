import React, { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import RoomChat from './components/RoomChat';
import './App.css';
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
  const [userName, setUserName] = useState('');
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
        console.log('📸 Local stream captured with tracks:', stream.getTracks().map(t => `${t.kind}: ${t.label}`));

        // Set video source immediately
        if (localVideoRef.current) {
          console.log('📸 Setting initial local video srcObject');
          localVideoRef.current.srcObject = stream;
          localVideoRef.current.play().catch(e => console.error('❌ Initial video play failed:', e));
        } else {
          console.warn('⚠️ Local video ref not available');
        }
        console.log('📸 Local stream displayed');

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
    // Update local video when stream changes
    if (localVideoRef.current && localStream) {
      console.log('🔧 Setting local video srcObject:', localStream);
      localVideoRef.current.srcObject = localStream;
      localVideoRef.current.play().catch(e => {
        console.error('❌ Local video play failed:', e);
      });
    } else {
      console.log('🔧 Local video not ready - ref:', !!localVideoRef.current, 'stream:', !!localStream);
    }
  }, [localStream]);

  useEffect(() => {
    return () => {
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [localStream]);

  return (
    <div className="app-container">
      <div className="main-content">
        <h2 className="title">🎦 Mediasoup SFU Video Chat with Room Chat 💬</h2>
        
        {!joined && (
          <div className="join-form">
            <div className="form-inputs">
              <input
                type="text"
                placeholder="Room ID"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                className="form-input"
              />
              <input
                type="text"
                placeholder="User ID"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className="form-input"
              />
              <input
                type="text"
                placeholder="Your Name (optional)"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                className="form-input"
              />
            </div>
            <button 
              onClick={handleJoin}
              className="join-button"
            >
              🚀 Join Room
            </button>
          </div>
        )}

        {joined && (
          <div className="content-layout">
            {/* Video Section */}
            <div className="video-section">
              <div className="video-grid">
                <div className="video-container">
                  <h4 className="video-title">📷 Your Video</h4>
                  <video
                    ref={localVideoRef}
                    autoPlay
                    muted
                    playsInline
                    className="video-element"
                    style={{ width: '300px', height: '225px', background: '#222' }}
                  />
                  <div style={{ fontSize: '12px', color: '#666', textAlign: 'center' }}>
                    {userName || userId} (You)
                  </div>
                </div>

                <div className="video-container">
                  <h4 className="video-title">🌐 Remote Participants</h4>
                  <div className="remote-videos">
                    {remoteStreams && remoteStreams.length > 0 ? (
                      remoteStreams.map((stream, index) => (
                        <div key={index} style={{ textAlign: 'center' }}>
                          <video
                            autoPlay
                            playsInline
                            className="video-element"
                            style={{ width: '300px', height: '225px', background: '#111' }}
                            ref={(el) => {
                              if (el && el.srcObject !== stream) {
                                el.srcObject = stream;
                                el.play().catch(e => console.log('Remote video play failed:', e));
                              }
                            }}
                          />
                          <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                            Participant {index + 1}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div style={{ 
                        width: '300px', 
                        height: '225px', 
                        background: '#f8f9fa', 
                        border: '2px dashed #dee2e6',
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#6c757d',
                        fontSize: '14px'
                      }}>
                        Waiting for participants...
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Chat Section */}
            <div className="chat-section">
              <RoomChat 
                socket={socket}
                roomId={roomId}
                userId={userId}
                userName={userName || `User-${userId}`}
                joined={joined}
              />
            </div>
          </div>
        )}

        {!joined && (
          <div style={{ textAlign: 'center', marginTop: '30px', color: '#6c757d' }}>
            <p>👥 Join a room to start video chat and messaging</p>
            <p>🎥 Video powered by MediaSoup SFU</p>
            <p>💬 Real-time chat powered by Socket.IO</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;