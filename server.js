const http = require('http');
const WebSocket = require('ws');

const server = http.createServer((req, res) => {
   res.writeHead(200, { 'Content-Type': 'text/plain' });
   res.end('🎵 WebSocket server is running successfully!');
});

// Create WebSocket server
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, req) => {
   console.log('✅ New client connected:', req.socket.remoteAddress);

   ws.send('👋 Welcome to the Music WebSocket server!');

   ws.on('message', message => {
      console.log('📩 Received:', message.toString());

      // Broadcast message to all connected clients
      wss.clients.forEach(client => {
         if (client.readyState === WebSocket.OPEN) {
            client.send(`Broadcast: ${message}`);
         }
      });
   });

   ws.on('close', () => {
      console.log('❌ Client disconnected');
   });
});

// For Render, Railway, or local hosting
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
