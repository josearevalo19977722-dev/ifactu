import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Empresa } from '../../empresa/entities/empresa.entity';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { Dte, EstadoDte } from '../entities/dte.entity';
import { InvalidarDteDto } from '../dto/invalidar-dte.dto';
import { SignerService } from './signer.service';
import { svDateTime } from '../../utils/sv-datetime';
import { AuthMhService } from '../../auth-mh/auth-mh.service';
import { getAmbiente, getNitEmisor } from './mh-config.helper';
import { EmpresaService } from '../../empresa/services/empresa.service';

// No existe un "tipoDte" de anulación — el endpoint /anulardte recibe el evento de invalidación

@Injectable()
export class InvalidacionService {
  private readonly logger = new Logger(InvalidacionService.name);

  constructor(
    @InjectRepository(Dte)
    private readonly dteRepo: Repository<Dte>,
    private readonly config: ConfigService,
    private readonly http: HttpService,
    private readonly signer: SignerService,
    private readonly authMh: AuthMhService,
    private readonly empresaService: EmpresaService,
    @InjectRepository(Empresa)
    private readonly empresaRepo: Repository<Empresa>,
  ) {}

  async anular(dto: InvalidarDteDto, empresaId: string): Promise<Dte> {
    const dte = await this.dteRepo.findOne({ 
      where: { id: dto.dteId, empresa: { id: empresaId } } 
    });
    if (!dte) throw new NotFoundException(`DTE ${dto.dteId} no encontrado o no pertenece a su empresa`);
    if (dte.estado === EstadoDte.ANULADO) {
      throw new BadRequestException('El DTE ya está anulado');
    }
    if (dte.estado !== EstadoDte.RECIBIDO) {
      throw new BadRequestException(
        'Solo se pueden anular DTEs con estado RECIBIDO',
      );
    }

    const { fecEmi: fecAnula, horEmi: horAnula } = svDateTime();
    const codigoGeneracion = uuidv4().toUpperCase();

    const empresa = await this.empresaService.findById(empresaId);
    if (!empresa) throw new Error('Empresa no encontrada');

    const ambiente = getAmbiente(empresa, this.config);

    const jsonAnulacion = {
      identificacion: {
        version: 2,
        ambiente,
        codigoGeneracion,
        fecAnula,
        horAnula,
      },
      emisor: {
        nit: getNitEmisor(empresa),
        nrc: empresa.nrc.replace(/-/g, ''),
        nombre: empresa.nombreLegal,
        telefono: empresa.telefono,
        correo: empresa.correo,
        codEstableMH:    (empresa.codEstableMh || '').toString().padStart(4, '0'),
        codPuntoVentaMH: (empresa.codPuntoVentaMh || '').toString().padStart(4, '0'),
        nomEstablecimiento: empresa.nombreComercial || null,
      },
      documento: {
        tipoDte: dte.tipoDte,
        codigoGeneracion: dte.codigoGeneracion,
        selloRecibido: dte.selloRecepcion,
        numeroControl: dte.numeroControl,
        fecEmi: dte.fechaEmision,
        montoIva: this.calcularIva(dte),
        codigoGeneracionR: null,
      },
      motivo: {
        tipoAnulacion: dto.tipoAnulacion,
        motivoAnulacion: (dto.motivoAnulacion || '').substring(0, 250), // Límite esquema v2
        nombreResponsable: dto.nombreResponsable,
        tipDocResponsable: dto.tipDocResponsable,
        numDocResponsable: dto.numDocResponsable,
        nombreSolicita: dto.nombreSolicita,
        tipDocSolicita: dto.tipDocSolicita,
        numDocSolicita: dto.numDocSolicita,
      },
    };

    const jsonFirmado = await this.signer.firmar(jsonAnulacion, empresa);

    const url    = this.config.get<string>('MH_ANULAR_URL', '');
    const nit    = getNitEmisor(empresa);
    const token  = await this.authMh.getToken(empresa);
    const documento = Buffer.from(JSON.stringify(jsonFirmado)).toString('base64');

    const idEnvio = Date.now().toString(); // Hacienda prefiere numérico
    this.logger.debug(`Enviando invalidación MH - idEnvio: ${idEnvio}`);
    this.logger.debug(`JSON Original (sin firma): ${JSON.stringify(jsonAnulacion, null, 2)}`);

    // Manual MH sección 4.5: el payload de /anulardte no lleva tipoDte en el nivel raíz
    const payload = {
      ambiente,
      idEnvio,
      version: 2,
      documento,
    };

    try {
      const { data } = await firstValueFrom(
        this.http.post(url, payload, {
          headers: {
            Authorization: token,
            'Content-Type': 'application/json',
            nitEmisor: nit,
            'User-Agent': 'facturacion-dte/1.0',
          },
          timeout: 15000,
        }),
      );

      const aceptado =
        data.estado === 'PROCESADO' || data.estado === 'RECIBIDO';

      if (aceptado) {
        dte.estado = EstadoDte.ANULADO;
        dte.observaciones =
          `Anulado: ${dto.motivoAnulacion}` +
          (data.selloRecibido ? ` | Sello: ${data.selloRecibido}` : '');
        dte.codigoMsg = data.codigoMsg ?? null;
        dte.descripcionMsg = data.descripcionMsg ?? null;
      } else {
        throw new BadRequestException(
          `MH rechazó la anulación: ${data.descripcionMsg ?? JSON.stringify(data)}`,
        );
      }
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      // Error de red — guardamos el intento pero no cambiamos estado
      throw new BadRequestException(
        `Error al comunicar con el MH: ${err.message}`,
      );
    }

    return this.dteRepo.save(dte);
  }

  private calcularIva(dte: Dte): number {
    const json = dte.jsonDte as any;
    if (!json || !json.resumen) return 0;

    // Para CCF, NC y ND el IVA está en el arreglo de tributos (código 20)
    if (['03', '05', '06'].includes(dte.tipoDte)) {
      const ivaTributo = json.resumen.tributos?.find(
        (t: any) => t.codigo === '20',
      );
      return ivaTributo?.valor ?? 0;
    }

    // Para CF el IVA está en un campo directo totalIva
    if (dte.tipoDte === '01') {
      return json.resumen.totalIva ?? 0;
    }

    // Para otros tipos (FEXE, FSE, Retención, Donación) el monto IVA es 0
    return 0;
  }
}
