import type { CreateCcfPayload, CreateCfPayload, Dte } from '../types/dte';
import apiClient, { API_BASE } from './apiClient';

const api = apiClient;

export interface InvalidarPayload {
  tipoAnulacion: 1 | 2 | 3;
  motivoAnulacion: string;
  nombreResponsable: string;
  numDocResponsable: string;
  tipDocResponsable?: string;
  nombreSolicita?: string;
  tipDocSolicita?: string;
  numDocSolicita?: string;
}

export const dteApi = {
  emitirCf: (payload: CreateCfPayload): Promise<Dte> =>
    api.post<Dte>('/dte/cf', payload).then((r) => r.data),

  emitirCcf: (payload: CreateCcfPayload): Promise<Dte> =>
    api.post<Dte>('/dte/ccf', payload).then((r) => r.data),

  listar: (params?: {
    tipoDte?: string;
    estado?: string;
    q?: string;
    page?: number;
    limit?: number;
    empresaId?: string;
  }): Promise<[Dte[], number]> =>
    api.get<[Dte[], number]>('/dte', { params }).then((r) => r.data),

  obtener: (id: string): Promise<Dte> =>
    api.get<Dte>(`/dte/${id}`).then((r) => r.data),

  anular: (dteId: string, payload: InvalidarPayload): Promise<Dte> =>
    api.post<Dte>(`/dte/${dteId}/anular`, payload).then((r) => r.data),

  consultarMh: (id: string): Promise<Dte> =>
    api.post<Dte>(`/dte/${id}/consultar-mh`).then((r) => r.data),

  pdfUrl: (id: string): string =>
    `${API_BASE.replace(/\/$/, '')}/public/dte/${id}/pdf`,
};
