import { Module } from '@nestjs/common';
import { AttendanceController } from './attendance/attendance.controller';
import { AttendanceService } from './attendance/attendance.service';
import { TeachingController } from './teaching/teaching.controller';
import { TeachingService } from './teaching/teaching.service';
import { AuthModule } from './auth/auth.module';
import { PortalAuthController } from './auth/portal-auth.controller';
import { PortalAuthService } from './auth/portal-auth.service';
import { CbtController } from './cbt/cbt.controller';
import { CbtService } from './cbt/cbt.service';
import { QuestionsController } from './cbt/questions.controller';
import { DbModule } from './db/db.module';
import { FeesController } from './fees/fees.controller';
import { FeesService } from './fees/fees.service';
import { PaystackClient } from './fees/paystack.client';
import { GuardiansController } from './guardians/guardians.controller';
import { GuardiansService } from './guardians/guardians.service';
import { HealthController } from './health.controller';
import { MessagingProvider, messagingProviderFactory } from './messaging/messaging.provider';
import { NotificationsController } from './messaging/notifications.controller';
import { NotificationsService } from './messaging/notifications.service';
import { ParentController } from './portal/parent.controller';
import { PortalResultsService } from './portal/portal-results.service';
import { StudentController } from './portal/student.controller';
import { AiService } from './prep/ai.service';
import { PrepController } from './prep/prep.controller';
import { PrepService } from './prep/prep.service';
import { ResultsController } from './results/results.controller';
import { ResultsService } from './results/results.service';
import { SetupController } from './setup/setup.controller';
import { StudentsController } from './students/students.controller';

import { PlatformController } from './platform/platform.controller';
import { DashboardController } from './dashboard/dashboard.controller';
import { AiAdminController } from './ai-admin/ai-admin.controller';
import { KnowledgeController } from './knowledge/knowledge.controller';
import { KnowledgeService } from './knowledge/knowledge.service';
import { ExamPrepService } from './prep/exam-prep.service';
import { TutorController } from './tutor/tutor.controller';
import { TutorService } from './tutor/tutor.service';
import { InsightsController, ParentForecastController } from './insights/insights.controller';
import { InsightsService } from './insights/insights.service';
import { LiveController } from './live/live.controller';
import { LiveService } from './live/live.service';
import { AutomationsService } from './autopilot/automations.service';
import { AutopilotController } from './autopilot/autopilot.controller';
import { PayLinksController } from './autopilot/pay-links.controller';
import { EmailProvider, emailProviderFactory } from './messaging/email.provider';

@Module({
  imports: [DbModule, AuthModule],
  controllers: [
    HealthController,
    SetupController,
    StudentsController,
    GuardiansController,
    ResultsController,
    AttendanceController,
    FeesController,
    NotificationsController,
    QuestionsController,
    CbtController,
    PrepController,
    PortalAuthController,
    ParentController,
    StudentController,
    PlatformController,
    DashboardController,
    KnowledgeController,
    TeachingController,
    TutorController,
    AiAdminController,
    InsightsController,
    ParentForecastController,
    LiveController,
    AutopilotController,
    PayLinksController,
  ],
  providers: [
    ResultsService,
    GuardiansService,
    AttendanceService,
    FeesService,
    PaystackClient,
    { provide: MessagingProvider, useFactory: messagingProviderFactory },
    { provide: EmailProvider, useFactory: emailProviderFactory },
    NotificationsService,
    PortalAuthService,
    CbtService,
    AiService,
    PrepService,
    PortalResultsService,
    KnowledgeService,
    TeachingService,
    TutorService,
    ExamPrepService,
    InsightsService,
    LiveService,
    AutomationsService,
  ],
})
export class AppModule {}
