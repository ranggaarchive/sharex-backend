const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcrypt.hash('password', 12);
  const user = await prisma.user.upsert({
    where: { email: 'user@gmail.com' },
    update: {
      password: hashedPassword,
      role: 'ADMIN',
      plan: 'PHANTOM'
    },
    create: {
      email: 'user@gmail.com',
      password: hashedPassword,
      role: 'ADMIN',
      plan: 'PHANTOM'
    }
  });
  console.log('User created:', user.email);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
