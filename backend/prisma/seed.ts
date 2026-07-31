import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import * as bcrypt from 'bcrypt';

const adapter = new PrismaLibSql({
  url: process.env.DATABASE_URL || 'file:./dev.db',
});
const prisma = new PrismaClient({ adapter });

// ─── Permissions ─────────────────────────────────────────────────────────────

const PERMISSIONS = [
  // User
  { name: 'user:read', description: 'View users', group: 'user' },
  { name: 'user:create', description: 'Create users', group: 'user' },
  { name: 'user:update', description: 'Update users', group: 'user' },
  { name: 'user:delete', description: 'Delete users', group: 'user' },
  // Role
  { name: 'role:read', description: 'View roles', group: 'role' },
  { name: 'role:create', description: 'Create roles', group: 'role' },
  { name: 'role:update', description: 'Update roles', group: 'role' },
  { name: 'role:delete', description: 'Delete roles', group: 'role' },
  { name: 'role:assign', description: 'Assign roles to users', group: 'role' },
  // Permission
  { name: 'permission:read', description: 'View permissions', group: 'permission' },
  { name: 'permission:create', description: 'Create permissions', group: 'permission' },
  { name: 'permission:update', description: 'Update permissions', group: 'permission' },
  { name: 'permission:delete', description: 'Delete permissions', group: 'permission' },
];

// ─── Roles ────────────────────────────────────────────────────────────────────

const ROLES = [
  {
    name: 'SUPER_ADMIN',
    description: 'Full system access',
    isSystem: true,
    permissions: PERMISSIONS.map((p) => p.name), // all permissions
  },
  {
    name: 'ADMIN',
    description: 'User and role management',
    isSystem: true,
    permissions: [
      'user:read',
      'user:create',
      'user:update',
      'role:read',
      'role:assign',
      'permission:read',
    ],
  },
  {
    name: 'USER',
    description: 'Regular authenticated user',
    isSystem: true,
    permissions: [],
  },
];

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱 Seeding database...');

  // Upsert permissions
  for (const perm of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { name: perm.name },
      create: perm,
      update: { description: perm.description, group: perm.group },
    });
  }
  console.log(`✅ Seeded ${PERMISSIONS.length} permissions`);

  // Upsert roles with permissions
  for (const roleData of ROLES) {
    const { permissions: permNames, ...roleInfo } = roleData;

    const role = await prisma.role.upsert({
      where: { name: roleInfo.name },
      create: roleInfo,
      update: { description: roleInfo.description },
    });

    // Sync permissions
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    if (permNames.length > 0) {
      const perms = await prisma.permission.findMany({
        where: { name: { in: permNames } },
      });
      for (const perm of perms) {
        await prisma.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId: role.id,
              permissionId: perm.id,
            },
          },
          create: { roleId: role.id, permissionId: perm.id },
          update: {},
        });
      }
    }
  }
  console.log(`✅ Seeded ${ROLES.length} roles`);

  // Upsert super admin user
  const superAdminEmail = 'admin@example.com';
  const superAdminPassword = await bcrypt.hash('Admin@123', 10);
  const superAdminRole = await prisma.role.findUnique({
    where: { name: 'SUPER_ADMIN' },
  });

  if (!superAdminRole) throw new Error('SUPER_ADMIN role not found');

  const superAdmin = await prisma.user.upsert({
    where: { email: superAdminEmail },
    create: {
      fullName: 'Super Admin',
      email: superAdminEmail,
      password: superAdminPassword,
      emailVerified: true,
      status: 'ACTIVE',
    },
    update: {},
  });

  await prisma.userRole.upsert({
    where: {
      userId_roleId: { userId: superAdmin.id, roleId: superAdminRole.id },
    },
    create: { userId: superAdmin.id, roleId: superAdminRole.id },
    update: {},
  });

  console.log(`✅ Seeded super admin: ${superAdminEmail} / Admin@123`);
  console.log('🎉 Seeding completed!');
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
