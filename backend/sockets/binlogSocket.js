const { pollBinlogEventsInternal } = require('../controllers/connectionController');

// Map to track active polling intervals: connectionId -> { intervalId, sockets: Set(socketId) }
const activeIntervals = new Map();

module.exports = (io) => {
  io.on('connection', (socket) => {
    console.log(`🔌 Client connected to socket: ${socket.id}`);

    // Join connection room
    socket.on('join_connection', (connectionId) => {
      if (!connectionId) return;
      socket.join(`connection_${connectionId}`);
      console.log(`👤 Socket ${socket.id} joined room connection_${connectionId}`);
    });

    // Start binlog monitoring loop
    socket.on('start_binlog_monitoring', async ({ connectionId, logFile, position, mode, userId }) => {
      if (!connectionId) return;
      console.log(`📡 Start monitoring connection: ${connectionId} | File: ${logFile} | Pos: ${position} | Mode: ${mode}`);

      // If an active interval already exists for this connection, append socket to subscribers
      if (activeIntervals.has(connectionId)) {
        const activeInfo = activeIntervals.get(connectionId);
        activeInfo.sockets.add(socket.id);
        console.log(`🔗 Appended socket ${socket.id} to active monitors. Total watchers: ${activeInfo.sockets.size}`);
        return;
      }

      let currentLogFile = logFile;
      let currentPosition = parseInt(position) || 4;

      const runPoll = async () => {
        try {
          const result = await pollBinlogEventsInternal(connectionId, currentLogFile, currentPosition, mode, userId);
          
          if (result && result.success) {
            currentLogFile = result.nextLogFile;
            currentPosition = result.nextPosition;

            // Broadcast updates to the room
            if (result.events && result.events.length > 0) {
              io.to(`connection_${connectionId}`).emit('binlog_events', {
                events: result.events,
                logFile: currentLogFile,
                position: currentPosition
              });
            } else {
              // Send location updates to keep client synchronized
              io.to(`connection_${connectionId}`).emit('binlog_location', {
                logFile: currentLogFile,
                position: currentPosition
              });
            }
          }
        } catch (err) {
          console.error(`Socket polling error for connection ${connectionId}:`, err.message);
        }
      };

      // Run initial poll instantly
      await runPoll();

      // Setup 2-second interval loop
      const intervalId = setInterval(runPoll, 2000);

      activeIntervals.set(connectionId, {
        intervalId,
        sockets: new Set([socket.id])
      });
    });

    // Stop binlog monitoring
    socket.on('stop_binlog_monitoring', ({ connectionId }) => {
      if (!connectionId) return;
      console.log(`🛑 Stop monitoring connection request: ${connectionId}`);
      
      if (activeIntervals.has(connectionId)) {
        const activeInfo = activeIntervals.get(connectionId);
        activeInfo.sockets.delete(socket.id);
        
        // Clear interval if no more sockets are watching this connection
        if (activeInfo.sockets.size === 0) {
          clearInterval(activeInfo.intervalId);
          activeIntervals.delete(connectionId);
          console.log(`🧹 Interval cleared for connection: ${connectionId}`);
        }
      }
    });

    // Disconnect handler
    socket.on('disconnect', () => {
      console.log(`🔌 Client disconnected: ${socket.id}`);
      
      // Remove socket from all active monitors
      for (const [connectionId, activeInfo] of activeIntervals.entries()) {
        if (activeInfo.sockets.has(socket.id)) {
          activeInfo.sockets.delete(socket.id);
          if (activeInfo.sockets.size === 0) {
            clearInterval(activeInfo.intervalId);
            activeIntervals.delete(connectionId);
            console.log(`🧹 Interval cleared automatically for connection: ${connectionId}`);
          }
        }
      }
    });
  });
};
