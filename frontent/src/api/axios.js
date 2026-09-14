import axios from "axios";

const getBaseURL = () => {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl === '/api' && window.location.hostname === 'localhost') {
    return 'http://localhost:5001/api';
  }
  return envUrl || 'http://localhost:5001/api';
};

const API = axios.create({
  baseURL: getBaseURL(),
  withCredentials: true,
});

API.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

API.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;

    if (status === 401) {
      localStorage.removeItem("token");
    }

    return Promise.reject(error);
  },
);

export default API;
