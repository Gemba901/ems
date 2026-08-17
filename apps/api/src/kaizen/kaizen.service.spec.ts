import { Test, TestingModule } from '@nestjs/testing';
import { KaizenService } from './kaizen.service';

describe('KaizenService', () => {
  let service: KaizenService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [KaizenService],
    }).compile();

    service = module.get<KaizenService>(KaizenService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
