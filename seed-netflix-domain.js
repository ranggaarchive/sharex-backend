const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const domain = await prisma.domain.upsert({
    where: { slug: 'netflix' },
    update: {},
    create: {
      name: 'Netflix',
      slug: 'netflix',
      url: 'https://www.netflix.com',
      loginUrl: 'https://www.netflix.com/login',
      cookieDomain: '.netflix.com',
      category: 'STREAMING',
      requiredPlan: 'FREE'
    }
  });

  console.log('Domain added/verified:', domain.name);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
