import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Usuario } from './usuarios/usuario.entity';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    @InjectRepository(Usuario)
    private readonly usuarioRepo: Repository<Usuario>,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('debug-users')
  async debugUsers() {
    try {
      const users = await this.usuarioRepo.find({ select: ['email', 'rol', 'activo'] });
      return { 
        status: 'OK', 
        count: users.length, 
        users 
      };
    } catch (err) {
      return { status: 'ERROR', message: err.message };
    }
  }
}
