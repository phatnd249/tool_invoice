// Discover backend port from URL parameters or fallback to VITE_API_PORT or 3000
const params = new URLSearchParams(window.location.search);
const queryPort = params.get('port');
const defaultPort = import.meta.env.VITE_API_PORT || '3000';
export const API_PORT = queryPort || defaultPort;
export const API_BASE_URL = `http://localhost:${API_PORT}`;
