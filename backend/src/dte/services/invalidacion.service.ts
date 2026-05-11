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
import { getAmbiente, getMhUrls, getNitEmisor } from './mh-config.helper';
import { EmpresaService } from '../../empresa/services/empresa.service';
import { NotificacionDteService } from './notificacion-dte.service';

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
    private readonly notificacion: NotificacionDteService,
  ) {}

  /**
   * Busca un DTE por UUID interno, codigoGeneracion o numeroControl.
   * Usado por el endpoint POS /dte/:ref/anular para aceptar cualquier referencia.
   */
  async buscarPorRef(ref: string, empresaId: string): Promise<Dte | null> {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(ref)) {
      return this.dteRepo.findOne({ where: { id: ref, empresa: { id: empresaId } } });
    }
    return this.dteRepo.findOne({
      where: [
        { codigoGeneracion: ref, empresa: { id: empresaId } },
        { numeroControl:    ref, empresa: { id: empresaId } },
      ],
    });
  }

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

    // Extraer datos del receptor EXACTAMENTE como están en el jsonDte original
    // (Hacienda valida que coincidan con lo que recibió en el DTE original)
    const jsonOriginal = dte.jsonDte as any;
    const receptorJson = jsonOriginal?.receptor ?? null;
    const receptorNombre  = receptorJson?.nombre        ?? null;
    const receptorTipoDoc = receptorJson?.tipoDocumento ?? null;
    const receptorNumDoc  = receptorJson?.numDocumento  ?? null;

    const jsonAnulacion = {
      identificacion: {
        version: 2,
        ambiente,
        codigoGeneracion,
        fecAnula,
        horAnula,
      },
      emisor: {
        nit:  getNitEmisor(empresa),
        // nrc no va en invalidación (schema v2 no lo permite)
        nombre: empresa.nombreLegal,
        telefono: empresa.telefono,
        correo: empresa.correo,
        codEstable:    (empresa.codEstableMh  || '0').toString().padStart(4, '0'),
        codPuntoVenta: (empresa.codPuntoVentaMh || '0').toString().padStart(4, '0'),
        tipoEstablecimiento: empresa.tipoEstablecimiento || '02',
        nomEstablecimiento: empresa.nombreComercial || empresa.nombreLegal,
      },
      documento: {
        tipoDte:          dte.tipoDte,
        codigoGeneracion: dte.codigoGeneracion,
        selloRecibido:    dte.selloRecepcion,
        numeroControl:    dte.numeroControl,
        fecEmi:           dte.fechaEmision,
        montoIva:         this.calcularIva(dte),
        codigoGeneracionR: null,
        // Campos del receptor requeridos por schema v2
        tipoDocumento: receptorTipoDoc,
        numDocumento:  receptorNumDoc,
        nombre:        receptorNombre,
      },
      motivo: {
        tipoAnulacion: dto.tipoAnulacion,
        motivoAnulacion: (dto.motivoAnulacion || '').substring(0, 250), // Límite esquema v2
        nombreResponsable: dto.nombreResponsable,
        tipDocResponsable: dto.tipDocResponsable ?? '13',
        numDocResponsable: dto.numDocResponsable,
        // Si no se envían los campos de quien solicita, se usan los del responsable
        nombreSolicita: dto.nombreSolicita ?? dto.nombreResponsable,
        tipDocSolicita: dto.tipDocSolicita ?? dto.tipDocResponsable ?? '13',
        numDocSolicita: dto.numDocSolicita ?? dto.numDocResponsable,
      },
    };

    const jsonFirmado = await this.signer.firmar(jsonAnulacion, empresa);

    // Extraer el JWS token igual que TransmitterService
    let jwsToken: string;
    if (typeof jsonFirmado === 'string') {
      jwsToken = jsonFirmado;
    } else if ((jsonFirmado as any).body) {
      jwsToken = (jsonFirmado as any).body;
    } else {
      jwsToken = JSON.stringify(jsonFirmado);
    }

    const url    = getMhUrls(empresa, this.config).anular;
    const nit    = getNitEmisor(empresa);
    const token  = await this.authMh.getToken(empresa);
    // Mismo formato que /recepciondte: JWS directo, sin re-codificar en Base64
    const documento = jwsToken;

    const idEnvio = (Date.now() % 1_000_000_000).toString(); // Max 9 dígitos numéricos
    this.logger.debug(`Enviando invalidación MH - idEnvio: ${idEnvio}`);
    this.logger.debug(`JSON Original (sin firma): ${JSON.stringify(jsonAnulacion, null, 2)}`);

    // Manual MH sección 4.5: el payload de /anulardte no lleva tipoDte en el nivel raíz
    const payload = {
      ambiente,
      idEnvio,
      version: 2,
      documento,
      nitEmisor: nit,
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

        // Notificar al receptor que el documento fue anulado
        const savedDte = await this.dteRepo.save(dte);
        const jsonOrig = jsonOriginal as any;
        this.notificacion.programar({
          dte:      savedDte,
          correo:   jsonOrig?.receptor?.correo   ?? null,
          telefono: jsonOrig?.receptor?.telefono ?? null,
          nombre:   receptorNombre ?? 'Cliente',
          empresa,
        });
        return savedDte;
      } else {
        throw new BadRequestException(
          `MH rechazó la anulación: ${data.descripcionMsg ?? JSON.stringify(data)}`,
        );
      }
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      // Loguear el body de respuesta del MH para diagnóstico
      const responseData = err.response?.data;
      if (responseData) {
        this.logger.error(`MH 400 response: ${JSON.stringify(responseData)}`);
        const mhMsg = responseData.descripcionMsg
          ?? responseData.mensaje
          ?? responseData.message
          ?? JSON.stringify(responseData);
        throw new BadRequestException(`MH rechazó: ${mhMsg}`);
      }
      throw new BadRequestException(
        `Error al comunicar con el MH: ${err.message}`,
      );
    }
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
