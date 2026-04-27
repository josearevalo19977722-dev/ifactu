import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { firstValueFrom } from 'rxjs';
import { Dte, EstadoDte } from '../entities/dte.entity';
import { AuthMhService } from '../../auth-mh/auth-mh.service';
import { getAmbiente, getNitEmisor } from './mh-config.helper';

export interface ConsultaMhResult {
  codigoGeneracion: string;
  estadoMh: string;
  selloRecepcion?: string;
  observaciones?: string[];
}

@Injectable()
export class ConsultaMhService {
  private readonly logger = new Logger(ConsultaMhService.name);

  constructor(
    @InjectRepository(Dte)
    private readonly dteRepo: Repository<Dte>,
    private readonly http: HttpService,
    private readonly config: ConfigService,
    private readonly authMh: AuthMhService,
  ) {}

  /**
   * Consulta el estado de un DTE en el MH y actualiza el registro local.
   */
  async consultar(id: string): Promise<Dte> {
    const dte = await this.dteRepo.findOneOrFail({ where: { id }, relations: ['empresa'] });

    const url      = this.config.get<string>('MH_CONSULTA_URL', '');
    const nit      = getNitEmisor(dte.empresa);
    const token    = await this.authMh.getToken(dte.empresa);
    const ambiente = getAmbiente(dte.empresa, this.config);

    // Manual MH sección 4.3.1: GET {url}/{codigoGeneracion} con tipoDte y ambiente como query params
    const { data } = await firstValueFrom(
      this.http.get(`${url}/${dte.codigoGeneracion}`, {
        params: {
          ambiente,
          tipoDte: dte.tipoDte,
        },
        headers: {
          Authorization: token,
          nitEmisor: nit,
          'User-Agent': 'facturacion-dte/1.0',
        },
        timeout: 10000,
      }),
    );

    this.logger.log(
      `Consulta MH para ${dte.codigoGeneracion}: ${JSON.stringify(data)}`,
    );

    // Sincronizar estado local con lo que responde el MH
    if (data.selloRecibido && dte.estado !== EstadoDte.ANULADO) {
      dte.estado = EstadoDte.RECIBIDO;
      dte.selloRecepcion = data.selloRecibido;
    }
    if (data.observaciones?.length) {
      dte.observaciones = data.observaciones.join(', ');
    }

    return this.dteRepo.save(dte);
  }

  /**
   * Consulta el estado de un lote de DTEs en el MH (sección 4.3.2 del manual).
   * Retorna los DTE procesados y rechazados individually.
   */
  async consultarLote(codigoLote: string, empresa: any): Promise<{
    procesados: Array<{
      codigoGeneracion: string;
      estado: string;
      selloRecepcion?: string;
      fhProcesamiento?: string;
      clasificaMsg?: string;
      codigoMsg?: string;
      descripcionMsg?: string;
    }>;
    rechazados: Array<{
      codigoGeneracion: string;
      estado: string;
      clasificaMsg?: string;
      codigoMsg?: string;
      descripcionMsg?: string;
    }>;
  }> {
    const url = this.config.get<string>('MH_LOTE_CONSULTA_URL', '');
    const nit = getNitEmisor(empresa);
    const token = await this.authMh.getToken(empresa);

    this.logger.log(`Consultando lote ${codigoLote} en MH`);

    const { data } = await firstValueFrom(
      this.http.get(`${url}/${codigoLote}`, {
        headers: {
          Authorization: token,
          nitEmisor: nit,
          'User-Agent': 'facturacion-dte/1.0',
        },
        timeout: 15000,
      }),
    );

    return {
      procesados: (data.procesados || []).map((p: any) => ({
        codigoGeneracion: p.codigoGeneracion,
        estado: p.estado,
        selloRecepcion: p.selloRecibido,
        fhProcesamiento: p.fhProcesamiento,
        clasificaMsg: p.clasificaMsg,
        codigoMsg: p.codigoMsg,
        descripcionMsg: p.descripcionMsg,
      })),
      rechazados: (data.rechazados || []).map((r: any) => ({
        codigoGeneracion: r.codigoGeneracion,
        estado: r.estado,
        clasificaMsg: r.clasificaMsg,
        codigoMsg: r.codigoMsg,
        descripcionMsg: r.descripcionMsg,
      })),
    };
  }

  /**
   * Procesa la respuesta de un lote consultando al MH y actualizando cada DTE local.
   */
  async procesarResultadoLote(codigoLote: string, empresa: any): Promise<{ actualizados: number; rechazados: number }> {
    const resultado = await this.consultarLote(codigoLote, empresa);

    let actualizados = 0;
    let rechazados = 0;

    for (const p of resultado.procesados) {
      const dte = await this.dteRepo.findOne({
        where: { codigoGeneracion: p.codigoGeneracion, empresa: { id: empresa.id } },
      });
      if (dte) {
        dte.estado = EstadoDte.RECIBIDO;
        dte.selloRecepcion = p.selloRecepcion ?? null;
        dte.fhProcesamiento = p.fhProcesamiento ?? null;
        dte.clasificaMsg = p.clasificaMsg ?? null;
        dte.codigoMsg = p.codigoMsg ?? null;
        dte.descripcionMsg = p.descripcionMsg ?? null;
        dte.observaciones = null;
        await this.dteRepo.save(dte);
        actualizados++;
      }
    }

    for (const r of resultado.rechazados) {
      const dte = await this.dteRepo.findOne({
        where: { codigoGeneracion: r.codigoGeneracion, empresa: { id: empresa.id } },
      });
      if (dte) {
        dte.estado = EstadoDte.RECHAZADO;
        dte.clasificaMsg = r.clasificaMsg ?? null;
        dte.codigoMsg = r.codigoMsg ?? null;
        dte.descripcionMsg = r.descripcionMsg ?? null;
        dte.observaciones = `Rechazado en lote ${codigoLote}: ${r.descripcionMsg}`;
        await this.dteRepo.save(dte);
        rechazados++;
      }
    }

    this.logger.log(`Lote ${codigoLote}: ${actualizados} actualizados, ${rechazados} rechazados`);
    return { actualizados, rechazados };
  }
}
