import {
  Injectable,
  CanActivate,
  ExecutionContext,
  BadRequestException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SuscripcionesService } from '../../empresa/services/suscripciones.service';

@Injectable()
export class LimiteDtesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly suscripcionesService: SuscripcionesService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const empresaId = request.user?.empresaId;

    if (!empresaId) {
      return true;
    }

    const result = await this.suscripcionesService.verificarLimiteDtes(empresaId);

    if (!result.permitido) {
      throw new BadRequestException({
        message: `Límite de documentos mensuales alcanzado (${result.usados}/${result.limite}).`,
        code: 'LIMITE_DTE_ALCANZADO',
        usados: result.usados,
        limite: result.limite,
        extrasDisponibles: result.extrasDisponibles ?? 0,
      });
    }

    return true;
  }
}
