import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateCommitteeDto, AddMemberDto } from './dto/committee.dto';

const committeeInclude = {
  members: {
    include: {
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          department: { select: { id: true, name: true } },
        },
      },
    },
  },
};

@Injectable()
export class CommitteeService {
  constructor(private prisma: PrismaService) {}

  private async resolveEmployee(userId: string, organizationId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { userId, organizationId },
      select: { id: true },
    });
    if (!employee) throw new ForbiddenException('No employee profile linked to your account');
    return employee;
  }

  async createCommittee(dto: CreateCommitteeDto, organizationId: string) {
    return this.prisma.steeringCommittee.create({
      data: {
        name: dto.name,
        type: dto.type,
        organizationId,
      },
      include: committeeInclude,
    });
  }

  async listCommittees(organizationId: string) {
    return this.prisma.steeringCommittee.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'asc' },
      include: committeeInclude,
    });
  }

  // Lightweight list for the "route this suggestion to a committee" picker — any authenticated
  // org member may see committee names/types to route to, without the full member roster.
  async listRoutable(organizationId: string) {
    return this.prisma.steeringCommittee.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, type: true },
    });
  }

  async getCommittee(id: string, organizationId: string) {
    const committee = await this.prisma.steeringCommittee.findUnique({
      where: { id },
      include: committeeInclude,
    });
    if (!committee || committee.organizationId !== organizationId) {
      throw new NotFoundException('Committee not found');
    }
    return committee;
  }

  async addMember(committeeId: string, dto: AddMemberDto, organizationId: string) {
    const committee = await this.prisma.steeringCommittee.findUnique({
      where: { id: committeeId },
    });
    if (!committee || committee.organizationId !== organizationId) {
      throw new NotFoundException('Committee not found');
    }

    const employee = await this.prisma.employee.findFirst({
      where: { id: dto.employeeId, organizationId },
    });
    if (!employee) throw new NotFoundException('Employee not found in this organisation');

    const existing = await this.prisma.steeringCommitteeMember.findUnique({
      where: { committeeId_employeeId: { committeeId, employeeId: dto.employeeId } },
    });
    if (existing) throw new ConflictException('Employee is already a member of this committee');

    await this.prisma.steeringCommitteeMember.create({
      data: { committeeId, employeeId: dto.employeeId },
    });

    return this.getCommittee(committeeId, organizationId);
  }

  async removeMember(committeeId: string, employeeId: string, organizationId: string) {
    const committee = await this.prisma.steeringCommittee.findUnique({
      where: { id: committeeId },
    });
    if (!committee || committee.organizationId !== organizationId) {
      throw new NotFoundException('Committee not found');
    }

    const membership = await this.prisma.steeringCommitteeMember.findUnique({
      where: { committeeId_employeeId: { committeeId, employeeId } },
    });
    if (!membership) throw new NotFoundException('Employee is not a member of this committee');

    await this.prisma.steeringCommitteeMember.delete({
      where: { committeeId_employeeId: { committeeId, employeeId } },
    });

    return this.getCommittee(committeeId, organizationId);
  }

  async deleteCommittee(id: string, organizationId: string) {
    const committee = await this.prisma.steeringCommittee.findUnique({ where: { id } });
    if (!committee || committee.organizationId !== organizationId) {
      throw new NotFoundException('Committee not found');
    }
    await this.prisma.steeringCommittee.delete({ where: { id } });
    return { message: 'Committee deleted' };
  }

  // Returns the committee(s) the current user belongs to in this org
  async getMyCommittees(userId: string, organizationId: string) {
    const employee = await this.resolveEmployee(userId, organizationId);
    return this.prisma.steeringCommittee.findMany({
      where: {
        organizationId,
        members: { some: { employeeId: employee.id } },
      },
      select: { id: true, name: true, type: true },
    });
  }

  // The single committee SELECTED_FOR_SGA suggestions are forwarded to for this org
  async setDesignatedSgaCommittee(committeeId: string, organizationId: string) {
    const committee = await this.prisma.steeringCommittee.findUnique({
      where: { id: committeeId },
    });
    if (!committee || committee.organizationId !== organizationId) {
      throw new NotFoundException('Committee not found');
    }

    await this.prisma.organization.update({
      where: { id: organizationId },
      data: { sgaCommitteeId: committeeId },
    });

    return this.getCommittee(committeeId, organizationId);
  }

  async getDesignatedSgaCommittee(organizationId: string) {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { sgaCommittee: { select: { id: true, name: true, type: true } } },
    });
    return organization?.sgaCommittee ?? null;
  }
}
