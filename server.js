const http = require('http');
const WebSocket = require('ws');

const server = http.createServer((req, res) => {
   res.writeHead(200, {
      'Content-Type': 'text/plain',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
   });

   if (req.method === 'OPTIONS') {
      res.end();
      return;
   }

   res.end('🎵 Walkie-Talkie WebRTC Signaling Server is running!');
});

// Create WebSocket server
const wss = new WebSocket.Server({
   server,
   clientTracking: true,
});

let clients = new Map();
let clientIdCounter = 1;

wss.on('connection', (ws, req) => {
   const clientId = clientIdCounter++;
   clients.set(ws, { id: clientId, room: 'default' });

   console.log(
      `✅ Client ${clientId} connected from: ${req.socket.remoteAddress}`
   );

   // Send welcome message
   ws.send(
      JSON.stringify({
         type: 'welcome',
         message: `👋 Welcome to Walkie-Talkie Server! You are client ${clientId}`,
         clientId: clientId,
      })
   );

   // Send current user count to all clients
   broadcastUserCount();

   ws.on('message', message => {
      try {
         const data = JSON.parse(message);
         console.log(`📨 Received from client ${clientId}: ${data.type}`);

         // Handle different message types
         switch (data.type) {
            case 'offer':
            case 'answer':
            case 'ice-candidate':
               // Broadcast to all other clients for WebRTC signaling
               broadcastToOthers(ws, data);
               break;

            case 'ping':
               ws.send(JSON.stringify({ type: 'pong' }));
               break;

            default:
               console.log(
                  `❓ Unknown message type from client ${clientId}: ${data.type}`
               );
         }
      } catch (error) {
         // If not JSON, treat as text message
         console.log(`📢 Message from client ${clientId}: ${message}`);

         // Broadcast text messages to all other clients
         broadcastToOthers(ws, {
            type: 'message',
            text: message.toString(),
            clientId: clientId,
         });
      }
   });

   ws.on('close', () => {
      console.log(`❌ Client ${clientId} disconnected`);
      clients.delete(ws);
      broadcastUserCount();
   });

   ws.on('error', error => {
      console.error(`💥 WebSocket error for client ${clientId}:`, error);
      clients.delete(ws);
      broadcastUserCount();
   });

   // Heartbeat to keep connection alive
   const heartbeat = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
         ws.send(JSON.stringify({ type: 'heartbeat' }));
      }
   }, 30000);

   ws.on('close', () => {
      clearInterval(heartbeat);
   });
});

function broadcastToOthers(sender, message) {
   const senderData = clients.get(sender);

   clients.forEach((clientData, client) => {
      if (client !== sender && client.readyState === WebSocket.OPEN) {
         try {
            client.send(JSON.stringify(message));
         } catch (error) {
            console.error('Error sending to client:', error);
         }
      }
   });
}

function broadcastUserCount() {
   const userCount = clients.size;
   console.log(`👥 Broadcasting user count: ${userCount}`);

   const countMessage = JSON.stringify({
      type: 'user-count',
      count: userCount,
   });

   clients.forEach((clientData, client) => {
      if (client.readyState === WebSocket.OPEN) {
         try {
            client.send(countMessage);
         } catch (error) {
            console.error('Error sending user count:', error);
         }
      }
   });
}

// For Render, Railway, or local hosting
const PORT = process.env.PORT || 8080;
server.listen(PORT, '0.0.0.0', () => {
   console.log(`🚀 Walkie-Talkie Server running on port ${PORT}`);
   console.log(`📍 WebSocket: ws://localhost:${PORT}`);
   console.log(`📍 HTTP: http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
   console.log('SIGTERM received, shutting down gracefully');
   wss.close(() => {
      server.close(() => {
         console.log('Server closed');
         process.exit(0);
      });
   });
});
