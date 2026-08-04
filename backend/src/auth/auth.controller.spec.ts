import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

const mockAuthService = {
  register: jest.fn(),
  verifyEmail: jest.fn(),
  resendVerification: jest.fn(),
  login: jest.fn(),
  refreshTokens: jest.fn(),
  logout: jest.fn(),
  logoutAll: jest.fn(),
  forgotPassword: jest.fn(),
  resetPassword: jest.fn(),
};

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockAuthService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    jest.clearAllMocks();
  });

  it('should call authService.register', async () => {
    const dto = {
      fullName: 'John',
      email: 'john@example.com',
      password: 'Password1',
      confirmPassword: 'Password1',
    };
    mockAuthService.register.mockResolvedValue({ message: 'ok' });

    const result = await controller.register(dto);

    expect(mockAuthService.register).toHaveBeenCalledWith(dto);
    expect(result).toEqual({ message: 'ok' });
  });

  it('should call authService.verifyEmail', async () => {
    mockAuthService.verifyEmail.mockResolvedValue({ message: 'ok' });

    await controller.verifyEmail({ token: 'abc' });

    expect(mockAuthService.verifyEmail).toHaveBeenCalledWith('abc');
  });

  it('should call authService.resendVerification', async () => {
    mockAuthService.resendVerification.mockResolvedValue({ message: 'ok' });

    await controller.resendVerification({ email: 'john@example.com' });

    expect(mockAuthService.resendVerification).toHaveBeenCalledWith('john@example.com');
  });

  it('should call authService.login', async () => {
    const dto = { email: 'john@example.com', password: 'Password1' };
    mockAuthService.login.mockResolvedValue({
      accessToken: 'at',
      refreshToken: 'rt',
    });

    const result = await controller.login(dto);

    expect(mockAuthService.login).toHaveBeenCalledWith(dto);
    expect(result).toHaveProperty('accessToken');
  });

  it('should call authService.refreshTokens', async () => {
    mockAuthService.refreshTokens.mockResolvedValue({
      accessToken: 'at',
      refreshToken: 'rt',
    });

    await controller.refresh({ refreshToken: 'rt' });

    expect(mockAuthService.refreshTokens).toHaveBeenCalledWith('rt');
  });

  it('should call authService.logout with user and refreshToken', async () => {
    const user: any = { id: 'uid-1', email: 'john@example.com', jti: 'jti-1' };
    mockAuthService.logout.mockResolvedValue({ message: 'ok' });

    await controller.logout(user, { refreshToken: 'rt' });

    expect(mockAuthService.logout).toHaveBeenCalledWith('uid-1', 'jti-1', 'rt');
  });

  it('should call authService.logoutAll', async () => {
    const user: any = { id: 'uid-1', jti: 'jti-1' };
    mockAuthService.logoutAll.mockResolvedValue({ message: 'ok' });

    await controller.logoutAll(user);

    expect(mockAuthService.logoutAll).toHaveBeenCalledWith('uid-1', 'jti-1');
  });

  it('should call authService.forgotPassword', async () => {
    mockAuthService.forgotPassword.mockResolvedValue({ message: 'ok' });

    await controller.forgotPassword({ email: 'john@example.com' });

    expect(mockAuthService.forgotPassword).toHaveBeenCalledWith('john@example.com');
  });

  it('should call authService.resetPassword', async () => {
    const dto = {
      token: 'tok',
      password: 'NewPass1',
      confirmPassword: 'NewPass1',
    };
    mockAuthService.resetPassword.mockResolvedValue({ message: 'ok' });

    await controller.resetPassword(dto);

    expect(mockAuthService.resetPassword).toHaveBeenCalledWith(
      'tok',
      'NewPass1',
      'NewPass1',
    );
  });
});
