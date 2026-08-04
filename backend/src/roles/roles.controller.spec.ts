import { Test, TestingModule } from '@nestjs/testing';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';

const mockRolesService = {
  findAll: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};

describe('RolesController', () => {
  let controller: RolesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RolesController],
      providers: [{ provide: RolesService, useValue: mockRolesService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<RolesController>(RolesController);
    jest.clearAllMocks();
  });

  it('should call rolesService.findAll', async () => {
    mockRolesService.findAll.mockResolvedValue([]);
    await controller.findAll();
    expect(mockRolesService.findAll).toHaveBeenCalled();
  });

  it('should call rolesService.findOne', async () => {
    mockRolesService.findOne.mockResolvedValue({ id: 'role-1' });
    await controller.findOne('role-1');
    expect(mockRolesService.findOne).toHaveBeenCalledWith('role-1');
  });

  it('should call rolesService.create', async () => {
    mockRolesService.create.mockResolvedValue({ id: 'role-1' });
    const dto: any = { name: 'editor' };
    await controller.create(dto);
    expect(mockRolesService.create).toHaveBeenCalledWith(dto);
  });

  it('should call rolesService.update', async () => {
    mockRolesService.update.mockResolvedValue({ id: 'role-1' });
    const dto: any = { name: 'author' };
    await controller.update('role-1', dto);
    expect(mockRolesService.update).toHaveBeenCalledWith('role-1', dto);
  });

  it('should call rolesService.delete', async () => {
    mockRolesService.delete.mockResolvedValue({ message: 'deleted' });
    await controller.delete('role-1');
    expect(mockRolesService.delete).toHaveBeenCalledWith('role-1');
  });
});
