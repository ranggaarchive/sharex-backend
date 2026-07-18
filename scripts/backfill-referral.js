const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function generateReferralCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 5; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

async function main() {
  const users = await prisma.user.findMany({
    where: { referralCode: null }
  });

  console.log(`Found ${users.length} users without referral codes.`);

  for (const user of users) {
    let newReferralCode;
    let isUnique = false;
    while (!isUnique) {
      newReferralCode = generateReferralCode();
      const existing = await prisma.user.findUnique({ where: { referralCode: newReferralCode } });
      if (!existing) {
        isUnique = true;
      }
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { referralCode: newReferralCode }
    });
    console.log(`Updated user ${user.email} with code ${newReferralCode}`);
  }

  console.log('Done!');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
