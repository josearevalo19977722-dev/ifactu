import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
  BadRequestException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Usuario, RolUsuario } from '../usuarios/usuario.entity';
import { Empresa } from '../empresa/entities/empresa.entity';
import { ExtensionLicenseService } from '../extension-license/extension-license.service';

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(Usuario) private readonly usuarioRepo: Repository<Usuario>,
    @InjectRepository(Empresa) private readonly empresaRepo: Repository<Empresa>,
    private readonly jwtService: JwtService,
    private readonly extensionLic: ExtensionLicenseService,
  ) {}

  async onModuleInit() {
    await this.initAdmin();
    await this.syncLegacyUsers();
  }

  /** Vincula usuarios antiguos (ADMIN/EMISOR) a la primera empresa si no tienen ninguna */
  private async syncLegacyUsers() {
    this.logger.log('Sincronizando usuarios legacy...');
    const mainEmpresa = await this.empresaRepo.findOne({ where: {} }); // Primera empresa
    if (!mainEmpresa) {
      this.logger.warn('No hay empresas creadas. Saltando sincronización de usuarios.');
      return;
    }

    const legacyUsers = await this.usuarioRepo.find({
      where: [
        { rol: RolUsuario.ADMIN, empresa: IsNull() },
        { rol: RolUsuario.EMISOR, empresa: IsNull() },
      ],
      relations: ['empresa'],
    });

    if (legacyUsers.length > 0) {
      this.logger.log(`Vinculando ${legacyUsers.length} usuarios a empresa: ${mainEmpresa.nombreLegal}`);
      for (const user of legacyUsers) {
        user.empresa = mainEmpresa;
        await this.usuarioRepo.save(user);
      }
    }
  }

  async login(email: string, password: string) {
    const user = await this.usuarioRepo.findOne({
      where: { email, activo: true },
      relations: ['empresa', 'empresas']
    });
    if (!user) throw new UnauthorizedException('Credenciales inválidas');

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Credenciales inválidas');

    // Contador con múltiples empresas → pedir selección antes de emitir JWT
    if (user.rol === RolUsuario.CONTADOR && user.empresas?.length > 1) {
      const selectionPayload = {
        sub: user.id,
        email: user.email,
        nombre: user.nombre,
        rol: user.rol,
        requires_selection: true,
      };
      return {
        requires_empresa_selection: true,
        selection_token: this.jwtService.sign(selectionPayload, { expiresIn: '10m' }),
        empresas: user.empresas.map(e => ({ id: e.id, nombre: e.nombreLegal || e.nombreComercial })),
      };
    }

    // Si contador tiene exactamente 1 empresa en lista, usarla; de lo contrario usar empresa principal
    const empresaId = (user.rol === RolUsuario.CONTADOR && user.empresas?.length === 1)
      ? user.empresas[0].id
      : (user.empresa?.id || null);

    const payload = {
      sub: user.id,
      email: user.email,
      nombre: user.nombre,
      rol: user.rol,
      empresaId,
    };
    return {
      access_token: this.jwtService.sign(payload),
      usuario: {
        id: user.id,
        email: user.email,
        nombre: user.nombre,
        rol: user.rol,
        empresaId,
      },
    };
  }

  /** Contador selecciona empresa después del login → devuelve JWT real */
  async seleccionarEmpresa(selectionToken: string, empresaId: string) {
    let payload: any;
    try {
      payload = this.jwtService.verify(selectionToken);
    } catch {
      throw new UnauthorizedException('Token de selección inválido o expirado');
    }
    if (!payload.requires_selection) {
      throw new UnauthorizedException('Token de selección inválido');
    }

    // Verificar que el usuario tiene acceso a esa empresa
    const user = await this.usuarioRepo.findOne({
      where: { id: payload.sub, activo: true },
      relations: ['empresas'],
    });
    if (!user) throw new UnauthorizedException('Usuario no encontrado');

    const tieneAcceso = user.empresas?.some(e => e.id === empresaId);
    if (!tieneAcceso) throw new UnauthorizedException('No tienes acceso a esa empresa');

    const jwtPayload = {
      sub: user.id,
      email: user.email,
      nombre: user.nombre,
      rol: user.rol,
      empresaId,
    };
    return {
      access_token: this.jwtService.sign(jwtPayload),
      usuario: {
        id: user.id,
        email: user.email,
        nombre: user.nombre,
        rol: user.rol,
        empresaId,
      },
    };
  }

  async crearUsuario(dto: { email: string; nombre: string; password: string; rol?: RolUsuario }) {
    const existe = await this.usuarioRepo.findOne({ where: { email: dto.email } });
    if (existe) throw new ConflictException('El email ya está registrado');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = this.usuarioRepo.create({
      email: dto.email, nombre: dto.nombre,
      passwordHash, rol: dto.rol ?? RolUsuario.EMISOR,
    });
    const saved = await this.usuarioRepo.save(user);

    if (saved.rol === RolUsuario.CONTADOR) {
      await this.extensionLic.generarParaContador(saved.id, saved.nombre, saved.email);
    }

    const { passwordHash: _, ...result } = saved;
    return result;
  }

  async listarUsuarios(empresaId?: string) {
    const where = empresaId ? { empresa: { id: empresaId } } : {};
    const users = await this.usuarioRepo.find({ where, order: { createdAt: 'DESC' } });
    return users.map(({ passwordHash: _, ...u }) => u);
  }

  async cambiarRol(id: string, rol: RolUsuario) {
    await this.usuarioRepo.update(id, { rol });
    return this.usuarioRepo.findOne({ where: { id } });
  }

  async toggleActivo(id: string) {
    const user = await this.usuarioRepo.findOneOrFail({ where: { id } });
    await this.usuarioRepo.update(id, { activo: !user.activo });
    return this.usuarioRepo.findOne({ where: { id } });
  }

  /** Solo superadmin: recuperar accesos de admins de inquilino sin tocar la BD a mano */
  async establecerPasswordUsuario(usuarioId: string, password: string) {
    if (!password || password.length < 6) {
      throw new BadRequestException('La contraseña debe tener al menos 6 caracteres');
    }
    const user = await this.usuarioRepo.findOne({ where: { id: usuarioId } });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    const passwordHash = await bcrypt.hash(password, 10);
    await this.usuarioRepo.update(usuarioId, { passwordHash, activo: true });
    return { ok: true as const, email: user.email };
  }

  /** Superadmin: lista TODOS los usuarios del sistema con su empresa */
  async listarTodosLosUsuarios() {
    const users = await this.usuarioRepo.find({
      relations: ['empresa'],
      order: { createdAt: 'DESC' },
    });
    return users.map(({ passwordHash: _, ...u }) => u);
  }

  /** Superadmin: lista usuarios de una empresa específica */
  async listarUsuariosDeEmpresa(empresaId: string) {
    const users = await this.usuarioRepo.find({
      where: { empresa: { id: empresaId } },
      order: { createdAt: 'ASC' },
    });
    return users.map(({ passwordHash: _, ...u }) => u);
  }

  /** Superadmin: crea un usuario vinculado a una empresa específica */
  async crearUsuarioParaEmpresa(
    empresaId: string,
    dto: { email: string; nombre: string; password: string; rol?: RolUsuario },
  ) {
    const empresa = await this.empresaRepo.findOne({ where: { id: empresaId } });
    if (!empresa) throw new NotFoundException('Empresa no encontrada');

    const existe = await this.usuarioRepo.findOne({ where: { email: dto.email } });
    if (existe) throw new ConflictException('El email ya está registrado');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = this.usuarioRepo.create({
      email: dto.email,
      nombre: dto.nombre,
      passwordHash,
      rol: dto.rol ?? RolUsuario.ADMIN,
      empresa,
    });
    const saved = await this.usuarioRepo.save(user);

    if (saved.rol === RolUsuario.CONTADOR) {
      await this.extensionLic.generarParaContador(saved.id, saved.nombre, saved.email);
    }

    const { passwordHash: _, ...result } = saved;
    return result;
  }

  /** Superadmin: actualiza nombre, email y/o password de cualquier usuario */
  async actualizarUsuario(id: string, dto: { nombre?: string; email?: string; password?: string }) {
    const user = await this.usuarioRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    const updates: Partial<Usuario> = {};

    if (dto.nombre?.trim()) updates.nombre = dto.nombre.trim();

    if (dto.email?.trim()) {
      const yaExiste = await this.usuarioRepo.findOne({ where: { email: dto.email.trim() } });
      if (yaExiste && yaExiste.id !== id) {
        throw new BadRequestException('El correo ya está en uso por otro usuario');
      }
      updates.email = dto.email.trim().toLowerCase();
    }

    if (dto.password) {
      if (dto.password.length < 6) throw new BadRequestException('La contraseña debe tener al menos 6 caracteres');
      updates.passwordHash = await bcrypt.hash(dto.password, 10);
    }

    await this.usuarioRepo.update(id, updates);
    const saved = await this.usuarioRepo.findOneOrFail({ where: { id }, relations: ['empresa'] });
    const { passwordHash: _, ...updated } = saved;
    return updated;
  }

  /** Superadmin: genera un token de impersonación para una empresa */
  async impersonarEmpresa(empresaId: string, superadminId: string) {
    // Find first ADMIN user of that empresa
    const adminUser = await this.usuarioRepo.findOne({
      where: { empresa: { id: empresaId }, rol: RolUsuario.ADMIN },
      relations: ['empresa'],
    });
    // Fallback: any user of that empresa
    const user = adminUser ?? await this.usuarioRepo.findOne({
      where: { empresa: { id: empresaId } },
      relations: ['empresa'],
    });
    if (!user) throw new NotFoundException('No se encontró un usuario administrador para esta empresa');

    const payload = {
      sub: user.id, email: user.email, nombre: user.nombre,
      rol: user.rol, empresaId,
      impersonando: true, superadminId,
    };
    return {
      access_token: this.jwtService.sign(payload, { expiresIn: '2h' }),
      usuario: { id: user.id, email: user.email, nombre: user.nombre, rol: user.rol, empresaId, impersonando: true },
    };
  }

  /** Contador cambia de empresa durante la sesión → devuelve nuevo JWT */
  async cambiarEmpresa(usuarioId: string, empresaId: string) {
    const user = await this.usuarioRepo.findOne({
      where: { id: usuarioId, activo: true },
      relations: ['empresas'],
    });
    if (!user) throw new UnauthorizedException('Usuario no encontrado');

    const tieneAcceso = user.empresas?.some(e => e.id === empresaId);
    if (!tieneAcceso) throw new UnauthorizedException('No tienes acceso a esa empresa');

    const jwtPayload = {
      sub: user.id,
      email: user.email,
      nombre: user.nombre,
      rol: user.rol,
      empresaId,
    };
    return {
      access_token: this.jwtService.sign(jwtPayload),
      usuario: {
        id: user.id,
        email: user.email,
        nombre: user.nombre,
        rol: user.rol,
        empresaId,
      },
    };
  }

  /** Devuelve la lista de empresas a las que tiene acceso un contador */
  async empresasDeContador(usuarioId: string) {
    const user = await this.usuarioRepo.findOne({
      where: { id: usuarioId },
      relations: ['empresas'],
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return (user.empresas ?? []).map(e => ({ id: e.id, nombre: e.nombreLegal || e.nombreComercial }));
  }

  /** Superadmin: asigna una empresa a un contador */
  async asignarEmpresaContador(usuarioId: string, empresaId: string) {
    const user = await this.usuarioRepo.findOne({
      where: { id: usuarioId },
      relations: ['empresas'],
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    const empresa = await this.empresaRepo.findOne({ where: { id: empresaId } });
    if (!empresa) throw new NotFoundException('Empresa no encontrada');
    const yaAsignada = user.empresas?.some(e => e.id === empresaId);
    if (!yaAsignada) {
      user.empresas = [...(user.empresas ?? []), empresa];
      await this.usuarioRepo.save(user);
    }
    return { ok: true };
  }

  /** Superadmin: quita una empresa de un contador */
  async quitarEmpresaContador(usuarioId: string, empresaId: string) {
    const user = await this.usuarioRepo.findOne({
      where: { id: usuarioId },
      relations: ['empresas'],
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    user.empresas = (user.empresas ?? []).filter(e => e.id !== empresaId);
    await this.usuarioRepo.save(user);
    return { ok: true };
  }

  /** Crea o RE-SETEA el usuario superadmin maestro de la plataforma */
  async initAdmin() {
    const adminEmail = 'superadmin@nexa.com';
    const exists = await this.usuarioRepo.findOne({ where: { email: adminEmail } });

    if (!exists) {
      this.logger.log(`Creando Superusuario Maestro: ${adminEmail}`);
      await this.crearUsuario({
        email: adminEmail,
        nombre: 'Nexa SuperAdmin',
        password: 'SuperAdmin1234',
        rol: RolUsuario.SUPERADMIN,
      });
    } else {
      this.logger.log(
        `Superusuario ${adminEmail} ya existe. Asegurando rol y reseteando contraseña...`,
      );
      const passwordHash = await bcrypt.hash('SuperAdmin1234', 10);
      await this.usuarioRepo.update(exists.id, {
        passwordHash,
        activo: true,
        rol: RolUsuario.SUPERADMIN,
      });
    }
  }
}
