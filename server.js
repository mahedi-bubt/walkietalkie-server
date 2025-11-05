const http = require('http');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid'); // Add this package

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
let rooms = new Map(); // NEW: For room management

// NEW: Generate unique client ID that persists across reconnects
function generateClientId() {
   return uuidv4();
}

wss.on('connection', (ws, req) => {
   // NEW: Try to get existing client ID from query params or generate new
   const url = new URL(req.url, `http://${req.headers.host}`);
   const clientId = url.searchParams.get('clientId') || generateClientId();
   const roomId = url.searchParams.get('roomId') || 'default';

   // NEW: Check if this client already exists (reconnection)
   const existingClient = Array.from(clients.values()).find(
      client => client.id === clientId && client.room === roomId
   );

   if (existingClient) {
      // Replace the old connection with new one
      clients.delete(existingClient.ws);
      console.log(`🔄 Client ${clientId} reconnected in room ${roomId}`);
   } else {
      console.log(`✅ New client ${clientId} connected to room ${roomId}`);
   }

   // Store client info
   clients.set(ws, {
      id: clientId,
      room: roomId,
      ws: ws,
   });

   // Initialize room if not exists
   if (!rooms.has(roomId)) {
      rooms.set(roomId, new Set());
   }
   rooms.get(roomId).add(clientId);

   // Send welcome message with client ID for reconnection
   ws.send(
      JSON.stringify({
         type: 'welcome',
         message: `👋 Welcome to Walkie-Talkie Server!`,
         clientId: clientId,
         roomId: roomId,
      })
   );

   // Send current user count to all clients in the same room
   broadcastUserCount(roomId);

   ws.on('message', message => {
      try {
         const data = JSON.parse(message);
         const clientData = clients.get(ws);

         if (!clientData) return;

         console.log(
            `📨 Received from client ${clientData.id} in room ${clientData.room}: ${data.type}`
         );

         // Handle different message types
         switch (data.type) {
            case 'offer':
               // NEW: Broadcast offer to all other clients in the same room
               broadcastToRoom(ws, data, clientData.room);
               break;

            case 'answer':
            case 'ice-candidate':
               // NEW: Send to specific target client for peer connection
               if (data.targetClientId) {
                  sendToClient(data.targetClientId, data);
               } else {
                  // Fallback: broadcast to room (for backward compatibility)
                  broadcastToRoom(ws, data, clientData.room);
               }
               break;

            case 'ping':
               ws.send(JSON.stringify({ type: 'pong' }));
               break;

            case 'hangup':
               // NEW: Broadcast hangup to room
               broadcastToRoom(ws, data, clientData.room);
               break;

            default:
               console.log(
                  `❓ Unknown message type from client ${clientData.id}: ${data.type}`
               );
         }
      } catch (error) {
         // If not JSON, treat as text message
         const clientData = clients.get(ws);
         console.log(`📢 Message from client ${clientData.id}: ${message}`);

         // Broadcast text messages to all other clients in room
         broadcastToRoom(
            ws,
            {
               type: 'message',
               text: message.toString(),
               clientId: clientData.id,
            },
            clientData.room
         );
      }
   });

   ws.on('close', () => {
      const clientData = clients.get(ws);
      if (clientData) {
         console.log(
            `❌ Client ${clientData.id} disconnected from room ${clientData.room}`
         );
         clients.delete(ws);

         // Remove from room
         const room = rooms.get(clientData.room);
         if (room) {
            room.delete(clientData.id);
            if (room.size === 0) {
               rooms.delete(clientData.room);
            }
         }

         broadcastUserCount(clientData.room);
      }
   });

   ws.on('error', error => {
      const clientData = clients.get(ws);
      console.error(`💥 WebSocket error for client ${clientData.id}:`, error);
      clients.delete(ws);
      if (clientData) {
         broadcastUserCount(clientData.room);
      }
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

// NEW: Broadcast to all other clients in the same room
function broadcastToRoom(sender, message, roomId) {
   const senderData = clients.get(sender);

   clients.forEach((clientData, client) => {
      if (
         client !== sender &&
         clientData.room === roomId &&
         client.readyState === WebSocket.OPEN
      ) {
         try {
            client.send(
               JSON.stringify({
                  ...message,
                  senderClientId: senderData?.id, // Include sender ID
               })
            );
         } catch (error) {
            console.error('Error sending to client:', error);
         }
      }
   });
}

// NEW: Send to specific client
function sendToClient(targetClientId, message) {
   const targetClient = Array.from(clients.entries()).find(
      ([_, clientData]) => clientData.id === targetClientId
   );

   if (targetClient && targetClient[0].readyState === WebSocket.OPEN) {
      try {
         targetClient[0].send(JSON.stringify(message));
      } catch (error) {
         console.error(`Error sending to client ${targetClientId}:`, error);
      }
   }
}

// NEW: Broadcast user count per room
function broadcastUserCount(roomId) {
   const room = rooms.get(roomId);
   const userCount = room ? room.size : 0;

   console.log(`👥 Broadcasting user count for room ${roomId}: ${userCount}`);

   const countMessage = JSON.stringify({
      type: 'user-count',
      count: userCount,
      roomId: roomId,
   });

   clients.forEach((clientData, client) => {
      if (clientData.room === roomId && client.readyState === WebSocket.OPEN) {
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
