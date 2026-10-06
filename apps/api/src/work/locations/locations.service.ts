import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { HomeLocationRequestStatus, Prisma, WorkArrangement, WorkPlaceKind } from 'db';
import type { AccessTokenPayload } from 'src/auth/access-token-payload';
import { PrismaService } from 'src/prisma/prisma.service';
import { CURRENT_EMPLOYMENT } from '../analytics/analytics.service';
import { Page, pageArgs } from '../dto/common.dto';
import {
    ArrangementQueryDto,
    CreateSiteDto,
    HomeLocationRequestDto,
    HomeRequestQueryDto,
    ReviewHomeRequestDto,
    UpdateArrangementDto,
    UpdateLocationSettingsDto,
    UpdateSiteDto,
} from '../dto/locations.dto';
import { WorkAccessService, WorkActor } from '../work-access.service';
import { WORK_SETTINGS_ROLES } from '../work-access.policy';
import { WorkErrorCode, isUniqueViolation, workBadRequest, workConflict } from '../work-errors';
import { EMPLOYEE_SUMMARY_SELECT, EmployeeSummary, toEmployeeSummary } from '../work-people';
import { WorkPlace, allowedPlaces } from '../work-location';

export const DEFAULT_HOME_RADIUS_METERS = 150;
// A home captured with a vaguer fix than this can't be checked against meaningfully.
export const MAX_HOME_ACCURACY_METERS = 200;

const SITE_SELECT = { id: true, name: true, latitude: true, longitude: true, radiusMeters: true, isActive: true } satisfies Prisma.WorkSiteSelect;

export type SiteView = Prisma.WorkSiteGetPayload<{ select: typeof SITE_SELECT }>;

export type LocationSettingsView = {
    homeRadiusMeters: number;
    // Everyone sees active sites; settings roles also see switched-off ones.
    sites: SiteView[];
    canEdit: boolean;
};

export type HomeView = { latitude: number; longitude: number; approvedAt: Date };

export type HomeRequestView = {
    id: string;
    employee: EmployeeSummary;
    latitude: number;
    longitude: number;
    accuracyMeters: number;
    capturedAt: Date;
    note: string | null;
    status: HomeLocationRequestStatus;
    createdAt: Date;
    reviewedBy: EmployeeSummary | null;
    reviewedAt: Date | null;
    reviewNote: string | null;
    // The home in force now, so a reviewer can see how far it moved.
    currentHome: HomeView | null;
};

export type MyLocationView = {
    arrangement: WorkArrangement;
    home: HomeView | null;
    homeRadiusMeters: number;
    canRequestHome: boolean;
    // The pending request, or else the most recent decision.
    latestRequest: Omit<HomeRequestView, 'employee' | 'currentHome'> | null;
    sites: SiteView[];
};

export type ArrangementView = {
    employee: EmployeeSummary;
    jobTitle: string | null;
    department: { id: string; name: string } | null;
    arrangement: WorkArrangement;
    hasHome: boolean;
    homeApprovedAt: Date | null;
    pendingRequest: boolean;
};

const REQUEST_SELECT = {
    id: true,
    employeeId: true,
    latitude: true,
    longitude: true,
    accuracyMeters: true,
    capturedAt: true,
    note: true,
    status: true,
    createdAt: true,
    reviewedAt: true,
    reviewNote: true,
    employee: { select: EMPLOYEE_SUMMARY_SELECT },
    reviewedBy: { select: EMPLOYEE_SUMMARY_SELECT },
} satisfies Prisma.WorkHomeLocationRequestSelect;

type RequestRow = Prisma.WorkHomeLocationRequestGetPayload<{ select: typeof REQUEST_SELECT }>;

function toRequestView(row: RequestRow, currentHome: HomeView | null): HomeRequestView {
    const { employeeId: _employeeId, employee, reviewedBy, ...rest } = row;
    return { ...rest, employee: toEmployeeSummary(employee), reviewedBy: toEmployeeSummary(reviewedBy), currentHome };
}

function toHome(profile: { homeLatitude: number | null; homeLongitude: number | null; homeApprovedAt: Date | null } | null): HomeView | null {
    if (!profile || profile.homeLatitude === null || profile.homeLongitude === null || !profile.homeApprovedAt) return null;
    return { latitude: profile.homeLatitude, longitude: profile.homeLongitude, approvedAt: profile.homeApprovedAt };
}

@Injectable()
export class LocationsService {
    constructor(
        private prisma: PrismaService,
        private access: WorkAccessService,
    ) {}

    // The places an employee may clock in at right now, for the clock-in check.
    async placesFor(organizationId: string, employeeId: string): Promise<{ arrangement: WorkArrangement; places: WorkPlace[] }> {
        const [profile, sites, settings] = await Promise.all([
            this.prisma.workEmployeeProfile.findUnique({ where: { employeeId } }),
            this.prisma.workSite.findMany({ where: { organizationId, isActive: true }, select: SITE_SELECT }),
            this.prisma.workSettings.findUnique({ where: { organizationId }, select: { homeRadiusMeters: true } }),
        ]);
        const arrangement = profile?.organizationId === organizationId ? profile.arrangement : WorkArrangement.ON_SITE;
        const homeView = profile?.organizationId === organizationId ? toHome(profile) : null;
        const home: WorkPlace | null = homeView && {
            kind: WorkPlaceKind.HOME,
            name: 'Home',
            latitude: homeView.latitude,
            longitude: homeView.longitude,
            radiusMeters: settings?.homeRadiusMeters ?? DEFAULT_HOME_RADIUS_METERS,
        };
        const sitePlaces: WorkPlace[] = sites.map((s) => ({ kind: WorkPlaceKind.SITE, name: s.name, latitude: s.latitude, longitude: s.longitude, radiusMeters: s.radiusMeters }));
        return { arrangement, places: allowedPlaces(arrangement, sitePlaces, home) };
    }

    // Company sites and the home radius ----------------------------------------------------

    async settings(user: AccessTokenPayload): Promise<LocationSettingsView> {
        const actor = await this.access.resolveActor(user);
        return this.settingsView(actor);
    }

    async updateSettings(user: AccessTokenPayload, dto: UpdateLocationSettingsDto): Promise<LocationSettingsView> {
        const actor = await this.access.resolveActor(user);
        this.assertCanEdit(actor);
        await this.prisma.workSettings.upsert({
            where: { organizationId: actor.organizationId },
            create: { organizationId: actor.organizationId, homeRadiusMeters: dto.homeRadiusMeters },
            update: { homeRadiusMeters: dto.homeRadiusMeters },
        });
        return this.settingsView(actor);
    }

    async createSite(user: AccessTokenPayload, dto: CreateSiteDto): Promise<SiteView> {
        const actor = await this.access.resolveActor(user);
        this.assertCanEdit(actor);
        try {
            return await this.prisma.workSite.create({
                data: { organizationId: actor.organizationId, ...dto },
                select: SITE_SELECT,
            });
        } catch (error) {
            if (isUniqueViolation(error)) throw this.siteExists();
            throw error;
        }
    }

    // Changes apply to future clock-ins only; past records keep the place they were checked against.
    async updateSite(user: AccessTokenPayload, siteId: string, dto: UpdateSiteDto): Promise<SiteView> {
        const actor = await this.access.resolveActor(user);
        this.assertCanEdit(actor);
        await this.findSite(actor, siteId);
        try {
            return await this.prisma.workSite.update({
                where: { id: siteId },
                data: Object.fromEntries(Object.entries(dto).filter(([, v]) => v !== undefined)),
                select: SITE_SELECT,
            });
        } catch (error) {
            if (isUniqueViolation(error)) throw this.siteExists();
            throw error;
        }
    }

    async deleteSite(user: AccessTokenPayload, siteId: string): Promise<{ id: string }> {
        const actor = await this.access.resolveActor(user);
        this.assertCanEdit(actor);
        await this.findSite(actor, siteId);
        await this.prisma.workSite.delete({ where: { id: siteId } });
        return { id: siteId };
    }

    // Arrangements (HR) ---------------------------------------------------------------------

    async listArrangements(user: AccessTokenPayload, query: ArrangementQueryDto): Promise<Page<ArrangementView>> {
        const actor = await this.access.resolveActor(user);
        this.assertCanEdit(actor);

        const terms = (query.search ?? '').split(/\s+/).filter(Boolean).slice(0, 4);
        const arrangementFilter: Prisma.EmployeeWhereInput | undefined =
            query.arrangement === undefined
                ? undefined
                : query.arrangement === WorkArrangement.ON_SITE
                  ? { OR: [{ workProfile: null }, { workProfile: { arrangement: WorkArrangement.ON_SITE } }] }
                  : { workProfile: { arrangement: query.arrangement } };
        const where: Prisma.EmployeeWhereInput = {
            organizationId: actor.organizationId,
            employmentStatus: { in: CURRENT_EMPLOYMENT },
            AND: [
                ...terms.map((term) => ({
                    OR: [{ firstName: { contains: term, mode: 'insensitive' as const } }, { lastName: { contains: term, mode: 'insensitive' as const } }],
                })),
                ...(arrangementFilter ? [arrangementFilter] : []),
            ],
        };

        const [rows, total] = await this.prisma.$transaction([
            this.prisma.employee.findMany({
                where,
                select: {
                    ...EMPLOYEE_SUMMARY_SELECT,
                    jobTitle: true,
                    department: { select: { id: true, name: true } },
                    workProfile: { select: { arrangement: true, homeApprovedAt: true } },
                    workHomeRequests: { where: { status: HomeLocationRequestStatus.PENDING }, select: { id: true }, take: 1 },
                },
                orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }, { id: 'asc' }],
                ...pageArgs(query),
            }),
            this.prisma.employee.count({ where }),
        ]);
        const items = rows.map((r) => ({
            employee: toEmployeeSummary(r),
            jobTitle: r.jobTitle,
            department: r.department,
            arrangement: r.workProfile?.arrangement ?? WorkArrangement.ON_SITE,
            hasHome: !!r.workProfile?.homeApprovedAt,
            homeApprovedAt: r.workProfile?.homeApprovedAt ?? null,
            pendingRequest: r.workHomeRequests.length > 0,
        }));
        return { items, page: query.page, pageSize: query.pageSize, total };
    }

    async setArrangement(user: AccessTokenPayload, employeeId: string, dto: UpdateArrangementDto): Promise<{ employeeId: string; arrangement: WorkArrangement; hasHome: boolean }> {
        const actor = await this.access.resolveActor(user);
        this.assertCanEdit(actor);
        const employee = await this.prisma.employee.findFirst({ where: { id: employeeId, organizationId: actor.organizationId }, select: { id: true } });
        if (!employee) throw new NotFoundException('Employee not found');

        const clear = dto.clearHome ? { homeLatitude: null, homeLongitude: null, homeApprovedAt: null } : {};
        const profile = await this.prisma.workEmployeeProfile.upsert({
            where: { employeeId },
            create: { employeeId, organizationId: actor.organizationId, arrangement: dto.arrangement },
            update: { arrangement: dto.arrangement, ...clear },
        });
        return { employeeId, arrangement: profile.arrangement, hasHome: !!profile.homeApprovedAt };
    }

    // The employee's own setup --------------------------------------------------------------

    async mine(user: AccessTokenPayload): Promise<MyLocationView> {
        const actor = await this.access.resolveActor(user);
        const [profile, latest, settings, sites] = await Promise.all([
            this.prisma.workEmployeeProfile.findUnique({ where: { employeeId: actor.employeeId } }),
            this.prisma.workHomeLocationRequest.findFirst({
                where: { employeeId: actor.employeeId, organizationId: actor.organizationId, status: { not: HomeLocationRequestStatus.CANCELLED } },
                select: REQUEST_SELECT,
                orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            }),
            this.prisma.workSettings.findUnique({ where: { organizationId: actor.organizationId }, select: { homeRadiusMeters: true } }),
            this.prisma.workSite.findMany({ where: { organizationId: actor.organizationId, isActive: true }, select: SITE_SELECT, orderBy: { name: 'asc' } }),
        ]);
        const arrangement = profile?.arrangement ?? WorkArrangement.ON_SITE;
        let latestRequest: MyLocationView['latestRequest'] = null;
        if (latest) {
            const { employee: _employee, currentHome: _home, ...rest } = toRequestView(latest, null);
            latestRequest = rest;
        }
        return {
            arrangement,
            home: toHome(profile),
            homeRadiusMeters: settings?.homeRadiusMeters ?? DEFAULT_HOME_RADIUS_METERS,
            canRequestHome: arrangement !== WorkArrangement.ON_SITE,
            latestRequest,
            sites,
        };
    }

    // A new capture replaces any request still waiting; the approved home stays until this one is approved.
    async requestHome(user: AccessTokenPayload, dto: HomeLocationRequestDto): Promise<MyLocationView> {
        const actor = await this.access.resolveActor(user);
        const profile = await this.prisma.workEmployeeProfile.findUnique({ where: { employeeId: actor.employeeId }, select: { arrangement: true } });
        if (!profile || profile.arrangement === WorkArrangement.ON_SITE) {
            throw workBadRequest(WorkErrorCode.HOME_NOT_ALLOWED, 'Only remote or hybrid employees can set a home location; ask HR to change your work arrangement');
        }
        if (dto.location.accuracyMeters > MAX_HOME_ACCURACY_METERS) {
            throw workBadRequest(WorkErrorCode.LOCATION_TOO_VAGUE, `Your location is only accurate to ${Math.round(dto.location.accuracyMeters)} m. Turn on precise location or move near a window and try again.`, {
                maxAccuracyMeters: MAX_HOME_ACCURACY_METERS,
            });
        }

        try {
            await this.prisma.$transaction(async (tx) => {
                await tx.workHomeLocationRequest.updateMany({
                    where: { employeeId: actor.employeeId, status: HomeLocationRequestStatus.PENDING },
                    data: { status: HomeLocationRequestStatus.CANCELLED },
                });
                await tx.workHomeLocationRequest.create({
                    data: {
                        organizationId: actor.organizationId,
                        employeeId: actor.employeeId,
                        latitude: dto.location.latitude,
                        longitude: dto.location.longitude,
                        accuracyMeters: dto.location.accuracyMeters,
                        capturedAt: new Date(dto.location.capturedAt),
                        note: dto.note,
                    },
                });
            });
        } catch (error) {
            // Two captures at once; the other one is now the pending request.
            if (isUniqueViolation(error)) throw workConflict(WorkErrorCode.HOME_REQUEST_NOT_PENDING, 'Another home location request was just sent; reload and try again');
            throw error;
        }
        return this.mine(user);
    }

    async cancelMine(user: AccessTokenPayload): Promise<MyLocationView> {
        const actor = await this.access.resolveActor(user);
        await this.prisma.workHomeLocationRequest.updateMany({
            where: { employeeId: actor.employeeId, organizationId: actor.organizationId, status: HomeLocationRequestStatus.PENDING },
            data: { status: HomeLocationRequestStatus.CANCELLED },
        });
        return this.mine(user);
    }

    // Review (HR, or the employee's reporting manager) ---------------------------------------

    async listRequests(user: AccessTokenPayload, query: HomeRequestQueryDto): Promise<HomeRequestView[]> {
        const actor = await this.access.resolveActor(user);
        const status = query.status ?? HomeLocationRequestStatus.PENDING;
        const rows = await this.prisma.workHomeLocationRequest.findMany({
            where: { organizationId: actor.organizationId, status, employeeId: await this.reviewableFilter(actor) },
            select: REQUEST_SELECT,
            orderBy: [{ createdAt: status === HomeLocationRequestStatus.PENDING ? 'asc' : 'desc' }, { id: 'asc' }],
            take: 100,
        });
        const profiles = await this.prisma.workEmployeeProfile.findMany({
            where: { employeeId: { in: [...new Set(rows.map((r) => r.employeeId))] } },
            select: { employeeId: true, homeLatitude: true, homeLongitude: true, homeApprovedAt: true },
        });
        const homes = new Map(profiles.map((p) => [p.employeeId, toHome(p)]));
        return rows.map((r) => toRequestView(r, homes.get(r.employeeId) ?? null));
    }

    // Approving copies the captured point to the profile as the home in force.
    async review(user: AccessTokenPayload, requestId: string, dto: ReviewHomeRequestDto): Promise<HomeRequestView> {
        const actor = await this.access.resolveActor(user);
        const request = await this.prisma.workHomeLocationRequest.findFirst({
            where: { id: requestId, organizationId: actor.organizationId, employeeId: await this.reviewableFilter(actor) },
            select: { id: true, employeeId: true, latitude: true, longitude: true },
        });
        if (!request) throw new NotFoundException('Home location request not found');
        if (request.employeeId === actor.employeeId) throw new ForbiddenException('Someone else must review your own home location');

        const now = new Date();
        await this.prisma.$transaction(async (tx) => {
            const { count } = await tx.workHomeLocationRequest.updateMany({
                where: { id: request.id, status: HomeLocationRequestStatus.PENDING },
                data: { status: dto.decision, reviewedById: actor.employeeId, reviewedAt: now, reviewNote: dto.note },
            });
            if (count === 0) throw workConflict(WorkErrorCode.HOME_REQUEST_NOT_PENDING, 'This request has already been reviewed or withdrawn');

            if (dto.decision === HomeLocationRequestStatus.APPROVED) {
                const home = { homeLatitude: request.latitude, homeLongitude: request.longitude, homeApprovedAt: now };
                await tx.workEmployeeProfile.upsert({
                    where: { employeeId: request.employeeId },
                    create: { employeeId: request.employeeId, organizationId: actor.organizationId, ...home },
                    update: home,
                });
            }
        });

        const [row, profile] = await Promise.all([
            this.prisma.workHomeLocationRequest.findUniqueOrThrow({ where: { id: request.id }, select: REQUEST_SELECT }),
            this.prisma.workEmployeeProfile.findUnique({ where: { employeeId: request.employeeId } }),
        ]);
        return toRequestView(row, toHome(profile));
    }

    // Settings roles review anyone; a reporting manager reviews their direct reports.
    private async reviewableFilter(actor: WorkActor): Promise<Prisma.StringFilter | undefined> {
        if (WORK_SETTINGS_ROLES.includes(actor.role)) return undefined;
        const reports = await this.access.directReportIds(actor);
        if (reports.length === 0) throw new ForbiddenException('You cannot review home locations');
        return { in: reports };
    }

    private async settingsView(actor: WorkActor): Promise<LocationSettingsView> {
        const canEdit = WORK_SETTINGS_ROLES.includes(actor.role);
        const [settings, sites] = await Promise.all([
            this.prisma.workSettings.findUnique({ where: { organizationId: actor.organizationId }, select: { homeRadiusMeters: true } }),
            this.prisma.workSite.findMany({
                where: { organizationId: actor.organizationId, ...(!canEdit && { isActive: true }) },
                select: SITE_SELECT,
                orderBy: { name: 'asc' },
            }),
        ]);
        return { homeRadiusMeters: settings?.homeRadiusMeters ?? DEFAULT_HOME_RADIUS_METERS, sites, canEdit };
    }

    private async findSite(actor: WorkActor, siteId: string): Promise<void> {
        const site = await this.prisma.workSite.findFirst({ where: { id: siteId, organizationId: actor.organizationId }, select: { id: true } });
        if (!site) throw new NotFoundException('Location not found');
    }

    private assertCanEdit(actor: WorkActor): void {
        if (!WORK_SETTINGS_ROLES.includes(actor.role)) throw new ForbiddenException('You cannot change work locations');
    }

    private siteExists() {
        return workConflict(WorkErrorCode.SITE_EXISTS, 'There is already a location with that name');
    }
}
