import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { firstValueFrom } from 'rxjs';
import { Dte } from '../dte/entities/dte.entity';
import { WhatsappService } from '../notifications/whatsapp.service';

@Injectable()
export class SaludService {
  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
    private readonly whatsapp: WhatsappService,
    @InjectRepository(Dte) private readonly dteRepo: Repository<Dte>,
  ) {}

  async verificar() {
    const [mh, firmador, smtp, db] = await Promise.all([
      this.checkMh(),
      this.checkFirmador(),
      this.checkSmtp(),
      this.checkDb(),
    ]);
    return {
      timestamp: new Date().toISOString(),
      servicios: {
        mh,
        firmador,
        smtp,
        db,
        whatsapp: { ok: this.whatsapp.getEstado() === 'CONECTADO', detalle: this.whatsapp.getEstado() },
      },
    };
  }

  private async checkMh() {
    const start = Date.now();
    try {
      const url = this.config.get('MH_AUTH_URL', '');
      if (!url) return { ok: false, detalle: 'MH_AUTH_URL no configurado', ms: 0 };
      await firstValueFrom(this.http.get(url, { timeout: 5000 }));
      return { ok: true, detalle: 'Respondiendo', ms: Date.now() - start };
    } catch (e: any) {
      const status = e?.response?.status;
      // MH returns 400/405 for bad requests but it means it's UP
      if (status && status < 500) return { ok: true, detalle: `HTTP ${status}`, ms: Date.now() - start };
      return { ok: false, detalle: e?.message ?? 'Sin respuesta', ms: Date.now() - start };
    }
  }

  private async checkFirmador() {
    const start = Date.now();
    try {
      const url = this.config.get('FIRMADOR_URL', '');
      if (!url) return { ok: false, detalle: 'FIRMADOR_URL no configurado', ms: 0 };
      await firstValueFrom(this.http.get(url, { timeout: 4000 }));
      return { ok: true, detalle: 'Respondiendo', ms: Date.now() - start };
    } catch (e: any) {
      const status = e?.response?.status;
      if (status && status < 500) return { ok: true, detalle: `HTTP ${status}`, ms: Date.now() - start };
      return { ok: false, detalle: e?.message ?? 'Sin respuesta', ms: Date.now() - start };
    }
  }

  private async checkSmtp() {
    const start = Date.now();
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const nodemailer = require('nodemailer');
      const t = nodemailer.createTransport({
        host: this.config.get('SMTP_HOST', 'smtp.gmail.com'),
        port: Number(this.config.get('SMTP_PORT', '587')),
        auth: { user: this.config.get('SMTP_USER', ''), pass: this.config.get('SMTP_PASS', '') },
      });
      await t.verify();
      return { ok: true, detalle: 'Conectado', ms: Date.now() - start };
    } catch (e: any) {
      return { ok: false, detalle: e?.message ?? 'Error SMTP', ms: Date.now() - start };
    }
  }

  private async checkDb() {
    const start = Date.now();
    try {
      const count = await this.dteRepo.count();
      return { ok: true, detalle: `${count} DTEs en BD`, ms: Date.now() - start };
    } catch (e: any) {
      return { ok: false, detalle: e?.message ?? 'Error BD', ms: Date.now() - start };
    }
  }
}
