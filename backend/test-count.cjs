const { PrismaClient } = require('@prisma/client');
const path = require('path');
const dbPath = path.resolve(__dirname, 'dev.db');
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: `file:${dbPath}`
    }
  }
});

async function run() {
  const companies = await prisma.company.findMany();
  console.log('Companies:');
  for (const c of companies) {
    console.log(c.taxCode, c.name);
    const count = await prisma.invoice.count({
      where: { OR: [{ sellerTaxCode: c.taxCode }, { buyerTaxCode: c.taxCode }] }
    });
    console.log('  Invoices:', count);
  }
}

run().catch(console.error).finally(() => prisma.$disconnect());
