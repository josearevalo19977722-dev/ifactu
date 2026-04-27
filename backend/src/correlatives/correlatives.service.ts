import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Correlative } from './entities/correlative.entity';
import { EmpresaService } from '../empresa/services/empresa.service';
import { getAmbiente } from '../dte/services/mh-config.helper';

@Injectable()
export class CorrelativesService {
  constructor(
    @InjectRepository(Correlative)
    private readonly repo: Repository<Correlative>,
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly empresaService: EmpresaService,
  ) {}

  /**
   * Genera el número de control con el formato vigente desde 09/10/2025:
   * DTE-{tipoDte}-{codEstableMH}{codPuntoVentaMH}-{15 dígitos secuenciales}
   * Ejemplo: DTE-01-M001P001-000000000000001
   */
   async siguiente(
     tipoDte: string, 
     empresa: any, 
     sucursalCode: string, 
     posCode: string
   ): Promise<string> {
    const ambiente = getAmbiente(empresa, this.config); // 1: Pruebas, 2: Prod
    const anio = new Date().getFullYear();

    return await this.dataSource.transaction(async (manager) => {
      let correlativo = await manager.findOne(Correlative, {
        where: { 
          tipoDte, 
          ambiente, 
          sucursal: sucursalCode, 
          pos: posCode,
          empresa: { id: empresa.id },
          anio
        },
        lock: { mode: 'pessimistic_write' },
      });

      if (!correlativo) {
        correlativo = manager.create(Correlative, { 
          tipoDte, 
          ambiente, 
          sucursal: sucursalCode, 
          pos: posCode, 
          empresa,
          anio,
          ultimoNumero: 0 
        });
      }

      correlativo.ultimoNumero = Number(correlativo.ultimoNumero) + 1;
      await manager.save(correlativo);

      // Hacienda exige exactamente 15 dígitos para la parte secuencial.
      // Si por alguna razón el número excediera los 15 dígitos (más de 999 billones),
      // lo truncamos a los últimos 15 para cumplir con el formato técnico del DTE.
      const numero = String(correlativo.ultimoNumero).slice(-15).padStart(15, '0');
      return `DTE-${tipoDte}-${sucursalCode}${posCode}-${numero}`;
    });
  }

  async listar(empresaId: string) {
    return this.repo.find({
      where: { empresa: { id: empresaId } },
      order: { anio: 'DESC', tipoDte: 'ASC' }
    });
  }

  async inicializar(empresa: any, data: {
    tipoDte: string,
    sucursal: string,
    pos: string,
    ultimoNumero: number,
    anio?: number
  }) {
    const anio = data.anio || new Date().getFullYear();
    const ambiente = getAmbiente(empresa, this.config);

    let corr = await this.repo.findOne({
      where: {
        tipoDte: data.tipoDte,
        ambiente,
        sucursal: data.sucursal,
        pos: data.pos,
        empresa: { id: empresa.id },
        anio
      }
    });

    if (corr) {
      corr.ultimoNumero = data.ultimoNumero;
    } else {
      corr = this.repo.create({
        ...data,
        empresa,
        ambiente,
        anio,
        ultimoNumero: data.ultimoNumero
      });
    }

    return this.repo.save(corr);
  }
}
