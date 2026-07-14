const { PrismaClient } = require('@prisma/client');
const { encrypt } = require('./src/utils/crypto'); // Use the backend's crypto logic
const prisma = new PrismaClient();

async function main() {
  const domain = await prisma.domain.findUnique({ where: { slug: 'netflix' } });
  if (!domain) throw new Error("Netflix domain not found");

  // Create a dummy cookie array
  const dummyCookies = [
    { name: "NetflixId", value: "dummy-value-123", domain: ".netflix.com", path: "/", secure: true }
  ];

  const encryptedCookies = encrypt(dummyCookies);
  const encryptedPassword = encrypt('dummyPassword');

  const account = await prisma.account.create({
    data: {
      domainId: domain.id,
      label: 'Netflix Akun Test (Healthy)',
      email: 'netflix@test.com',
      password: encryptedPassword,
      maxConcurrent: 5,
      cookies: encryptedCookies,
      cookieHealth: 'HEALTHY'
    }
  });

  console.log('Account added/verified with HEALTHY status:', account.label);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
