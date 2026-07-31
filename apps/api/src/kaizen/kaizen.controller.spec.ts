import { Test, TestingModule } from '@nestjs/testing';
import { KaizenController } from './kaizen.controller';

describe('KaizenController', () => {
  let controller: KaizenController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [KaizenController],
    }).compile();

    controller = module.get<KaizenController>(KaizenController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
