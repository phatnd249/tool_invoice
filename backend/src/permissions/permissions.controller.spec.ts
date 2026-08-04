import { Test, TestingModule } from '@nestjs/testing';
import { PermissionsController } from './permissions.controller';
import { PermissionsService } from './permissions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';

const mockPermissionsService = {
  findAll: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};

describe('PermissionsController', () => {
  let controller: PermissionsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PermissionsController],
      providers: [
        { provide: PermissionsService, useValue: mockPermissionsService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<PermissionsController>(PermissionsController);
    jest.clearAllMocks();
  });

  it('should call permissionsService.findAll', async () => {
    mockPermissionsService.findAll.mockResolvedValue([]);
    await controller.findAll();
    expect(mockPermissionsService.findAll).toHaveBeenCalled();
  });

  it('should call permissionsService.findOne', async () => {
    mockPermissionsService.findOne.mockResolvedValue({ id: 'perm-1' });
    await controller.findOne('perm-1');
    expect(mockPermissionsService.findOne).toHaveBeenCalledWith('perm-1');
  });

  it('should call permissionsService.create', async () => {
    mockPermissionsService.create.mockResolvedValue({ id: 'perm-1' });
    const dto: any = { name: 'user:read', group: 'user' };
    await controller.create(dto);
    expect(mockPermissionsService.create).toHaveBeenCalledWith(dto);
  });

  it('should call permissionsService.update', async () => {
    mockPermissionsService.update.mockResolvedValue({ id: 'perm-1' });
    const dto: any = { description: 'Updated' };
    await controller.update('perm-1', dto);
    expect(mockPermissionsService.update).toHaveBeenCalledWith('perm-1', dto);
  });

  it('should call permissionsService.delete', async () => {
    mockPermissionsService.delete.mockResolvedValue({ message: 'deleted' });
    await controller.delete('perm-1');
    expect(mockPermissionsService.delete).toHaveBeenCalledWith('perm-1');
  });
});
