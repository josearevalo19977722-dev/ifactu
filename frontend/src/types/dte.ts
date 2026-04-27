export type TipoDte = '01' | '03' | '04' | '05' | '06' | '07' | '11' | '14' | '15';

export type EstadoDte = 'PENDIENTE' | 'RECIBIDO' | 'RECHAZADO' | 'CONTINGENCIA' | 'ANULADO';

export interface Dte {
  id: string;
  tipoDte: TipoDte;
  numeroControl: string;
  codigoGeneracion: string;
  jsonDte: object;
  estado: EstadoDte;
  selloRecepcion?: string;
  observaciones?: string;
  clasificaMsg?: string;
  codigoMsg?: string;
  descripcionMsg?: string;
  fhProcesamiento?: string;
  fechaEmision: string;
  totalPagar: number;
  receptorNombre?: string;
  createdAt: string;
}

export interface ItemCf {
  numItem: number;
  tipoItem: number;
  cantidad: number;
  codigo?: string;
  uniMedida: number;
  descripcion: string;
  precioUni: number;
  montoDescu: number;
  ventaNoSuj: number;
  ventaExenta: number;
  ventaGravada: number;
  incluyeIva?: boolean;
}

export interface Pago {
  codigo: string;
  montoPago: number;
  referencia?: string;
  plazo?: string;
  periodo?: number;
}

export interface CreateCfPayload {
  receptor?: {
    tipoDocumento?: string;
    numDocumento?: string;
    nombre?: string;
    correo?: string;
    telefono?: string;
  };
  items: ItemCf[];
  condicionOperacion: number;
  pagos: Pago[];
  observaciones?: string;
}

export interface CreateCcfPayload {
  receptor: {
    nit: string;
    nrc: string;
    nombre: string;
    codActividad: string;
    descActividad: string;
    direccionDepartamento: string;
    direccionMunicipio: string;
    direccionComplemento: string;
    telefono?: string;
    correo?: string;
    esGranContribuyente?: boolean;
  };
  items: ItemCf[];
  condicionOperacion: number;
  pagos: Pago[];
  observaciones?: string;
}
