const isFileProtocol = window.location.protocol === 'file:';
const isViteDev = window.location.port === '5173';

const params = new URLSearchParams(window.location.search);
const queryPort = params.get('port');
const defaultPort = import.meta.env.VITE_API_PORT || '3000';
export const API_PORT = queryPort || defaultPort;

// If served statically by backend, use relative paths. Otherwise, use absolute localhost url.
export const API_BASE_URL = (isFileProtocol || isViteDev)
  ? `http://localhost:${API_PORT}`
  : '';
