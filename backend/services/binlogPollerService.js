const Connection = require('../models/connectionModel');
const BinlogState = require('../models/binlogStateModel');
const { pollBinlogEventsInternal } = require('../controllers/connectionController');
const { getConnection } = require('../connections/connectionManager');

// Map to prevent parallel duplicate polling checks on the same connection
const processingConnections = new Set();

const pollAllConnections = async (io) => {
  try {
    // Fetch all active/saved MySQL connections
    const mysqlConnections = await Connection.find({ type: 'mysql' });
    
    for (const connDoc of mysqlConnections) {
      const connId = connDoc._id.toString();
      
      // Skip if already in process to avoid overlapping interval queries
      if (processingConnections.has(connId)) continue;
      
      processingConnections.add(connId);
      
      try {
        // Load the saved state coordinates
        let state = await BinlogState.findOne({ connectionId: connDoc._id });
        
        let startLogFile = '';
        let startPosition = 4;
        let startMode = 'real';
        
        if (!state) {
          // Initialize coordinates from the current binlog position
          try {
            const { conn } = await getConnection(connDoc);
            let logFile = '';
            let position = 4;
            let logBinEnabled = false;

            // Check if binary logging is enabled on target database
            try {
              const [logBinVars] = await conn.query("SHOW VARIABLES LIKE 'log_bin'");
              if (logBinVars && logBinVars.length > 0 && logBinVars[0].Value === 'ON') {
                logBinEnabled = true;
              }
            } catch (err) {
              console.warn(`Failed to check log_bin variable for connection ${connId}:`, err.message);
            }

            if (logBinEnabled) {
              try {
                // Query current file and coordinates
                try {
                  const [binlogStatus] = await conn.query("SHOW BINARY LOG STATUS");
                  if (binlogStatus && binlogStatus.length > 0) {
                    logFile = binlogStatus[0].File;
                    position = binlogStatus[0].Position;
                  }
                } catch (e1) {
                  const [masterStatus] = await conn.query("SHOW MASTER STATUS");
                  if (masterStatus && masterStatus.length > 0) {
                    logFile = masterStatus[0].File;
                    position = masterStatus[0].Position;
                  }
                }
              } catch (e2) {
                console.warn(`Failed to read binary status for connection ${connId}:`, e2.message);
              }
            }

            if (logFile) {
              startLogFile = logFile;
              startPosition = position;
              startMode = 'real';
            } else {
              startLogFile = 'mock-binlog.000001';
              startPosition = 100;
              startMode = 'simulation';
            }
          } catch (connErr) {
            // Default to simulation mode if target database is unreachable
            startLogFile = 'mock-binlog.000001';
            startPosition = 100;
            startMode = 'simulation';
          }

          state = await BinlogState.create({
            connectionId: connDoc._id,
            logFile: startLogFile,
            position: startPosition,
            mode: startMode
          });
        }

        // Run the poller (it retrieves logs and writes to Mongoose BinlogAudit)
        const result = await pollBinlogEventsInternal(
          connId, 
          state.logFile, 
          state.position, 
          state.mode, 
          null // no user ID (background daemon)
        );

        if (result && result.success) {
          // Save the advanced position
          state.logFile = result.nextLogFile;
          state.position = result.nextPosition;
          state.updatedAt = new Date();
          await state.save();

          // Broadcast coordinates & events to active watchers
          if (result.events && result.events.length > 0) {
            io.to(`connection_${connId}`).emit('binlog_events', {
              events: result.events,
              logFile: result.nextLogFile,
              position: result.nextPosition
            });
          } else {
            io.to(`connection_${connId}`).emit('binlog_location', {
              logFile: result.nextLogFile,
              position: result.nextPosition
            });
          }
        }
      } catch (err) {
        console.error(`Background poller error for connection ${connId}:`, err.message);
      } finally {
        processingConnections.delete(connId);
      }
    }
  } catch (err) {
    console.error('Background poller service error:', err.message);
  }
};

const startBackgroundBinlogPoller = (io) => {
  console.log('📡 Starting background Binlog Poller Daemon...');
  
  // Run poller checks every 4 seconds
  setInterval(() => {
    pollAllConnections(io);
  }, 4000);
};

module.exports = { startBackgroundBinlogPoller };
