// server.js
const WebSocket = require('ws');
const os = require('os');

// Get local IP addresses
function getLocalIP() {
   const interfaces = os.networkInterfaces();
   for (const name of Object.keys(interfaces)) {
      for (const interface of interfaces[name]) {
         if (interface.family === 'IPv4' && !interface.internal) {
            return interface.address;
         }
      }
   }
   return 'localhost';
}

const serverIp = getLocalIP();
const wss = new WebSocket.Server({ port: 8080, host: '0.0.0.0' });

let users = [];

console.log('🚀 Walkie-Talkie Server Started!');
console.log('📍 Local: ws://localhost:8080');
console.log(`🌐 Network: ws://${serverIp}:8080`);
console.log('📱 Android Emulator: ws://10.0.2.2:8080');
console.log('');

wss.on('connection', ws => {
   const userId = `user-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}`;
   const user = { id: userId, name: `User${users.length + 1}`, ws: ws };

   users.push(user);
   console.log(`✅ ${user.name} connected (Total: ${users.length})`);

   // Send welcome message
   ws.send(
      JSON.stringify({
         type: 'welcome',
         message: `Connected as ${user.name}`,
         userId: userId,
      })
   );

   // Send user list to all clients
   broadcastUserList();

   // Notify others about new user
   broadcastToOthers(ws, {
      type: 'user-joined',
      user: user,
   });

   ws.on('message', message => {
      try {
         const data = JSON.parse(message);

         // Log message type
         console.log(`📨 ${user.name}: ${data.type}`);

         // Broadcast to all other clients
         broadcastToOthers(ws, data);
      } catch (error) {
         console.error('Error parsing message:', error);
      }
   });

   ws.on('close', () => {
      users = users.filter(u => u.id !== userId);
      console.log(`❌ ${user.name} disconnected (Remaining: ${users.length})`);

      // Notify others
      broadcastToOthers(ws, {
         type: 'user-left',
         userId: userId,
      });

      // Update user list
      broadcastUserList();
   });

   ws.on('error', error => {
      console.error(`💥 WebSocket error for ${user.name}:`, error);
   });
});

function broadcastToOthers(senderWs, message) {
   users.forEach(user => {
      if (user.ws !== senderWs && user.ws.readyState === WebSocket.OPEN) {
         user.ws.send(JSON.stringify(message));
      }
   });
}

function broadcastUserList() {
   const userList = users.map(user => ({
      id: user.id,
      name: user.name,
   }));

   users.forEach(user => {
      if (user.ws.readyState === WebSocket.OPEN) {
         user.ws.send(
            JSON.stringify({
               type: 'user-list',
               users: userList,
            })
         );
      }
   });
}

console.log('🔄 Server is ready for connections...');
