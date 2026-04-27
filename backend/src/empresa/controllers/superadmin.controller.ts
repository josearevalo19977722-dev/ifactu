import { Controller, Get, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../../auth/roles.guard';
import { RolUsuario } from '../../usuarios/usuario.entity';
import { Dte, EstadoDte } from '../../dte/entities/dte.entity';
import { Empresa } from '../entities/empresa.entity';
import { Suscripcion, EstadoSuscripcion } from '../entities/suscripcion.entity';

@Controller('api/superadmin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RolUsuario.SUPERADMIN)
export class SuperadminController {
  constructor(
    @InjectRepository(Dte)
    private readonly dteRepo: Repository<Dte>,
    @InjectRepository(Empresa)
    private readonly empresaRepo: Repository<Empresa>,
    @InjectRepository(Suscripcion)
    private readonly suscripcionRepo: Repository<Suscripcion>,
  ) {}

  @Get('dashboard')
  async getDashboard() {
    const [
      totalEmpresas,
      empresasActivas,
      empresasInactivas,
      dtesTotales,
      dtesRecibidos,
      dtesPendientes,
      dtesRechazados,
      suscripcionesActivas,
      suscripcionesVencidas,
    ] = await Promise.all([
      this.empresaRepo.count(),
      this.empresaRepo.count({ where: { activo: true } }),
      this.empresaRepo.count({ where: { activo: false } }),
      this.dteRepo.count(),
      this.dteRepo.count({ where: { estado: EstadoDte.RECIBIDO } }),
      this.dteRepo.count({ where: { estado: EstadoDte.PENDIENTE } }),
      this.dteRepo.count({ where: { estado: EstadoDte.RECHAZADO } }),
      this.suscripcionRepo.count({ where: { estado: EstadoSuscripcion.ACTIVA } }),
      this.suscripcionRepo.count({ where: { estado: EstadoSuscripcion.VENCIDA } }),
    ]);

    const emitidasEsteMes = await this.dteRepo
      .createQueryBuilder('dte')
      .where('EXTRACT(MONTH FROM dte.fechaEmision) = EXTRACT(MONTH FROM NOW())')
      .andWhere('EXTRACT(YEAR FROM dte.fechaEmision) = EXTRACT(YEAR FROM NOW())')
      .getCount();

    const porEstado = await this.dteRepo
      .createQueryBuilder('dte')
      .select('dte.estado', 'estado')
      .addSelect('COUNT(*)', 'cantidad')
      .groupBy('dte.estado')
      .getRawMany();

    const porTipo = await this.dteRepo
      .createQueryBuilder('dte')
      .select('dte.tipoDte', 'tipo')
      .addSelect('COUNT(*)', 'cantidad')
      .groupBy('dte.tipoDte')
      .getRawMany();

    return {
      empresas: {
        total: totalEmpresas,
        activas: empresasActivas,
        inactivas: empresasInactivas,
      },
      dtes: {
        total: dtesTotales,
        recibidas: dtesRecibidos,
        pendientes: dtesPendientes,
        rechazadas: dtesRechazados,
        emitidasEsteMes,
      },
      suscripciones: {
        activas: suscripcionesActivas,
        vencidas: suscripcionesVencidas,
      },
      porEstado,
      porTipo,
    };
  }

  @Get('empresas')
  async listarEmpresas() {
    return this.empresaRepo.find({
      relations: ['suscripciones'],
      order: { createdAt: 'DESC' },
    });
  }

  @Get('empresas/:id/dtes')
  async dtesPorEmpresa(empresaId: string) {
    const empresa = await this.empresaRepo.findOne({ where: { id: empresaId } });
    if (!empresa) return { error: 'Empresa no encontrada' };

    const dtes = await this.dteRepo.find({
      where: { empresa: { id: empresaId } },
      order: { createdAt: 'DESC' },
      take: 100,
    });

    const total = await this.dteRepo.count({ where: { empresa: { id: empresaId } } });

    return { empresa: empresa.nombreLegal, total, dtes };
  }

  @Get('top-empresas')
  async topEmpresas() {
    return this.dteRepo
      .createQueryBuilder('dte')
      .select('dte.empresa_id', 'empresaId')
      .addSelect('empresa.nombre_legal', 'nombre')
      .leftJoin('dte.empresa', 'empresa')
      .addSelect('COUNT(*)', 'totalDtes')
      .addSelect('SUM(dte.totalPagar)', 'totalFacturado')
      .groupBy('dte.empresa_id')
      .addGroupBy('empresa.nombre_legal')
      .orderBy('totalDtes', 'DESC')
      .limit(10)
      .getRawMany();
  }

  @Get('consumo-mensual')
  async consumoMensual() {
    const resultados = await this.dteRepo
      .createQueryBuilder('dte')
      .select('EXTRACT(YEAR FROM dte.fechaEmision)', 'anio')
      .addSelect('EXTRACT(MONTH FROM dte.fechaEmision)', 'mes')
      .addSelect('COUNT(*)', 'total')
      .addSelect('SUM(dte.totalPagar)', 'monto')
      .groupBy('EXTRACT(YEAR FROM dte.fechaEmision)')
      .addGroupBy('EXTRACT(MONTH FROM dte.fechaEmision)')
      .orderBy('anio', 'ASC')
      .addOrderBy('mes', 'ASC')
      .getRawMany();

    return resultados.map((r: any) => ({
      anio: parseInt(r.anio),
      mes: parseInt(r.mes),
      total: parseInt(r.total),
      monto: parseFloat(r.monto || 0),
    }));
  }

  @Get('suscripciones')
  async listarSuscripciones() {
    return this.suscripcionRepo.find({
      relations: ['empresa'],
      order: { createdAt: 'DESC' },
    });
  }
}
