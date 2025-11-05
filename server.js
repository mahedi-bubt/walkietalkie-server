const http = require('http');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

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

   res.end('🎵 Walkie-Talkie WebRTC Signaling Server (1-to-1)');
});

const wss = new WebSocket.Server({ server });

// Store active peer connections
const peers = new Map(); // clientId -> { ws, partnerId, roomId }

wss.on('connection', (ws, req) => {
   const url = new URL(req.url, `http://${req.headers.host}`);
   const clientId = url.searchParams.get('clientId') || uuidv4();
   const roomId = url.searchParams.get('roomId') || 'default';
   const partnerId = url.searchParams.get('partnerId'); // Specific partner to connect to

   console.log(`✅ Client ${clientId} connected to room ${roomId}`);

   // Store peer information
   peers.set(clientId, { ws, roomId, partnerId: partnerId || null });

   // Send welcome with client ID
   ws.send(
      JSON.stringify({
         type: 'welcome',
         clientId: clientId,
         roomId: roomId,
      })
   );

   // Notify if partner is available
   if (partnerId && peers.has(partnerId)) {
      const partner = peers.get(partnerId);
      if (partner.roomId === roomId) {
         ws.send(
            JSON.stringify({
               type: 'partner-available',
               partnerId: partnerId,
            })
         );
      }
   }

   ws.on('message', message => {
      try {
         const data = JSON.parse(message);
         const sender = peers.get(clientId);

         if (!sender) return;

         console.log(`📨 ${data.type} from ${clientId}`);

         switch (data.type) {
            case 'offer':
            case 'answer':
            case 'ice-candidate':
            case 'hangup':
               // Forward to specific partner
               if (data.targetClientId && peers.has(data.targetClientId)) {
                  const targetPeer = peers.get(data.targetClientId);
                  if (targetPeer.ws.readyState === WebSocket.OPEN) {
                     targetPeer.ws.send(
                        JSON.stringify({
                           ...data,
                           senderClientId: clientId,
                        })
                     );
                  }
               }
               break;

            case 'list-partners':
               // List all available partners in the same room
               const roomPartners = Array.from(peers.entries())
                  .filter(
                     ([id, peer]) =>
                        id !== clientId &&
                        peer.roomId === roomId &&
                        peer.ws.readyState === WebSocket.OPEN
                  )
                  .map(([id]) => id);

               ws.send(
                  JSON.stringify({
                     type: 'partners-list',
                     partners: roomPartners,
                  })
               );
               break;

            case 'ping':
               ws.send(JSON.stringify({ type: 'pong' }));
               break;

            default:
               console.log(`❓ Unknown message type: ${data.type}`);
         }
      } catch (error) {
         console.error('Error parsing message:', error);
      }
   });

   ws.on('close', () => {
      console.log(`❌ Client ${clientId} disconnected`);

      // Notify partner about disconnection
      const peer = peers.get(clientId);
      if (peer) {
         // Find and notify all partners that were connected to this client
         peers.forEach((otherPeer, otherId) => {
            if (
               otherId !== clientId &&
               otherPeer.ws.readyState === WebSocket.OPEN &&
               (otherPeer.partnerId === clientId || !otherPeer.partnerId)
            ) {
               otherPeer.ws.send(
                  JSON.stringify({
                     type: 'partner-disconnected',
                     clientId: clientId,
                  })
               );
            }
         });
      }

      peers.delete(clientId);
   });

   ws.on('error', error => {
      console.error(`💥 WebSocket error for ${clientId}:`, error);
      peers.delete(clientId);
   });

   // Heartbeat
   const heartbeat = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
         ws.send(JSON.stringify({ type: 'heartbeat' }));
      }
   }, 30000);

   ws.on('close', () => {
      clearInterval(heartbeat);
   });
});

// Get all peers in a room
function getRoomPeers(roomId) {
   return Array.from(peers.entries())
      .filter(
         ([id, peer]) =>
            peer.roomId === roomId && peer.ws.readyState === WebSocket.OPEN
      )
      .map(([id]) => id);
}

const PORT = process.env.PORT || 8080;
server.listen(PORT, '0.0.0.0', () => {
   console.log(`🚀 1-to-1 Walkie-Talkie Server running on port ${PORT}`);
   console.log(`📍 WebSocket: ws://localhost:${PORT}`);
});

process.on('SIGTERM', () => {
   console.log('SIGTERM received, shutting down gracefully');
   wss.close(() => {
      server.close(() => {
         console.log('Server closed');
         process.exit(0);
      });
   });
});
