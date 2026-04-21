import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Role } from 'src/common/enum/role.enum';

export interface JwtPayload {
    userId: String;
    organizationId: String | null;
    roleId: String;
    email: String | null;
    phone: String;
    organizationName: String;
    roleLevel: Role
}

@Injectable()
export class AuthService {
    constructor(
        private prisma: PrismaService,
        private jwtService: JwtService,
    ) { }

    // login via phone or email
    async login(phoneOrEmail: string, password: string) {
        // Try to find user by unique email or phone
        let user = await this.prisma.user.findFirst({
            where: {
                OR: [
                    { email: phoneOrEmail },
                    { phone: phoneOrEmail }
                ]
            },
            include: {
                organization: true,
                role: true
            }
        });

        // throw error if user not found
        if (!user) throw new UnauthorizedException('Invalid credentials');

        // compare password with hashed password
        const isMatch = await bcrypt.compare(password, user.password!);
        if (!isMatch) throw new UnauthorizedException('Invalid credentials');

        // create JWT payload and sign token
        const payload: JwtPayload = {
            userId: user.id,
            organizationId: user.organizationId,
            roleId: user.roleId,
            roleLevel: user.role.name.toUpperCase().replace(/\s+/g, '_') as Role,
            email: user.email,
            phone: user.phone,
            organizationName: user.organization?.name || 'Unknown Organization',
        }


        return {
            accessToken: this.jwtService.sign(payload),
            user: { name: user.name,  ...payload }
        }
    }

    // first time login - verify if user exists and return setup token
    async verifyFirstTimeUser(phoneOrEmail: string) {
        const user = await this.prisma.user.findFirst({
            where: {
                OR: [
                    { email: phoneOrEmail },
                    { phone: phoneOrEmail }
                ]
            },
            include: {
                organization: true 
            }
        });

        if (!user) {
            throw new UnauthorizedException('Account not found! Please contact your administrator.');
        }

        const hasPassword = !!user.password;

        const responseData = {
            identifier: phoneOrEmail,
            hasPassword: hasPassword,
            name: user.name,
            orgName: user.organization?.name || 'Unknown Organization',
        };

        if (hasPassword) {
            return responseData;
        }

        const setupToken = this.jwtService.sign({
            userId: user.id,
            purpose: 'FIRST_TIME_SETUP'
        }, { expiresIn: '15m' });


        return {
            ...responseData,
            setupToken
        };
    }

    async createPassword(setupToken: string, newPassword: string) {
        try {
            // verify token
            const decoded = this.jwtService.verify(setupToken);

            // check token purpose
            if (decoded.purpose !== 'FIRST_TIME_SETUP') {
                throw new UnauthorizedException('Invalid setup token');
            }

            // check if user exists and password is not already set
            const user = await this.prisma.user.findUnique({ where: { id: decoded.userId } });
            if (!user) throw new UnauthorizedException('User not found');
            if (user.password) throw new UnauthorizedException('Password already set. Please login.');

            // hash new password
            const hashedPassword = await bcrypt.hash(newPassword, 10);

            // update user with new password
            await this.prisma.user.update({
                where: { id: decoded.userId },
                data: { password: hashedPassword }
            });

            return { message: 'Password created successfully! You can now login.' };
        } catch (error) {
            throw new UnauthorizedException('Invalid or expired setup token! Please try again.');
        }
    }
}
