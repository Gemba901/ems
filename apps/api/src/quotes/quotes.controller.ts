import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { QuotesService } from './quotes.service';

@Controller('quotes')
@UseGuards(JwtAuthGuard)
export class QuotesController {
    constructor(private quotesService: QuotesService) { }

    @Get('daily')
    async getDailyQuote(@Req() req) {
        return this.quotesService.getQuoteForUser(req.user.userId);
    }
}
