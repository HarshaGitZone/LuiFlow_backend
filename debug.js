const mongoose = require('mongoose');
require('dotenv').config({ path: './.env' });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/finance-tracker';

async function debug() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    const transactionCollection = mongoose.connection.collection('transactions');
    const userCollection = mongoose.connection.collection('users');

    // Get all users
    const users = await userCollection.find({}).toArray();
    console.log('\n=== USERS ===');
    console.log('Total users:', users.length);
    users.forEach((u, i) => {
      console.log(`${i + 1}. ID: ${u._id}, Email: ${u.email}`);
    });

    // For each user, get sample transactions and full details
    console.log('\n=== TRANSACTION DETAILS BY USER ===');
    for (const user of users) {
      const userId = user._id;
      const transactions = await transactionCollection.find({ userId }).limit(1).toArray();
      console.log(`\nUser ${user.email} (${userId.toString()}):`);
      console.log(`  Total transactions: ${await transactionCollection.countDocuments({ userId })}`);
      
      if (transactions.length > 0) {
        const t = transactions[0];
        console.log(`  Sample transaction:`);
        console.log(`    _id: ${t._id}`);
        console.log(`    userId (exists): ${t.userId !== undefined}`);
        console.log(`    userId value: ${t.userId}`);
        console.log(`    userId type: ${typeof t.userId}`);
      }
    }

    // Check transactions without userId
    const noUserIdCount = await transactionCollection.countDocuments({ userId: { $exists: false } });
    console.log(`\n=== TRANSACTIONS WITHOUT USERID ===`);
    console.log(`Count: ${noUserIdCount}`);

    await mongoose.connection.close();
    console.log('\nDebug complete');
  } catch (error) {
    console.error('Error:', error.message);
  }
}

debug();
