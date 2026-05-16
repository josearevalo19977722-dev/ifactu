import { Injectable, NotFoundException, Inject, forwardRef } from '@nestjs/common';

/** Tipos DTE MH que se pueden asignar a un tenant (emisión) */
export const TIPOS_DTE_TODOS = ['01', '03', '04', '05', '06', '07', '11', '14', '15'] as const;
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Empresa } from '../entities/empresa.entity';
import { Usuario, RolUsuario } from '../../usuarios/usuario.entity';
import { Dte } from '../../dte/entities/dte.entity';
import * as bcrypt from 'bcrypt';
import { BillingService } from '../../billing/billing.service';
import { encrypt, decrypt } from '../../utils/encryption.util';

@Injectable()
export class TenantsService {
  private readonly encryptionKey: string;

  constructor(
    @InjectRepository(Empresa)
    private readonly empresaRepo: Repository<Empresa>,
    @InjectRepository(Usuario)
    private readonly usuarioRepo: Repository<Usuario>,
    @InjectRepository(Dte)
    private readonly dteRepo: Repository<Dte>,
    @Inject(forwardRef(() => BillingService))
    private readonly billing: BillingService,
    private readonly config: ConfigService,
  ) {
    this.encryptionKey = (this.config.get('DB_ENCRYPTION_KEY', '') || '').trim();
  }

  /** Oculta campos sensibles antes de devolver al frontend */
  private sanitizeTenant(e: Empresa): Empresa {
    const copy = { ...e } as any;
    if (copy.mhApiKey)       copy.mhApiKey       = '••••••••';
    if (copy.mhPasswordCert) copy.mhPasswordCert = '••••••••';
    return copy;
  }

  async listTenants() {
    const tenants = await this.empresaRepo.find({ order: { createdAt: 'DESC' } });
    return tenants.map(t => this.sanitizeTenant(t));
  }

  async createTenant(dto: any) {
    const tipos: string[] = Array.isArray(dto.tiposDteHabilitados)
      ? dto.tiposDteHabilitados.filter((c: string) => TIPOS_DTE_TODOS.includes(c as any))
      : [...TIPOS_DTE_TODOS];

    // 1. Crear Empresa
    const empresa = this.empresaRepo.create({
      nombreLegal: dto.nombreLegal,
      nit: dto.nit,
      nrc: dto.nrc,
      correo: dto.correo,
      telefono: dto.telefono,
      codActividad: dto.codActividad ?? '00000',
      descActividad: dto.descActividad ?? 'Actividad económica',
      departamento: dto.departamento ?? '06',
      municipio: dto.municipio ?? '14',
      complemento: dto.complemento ?? 'Por completar',
      tiposDteHabilitados: tipos.length > 0 ? tipos : [...TIPOS_DTE_TODOS],
    });
    const savedEmpresa = await this.empresaRepo.save(empresa);

    // 2. Crear Usuario Dueño (ADMIN del tenant)
    const passwordHash = await bcrypt.hash(dto.adminPassword || 'Temporal123', 10);
    const usuario = this.usuarioRepo.create({
      email: dto.adminEmail,
      nombre: dto.adminNombre || 'Administrador',
      passwordHash,
      rol: RolUsuario.ADMIN,
      empresa: savedEmpresa,
    });
    await this.usuarioRepo.save(usuario);

    // 3. Asignar plan inicial si hay uno configurado
    await this.billing.asignarPlanInicialSiCorresponde(savedEmpresa.id);

    return savedEmpresa;
  }

  async toggleTenantStatus(id: string) {
    const empresa = await this.empresaRepo.findOne({ where: { id } });
    if (!empresa) throw new NotFoundException('Empresa no encontrada');
    empresa.activo = !empresa.activo;
    return this.empresaRepo.save(empresa);
  }

  async updateTenant(id: string, dto: Partial<Empresa>) {
    const empresa = await this.empresaRepo.findOne({ where: { id } });
    if (!empresa) throw new NotFoundException('Empresa no encontrada');

    // Encriptar campos sensibles si vienen con valor real (no el placeholder ••••••••)
    if ((dto as any).mhApiKey && (dto as any).mhApiKey !== '••••••••') {
      (dto as any).mhApiKey = encrypt((dto as any).mhApiKey, this.encryptionKey);
    } else {
      delete (dto as any).mhApiKey; // no tocar el valor existente
    }
    if ((dto as any).mhPasswordCert && (dto as any).mhPasswordCert !== '••••••••') {
      (dto as any).mhPasswordCert = encrypt((dto as any).mhPasswordCert, this.encryptionKey);
    } else {
      delete (dto as any).mhPasswordCert; // no tocar el valor existente
    }

    // Campos editables por superadmin
    const allowed: (keyof Empresa)[] = [
      'nombreLegal', 'nombreComercial', 'nit', 'nrc', 'correo', 'telefono',
      'codActividad', 'descActividad', 'departamento', 'municipio', 'complemento',
      'activo', 'pagoAlDia', 'esAgenteRetencion', 'mhAmbiente',
      'mhPasswordCert', 'mhApiKey', 'tiposDteHabilitados',
    ];
    for (const key of allowed) {
      if (dto[key] === undefined) continue;
      if (key === 'tiposDteHabilitados') {
        const raw = (dto as any).tiposDteHabilitados;
        const t = Array.isArray(raw)
          ? raw.filter((c: string) => (TIPOS_DTE_TODOS as readonly string[]).includes(c))
          : [];
        (empresa as any).tiposDteHabilitados = t.length > 0 ? t : [...TIPOS_DTE_TODOS];
      } else {
        (empresa as any)[key] = (dto as any)[key];
      }
    }
    return this.sanitizeTenant(await this.empresaRepo.save(empresa));
  }

  async getTenantStats(id: string) {
    const empresa = await this.empresaRepo.findOne({ where: { id } });
    if (!empresa) throw new NotFoundException('Empresa no encontrada');

    const rows = await this.dteRepo
      .createQueryBuilder('d')
      .select('d.tipoDte', 'tipoDte')
      .addSelect('d.estado', 'estado')
      .addSelect('COUNT(*)', 'cantidad')
      .addSelect('SUM(d.totalPagar)', 'totalPagar')
      .where('d.empresa = :id', { id })
      .groupBy('d.tipoDte')
      .addGroupBy('d.estado')
      .getRawMany();

    const totalDtes = rows.reduce((s, r) => s + Number(r.cantidad), 0);
    const totalFacturado = rows
      .filter(r => r.estado !== 'ANULADO')
      .reduce((s, r) => s + Number(r.totalPagar || 0), 0);

    return {
      empresa: {
        id: empresa.id,
        nombreLegal: empresa.nombreLegal,
        activo: empresa.activo,
        pagoAlDia: empresa.pagoAlDia,
        dtesEmitidosMes: empresa.dtesEmitidosMes,
        mhAmbiente: empresa.mhAmbiente,
        createdAt: empresa.createdAt,
      },
      totalDtes,
      totalFacturado: Math.round(totalFacturado * 100) / 100,
      desglose: rows,
    };
  }
}
