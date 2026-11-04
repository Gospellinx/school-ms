import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { DbModule } from './db/db.module';
import { ResultsController } from './results/results.controller';
import { ResultsService } from './results/results.service';
import { SetupController } from './setup/setup.controller';
import { StudentsController } from './students/students.controller';
import { HealthController } from './health.controller';

@Module({
  imports: [DbModule, AuthModule],
  controllers: [HealthController, SetupController, StudentsController, ResultsController],
  providers: [ResultsService],
})
export class AppModule {}
