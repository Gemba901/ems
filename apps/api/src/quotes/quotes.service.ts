import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class QuotesService {
    constructor(private prisma: PrismaService) { }

    private getTimeOfDay(): string {
        const hour = new Date().getHours();

        // morning
        if (hour > 5 && hour < 12) {
            return 'MORNING';
        }

        // afternoon
        if (hour >= 12 && hour < 17) {
            return 'AFTERNOON';
        }

        // evening
        if (hour >= 17 && hour < 21) {
            return 'EVENING';
        }

        return 'NIGHT';
    }

    private generateHash(seed: string): number {
        let hash = 0;

        for (let i = 0; i < seed.length; i++) {
            hash = (hash << 5) - hash + seed.charCodeAt(i);
            hash |= 0; // Convert to 32bit integer
        }

        return Math.abs(hash);
    }

    async getQuoteForUser(userId: string) {
        const timeOfDay = this.getTimeOfDay();

        const where = {
            active: true,
            timeOfDay: { has: timeOfDay as any },
        };

        const count = await this.prisma.quotes.count({ where });

        if (!count) {
            return { message: 'No quotes available' };
        }

        const today = new Date().toDateString();
        const seed = `${userId}-${today}-${timeOfDay}`;
        const index = this.generateHash(seed) % count;

        const quote = await this.prisma.quotes.findFirst({
            where,
            orderBy: { id: 'asc' },
            skip: index,
            take: 1,
        });

        if (!quote) {
            return { message: 'No quotes available' };
        }

        return {
            id: quote.id,
            quote: quote.text,
            author: quote.author,
            category: quote.category,
            tags: quote.tags,
            timeOfDay,
        };
    }
}
