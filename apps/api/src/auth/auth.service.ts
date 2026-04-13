import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

export interface JwtPayload {
    userId: String;
    organizationId: String
    roleId: String;
    email: String;
    phone: String;
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
            }
        });

        // throw error if user not found
        if (!user) throw new UnauthorizedException('Invalid credentials');

        // compare password with hashed password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) throw new UnauthorizedException('Invalid credentials');

        // create JWT payload and sign token
        const payload: JwtPayload = {
            userId: user.id,
            organizationId: user.organizationId,
            roleId: user.roleId,
            email: user.email,
            phone: user.phone,
        }


        return {
            accessToken: this.jwtService.sign(payload),
            user: { name: user.name, ...payload }
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
            }
        })

        if (!user) throw new UnauthorizedException('Account not found! Please contact your administrator.');

        if (user.password) throw new UnauthorizedException('Account already setup! Please login with your password.');

        // generate a short lived token for password creation, valid for 15 minutes
        const setupToken = this.jwtService.sign({
            userId: user.id,
            purpsose: 'FIRST_TIME_SETUP'
        }, { expiresIn: '15m' });

        return {
            message: 'User verified! Proceed to create password.',
            setupToken
        };
    }

    async createPassword(setupToken: string, newPassword: string) {
        try {
            // verify token
            const decoded = this.jwtService.verify(setupToken);

            // check token purpose
            if (decoded.purpsose !== 'FIRST_TIME_SETUP') {
                throw new UnauthorizedException('Invalid setup token');
            }

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
