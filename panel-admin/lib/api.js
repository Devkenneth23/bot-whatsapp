import axios from "axios";
import Cookies from "js-cookie";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api";

const api = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Interceptor para agregar token a todas las peticiones
api.interceptors.request.use(
  (config) => {
    const token = Cookies.get("token");
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
      Cookies.remove("token");
      Cookies.remove("user");
      if (typeof window !== "undefined") {
        window.location.href = "/login";
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
  Cookies.remove("token");
  Cookies.remove("user");
  window.location.href = "/login";
};

// ========== DASHBOARD ==========
export const getDashboardStats = async () => {
  const response = await api.get("/dashboard/stats");
  return response.data;
};

// ========== CITAS ==========
export const getCitas = async (params = {}) => {
  const response = await api.get("/citas", { params });
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
  const response = await api.get("/clientes", { params });
  return response.data;
};

export const getClienteConversaciones = async (id, limit = 50) => {
  const response = await api.get(`/clientes/${id}/conversaciones`, {
    params: { limit },
  });
  return response.data;
};

export const deleteCliente = async (id) => {
  const response = await api.delete(`/clientes/${id}`);
  return response.data;
};

// ========== SERVICIOS ==========
export const getServicios = async () => {
  const response = await api.get("/servicios");
  return response.data;
};

export const createServicio = async (data) => {
  const response = await api.post("/servicios", data, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
  return response.data;
};

export const updateServicio = async (id, data) => {
  const response = await api.put(`/servicios/${id}`, data, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
  return response.data;
};

export const deleteServicio = async (id) => {
  const response = await api.delete(`/servicios/${id}`);
  return response.data;
};

// ========== ESTADÍSTICAS ==========
export const getEstadisticas = async (periodo = "7dias") => {
  const response = await api.get("/estadisticas", {
    params: { periodo },
  });
  return response.data;
};

// ========== HORARIOS ==========
export const getHorarios = async (dia) => {
  const response = await api.get("/horarios", { params: { dia } });
  return response.data;
};

// ========== CONFIG ==========
export const getConfig = async () => {
  const response = await api.get("/config");
  return response.data;
};

// ========== BOT CONTROL ==========
export const getBotStatus = async () => {
  const response = await api.get("/bot/status");
  return response.data;
};

export const toggleBot = async (activo) => {
  const response = await api.post("/bot/toggle", { activo });
  return response.data;
};

// ========== CONFIGURACIÓN ==========

// Configuración general
export const getConfiguracion = async () => {
  const response = await api.get("/config");
  return response.data;
};

export const updateConfiguracion = async (data) => {
  const response = await api.put("/config", data);
  return response.data;
};

// Horarios
export const getHorariosConfig = async () => {
  const response = await api.get("/config/horarios");
  return response.data;
};

export const createHorario = async (data) => {
  const response = await api.post("/config/horarios", data);
  return response.data;
};

export const deleteHorario = async (id) => {
  const response = await api.delete(`/config/horarios/${id}`);
  return response.data;
};

// FAQs
export const getFAQsConfig = async () => {
  const response = await api.get("/config/faqs");
  return response.data;
};

export const createFAQ = async (data) => {
  const response = await api.post("/config/faqs", data);
  return response.data;
};

export const updateFAQ = async (id, data) => {
  const response = await api.put(`/config/faqs/${id}`, data);
  return response.data;
};

export const deleteFAQ = async (id) => {
  const response = await api.delete(`/config/faqs/${id}`);
  return response.data;
};

// Usuarios
export const getUsuarios = async () => {
  const response = await api.get("/config/usuarios");
  return response.data;
};

export const createUsuario = async (data) => {
  const response = await api.post("/config/usuarios", data);
  return response.data;
};

export const updateUsuario = async (id, data) => {
  const response = await api.put(`/config/usuarios/${id}`, data);
  return response.data;
};

export const deleteUsuario = async (id) => {
  const response = await api.delete(`/config/usuarios/${id}`);
  return response.data;
};

// 1. DESCARGAR BACKUP DE BASE DE DATOS





// 1. DESCARGAR BACKUP DE BASE DE DATOS
export const downloadDatabaseBackup = async () => {
  try {
    const response = await api.get('/backup/database', {
      responseType: 'blob'
    });
    
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `backup-${new Date().toISOString().split('T')[0]}.db`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
    
    return response.data;
  } catch (error) {
    console.error('Error descargando backup de base de datos:', error);
    alert('Error al descargar backup de base de datos');
    throw error;
  }
};

// 2. DESCARGAR CSV DE CLIENTES
export const downloadClientesCSV = async () => {
  try {
    const response = await api.get('/backup/clientes-csv', {
      responseType: 'blob'
    });
    
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `clientes-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
    
    return response.data;
  } catch (error) {
    console.error('Error descargando CSV de clientes:', error);
    alert('Error al descargar CSV de clientes');
    throw error;
  }
};

// 3. DESCARGAR CSV DE CITAS
export const downloadCitasCSV = async () => {
  try {
    const response = await api.get('/backup/citas-csv', {
      responseType: 'blob'
    });
    
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `citas-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
    
    return response.data;
  } catch (error) {
    console.error('Error descargando CSV de citas:', error);
    alert('Error al descargar CSV de citas');
    throw error;
  }
};


export default api;
