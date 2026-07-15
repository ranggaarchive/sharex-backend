const crypto = require('crypto-js');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const IPAYMU_VA = process.env.IPAYMU_VA;
const IPAYMU_KEY = process.env.IPAYMU_KEY;
const API_URL = 'https://my.ipaymu.com/api/v2/payment'; // using production

/**
 * Buat sesi pembayaran iPaymu
 * @param {Object} data - { referenceId, amount, buyerName, buyerEmail, buyerPhone }
 * @returns {Promise<Object>} - { success, url, sessionId, error }
 */
async function createPaymentSession(data) {
  try {
    // iPaymu requires array for product, qty, price
    const body = {
      product: ["Akses Phantom ShareX"],
      qty: ["1"],
      price: [data.amount.toString()],
      amount: data.amount.toString(),
      returnUrl: `https://sharex-user.vercel.app/tutorial`, // Redirect here on success
      cancelUrl: `https://sharex-user.vercel.app/`, // Redirect here on cancel
      notifyUrl: `https://sharex-backend-production.up.railway.app/api/payment/callback`, // Webhook URL
      referenceId: data.referenceId,
      buyerName: data.buyerName || "User",
      buyerEmail: data.buyerEmail || "user@sharex.com",
    };

    // Generate Signature
    const bodyEncrypt = crypto.SHA256(JSON.stringify(body));
    const stringToSign = `POST:${IPAYMU_VA}:${bodyEncrypt}:${IPAYMU_KEY}`;
    const signature = crypto.enc.Hex.stringify(crypto.HmacSHA256(stringToSign, IPAYMU_KEY));
    
    // timestamp
    const now = new Date();
    const timestamp = now.getFullYear().toString() + 
                      String(now.getMonth() + 1).padStart(2, '0') + 
                      String(now.getDate()).padStart(2, '0') + 
                      String(now.getHours()).padStart(2, '0') + 
                      String(now.getMinutes()).padStart(2, '0') + 
                      String(now.getSeconds()).padStart(2, '0');

    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        va: IPAYMU_VA,
        signature: signature,
        timestamp: timestamp
      },
      body: JSON.stringify(body)
    });

    const responseJson = await response.json();
    console.log("iPaymu Response:", responseJson);

    if (responseJson.Success) {
      return {
        success: true,
        url: responseJson.Data.Url,
        sessionId: responseJson.Data.SessionID
      };
    } else {
      return {
        success: false,
        error: responseJson.Message || 'Failed to create payment session'
      };
    }
  } catch (error) {
    console.error("iPaymu Error:", error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  createPaymentSession
};
