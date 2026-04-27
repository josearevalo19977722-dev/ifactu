import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { EmpresaService } from '../empresa/services/empresa.service';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly empresaService: EmpresaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'] as string | undefined;

    if (!apiKey) {
      throw new UnauthorizedException('Falta cabecera X-API-Key');
    }

    const empresa = await this.empresaService.findByInternalApiKey(apiKey);
    if (!empresa) {
      throw new UnauthorizedException('API Key inválida');
    }

    if (!empresa.activo) {
      throw new UnauthorizedException('Comercio inactivo');
    }

    // Inyectar la empresa en el request para que el controlador la use
    request['empresa'] = empresa;

    return true;
  }
}
