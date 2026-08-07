import { io } from "socket.io-client";

const getSocketURL = () => {
  const envUrl = import.meta.env.VITE_SOCKET_URL;
  if (window.location.hostname === 'localhost') {
    return 'http://localhost:5001';
  }
  return envUrl || 'http://localhost:5001';
};

const SOCKET_URL = getSocketURL();

export const socket = io(SOCKET_URL, {
  autoConnect: false,
  withCredentials: true,
});
