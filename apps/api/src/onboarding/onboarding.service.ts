import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  HttpException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { Prisma, ModuleType } from 'db';
import { PrismaService } from '../prisma/prisma.service';
import {
  getOrganizationSlugError,
  normalizeOrganizationSlug,
} from '../common/utils/organization-slug';
import {
  OnboardingAccessDto,
  SignupDto,
  VerifySignupDto,
} from './onboarding.dto';
import {
  WorkspaceDomainError,
  WorkspaceDomainService,
} from './workspace-domain.service';

export const digest = (value: string) =>
  createHash('sha256').update(value).digest('hex');
export const backoff = (attempt: number) =>
  Math.min(3600, 30 * 2 ** Math.min(attempt, 7)) * 1000;

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);
  constructor(
    private readonly db: PrismaService,
    private readonly config: ConfigService,
    private readonly domains: WorkspaceDomainService,
  ) {}

  onModuleInit() {
    if (
      this.config.get('ONBOARDING_ENABLED') === 'true' ||
      this.config.get('ONBOARDING_WORKER_ENABLED') === 'true'
    ) {
      this.secret();
      this.publicOrigin();
      this.modules();
    }
  }
  private modules(): ModuleType[] {
    const values = (this.config.get<string>('ONBOARDING_DEFAULT_MODULES') ?? '')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    if (
      values.some(
        (value) => !Object.values(ModuleType).includes(value as ModuleType),
      )
    )
      throw new Error('Invalid ONBOARDING_DEFAULT_MODULES');
    return [...new Set(values)] as ModuleType[];
  }

  private secret() {
    const value = this.config.get<string>('ONBOARDING_TOKEN_SECRET');
    if (!value || value.length < 64 || /\s/.test(value))
      throw new Error(
        'Configure ONBOARDING_TOKEN_SECRET before enabling signup',
      );
    return value;
  }
  token(id: string, purpose: 'verify' | 'progress') {
    return createHmac('sha256', this.secret())
      .update(`${purpose}:${id}`)
      .digest('hex');
  }
  publicOrigin() {
    const url = new URL(this.config.getOrThrow<string>('ONBOARDING_ORIGIN'));
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/' ||
      !['http:', 'https:'].includes(url.protocol) ||
      (this.config.get('NODE_ENV') === 'production' &&
        url.protocol !== 'https:')
    )
      throw new Error('Invalid ONBOARDING_ORIGIN');
    return url.origin;
  }
  workspaceUrl(slug: string) {
    const base = this.config.getOrThrow<string>('TENANT_BASE_DOMAIN');
    if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(base))
      throw new Error('Invalid tenant base domain');
    const origin = new URL(this.publicOrigin());
    return `${origin.protocol}//${slug}.${base}${origin.port ? `:${origin.port}` : ''}/login`;
  }

  async signup(dto: SignupDto) {
    this.publicOrigin();
    this.secret();
    const data = {
      requestedSlug: normalizeOrganizationSlug(dto.slug),
      companyName: dto.companyName.trim(),
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
      email: dto.email.trim().toLowerCase(),
      phone: dto.phone.trim(),
      timeZone: dto.timeZone.trim(),
    };
    const error = getOrganizationSlugError(data.requestedSlug);
    if (error) throw new BadRequestException(error);
    if (!data.companyName || !data.firstName || !data.lastName)
      throw new BadRequestException('Names cannot be blank');
    try {
      new Intl.DateTimeFormat('en', { timeZone: data.timeZone });
    } catch {
      throw new BadRequestException('Invalid timezone');
    }
    const requestKeyHash = digest(dto.requestKey);
    const fingerprint = digest(JSON.stringify(data));
    return this.db.$transaction(async (tx) => {
      // Serializes quota checks and expiring reservations across all API replicas.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(53841291)`;
      const prior = await tx.onboardingRequest.findUnique({
        where: { requestKeyHash },
      });
      if (prior) {
        if (prior.fingerprint !== fingerprint)
          throw new ConflictException(
            'Use a new request key when changing signup details',
          );
        return { id: prior.id, status: prior.status };
      }
      const since = new Date(Date.now() - 3600_000);
      const [emailCount, total] = await Promise.all([
        tx.onboardingRequest.count({
          where: { email: data.email, createdAt: { gte: since } },
        }),
        tx.onboardingRequest.count({ where: { createdAt: { gte: since } } }),
      ]);
      if (emailCount >= 3 || total >= 100)
        throw new HttpException('Signup limit reached. Try again later.', 429);
      await tx.onboardingRequest.updateMany({
        where: {
          status: 'PENDING_VERIFICATION',
          expiresAt: { lt: new Date() },
        },
        data: { status: 'EXPIRED', slug: null },
      });
      if (
        (await tx.organization.findUnique({
          where: { slug: data.requestedSlug },
        })) ||
        (await tx.onboardingRequest.findUnique({
          where: { slug: data.requestedSlug },
        }))
      )
        throw new ConflictException('This company address is unavailable');
      const id = randomUUID();
      await tx.onboardingRequest.create({
        data: {
          id,
          ...data,
          slug: data.requestedSlug,
          requestKeyHash,
          fingerprint,
          verificationHash: digest(this.token(id, 'verify')),
          expiresAt: new Date(Date.now() + 30 * 60_000),
          messages: { create: { kind: 'VERIFY' } },
        },
      });
      return { id, status: 'PENDING_VERIFICATION' };
    });
  }

  async verify(dto: VerifySignupDto) {
    if (Buffer.byteLength(dto.password, 'utf8') > 72)
      throw new BadRequestException('Password exceeds 72 UTF-8 bytes');
    // Store no password until possession of the verification link is established.
    const request = await this.db.onboardingRequest.findUnique({
      where: { id: dto.id },
    });
    if (
      !request ||
      request.verificationHash !== digest(dto.token) ||
      request.expiresAt < new Date()
    )
      throw new UnauthorizedException(
        'Verification link is invalid, expired or already used',
      );
    // A lost success response can resume progress, but cannot change credentials again.
    if (request.verifiedAt)
      return {
        id: request.id,
        status: request.status,
        progressToken: this.token(request.id, 'progress'),
      };
    if (request.status !== 'PENDING_VERIFICATION')
      throw new UnauthorizedException('Verification is no longer available');
    // Persist a bounded attempt budget before expensive password comparison.
    const attempt = await this.db.onboardingRequest.updateMany({
      where: {
        id: request.id,
        status: 'PENDING_VERIFICATION',
        attempts: { lt: 5 },
      },
      data: { attempts: { increment: 1 } },
    });
    if (!attempt.count)
      throw new HttpException(
        'Verification attempt limit reached. Start again after this reservation expires.',
        429,
      );
    const existing = await this.db.user.findFirst({
      where: { email: { equals: request.email, mode: 'insensitive' } },
    });
    if (
      existing &&
      (!existing.password ||
        !(await bcrypt.compare(dto.password, existing.password)))
    )
      throw new UnauthorizedException(
        'Use your existing account password. Accounts without a password must complete account recovery first.',
      );
    if (!existing && dto.password.length < 12)
      throw new BadRequestException(
        'New passwords must contain at least 12 characters',
      );
    const passwordHash = existing ? null : await bcrypt.hash(dto.password, 12);
    const result = await this.db.onboardingRequest.updateMany({
      where: {
        id: request.id,
        status: 'PENDING_VERIFICATION',
        expiresAt: { gt: new Date() },
      },
      data: {
        verifiedAt: new Date(),
        status: 'PROVISIONING',
        passwordHash,
        existingUserId: existing?.id ?? null,
        attempts: 0,
        nextAttemptAt: new Date(),
      },
    });
    if (!result.count)
      throw new ConflictException(
        'Verification has already been completed or expired',
      );
    return {
      id: request.id,
      status: 'PROVISIONING',
      progressToken: this.token(request.id, 'progress'),
    };
  }

  private async authorized(dto: OnboardingAccessDto) {
    const request = await this.db.onboardingRequest.findUnique({
      where: { id: dto.id },
    });
    if (
      !request ||
      (digest(dto.token) !== request.requestKeyHash &&
        (!request.verifiedAt ||
          digest(dto.token) !== digest(this.token(request.id, 'progress'))))
    )
      throw new NotFoundException();
    return request;
  }
  async status(dto: OnboardingAccessDto) {
    const request = await this.authorized(dto);
    const status =
      request.status === 'PENDING_VERIFICATION' &&
      request.expiresAt < new Date()
        ? 'EXPIRED'
        : request.status;
    return {
      id: request.id,
      status,
      failureCode: request.failureCode,
      ...(status === 'READY'
        ? { workspaceUrl: this.workspaceUrl(request.requestedSlug) }
        : {}),
    };
  }
  async retry(dto: OnboardingAccessDto) {
    const request = await this.authorized(dto);
    if (
      !request.verifiedAt ||
      request.status !== 'FAILED' ||
      request.failureCode !== 'PROVISIONING_FAILED'
    )
      throw new ConflictException('This request cannot be retried');
    if (request.updatedAt.getTime() > Date.now() - 60_000)
      throw new HttpException('Wait a minute before retrying', 429);
    await this.db.onboardingRequest.updateMany({
      where: { id: request.id, status: 'FAILED' },
      data: {
        status: 'PROVISIONING',
        attempts: 0,
        nextAttemptAt: new Date(),
        failureCode: null,
      },
    });
    return this.status(dto);
  }

  async resend(dto: OnboardingAccessDto) {
    const request = await this.authorized(dto);
    if (
      request.status !== 'PENDING_VERIFICATION' ||
      request.expiresAt < new Date()
    )
      throw new ConflictException(
        'Start a new signup after this reservation expires',
      );
    const result = await this.db.onboardingMessage.updateMany({
      where: {
        requestId: request.id,
        kind: 'VERIFY',
        attempts: { lt: 10 },
        availableAt: { lt: new Date(Date.now() - 60_000) },
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
      },
      data: { sentAt: null, failedAt: null, availableAt: new Date() },
    });
    if (!result.count)
      throw new HttpException('Wait before requesting another email', 429);
    return { message: 'Verification email queued' };
  }

  async provisionOne() {
    // Short claim transaction; a crashed process becomes eligible again after two minutes.
    const claimed = await this.db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM "OnboardingRequest" WHERE status = 'PROVISIONING' AND "nextAttemptAt" <= NOW() ORDER BY "createdAt" FOR UPDATE SKIP LOCKED LIMIT 1`;
      if (!rows[0]) return null;
      return tx.onboardingRequest.update({
        where: { id: rows[0].id },
        data: {
          nextAttemptAt: new Date(Date.now() + 120_000),
          attempts: { increment: 1 },
        },
      });
    });
    if (!claimed) return;
    try {
      if (!claimed.verifiedAt) throw new Error('UNVERIFIED');
      // Provider/network calls must remain outside the company creation transaction.
      // A retry reuses the registered domain; no organization exists until HTTPS is ready.
      await this.domains.ensureReady(claimed.requestedSlug);
      await this.db.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM "OnboardingRequest" WHERE id = ${claimed.id} FOR UPDATE`;
          const request = await tx.onboardingRequest.findUniqueOrThrow({
            where: { id: claimed.id },
          });
          if (
            request.status !== 'PROVISIONING' ||
            request.attempts !== claimed.attempts
          )
            return;
          if (!request.verifiedAt) throw new Error('UNVERIFIED');
          const role = await tx.role.findUniqueOrThrow({
            where: { name: 'ADMIN' },
          });
          let user;
          if (request.existingUserId) {
            user = await tx.user.findUniqueOrThrow({
              where: { id: request.existingUserId },
            });
            if (user.email?.toLowerCase() !== request.email)
              throw new Error('IDENTITY_CHANGED');
          } else {
            // Never silently attach an account created since verification.
            if (
              await tx.user.findFirst({
                where: {
                  email: { equals: request.email, mode: 'insensitive' },
                },
              })
            )
              throw new Error('ACCOUNT_CHANGED');
            if (!request.passwordHash) throw new Error('UNVERIFIED');
            user = await tx.user.create({
              data: {
                email: request.email,
                phone: request.phone,
                name: `${request.firstName} ${request.lastName}`,
                password: request.passwordHash,
              },
            });
          }
          const org = await tx.organization.create({
            data: {
              name: request.companyName,
              slug: request.requestedSlug,
              timeZone: request.timeZone,
              modules: this.modules(),
              isAdminOrg: false,
            },
          });
          await tx.userOrganization.create({
            data: { userId: user.id, organizationId: org.id, roleId: role.id },
          });
          await tx.employee.create({
            data: {
              organizationId: org.id,
              userId: user.id,
              firstName: request.firstName,
              lastName: request.lastName,
              email: request.email,
              phone: request.phone,
            },
          });
          await tx.onboardingRequest.update({
            where: { id: request.id },
            data: {
              status: 'READY',
              organizationId: org.id,
              passwordHash: null,
              failureCode: null,
            },
          });
          await tx.onboardingMessage.create({
            data: { requestId: request.id, kind: 'WELCOME' },
          });
        },
        { timeout: 20_000 },
      );
    } catch (error) {
      if (error instanceof WorkspaceDomainError)
        this.logger.warn(
          `Workspace domain pending: request=${claimed.id}; ${error.message}`,
        );
      const permanent =
        (error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002') ||
        (error instanceof Error &&
          ['ACCOUNT_CHANGED', 'IDENTITY_CHANGED'].includes(error.message));
      await this.db.onboardingRequest.updateMany({
        where: {
          id: claimed.id,
          status: 'PROVISIONING',
          attempts: claimed.attempts,
        },
        data: {
          status:
            permanent || claimed.attempts >= 5 ? 'FAILED' : 'PROVISIONING',
          failureCode: permanent ? 'DETAILS_CONFLICT' : 'PROVISIONING_FAILED',
          nextAttemptAt: new Date(Date.now() + backoff(claimed.attempts)),
        },
      });
    }
  }
}
