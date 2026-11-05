/**
 * Creates a demo school modelled on the GCIS case study so the API can be tried locally.
 * Log in with school "gcis-demo", email proprietor@demo.test, password demo-password.
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { AuthService } from '../auth/auth.service';

async function seed() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const auth = app.get(AuthService);
    const { school } = await auth.registerSchool({
      school: {
        name: 'Grace of Christ International School (Demo)',
        slug: 'gcis-demo',
        motto: 'Excellence in Learning and Character',
        address: 'Gidan Daya, Karshi Road, Abuja',
      },
      owner: { fullName: 'Demo Proprietor', email: 'proprietor@demo.test', password: 'demo-password' },
    });
    console.log(`Seeded ${school.name}. Log in with school "gcis-demo", proprietor@demo.test / demo-password`);
  } finally {
    await app.close();
  }
}

seed().catch((err) => {
  console.error(err.response ?? err);
  process.exit(1);
});
