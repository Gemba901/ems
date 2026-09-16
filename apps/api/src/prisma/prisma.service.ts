import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from 'db';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
    constructor() {
        super({
            adapter: new PrismaPg({
                connectionString: process.env.DATABASE_URL,
            }),
        });
    }

    async onModuleInit() {
        await this.$connect();
        if (process.env.EXPECTED_DATABASE_NAME) {
            const [row] = await this.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
            if (row.name !== process.env.EXPECTED_DATABASE_NAME) {
                await this.$disconnect();
                throw new Error('Database name does not match EXPECTED_DATABASE_NAME');
            }
        }
    }
}