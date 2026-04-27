/** Usuario devuelto por GET /auth/usuarios */
export interface UsuarioSistema {
  id: string;
  email: string;
  nombre: string;
  rol: string;
  activo: boolean;
}

export interface CrearUsuarioPayload {
  email: string;
  nombre: string;
  password: string;
  rol: string;
}
