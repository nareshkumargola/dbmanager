import { useEffect, useState } from 'react';
import API from '../api/axios';
import { socket } from '../api/socket';

/**
 * Loads monitoring alerts for the given connections and keeps them live over the socket.
 * Pass an empty array to disable (no requests are made).
 */
export default function useConnectionAlerts(connections) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (connections.length === 0) return undefined;

    let cancelled = false;
    const fetchNotifications = async () => {
      setLoading(true);
      setError('');
      const results = await Promise.allSettled(
        connections.map((connection) => API.get(`/monitor/${connection._id}/alerts`))
      );
      if (cancelled) return;

      const alerts = [];
      let failedRequests = 0;
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          failedRequests += 1;
          console.error(`Failed to load alerts for connection "${connections[index].name}":`, result.reason);
          return;
        }

        const connection = connections[index];
        (result.value.data.alerts || []).forEach((alert) => {
          alerts.push({ ...alert, connection: connection._id, connectionName: connection.name });
        });
      });

      setNotifications(alerts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
      setError(failedRequests ? 'Some connection alerts could not be loaded.' : '');
      setLoading(false);
    };

    fetchNotifications().catch((err) => {
      console.error('Failed to load notifications:', err);
      if (!cancelled) {
        setError('Notifications could not be loaded.');
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [connections]);

  useEffect(() => {
    if (connections.length === 0) return undefined;

    socket.connect();
    const connectionIds = new Set(connections.map((connection) => connection._id));
    const getConnectionId = (alert) =>
      typeof alert.connection === 'object' ? alert.connection?._id : alert.connection;

    const handleNewAlert = (alert) => {
      const connectionId = getConnectionId(alert);
      const connection = connections.find((item) => item._id === connectionId);
      if (!connection) return;

      const notification = {
        ...alert,
        connection: connectionId,
        connectionName: alert.connectionName || connection.name,
      };
      setNotifications((current) => [
        notification,
        ...current.filter((item) => item._id !== notification._id),
      ]);
    };

    const handleAlertResolved = (alert) => {
      const connectionId = getConnectionId(alert);
      if (!connectionIds.has(connectionId)) return;

      const connection = connections.find((item) => item._id === connectionId);
      const notification = {
        ...alert,
        connection: connectionId,
        connectionName: alert.connectionName || connection?.name,
        resolved: true,
      };
      setNotifications((current) => {
        const existing = current.some((item) => item._id === notification._id);
        const updated = existing
          ? current.map((item) => item._id === notification._id ? notification : item)
          : [notification, ...current];
        return updated.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      });
    };

    socket.on('new-alert', handleNewAlert);
    socket.on('alert-resolved', handleAlertResolved);
    return () => {
      socket.off('new-alert', handleNewAlert);
      socket.off('alert-resolved', handleAlertResolved);
    };
  }, [connections]);

  const connectionIds = new Set(connections.map((connection) => connection._id));
  const activeNotifications = notifications.filter(
    (notification) => connectionIds.has(notification.connection) && !notification.resolved
  );

  return { activeNotifications, loading, error };
}
