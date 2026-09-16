import { TenantRequired } from 'src/tenancy/tenant-route.decorator';
import { TrustedTenantContextGuard } from 'src/tenancy/trusted-tenant-context.guard';
import { TenantGuard } from 'src/tenancy/tenant.guard';
import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { QuotesService } from './quotes.service';

@TenantRequired()
@Controller('quotes')
@UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard)
export class QuotesController {
    constructor(private quotesService: QuotesService) { }

    @Get('daily')
    async getDailyQuote(@Req() req) {
        return this.quotesService.getQuoteForUser(req.user.userId);
    }
}
