const axios = require('axios');

// Configuration
const API_BASE = 'http://localhost:10000/api';
let authToken = '';

// Test user credentials
const testUser = {
  email: 'test@example.com',
  password: 'testpassword123'
};

async function login() {
  try {
    const response = await axios.post(`${API_BASE}/auth/login`, testUser);
    authToken = response.data.token;
    console.log('✅ Logged in successfully');
    return true;
  } catch (error) {
    console.log('❌ Login failed:', error.response?.data?.error || error.message);
    return false;
  }
}

async function createBudget(category, amount) {
  try {
    const response = await axios.post(`${API_BASE}/budgets`, {
      name: `${category} Budget`,
      amount: amount,
      category: category,
      period: 'Monthly'
    }, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    console.log(`✅ Created ${category} budget with amount ${amount}`);
    return response.data;
  } catch (error) {
    console.log(`❌ Failed to create ${category} budget:`, error.response?.data?.error || error.message);
    return null;
  }
}

async function createTransaction(description, amount, type, category) {
  try {
    const response = await axios.post(`${API_BASE}/transactions`, {
      description: description,
      amount: amount,
      type: type,
      category: category,
      date: new Date().toISOString().split('T')[0]
    }, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    console.log(`✅ Created ${type} transaction: ${description} (${amount})`);
    return response.data;
  } catch (error) {
    console.log(`❌ Failed to create transaction:`, error.response?.data?.error || error.message);
    return null;
  }
}

async function getBudgets() {
  try {
    const response = await axios.get(`${API_BASE}/budgets`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    return response.data;
  } catch (error) {
    console.log('❌ Failed to get budgets:', error.response?.data?.error || error.message);
    return [];
  }
}

async function testBudgetTransactionIntegration() {
  console.log('🧪 Testing Budget-Transaction Integration\n');
  
  // Step 1: Login
  const loginSuccess = await login();
  if (!loginSuccess) return;
  
  // Step 2: Create a budget for Food category
  const foodBudget = await createBudget('Food', 5000);
  if (!foodBudget) return;
  
  // Step 3: Check initial budget state
  console.log('\n📊 Initial Budget State:');
  let budgets = await getBudgets();
  const foodBudgetCurrent = budgets.find(b => b.category === 'Food');
  if (foodBudgetCurrent) {
    console.log(`   Budget: ${foodBudgetCurrent.name}`);
    console.log(`   Amount: ₹${foodBudgetCurrent.amount}`);
    console.log(`   Spent: ₹${foodBudgetCurrent.spent}`);
    console.log(`   Remaining: ₹${foodBudgetCurrent.remaining}`);
    console.log(`   Status: ${foodBudgetCurrent.status}`);
  }
  
  // Step 4: Add a food expense transaction
  console.log('\n💸 Adding Food Expense Transaction...');
  await createTransaction('Restaurant Dinner', 1200, 'expense', 'Food');
  
  // Step 5: Wait a moment for the update to process
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Step 6: Check budget state after transaction
  console.log('\n📊 Budget State After Transaction:');
  budgets = await getBudgets();
  const updatedFoodBudget = budgets.find(b => b.category === 'Food');
  if (updatedFoodBudget) {
    console.log(`   Budget: ${updatedFoodBudget.name}`);
    console.log(`   Amount: ₹${updatedFoodBudget.amount}`);
    console.log(`   Spent: ₹${updatedFoodBudget.spent}`);
    console.log(`   Remaining: ₹${updatedFoodBudget.remaining}`);
    console.log(`   Status: ${updatedFoodBudget.status}`);
    
    // Verify the integration worked
    if (updatedFoodBudget.spent === 1200) {
      console.log('\n✅ SUCCESS: Budget spent amount updated correctly!');
    } else {
      console.log('\n❌ FAILURE: Budget spent amount not updated correctly');
    }
  }
  
  // Step 7: Add another transaction
  console.log('\n💸 Adding Another Food Expense...');
  await createTransaction('Grocery Shopping', 800, 'expense', 'Food');
  
  // Step 8: Check final budget state
  await new Promise(resolve => setTimeout(resolve, 1000));
  console.log('\n📊 Final Budget State:');
  budgets = await getBudgets();
  const finalFoodBudget = budgets.find(b => b.category === 'Food');
  if (finalFoodBudget) {
    console.log(`   Budget: ${finalFoodBudget.name}`);
    console.log(`   Amount: ₹${finalFoodBudget.amount}`);
    console.log(`   Spent: ₹${finalFoodBudget.spent}`);
    console.log(`   Remaining: ₹${finalFoodBudget.remaining}`);
    console.log(`   Status: ${finalFoodBudget.status}`);
    
    // Verify the integration worked
    if (finalFoodBudget.spent === 2000) {
      console.log('\n✅ SUCCESS: Budget spent amount updated correctly after second transaction!');
    } else {
      console.log('\n❌ FAILURE: Budget spent amount not updated correctly');
    }
  }
  
  console.log('\n🎉 Budget-Transaction Integration Test Complete!');
}

// Run the test
testBudgetTransactionIntegration().catch(console.error);
