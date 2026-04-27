import axios from 'axios';

/** Por defecto :3002: Nexa u otros suelen ocupar :3000 */
export const API_BASE = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:3002/api';

const apiClient = axios.create({
  baseURL: API_BASE,
});

// Interceptor para añadir el token en cada petición
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('dte_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Interceptor para manejar errores globales y extraer mensajes descriptivos
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const data   = error.response?.data;

    console.error('API Error:', status, error.message, data);

    if (status === 401) {
      console.warn('Sesión inválida detectada (401). Limpiando credenciales...');
      localStorage.removeItem('dte_token');
      localStorage.removeItem('dte_usuario');
      window.location.href = '/login';
      return Promise.reject(error);
    }

    // Detectar límite de DTEs alcanzado y disparar modal global
    if (data?.code === 'LIMITE_DTE_ALCANZADO') {
      window.dispatchEvent(
        new CustomEvent('dte-limite-alcanzado', {
          detail: {
            usados: data.usados,
            limite: data.limite,
            extrasDisponibles: data.extrasDisponibles ?? 0,
          },
        }),
      );
    }

    // Extraer el mensaje más descriptivo posible del cuerpo de la respuesta:
    // - NestJS ValidationPipe: { message: string[] }
    // - NestJS HttpException: { message: string }
    // - Error de negocio propio: { error: string }
    let humanMessage: string | undefined;
    if (data) {
      if (Array.isArray(data.message)) {
        humanMessage = data.message.join(' | ');
      } else if (typeof data.message === 'string') {
        humanMessage = data.message;
      } else if (typeof data.error === 'string') {
        humanMessage = data.error;
      }
    }

    if (humanMessage) {
      // Reemplazar el message del error para que los componentes lo puedan mostrar
      error.message = humanMessage;
    }

    return Promise.reject(error);
  }
);

export default apiClient;
