import { Injectable, OnModuleInit, Logger, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Empresa } from '../entities/empresa.entity';
import { encrypt, decrypt } from '../../utils/encryption.util';
import { randomBytes } from 'crypto';

@Injectable()
export class EmpresaService implements OnModuleInit {
  private readonly logger = new Logger(EmpresaService.name);
  private readonly encryptionKey: string;

  constructor(
    @InjectRepository(Empresa)
    private readonly repo: Repository<Empresa>,
    private readonly config: ConfigService,
  ) {
    this.encryptionKey = (this.config.get('DB_ENCRYPTION_KEY', '') || '').trim();
    if (this.encryptionKey.length !== 64) {
      console.error(`[EmpresaService] DB_ENCRYPTION_KEY inválida: longitud=${this.encryptionKey.length} (se requieren 64 chars hex)`);
    }
  }

  async onModuleInit() {
    await this.initEmpresa();
  }

  /**
   * Carga inicial de datos de la empresa desde .env si no existe registro
   */
  async initEmpresa() {
    const count = await this.repo.count();
    if (count === 0) {
      this.logger.log('Cargando datos iniciales de la empresa desde .env...');
      const empresa = this.repo.create({
        nombreLegal: this.config.get('EMISOR_NOMBRE', 'Mi Empresa S.A. de C.V.'),
        nombreComercial: this.config.get('EMISOR_NOMBRE_COMERCIAL', 'Mi Empresa'),
        nit: this.config.get('EMISOR_NIT', '0000-000000-000-0'),
        nrc: this.config.get('EMISOR_NRC', '0000-0'),
        codActividad: this.config.get('EMISOR_COD_ACTIVIDAD', '00000'),
        descActividad: this.config.get('EMISOR_DESC_ACTIVIDAD', 'Giro Comercial'),
        tipoEstablecimiento: this.config.get('EMISOR_TIPO_ESTABLECIMIENTO', '01'),
        codEstableMh: this.config.get('EMISOR_COD_ESTABLE_MH', 'M001'),
        codPuntoVentaMh: this.config.get('EMISOR_COD_PUNTO_VENTA_MH', 'P001'),
        departamento: this.config.get('EMISOR_DEPARTAMENTO', '06'),
        municipio: this.config.get('EMISOR_MUNICIPIO', '14'),
        complemento: this.config.get('EMISOR_COMPLEMENTO', 'Dirección de la empresa'),
        telefono: this.config.get('EMISOR_TELEFONO', '2222-2222'),
        correo: this.config.get('EMISOR_CORREO', 'info@empresa.com'),
      });
      await this.repo.save(empresa);
      this.logger.log('Datos de la empresa cargados exitosamente.');
    }
  }

  /**
   * @param empresaId Si viene del JWT, perfil de esa empresa; si no, primera empresa (compat. single-tenant).
   */
  async obtenerPerfil(empresaId?: string | null): Promise<Empresa> {
    if (empresaId) {
      const empresa = await this.repo.findOne({ where: { id: empresaId } });
      if (!empresa) throw new NotFoundException('Empresa no encontrada');
      return this.decryptEmpresa(empresa);
    }
    let empresa = await this.repo.findOne({ where: {} });
    if (!empresa) {
      await this.initEmpresa();
      empresa = await this.repo.findOneOrFail({ where: {} });
    }
    return this.decryptEmpresa(empresa);
  }

  /** Superadmin SaaS: restringe qué tipos de DTE puede emitir el tenant */
  assertTipoDteHabilitado(empresa: Empresa, tipoDte: string): void {
    const list = empresa.tiposDteHabilitados;
    if (Array.isArray(list) && list.length > 0 && !list.includes(tipoDte)) {
      throw new ForbiddenException(
        `Esta empresa no tiene habilitada la emisión del comprobante (tipo ${tipoDte}).`,
      );
    }
  }

  async findById(id: string): Promise<Empresa> {
    const empresa = await this.repo.findOne({ where: { id } });
    if (!empresa) throw new Error('Empresa no encontrada');
    return this.decryptEmpresa(empresa);
  }

  async findByInternalApiKey(key: string): Promise<Empresa | null> {
    const empresa = await this.repo.findOne({ where: { internalApiKey: key } });
    if (!empresa) return null;
    return this.decryptEmpresa(empresa);
  }

  async generarInternalApiKey(empresaId: string): Promise<string> {
    const key = `nx_live_${randomBytes(24).toString('hex')}`;
    await this.repo.update(empresaId, { internalApiKey: key });
    return key;
  }

  async actualizar(dto: Partial<Empresa>, empresaId?: string | null): Promise<Empresa> {
    const perfil = await this.obtenerPerfil(empresaId);
    
    // Encriptar campos sensibles antes de guardar
    if (dto.mhPasswordCert) {
      dto.mhPasswordCert = encrypt(dto.mhPasswordCert, this.encryptionKey);
    }
    if (dto.mhApiKey) {
      dto.mhApiKey = encrypt(dto.mhApiKey, this.encryptionKey);
    }

    Object.assign(perfil, dto);
    const saved = await this.repo.save(perfil);
    return this.decryptEmpresa(saved);
  }

  private decryptEmpresa(empresa: Empresa): Empresa {
    if (empresa.mhPasswordCert) {
      empresa.mhPasswordCert = decrypt(empresa.mhPasswordCert, this.encryptionKey);
    }
    if (empresa.mhApiKey) {
      empresa.mhApiKey = decrypt(empresa.mhApiKey, this.encryptionKey);
    }
    return empresa;
  }

  async guardarLogo(path: string, empresaId?: string | null): Promise<Empresa> {
    const perfil = await this.obtenerPerfil(empresaId);
    perfil.logoPath = path;
    return this.repo.save(perfil);
  }
}
