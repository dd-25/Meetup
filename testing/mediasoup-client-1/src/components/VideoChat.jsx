import React, { useRef, useState } from "react";
import { io } from "socket.io-client";
import * as mediasoupClient from "mediasoup-client";

const VideoChat = () => {
  const [connected, setConnected] = useState(false);
  const localVideoRef = useRef(null);
  const remoteVideosRef = useRef([]);
  const [socket, setSocket] = useState(null);

  const userId = "user-" + Math.floor(Math.random() * 1000);
  const roomId = "test-room";
  const teamId = "dummy-team";

  let device;
  let localStream;
  let sendTransport;
  let recvTransport;
  let consumers = [];
  let producerMap = new Set();

  const connect = () => {
    const newSocket = io("http://localhost:5000", { transports: ["websocket"] });

    newSocket.on("connect", async () => {
      console.log("✅ Connected");

      await new Promise((resolve) => {
        newSocket.emit("join-room", { roomId, userId, teamId }, resolve);
      });

      setSocket(newSocket);
      setConnected(true);
    });

    newSocket.on("producer-list", async (producerIds) => {
      for (const id of producerIds) {
        if (!producerMap.has(id)) {
          producerMap.add(id);
          await consume(id, newSocket);
        }
      }
    });

    newSocket.on("new-producer", async ({ producerId }) => {
      if (!producerMap.has(producerId)) {
        producerMap.add(producerId);
        await consume(producerId, newSocket);
      }
    });
  };

  const startStreaming = async () => {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localVideoRef.current.srcObject = localStream;

      const routerRtpCapabilities = await new Promise((resolve) => {
        socket.emit("get-rtp-capabilities", { roomId }, resolve);
      });

      device = new mediasoupClient.Device();
      await device.load({ routerRtpCapabilities });

      const sendTransportParams = await new Promise((resolve) => {
        socket.emit("create-send-transport", resolve);
      });

      sendTransport = device.createSendTransport(sendTransportParams);

      sendTransport.on("connect", ({ dtlsParameters }, callback) => {
        socket.emit("connect-send-transport", {
          transportId: sendTransport.id,
          dtlsParameters,
        }, callback);
      });

      sendTransport.on("produce", ({ kind, rtpParameters }, callback) => {
        socket.emit("produce", {
          transportId: sendTransport.id,
          kind,
          rtpParameters,
        }, ({ producerId }) => {
          callback({ id: producerId });
        });
      });

      for (const track of localStream.getTracks()) {
        await sendTransport.produce({ track });
      }

      socket.emit("get-producers");
    } catch (err) {
      console.error("❌ Streaming failed:", err);
      alert("Streaming failed: " + err.message);
    }
  };

  const consume = async (producerId, socketRef) => {
    try {
      if (!recvTransport) {
        const recvTransportParams = await new Promise((resolve) => {
          socketRef.emit("create-recv-transport", resolve);
        });

        recvTransport = device.createRecvTransport(recvTransportParams);

        recvTransport.on("connect", ({ dtlsParameters }, callback) => {
          socketRef.emit("connect-recv-transport", {
            transportId: recvTransport.id,
            dtlsParameters,
          }, callback);
        });
      }

      const consumerParams = await new Promise((resolve) => {
        socketRef.emit("consume", {
          producerId,
          transportId: recvTransport.id,
          rtpCapabilities: device.rtpCapabilities,
        }, resolve);
      });

      const consumer = await recvTransport.consume({
        id: consumerParams.id,
        producerId: consumerParams.producerId,
        kind: consumerParams.kind,
        rtpParameters: consumerParams.rtpParameters,
      });

      consumers.push(consumer);

      const remoteStream = new MediaStream([consumer.track]);
      const videoElement = document.createElement("video");
      videoElement.srcObject = remoteStream;
      videoElement.autoplay = true;
      videoElement.playsInline = true;
      remoteVideosRef.current.appendChild(videoElement);

      socketRef.emit("resume-consumer", { consumerId: consumer.id });
    } catch (err) {
      console.error("❌ consume error:", err);
    }
  };

  return (
    <div>
      <h2>Mediasoup React Client</h2>
      {!connected ? (
        <button onClick={connect}>Connect</button>
      ) : (
        <button onClick={startStreaming}>Start Streaming</button>
      )}
      <h3>Local Video</h3>
      <video ref={localVideoRef} autoPlay muted playsInline width="300" />
      <h3>Remote Videos</h3>
      <div ref={remoteVideosRef}></div>
    </div>
  );
};

export default VideoChat;