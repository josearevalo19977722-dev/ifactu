import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs';
import { join, extname } from 'path';
import { v4 as uuid } from 'uuid';
import { Certificado, TipoCertificado } from '../entities/certificado.entity';
import { Empresa } from '../entities/empresa.entity';

const execAsync = promisify(exec);

@Injectable()
export class CertificadosService {
  constructor(
    @InjectRepository(Certificado)
    private readonly certRepo: Repository<Certificado>,
    @InjectRepository(Empresa)
    private readonly empresaRepo: Repository<Empresa>,
  ) {}

  async uploadCertificado(
    empresaId: string,
    file: Express.Multer.File,
    tipo: TipoCertificado = TipoCertificado.FIRMA_DTE,
    datosExtra?: { fechaVencimiento?: Date; serial?: string; subject?: string; issuer?: string },
  ): Promise<Certificado> {
    const empresa = await this.empresaRepo.findOne({ where: { id: empresaId } });
    if (!empresa) throw new BadRequestException('Empresa no encontrada');

    const uploadPath = join(__dirname, '..', '..', '..', 'uploads', 'certificados');
    if (!existsSync(uploadPath)) mkdirSync(uploadPath, { recursive: true });

    const ext = extname(file.originalname).toLowerCase();
    const filename = `${uuid()}${ext}`;
    const filePath = join(uploadPath, filename);

    writeFileSync(filePath, file.buffer);

    let parsedData: { fechaVencimiento?: Date; serial?: string; subject?: string; issuer?: string } = {};

    try {
      if (ext === '.pfx' || ext === '.p12') {
        parsedData = await this.parsePfx(file.buffer);
      } else if (ext === '.pem' || ext === '.crt' || ext === '.cer') {
        parsedData = await this.parsePem(file.buffer);
      }
    } catch (err) {
      console.warn('No se pudo parsear automáticamente el certificado:', err.message);
    }

    const certificado = this.certRepo.create({
      empresa,
      tipo,
      nombreOriginal: file.originalname,
      nombreArchivo: filename,
      fechaVencimiento: datosExtra?.fechaVencimiento ?? parsedData.fechaVencimiento ?? null,
      serial: datosExtra?.serial ?? parsedData.serial ?? null,
      subject: datosExtra?.subject ?? parsedData.subject ?? null,
      issuer: datosExtra?.issuer ?? parsedData.issuer ?? null,
    });

    return this.certRepo.save(certificado);
  }

  private async parsePfx(buffer: Buffer): Promise<{ fechaVencimiento?: Date; serial?: string; subject?: string; issuer?: string }> {
    const tempFile = `/tmp/cert_${Date.now()}.pfx`;
    writeFileSync(tempFile, buffer);

    try {
      const { stdout } = await execAsync(
        `openssl pkcs12 -in "${tempFile}" -info -nodes -nokeys 2>/dev/null | openssl x509 -noout -dates -serial -subject -issuer`,
      );

      const lines = stdout.split('\n');
      const result: any = {};

      for (const line of lines) {
        if (line.startsWith('notBefore=')) result.fechaVencimiento = new Date(line.split('=')[1]);
        else if (line.startsWith('notAfter=')) result.fechaVencimiento = new Date(line.split('=')[1]);
        else if (line.startsWith('serial=')) result.serial = line.split('=')[1];
        else if (line.startsWith('subject=')) result.subject = line.split('=')[1].replace(/^\//, '').split('/').map((s: string) => s.split('=')[1]).join(', ');
        else if (line.startsWith('issuer=')) result.issuer = line.split('=')[1].replace(/^\//, '').split('/').map((s: string) => s.split('=')[1]).join(', ');
      }

      if (result.fechaVencimiento) result.fechaVencimiento = new Date(result.fechaVencimiento);

      return result;
    } finally {
      if (existsSync(tempFile)) unlinkSync(tempFile);
    }
  }

  private async parsePem(buffer: Buffer): Promise<{ fechaVencimiento?: Date; serial?: string; subject?: string; issuer?: string }> {
    const tempFile = `/tmp/cert_${Date.now()}.pem`;
    writeFileSync(tempFile, buffer);

    try {
      const { stdout } = await execAsync(
        `openssl x509 -in "${tempFile}" -noout -dates -serial -subject -issuer 2>/dev/null`,
      );

      const lines = stdout.split('\n');
      const result: any = {};

      for (const line of lines) {
        if (line.startsWith('notBefore=')) result.fechaVencimiento = new Date(line.split('=')[1]);
        else if (line.startsWith('notAfter=')) result.fechaVencimiento = new Date(line.split('=')[1]);
        else if (line.startsWith('serial=')) result.serial = line.split('=')[1];
        else if (line.startsWith('subject=')) result.subject = line.split('=')[1].replace(/CN=/, '');
        else if (line.startsWith('issuer=')) result.issuer = line.split('=')[1].replace(/CN=/, '');
      }

      return result;
    } finally {
      if (existsSync(tempFile)) unlinkSync(tempFile);
    }
  }

  async listarPorEmpresa(empresaId: string): Promise<Certificado[]> {
    return this.certRepo.find({
      where: { empresaId },
      order: { esPrincipal: 'DESC', createdAt: 'DESC' },
    });
  }

  async listarTodos(): Promise<Certificado[]> {
    return this.certRepo.find({
      relations: ['empresa'],
      order: { createdAt: 'DESC' },
    });
  }

  async marcarPrincipal(certificadoId: string, empresaId: string): Promise<Certificado> {
    await this.certRepo.update({ empresaId }, { esPrincipal: false });
    const cert = await this.certRepo.findOne({ where: { id: certificadoId, empresaId } });
    if (!cert) throw new BadRequestException('Certificado no encontrado');
    cert.esPrincipal = true;
    return this.certRepo.save(cert);
  }

  async desactivar(id: string, empresaId: string): Promise<Certificado> {
    const cert = await this.certRepo.findOne({ where: { id, empresaId } });
    if (!cert) throw new BadRequestException('Certificado no encontrado');
    cert.activo = false;
    cert.esPrincipal = false;
    return this.certRepo.save(cert);
  }

  async actualizar(id: string, empresaId: string, datos: { fechaVencimiento?: Date; notas?: string }): Promise<Certificado> {
    const cert = await this.certRepo.findOne({ where: { id, empresaId } });
    if (!cert) throw new BadRequestException('Certificado no encontrado');
    if (datos.fechaVencimiento) cert.fechaVencimiento = datos.fechaVencimiento;
    if (datos.notas !== undefined) cert.notas = datos.notas;
    return this.certRepo.save(cert);
  }

  async obtenerCertificadosPorVencer(dias: number = 30): Promise<Certificado[]> {
    const fechaLimite = new Date();
    fechaLimite.setDate(fechaLimite.getDate() + dias);

    return this.certRepo
      .createQueryBuilder('cert')
      .leftJoinAndSelect('cert.empresa', 'empresa')
      .where('cert.fechaVencimiento IS NOT NULL')
      .andWhere('cert.fechaVencimiento <= :fechaLimite', { fechaLimite })
      .andWhere('cert.activo = true')
      .orderBy('cert.fechaVencimiento', 'ASC')
      .getMany();
  }

  async obtenerVencidos(): Promise<Certificado[]> {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    return this.certRepo
      .createQueryBuilder('cert')
      .leftJoinAndSelect('cert.empresa', 'empresa')
      .where('cert.fechaVencimiento < :hoy', { hoy })
      .andWhere('cert.activo = true')
      .getMany();
  }

  async getCertificadoActivo(empresaId: string): Promise<Certificado | null> {
    return this.certRepo.findOne({
      where: { empresaId, activo: true, esPrincipal: true },
    });
  }

  getRutaCertificado(nombreArchivo: string): string {
    return join(__dirname, '..', '..', '..', 'uploads', 'certificados', nombreArchivo);
  }
}
