import { PrismaClient } from '@prisma/client';
import path from 'path';

// Trỏ thẳng tới backend/dev.db thay vì backend/prisma/dev.db
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: `file:${path.join(process.cwd(), 'dev.db')}`
    }
  }
});

async function main() {
  const items = await prisma.invoiceItem.deleteMany({});
  const invoices = await prisma.invoice.deleteMany({});
  const history = await prisma.downloadHistory.deleteMany({});
  const schedules = await prisma.schedule.deleteMany({});
  const companies = await prisma.company.deleteMany({});
  
  console.log(`Đã xóa thành công (tại ${process.cwd()}\\dev.db):
  - ${invoices.count} hóa đơn
  - ${items.count} chi tiết hóa đơn
  - ${history.count} nhật ký tải
  - ${schedules.count} lịch biểu
  - ${companies.count} doanh nghiệp
  `);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
