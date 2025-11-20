import axios from 'axios';
import Cookies from 'js-cookie';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor para agregar token a todas las peticiones
api.interceptors.request.use(
  (config) => {
    const token = Cookies.get('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Interceptor para manejar errores de autenticación
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      Cookies.remove('token');
      Cookies.remove('user');
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// ========== AUTH ==========
export const login = async (username, password) => {
  const response = await axios.post(`${API_URL}/auth/login`, {
    username,
    password,
  });
  return response.data;
};

export const logout = () => {
  Cookies.remove('token');
  Cookies.remove('user');
  window.location.href = '/login';
};

// ========== DASHBOARD ==========
export const getDashboardStats = async () => {
  const response = await api.get('/dashboard/stats');
  return response.data;
};

// ========== CITAS ==========
export const getCitas = async (params = {}) => {
  const response = await api.get('/citas', { params });
  return response.data;
};

export const getCitaById = async (id) => {
  const response = await api.get(`/citas/${id}`);
  return response.data;
};

export const updateCitaEstado = async (id, estado) => {
  const response = await api.put(`/citas/${id}/estado`, { estado });
  return response.data;
};

export const deleteCita = async (id) => {
  const response = await api.delete(`/citas/${id}`);
  return response.data;
};

// ========== CLIENTES ==========
export const getClientes = async (params = {}) => {
  const response = await api.get('/clientes', { params });
  return response.data;
};

export const getClienteConversaciones = async (id, limit = 50) => {
  const response = await api.get(`/clientes/${id}/conversaciones`, {
    params: { limit },
  });
  return response.data;
};

// ========== SERVICIOS ==========
export const getServicios = async () => {
  const response = await api.get('/servicios');
  return response.data;
};

export const createServicio = async (data) => {
  const response = await api.post('/servicios', data, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
};

export const updateServicio = async (id, data) => {
  const response = await api.put(`/servicios/${id}`, data, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
};

export const deleteServicio = async (id) => {
  const response = await api.delete(`/servicios/${id}`);
  return response.data;
};

// ========== ESTADÍSTICAS ==========
export const getEstadisticas = async (fechaInicio, fechaFin) => {
  const response = await api.get('/estadisticas', {
    params: { fecha_inicio: fechaInicio, fecha_fin: fechaFin },
  });
  return response.data;
};

// ========== HORARIOS ==========
export const getHorarios = async (dia) => {
  const response = await api.get('/horarios', { params: { dia } });
  return response.data;
};

// ========== CONFIG ==========
export const getConfig = async () => {
  const response = await api.get('/config');
  return response.data;
};

// ========== BOT CONTROL ==========
export const getBotStatus = async () => {
  const response = await api.get('/bot/status');
  return response.data;
};

export const toggleBot = async (activo) => {
  const response = await api.post('/bot/toggle', { activo });
  return response.data;
};

export default api;