import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/**
 * Encripta un texto usando AES-256-GCM.
 * Retorna un string en formato iv:authTag:encryptedContent
 */
export function encrypt(text: string, masterKeyHex: string): string {
  if (!text) return text;
  
  // La llave debe ser de 32 bytes (64 caracteres hex)
  const key = Buffer.from(masterKeyHex, 'hex');
  const iv = crypto.randomBytes(IV_LENGTH);
  
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag().toString('hex');
  
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Desencripta un string en formato iv:authTag:encryptedContent
 */
export function decrypt(hash: string, masterKeyHex: string): string {
  if (!hash || !hash.includes(':')) return hash;
  
  try {
    const [ivHex, authTagHex, encryptedHex] = hash.split(':');
    
    const key = Buffer.from(masterKeyHex, 'hex');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, undefined, 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Error desencriptando dato:', error.message);
    // Si falla la desencriptación (ej: no era un hash), retornamos el original
    return hash;
  }
}
