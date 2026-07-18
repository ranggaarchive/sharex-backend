const { PrismaClient } = require('@prisma/client');
const { BadRequestError } = require('../utils/errors');
const prisma = new PrismaClient();

async function getReferralData(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      referralCode: true,
      balance: true,
      _count: {
        select: { referrals: true }
      }
    }
  });

  const transactions = await prisma.walletTransaction.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 20
  });

  const withdrawals = await prisma.withdrawal.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 10
  });

  return {
    referralCode: user.referralCode,
    balance: user.balance,
    totalReferrals: user._count.referrals,
    transactions,
    withdrawals
  };
}

async function requestWithdrawal(userId, { amount, provider, accountNumber }) {
  if (!amount || amount <= 0) {
    throw new BadRequestError('Amount must be greater than 0');
  }
  if (!provider || !accountNumber) {
    throw new BadRequestError('Provider and account number are required');
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  
  if (user.balance < amount) {
    throw new BadRequestError('Insufficient balance');
  }

  // Deduct balance and create pending withdrawal
  const [withdrawal, updatedUser, walletTx] = await prisma.$transaction([
    prisma.withdrawal.create({
      data: {
        userId,
        amount,
        provider,
        accountNumber,
        status: 'PENDING'
      }
    }),
    prisma.user.update({
      where: { id: userId },
      data: { balance: { decrement: amount } }
    })
  ]);

  await prisma.walletTransaction.create({
    data: {
      userId,
      amount,
      type: 'WITHDRAWAL',
      description: `Penarikan ke ${provider} (${accountNumber})`,
      referenceTxId: withdrawal.id
    }
  });

  return withdrawal;
}

module.exports = {
  getReferralData,
  requestWithdrawal
};
