import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

// Mock bcrypt so tests don't do real hashing (slow + unnecessary)
jest.mock('bcrypt');

const mockPrisma = {
    user: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
    },
};

const mockJwtService = {
    sign: jest.fn(),
    verify: jest.fn(),
};

describe('AuthService', () => {
    let service: AuthService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AuthService,
                { provide: PrismaService, useValue: mockPrisma },
                { provide: JwtService, useValue: mockJwtService },
            ],
        }).compile();

        service = module.get<AuthService>(AuthService);

        // Reset all mocks before each test
        jest.clearAllMocks();
    });

    // ─────────────────────────────────────────────────────────────
    // login
    // ─────────────────────────────────────────────────────────────
    describe('login', () => {
        it('should throw if user is not found', async () => {
            mockPrisma.user.findFirst.mockResolvedValue(null);

            await expect(service.login('unknown@test.com', 'pass123'))
                .rejects.toThrow(new UnauthorizedException('Invalid credentials'));
        });

        it('should throw if password does not match', async () => {
            mockPrisma.user.findFirst.mockResolvedValue({
                id: 'user-1',
                password: 'hashed-password',
            });
            (bcrypt.compare as jest.Mock).mockResolvedValue(false);

            await expect(service.login('user@test.com', 'wrongpassword'))
                .rejects.toThrow(new UnauthorizedException('Invalid credentials'));
        });

        it('should return accessToken and user on success', async () => {
            const fakeUser = {
                id: 'user-1',
                name: 'John Doe',
                email: 'user@test.com',
                phone: '0712345678',
                organizationId: 'org-1',
                roleId: 'role-1',
                password: 'hashed-password',
            };
            mockPrisma.user.findFirst.mockResolvedValue(fakeUser);
            (bcrypt.compare as jest.Mock).mockResolvedValue(true);
            mockJwtService.sign.mockReturnValue('signed-jwt-token');

            const result = await service.login('user@test.com', 'correctpassword');

            expect(result.accessToken).toBe('signed-jwt-token');
            expect(result.user.name).toBe('John Doe');
            expect(result.user.userId).toBe('user-1');
        });
    });

    // ─────────────────────────────────────────────────────────────
    // verifyFirstTimeUser
    // ─────────────────────────────────────────────────────────────
    describe('verifyFirstTimeUser', () => {
        it('should throw if account is not found', async () => {
            mockPrisma.user.findFirst.mockResolvedValue(null);

            await expect(service.verifyFirstTimeUser('unknown@test.com'))
                .rejects.toThrow(new UnauthorizedException('Account not found! Please contact your administrator.'));
        });

        it('should throw if account already has a password', async () => {
            mockPrisma.user.findFirst.mockResolvedValue({
                id: 'user-1',
                password: 'already-set',
            });

            await expect(service.verifyFirstTimeUser('user@test.com'))
                .rejects.toThrow(new UnauthorizedException('Account already setup! Please login with your password.'));
        });

        it('should return a setupToken if user has no password yet', async () => {
            mockPrisma.user.findFirst.mockResolvedValue({
                id: 'user-1',
                password: null,
            });
            mockJwtService.sign.mockReturnValue('setup-jwt-token');

            const result = await service.verifyFirstTimeUser('user@test.com');

            expect(result.setupToken).toBe('setup-jwt-token');
            expect(result.message).toBe('User verified! Proceed to create password.');
            // Ensure the token was signed with the correct purpose
            expect(mockJwtService.sign).toHaveBeenCalledWith(
                { userId: 'user-1', purpsose: 'FIRST_TIME_SETUP' },
                { expiresIn: '15m' }
            );
        });
    });

    // ─────────────────────────────────────────────────────────────
    // createPassword
    // ─────────────────────────────────────────────────────────────
    describe('createPassword', () => {
        it('should throw if the token is invalid or expired', async () => {
            mockJwtService.verify.mockImplementation(() => {
                throw new Error('jwt expired');
            });

            await expect(service.createPassword('bad-token', 'newpass123'))
                .rejects.toThrow(new UnauthorizedException('Invalid or expired setup token! Please try again.'));
        });

        it('should throw if the token purpose is wrong', async () => {
            mockJwtService.verify.mockReturnValue({
                userId: 'user-1',
                purpsose: 'SOMETHING_ELSE',
            });

            await expect(service.createPassword('wrong-purpose-token', 'newpass123'))
                .rejects.toThrow(UnauthorizedException);
        });

        it('should throw if user is not found', async () => {
            mockJwtService.verify.mockReturnValue({
                userId: 'user-1',
                purpsose: 'FIRST_TIME_SETUP',
            });
            mockPrisma.user.findUnique.mockResolvedValue(null);

            await expect(service.createPassword('valid-token', 'newpass123'))
                .rejects.toThrow(UnauthorizedException);
        });

        it('should throw if user already has a password (token replay blocked)', async () => {
            mockJwtService.verify.mockReturnValue({
                userId: 'user-1',
                purpsose: 'FIRST_TIME_SETUP',
            });
            mockPrisma.user.findUnique.mockResolvedValue({
                id: 'user-1',
                password: 'already-hashed',
            });

            await expect(service.createPassword('valid-token', 'newpass123'))
                .rejects.toThrow(new UnauthorizedException('Password already set. Please login.'));
        });

        it('should hash the password and update the user on success', async () => {
            mockJwtService.verify.mockReturnValue({
                userId: 'user-1',
                purpsose: 'FIRST_TIME_SETUP',
            });
            mockPrisma.user.findUnique.mockResolvedValue({
                id: 'user-1',
                password: null,
            });
            (bcrypt.hash as jest.Mock).mockResolvedValue('new-hashed-password');
            mockPrisma.user.update.mockResolvedValue({});

            const result = await service.createPassword('valid-token', 'newpass123');

            expect(bcrypt.hash).toHaveBeenCalledWith('newpass123', 10);
            expect(mockPrisma.user.update).toHaveBeenCalledWith({
                where: { id: 'user-1' },
                data: { password: 'new-hashed-password' },
            });
            expect(result.message).toBe('Password created successfully! You can now login.');
        });
    });
});
