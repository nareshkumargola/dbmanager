module.exports = (io) => {
  io.on('connection', (socket) => {
    console.log(`🔌 Client connected to socket: ${socket.id}`);

    // Join connection room
    socket.on('join_connection', (connectionId) => {
      if (!connectionId) return;
      socket.join(`connection_${connectionId}`);
      console.log(`👤 Socket ${socket.id} joined room connection_${connectionId}`);
    });

    // Stub handlers for frontend compatibility
    socket.on('start_binlog_monitoring', () => {
      // Background daemon handles the polling persistently now.
    });

    socket.on('stop_binlog_monitoring', () => {
      // Background daemon handles the polling persistently now.
    });

    // Disconnect handler
    socket.on('disconnect', () => {
      console.log(`🔌 Client disconnected: ${socket.id}`);
    });
  });
};
