import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import * as fs from 'fs';
import { isModoDemo } from './mh-config.helper';
import * as path from 'path';
import * as jose from 'node-jose';
import * as forge from 'node-forge';
import { Empresa } from 'src/empresa/entities/empresa.entity';

@Injectable()
export class SignerService {
  private readonly logger = new Logger(SignerService.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Firma el JSON del DTE.
   * Intenta usar el SVFE-API-Firmador (Docker oficial del MH).
   * Si no está disponible, firma localmente con JWS RS512 usando node-jose.
   */
  async firmar(jsonDte: object, empresa: Empresa): Promise<object> {
    // Modo demo: firma simulada instantánea, sin necesidad de Docker ni certificado
    if (isModoDemo(this.config)) {
      return this.firmaSimulada(jsonDte);
    }

    const firmadorUrl = this.config.get<string>('FIRMADOR_URL', '');

    if (firmadorUrl) {
      try {
        return await this.firmarConServicio(jsonDte, firmadorUrl, empresa);
      } catch (err) {
        this.logger.warn(
          `Fallo firmador Docker (${err.message}) — Intentando firma local en Node.js...`,
        );
        // Continuamos para intentar firmarLocal
      }
    }

    return this.firmarLocal(jsonDte, empresa);
  }

  // ── Modo 1: SVFE-API-Firmador (Docker oficial MH) ──────────────────────────
  private async firmarConServicio(
    jsonDte: object,
    firmadorUrl: string,
    empresa: Empresa,
  ): Promise<object> {
    const nit      = empresa.nit.replace(/-/g, '');
    const password = empresa.mhPasswordCert;

    if (!password) throw new Error(`Password de certificado no configurado para ${empresa.nombreLegal}`);

    const { data } = await firstValueFrom(
      this.http.post(
        `${firmadorUrl}/firmardocumento/`,
        { nit, activo: true, passwordPri: password, dteJson: jsonDte },
        { timeout: 5000 },
      ),
    );

    if (data.status === 'ERROR' || data.codigo || !data.body) {
      const errorMsg = data.mensaje || data.descripcion || JSON.stringify(data);
      throw new Error(`El Firmador Docker rechazó la firma: ${errorMsg}`);
    }

    // Validar que el JWS tenga el encabezado x5c (certificado)
    const jwsStr = data.body.toString();
    if (!jwsStr.includes('x5c')) {
      this.logger.warn(`El Firmador Docker devolvió una firma sin certificado (x5c). Forzando fallback local...`);
      throw new Error('Firma incompleta del Docker');
    }

    this.logger.log(`DTE firmado con SVFE-API-Firmador para ${empresa.nombreLegal}`);
    return data.body;
  }

  // ── Modo 2: Firma local JWS RS512 (Fallback) ──────────────────────────────
  private async firmarLocal(jsonDte: object, empresa: Empresa): Promise<object> {
    const nitLimpio = empresa.nit.replace(/-/g, '');
    let certPath = empresa.mhCertificadoPath;
    const password = empresa.mhPasswordCert;

    if (!certPath) {
      const defaultPath = `Certificados/${nitLimpio}.crt`;
      if (fs.existsSync(path.resolve(process.cwd(), defaultPath))) {
        certPath = defaultPath;
      } else {
        throw new Error(`Empresa ${empresa.nombreLegal} no tiene certificado configurado.`);
      }
    }

    const fullPath = path.resolve(process.cwd(), certPath);
    if (!fs.existsSync(fullPath)) throw new Error(`No existe el certificado: ${fullPath}`);

    try {
      const fileBuffer = fs.readFileSync(fullPath);
      const fileContent = fileBuffer.toString();
      let privateKeyPem: string;
      let certificateBase64: string;

      // Soporte para PKCS#12 (.p12)
      if (fullPath.toLowerCase().endsWith('.p12') || fullPath.toLowerCase().endsWith('.pfx')) {
        const p12Asn1 = forge.asn1.fromDer(fileBuffer.toString('binary'));
        const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password || '');

        const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
        const bag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];
        if (!bag || !bag.key) throw new Error('No se encontró llave privada en .p12');
        privateKeyPem = forge.pki.privateKeyToPem(bag.key);

        const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
        const certBag = certBags[forge.pki.oids.certBag]?.[0];
        if (!certBag || !certBag.cert) throw new Error('No se encontró certificado en .p12');
        certificateBase64 = Buffer.from(forge.asn1.toDer(forge.pki.certificateToAsn1(certBag.cert)).getBytes(), 'binary').toString('base64');
      } 
      // Escenario C: Archivo es el XML <CertificadoMH> de Hacienda
      else if (fileContent.includes('<CertificadoMH>')) {
        this.logger.log(`Detectado formato XML <CertificadoMH> para NIT ${nitLimpio} — Iniciando AUTO-SANACIÓN...`);
        
        try {
          // 1. Extraer LLAVE PRIVADA
          const priKeyMatch = fileContent.match(/<privateKey>[\s\S]*?<encodied>([\s\S]+?)<\/encodied>/i);
          if (!priKeyMatch) throw new Error('No se encontró la llave privada en el XML');
          const priKeyB64 = priKeyMatch[1].replace(/[\s\r\n]/g, '');
          privateKeyPem = `-----BEGIN PRIVATE KEY-----\n${priKeyB64.match(/.{1,64}/g)?.join('\n')}\n-----END PRIVATE KEY-----`;
          
          // 2. Extraer LLAVE PÚBLICA
          const pubKeyMatch = fileContent.match(/<publicKey>[\s\S]*?<encodied>([\s\S]+?)<\/encodied>/i) || 
                              fileContent.match(/<subjectPublicKey>([\s\S]+?)<\/subjectPublicKey>/i);
          if (!pubKeyMatch) throw new Error('No se encontró la llave pública en el XML');
          const publicKeyB64 = pubKeyMatch[1].replace(/[\s\r\n]/g, '');
          const publicKeyPem = `-----BEGIN PUBLIC KEY-----\n${publicKeyB64.match(/.{1,64}/g)?.join('\n')}\n-----END PUBLIC KEY-----`;

          // 3. RECONSTRUCCIÓN CON FORGE
          const pki = forge.pki;
          const cert = pki.createCertificate();
          const priKeyForge = pki.privateKeyFromPem(privateKeyPem);
          const pubKeyForge = pki.publicKeyFromPem(publicKeyPem);
          cert.publicKey = pubKeyForge;
          cert.serialNumber = '01';
          cert.validity.notBefore = new Date();
          cert.validity.notAfter = new Date();
          cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 2);

          const extract = (tag: string) => {
             const m = fileContent.match(new RegExp(`<${tag}>(.*?)<\/${tag}>`, 'i'));
             return m ? m[1] : empresa.nombreLegal;
          };

          const attrs = [
            { name: 'commonName', value: extract('commonName') },
            { name: 'countryName', value: 'SV' },
            { name: 'organizationName', value: extract('organizationName') },
            { shortName: 'OU', value: `VATSV-${nitLimpio}` }
          ];
          cert.setSubject(attrs);
          cert.setIssuer(attrs);
          cert.sign(priKeyForge, forge.md.sha256.create());

          // 4. CONVERTIR A BASE64 Y PEM
          const certDer = forge.asn1.toDer(pki.certificateToAsn1(cert)).getBytes();
          certificateBase64 = Buffer.from(certDer, 'binary').toString('base64');
          const certPem = pki.certificateToPem(cert);

          // 5. AUTO-SANACIÓN: Guardar archivos para el Docker
          const certDir = path.resolve(process.cwd(), 'certificados');
          if (!fs.existsSync(certDir)) fs.mkdirSync(certDir, { recursive: true });
          fs.writeFileSync(path.join(certDir, `${nitLimpio}.crt`), certPem);
          fs.writeFileSync(path.join(certDir, `${nitLimpio}.key`), privateKeyPem);

          this.logger.log(`AUTO-SANACIÓN COMPLETA: Archivos PEM generados para Docker en /certificados`);
          
        } catch (err) {
          this.logger.error(`Fallo en auto-sanación: ${err.message}`);
          throw new Error(`Error procesando XML de Hacienda: ${err.message}`);
        }
      }
      else {
        // Fallback para otros formatos o llaves separadas
        throw new Error('Formato de certificado local no soportado (use .p12 o el Firmador Docker)');
      }

      const keystore = jose.JWK.createKeyStore();
      const key = await keystore.add(privateKeyPem, 'pem', { x5c: [certificateBase64], alg: 'RS512' });
      const token = await jose.JWS.createSign(
        { 
          format: 'compact', 
          fields: { x5c: [certificateBase64] } 
        }, 
        key
      )
        .update(JSON.stringify(jsonDte))
        .final();

      this.logger.log(`DTE firmado LOCALMENTE para ${empresa.nombreLegal}`);
      
      return { 
        body: token,
        diagnostico: {
          certLen: certificateBase64?.length || 0,
          keyLen: privateKeyPem?.length || 0
        }
      };

    } catch (error) {
      this.logger.error(`Error en firma LOCAL: ${error.message}`);
      throw new Error(`Fallo firma: ${error.message}`);
    }
  }

  // ── Modo 3: Firma simulada (solo pruebas locales sin certificado) ──────────
  private firmaSimulada(jsonDte: object): object {
    this.logger.warn(
      'FIRMA SIMULADA — solo válida para desarrollo local, no será aceptada por el MH',
    );
    return {
      ...jsonDte,
      firma: 'FIRMA_SIMULADA_DESARROLLO',
    };
  }
}
