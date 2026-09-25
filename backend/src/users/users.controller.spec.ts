import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';

const mockUsersService = {
  getProfile: jest.fn(),
  updateProfile: jest.fn(),
  changePassword: jest.fn(),
  findAll: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  toggleStatus: jest.fn(),
  softDelete: jest.fn(),
  assignRoles: jest.fn(),
  revokeRole: jest.fn(),
};

const mockUser: any = {
  id: 'uid-1',
  email: 'john@example.com',
  jti: 'jti-1',
};

describe('UsersController', () => {
  let controller: UsersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: mockUsersService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<UsersController>(UsersController);
    jest.clearAllMocks();
  });

  it('should call usersService.getProfile', async () => {
    mockUsersService.getProfile.mockResolvedValue({ id: 'uid-1' });
    await controller.getProfile(mockUser);
    expect(mockUsersService.getProfile).toHaveBeenCalledWith('uid-1');
  });

  it('should call usersService.updateProfile', async () => {
    mockUsersService.updateProfile.mockResolvedValue({ id: 'uid-1' });
    await controller.updateProfile(mockUser, { fullName: 'New' });
    expect(mockUsersService.updateProfile).toHaveBeenCalledWith('uid-1', {
      fullName: 'New',
    });
  });

  it('should call usersService.changePassword', async () => {
    mockUsersService.changePassword.mockResolvedValue({ message: 'ok' });
    const dto: any = {
      currentPassword: 'old',
      newPassword: 'new',
      confirmPassword: 'new',
    };
    await controller.changePassword(mockUser, dto);
    expect(mockUsersService.changePassword).toHaveBeenCalledWith('uid-1', dto);
  });

  it('should call usersService.findAll with query', async () => {
    mockUsersService.findAll.mockResolvedValue({ data: [], total: 0 });
    await controller.findAll({ page: 1, limit: 10 });
    expect(mockUsersService.findAll).toHaveBeenCalledWith({
      page: 1,
      limit: 10,
    });
  });

  it('should call usersService.findOne', async () => {
    mockUsersService.findOne.mockResolvedValue({ id: 'uid-2' });
    await controller.findOne('uid-2');
    expect(mockUsersService.findOne).toHaveBeenCalledWith('uid-2');
  });

  it('should call usersService.create', async () => {
    mockUsersService.create.mockResolvedValue({ id: 'uid-3' });
    const dto: any = {
      fullName: 'Jane',
      email: 'jane@example.com',
      password: 'p',
      roleIds: [],
    };
    await controller.create(dto, mockUser);
    expect(mockUsersService.create).toHaveBeenCalledWith(dto, 'uid-1');
  });

  it('should call usersService.update', async () => {
    mockUsersService.update.mockResolvedValue({ id: 'uid-1' });
    await controller.update('uid-2', { fullName: 'Updated' }, mockUser);
    expect(mockUsersService.update).toHaveBeenCalledWith(
      'uid-2',
      { fullName: 'Updated' },
      'uid-1',
    );
  });

  it('should call usersService.toggleStatus', async () => {
    mockUsersService.toggleStatus.mockResolvedValue({ status: 'INACTIVE' });
    await controller.toggleStatus('uid-2', mockUser);
    expect(mockUsersService.toggleStatus).toHaveBeenCalledWith(
      'uid-2',
      'uid-1',
    );
  });

  it('should call usersService.softDelete', async () => {
    mockUsersService.softDelete.mockResolvedValue({ message: 'deleted' });
    await controller.softDelete('uid-2', mockUser);
    expect(mockUsersService.softDelete).toHaveBeenCalledWith('uid-2', 'uid-1');
  });

  it('should call usersService.assignRoles', async () => {
    mockUsersService.assignRoles.mockResolvedValue({ id: 'uid-2' });
    await controller.assignRoles('uid-2', { roleIds: ['r-1'] }, mockUser);
    expect(mockUsersService.assignRoles).toHaveBeenCalledWith(
      'uid-2',
      ['r-1'],
      'uid-1',
    );
  });

  it('should call usersService.revokeRole', async () => {
    mockUsersService.revokeRole.mockResolvedValue({ id: 'uid-2' });
    await controller.revokeRole('uid-2', 'role-1', mockUser);
    expect(mockUsersService.revokeRole).toHaveBeenCalledWith(
      'uid-2',
      'role-1',
      'uid-1',
    );
  });
});
