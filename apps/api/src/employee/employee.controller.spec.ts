import { Test, TestingModule } from '@nestjs/testing';
import { EmployeeController } from './employee.controller';
import { EmployeeService } from './employee.service';
import { BadRequestException } from '@nestjs/common';

describe('EmployeeController', () => {
  let controller: EmployeeController;
  let service: EmployeeService;

  const mockEmployeeService = {
    onboardEmployee: jest.fn(),
    getEmployeeById: jest.fn(),
    getEmployeesByOrganization: jest.fn(),
    countEmployeesByOrganization: jest.fn(),
    getEmployeesByDepartment: jest.fn(),
    countEmployeesByDepartment: jest.fn(),
    updateEmployee: jest.fn(),
    deleteEmployee: jest.fn(),
  };

  const mockEmployee = {
    id: 'emp-1',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
    phone: '1234567890',
    departmentId: 'dept-1',
    organizationId: 'org-1',
    userId: 'user-1',
    createdAt: new Date(),
    department: {
      id: 'dept-1',
      name: 'Engineering',
      organizationId: 'org-1',
    },
    user: {
      id: 'user-1',
      email: 'john@example.com',
      phone: '1234567890',
      name: 'John Doe',
      roleId: 'role-1',
      organizationId: 'org-1',
      password: 'hashed-password',
      createdAt: new Date(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EmployeeController],
      providers: [
        {
          provide: EmployeeService,
          useValue: mockEmployeeService,
        },
      ],
    }).compile();

    controller = module.get<EmployeeController>(EmployeeController);
    service = module.get<EmployeeService>(EmployeeService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('onboard', () => {
    it('should create a new employee', async () => {
      const createEmployeeDto = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        phone: '1234567890',
        departmentId: 'dept-1',
        roleId: 'role-1',
      };

      mockEmployeeService.onboardEmployee.mockResolvedValue({
        user: mockEmployee.user,
        employee: mockEmployee,
      });

      const result = await controller.onboard(createEmployeeDto as any);

      expect(result).toEqual({
        user: mockEmployee.user,
        employee: mockEmployee,
      });
      expect(service.onboardEmployee).toHaveBeenCalledWith(createEmployeeDto, 'dept-1');
    });

    it('should handle duplicate email error', async () => {
      const createEmployeeDto = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        phone: '1234567890',
        departmentId: 'dept-1',
        roleId: 'role-1',
      };

      mockEmployeeService.onboardEmployee.mockRejectedValue(
        new BadRequestException('Employee with this email or phone already exists'),
      );

      await expect(controller.onboard(createEmployeeDto as any)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('getById', () => {
    it('should return an employee by id', async () => {
      mockEmployeeService.getEmployeeById.mockResolvedValue(mockEmployee);

      const result = await controller.getById('emp-1');

      expect(result).toEqual(mockEmployee);
      expect(service.getEmployeeById).toHaveBeenCalledWith('emp-1');
    });

    it('should throw error if employee not found', async () => {
      mockEmployeeService.getEmployeeById.mockRejectedValue(
        new BadRequestException('Employee not found'),
      );

      await expect(controller.getById('invalid-id')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('getByOrganization', () => {
    it('should return paginated employees by organization', async () => {
      const mockEmployees = [mockEmployee];
      const pagination = { page: 1, limit: 10 };

      mockEmployeeService.getEmployeesByOrganization.mockResolvedValue(
        mockEmployees,
      );
      mockEmployeeService.countEmployeesByOrganization.mockResolvedValue(1);

      const result = await controller.getByOrganization(
        'org-1',
        pagination as any,
      );

      expect(result).toEqual({
        data: mockEmployees,
        pagination: {
          page: 1,
          limit: 10,
          total: 1,
          pages: 1,
        },
      });
      expect(service.getEmployeesByOrganization).toHaveBeenCalledWith(
        'org-1',
        0,
        10,
      );
      expect(service.countEmployeesByOrganization).toHaveBeenCalledWith('org-1');
    });

    it('should use default pagination values', async () => {
      mockEmployeeService.getEmployeesByOrganization.mockResolvedValue([
        mockEmployee,
      ]);
      mockEmployeeService.countEmployeesByOrganization.mockResolvedValue(1);

      await controller.getByOrganization('org-1', {} as any);

      expect(service.getEmployeesByOrganization).toHaveBeenCalledWith(
        'org-1',
        0,
        10,
      );
    });

    it('should throw error for invalid pagination params', async () => {
      const invalidPagination = { page: 0, limit: 10 };

      await expect(
        controller.getByOrganization('org-1', invalidPagination as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getByDepartment', () => {
    it('should return paginated employees by department', async () => {
      const mockEmployees = [mockEmployee];
      const pagination = { page: 1, limit: 10 };

      mockEmployeeService.getEmployeesByDepartment.mockResolvedValue(
        mockEmployees,
      );
      mockEmployeeService.countEmployeesByDepartment.mockResolvedValue(1);

      const result = await controller.getByDepartment(
        'dept-1',
        pagination as any,
      );

      expect(result).toEqual({
        data: mockEmployees,
        pagination: {
          page: 1,
          limit: 10,
          total: 1,
          pages: 1,
        },
      });
      expect(service.getEmployeesByDepartment).toHaveBeenCalledWith(
        'dept-1',
        undefined,
        0,
        10,
      );
    });

    it('should throw error for invalid pagination params', async () => {
      const invalidPagination = { page: -1, limit: 10 };

      await expect(
        controller.getByDepartment('dept-1', invalidPagination as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('update', () => {
    it('should update an employee', async () => {
      const updateEmployeeDto = {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane@example.com',
      };

      const updatedEmployee = { ...mockEmployee, ...updateEmployeeDto };
      mockEmployeeService.updateEmployee.mockResolvedValue(updatedEmployee);

      const result = await controller.update('emp-1', updateEmployeeDto as any);

      expect(result).toEqual(updatedEmployee);
      expect(service.updateEmployee).toHaveBeenCalledWith(
        'emp-1',
        updateEmployeeDto,
      );
    });

    it('should throw error if employee not found', async () => {
      mockEmployeeService.updateEmployee.mockRejectedValue(
        new BadRequestException('Employee not found'),
      );

      await expect(
        controller.update('invalid-id', {} as any),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
