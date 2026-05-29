import axios from "axios";

const BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:8000";

const api = axios.create({
  baseURL: BASE_URL,
  // No withCredentials — we use JWT in Authorization header, not cookies
});

const AUTH_PATHS = [
  "/api/auth/login/",
  "/api/auth/logout/",
  "/api/auth/token/refresh/",
];

let _authRedirecting = false;

function isAuthRequest(url = "") {
  return AUTH_PATHS.some((p) => String(url).includes(p));
}

// Attach JWT access token from sessionStorage (tab-isolated)
api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem("access_token");
  if (token) {
    config.headers["Authorization"] = `Bearer ${token}`;
  }
  return config;
});

// On 401, try to refresh the access token once; on failure redirect to login
let _refreshing = null;

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config || {};
    const is401 = error.response?.status === 401;

    if (is401 && !original._retry && !isAuthRequest(original.url)) {
      original._retry = true;
      const refreshToken = sessionStorage.getItem("refresh_token");
      if (!refreshToken) {
        sessionStorage.removeItem("access_token");
        sessionStorage.removeItem("refresh_token");
        if (!_authRedirecting && window.location.pathname !== "/login") {
          _authRedirecting = true;
          window.location.href = "/login";
        }
        return Promise.reject(error);
      }
      // Deduplicate concurrent refresh calls
      if (!_refreshing) {
        _refreshing = axios
          .post(`${BASE_URL}/api/auth/token/refresh/`, { refresh: refreshToken })
          .then((res) => {
            sessionStorage.setItem("access_token", res.data.access);
            if (res.data.refresh) {
              sessionStorage.setItem("refresh_token", res.data.refresh);
            }
            return res.data.access;
          })
          .catch((err) => {
            sessionStorage.removeItem("access_token");
            sessionStorage.removeItem("refresh_token");
            if (!_authRedirecting && window.location.pathname !== "/login") {
              _authRedirecting = true;
              window.location.href = "/login";
            }
            return Promise.reject(err);
          })
          .finally(() => {
            _refreshing = null;
          });
      }
      try {
        const newAccess = await _refreshing;
        original.headers["Authorization"] = `Bearer ${newAccess}`;
        return api(original);
      } catch {
        return Promise.reject(error);
      }
    }
    return Promise.reject(error);
  }
);

export default api;
