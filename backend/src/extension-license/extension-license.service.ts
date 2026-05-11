import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { ExtensionLicense } from './extension-license.entity';

@Injectable()
export class ExtensionLicenseService {
  constructor(
    @InjectRepository(ExtensionLicense)
    private readonly repo: Repository<ExtensionLicense>,
  ) {}

  async validar(apiKey: string): Promise<{ valid: boolean; nombre?: string; email?: string; plan?: string; origen?: string }> {
    if (!apiKey) return { valid: false };

    const lic = await this.repo.findOne({ where: { apiKey, activa: true } });
    if (!lic) return { valid: false };

    if (lic.expiresAt && new Date() > lic.expiresAt) {
      return { valid: false };
    }

    return {
      valid:   true,
      nombre:  lic.nombre ?? undefined,
      email:   lic.email  ?? undefined,
      plan:    lic.origen === 'n1co' ? 'standalone' : 'ifactu',
      origen:  lic.origen,
    };
  }

  async generarParaContador(usuarioId: string, nombre: string, email: string): Promise<ExtensionLicense> {
    // Un contador solo tiene una licencia activa
    const existente = await this.repo.findOne({ where: { usuarioId, activa: true } });
    if (existente) return existente;

    const lic = this.repo.create({
      apiKey:    randomUUID(),
      origen:    'ifactu',
      activa:    true,
      expiresAt: null,
      nombre,
      email,
      usuarioId,
    });
    return this.repo.save(lic);
  }

  async obtenerDeUsuario(usuarioId: string): Promise<ExtensionLicense | null> {
    return this.repo.findOne({ where: { usuarioId, activa: true } });
  }

  async crear(dto: { nombre: string; email: string; origen: 'ifactu' | 'n1co'; expiresAt?: Date }): Promise<ExtensionLicense> {
    const lic = this.repo.create({
      apiKey:    randomUUID(),
      origen:    dto.origen,
      activa:    true,
      expiresAt: dto.expiresAt ?? null,
      nombre:    dto.nombre,
      email:     dto.email,
      usuarioId: null,
    });
    return this.repo.save(lic);
  }

  async listar(): Promise<ExtensionLicense[]> {
    return this.repo.find({ order: { createdAt: 'DESC' } });
  }

  async revocar(id: string): Promise<void> {
    const lic = await this.repo.findOne({ where: { id } });
    if (!lic) throw new NotFoundException('Licencia no encontrada');
    await this.repo.update(id, { activa: false });
  }

  async reactivar(id: string): Promise<void> {
    const lic = await this.repo.findOne({ where: { id } });
    if (!lic) throw new NotFoundException('Licencia no encontrada');
    await this.repo.update(id, { activa: true });
  }
}
