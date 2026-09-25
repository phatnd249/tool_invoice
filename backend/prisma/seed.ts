import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient({
  adapter: new PrismaLibSql({
    url: process.env.DATABASE_URL || 'file:./dev.db',
  }),
});

async function main() {
  console.log('🌱 Seeding database...');

  // ─── 1. Roles ──────────────────────────────────────────────────────────────

  const superAdminRole = await prisma.role.upsert({
    where: { name: 'SUPER_ADMIN' },
    update: {},
    create: {
      name: 'SUPER_ADMIN',
      description: 'Super Administrator — có tất cả quyền',
      isSystem: true,
    },
  });

  const adminRole = await prisma.role.upsert({
    where: { name: 'ADMIN' },
    update: {},
    create: {
      name: 'ADMIN',
      description: 'Administrator',
      isSystem: false,
    },
  });

  const staffRole = await prisma.role.upsert({
    where: { name: 'STAFF' },
    update: {},
    create: {
      name: 'STAFF',
      description: 'Nhân viên — quyền hạn chế',
      isSystem: false,
    },
  });

  console.log('✅ Roles seeded');

  // ─── 2. Permissions ────────────────────────────────────────────────────────

  const permissionDefs = [
    { name: 'company:read', group: 'company', description: 'Xem danh sách và chi tiết doanh nghiệp' },
    { name: 'company:create', group: 'company', description: 'Thêm doanh nghiệp mới' },
    { name: 'company:update', group: 'company', description: 'Cập nhật thông tin doanh nghiệp' },
    { name: 'company:delete', group: 'company', description: 'Xoá doanh nghiệp' },
    { name: 'company:login', group: 'company', description: 'Đăng nhập / refresh token doanh nghiệp' },

    { name: 'user:read', group: 'user', description: 'Xem danh sách và chi tiết người dùng' },
    { name: 'user:create', group: 'user', description: 'Tạo người dùng mới' },
    { name: 'user:update', group: 'user', description: 'Cập nhật người dùng' },
    { name: 'user:delete', group: 'user', description: 'Xoá người dùng' },

    { name: 'role:read', group: 'role', description: 'Xem danh sách và chi tiết vai trò' },
    { name: 'role:create', group: 'role', description: 'Tạo vai trò mới' },
    { name: 'role:update', group: 'role', description: 'Cập nhật vai trò' },
    { name: 'role:delete', group: 'role', description: 'Xoá vai trò' },

    { name: 'invoice:read', group: 'invoice', description: 'Xem danh sách và chi tiết hoá đơn' },
    { name: 'invoice:download', group: 'invoice', description: 'Tải hoá đơn từ Tổng cục Thuế' },

    { name: 'company:scope', group: 'company', description: 'Xem tất cả doanh nghiệp (toàn cục). Nếu không có, user chỉ thấy công ty được gán.' },

    { name: 'backup:manage', group: 'system', description: 'Quản lý sao lưu dữ liệu và Google Drive' },
  ];


  const permissionIds: Record<string, string> = {};

  for (const perm of permissionDefs) {
    const p = await prisma.permission.upsert({
      where: { name: perm.name },
      update: {},
      create: perm,
    });
    permissionIds[perm.name] = p.id;
  }

  console.log('✅ Permissions seeded');

  // ─── 3. Assign permissions to roles ────────────────────────────────────────

  // SUPER_ADMIN gets ALL permissions
  for (const permName of Object.keys(permissionIds)) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: superAdminRole.id,
          permissionId: permissionIds[permName],
        },
      },
      update: {},
      create: {
        roleId: superAdminRole.id,
        permissionId: permissionIds[permName],
      },
    });
  }

  // ADMIN gets ALL permissions
  for (const permName of Object.keys(permissionIds)) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: adminRole.id,
          permissionId: permissionIds[permName],
        },
      },
      update: {},
      create: {
        roleId: adminRole.id,
        permissionId: permissionIds[permName],
      },
    });
  }

  // STAFF gets limited permissions
  const staffPerms = ['company:read', 'company:login', 'user:read'];
  for (const permName of staffPerms) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: staffRole.id,
          permissionId: permissionIds[permName],
        },
      },
      update: {},
      create: {
        roleId: staffRole.id,
        permissionId: permissionIds[permName],
      },
    });
  }

  console.log('✅ Role permissions assigned');

  // ─── 4. Seed Super Admin user (chỉ khi có ADMIN_EMAIL + ADMIN_INITIAL_PASSWORD) ──

  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_INITIAL_PASSWORD;

  if (!adminEmail || !adminPassword) {
    console.warn(
      '⚠️  Bỏ qua tạo admin: bật ADMIN_EMAIL + ADMIN_INITIAL_PASSWORD để seed tài khoản quản trị',
    );
  } else if (adminPassword.length < 8) {
    console.warn(
      '⚠️  Bỏ qua tạo admin: ADMIN_INITIAL_PASSWORD phải có ít nhất 8 ký tự',
    );
  } else {
    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    const superAdminUser = await prisma.user.upsert({
      where: { email: adminEmail },
      update: {},
      create: {
        fullName: 'Super Admin',
        email: adminEmail,
        password: hashedPassword,
        status: 'ACTIVE',
        emailVerified: true,
      },
    });

    await prisma.userRole.upsert({
      where: {
        userId_roleId: {
          userId: superAdminUser.id,
          roleId: superAdminRole.id,
        },
      },
      update: {},
      create: {
        userId: superAdminUser.id,
        roleId: superAdminRole.id,
      },
    });

    console.log(`✅ Super Admin user seeded: ${adminEmail}`);
  }

  console.log('🎉 Seed completed!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
