const SalaryPlanner = require('../models/SalaryPlanner');

// Get salary planner data for a specific month
const getSalaryPlanner = async (req, res) => {
  try {
    const { month } = req.query;
    const userId = req.userId;
    
    let planner;
    if (month) {
      planner = await SalaryPlanner.findOne({ userId, month });
    } else {
      // Get current month's data or create new one
      const currentMonth = new Date().toISOString().slice(0, 7);
      planner = await SalaryPlanner.findOne({ userId, month: currentMonth });
    }
    
    if (!planner) {
      // Create default planner if none exists
      const defaultPlanner = new SalaryPlanner({
        userId,
        month: month || new Date().toISOString().slice(0, 7),
        salary: { amount: 45000, creditDate: '01' },
        fixedBills: [
          { name: 'Rent', amount: 15000, dueDate: '01', status: 'unpaid' },
          { name: 'Electricity', amount: 2000, dueDate: '10', status: 'unpaid' },
          { name: 'Internet', amount: 1000, dueDate: '15', status: 'unpaid' },
          { name: 'Mobile Recharge', amount: 500, dueDate: '01', status: 'unpaid' }
        ],
        variableExpenses: {
          categories: [
            { name: 'Groceries', budgetAmount: 8000, currentSpent: 0 },
            { name: 'Food & Dining', budgetAmount: 6000, currentSpent: 0 },
            { name: 'Transportation', budgetAmount: 3000, currentSpent: 0 },
            { name: 'Shopping', budgetAmount: 4000, currentSpent: 0 },
            { name: 'Entertainment', budgetAmount: 2000, currentSpent: 0 },
            { name: 'Medical', budgetAmount: 1500, currentSpent: 0 },
            { name: 'Personal Care', budgetAmount: 1000, currentSpent: 0 }
          ],
          totalSpent: 0
        },
        savingsGoals: [
          { title: 'Emergency Fund', targetAmount: 50000, targetDate: new Date(Date.now() + 6*30*24*60*60*1000), savedAmount: 0, monthlyContribution: 5000 },
          { title: 'New Laptop', targetAmount: 80000, targetDate: new Date(Date.now() + 12*30*24*60*60*1000), savedAmount: 0, monthlyContribution: 6000 }
        ]
      });
      
      await defaultPlanner.save();
      planner = defaultPlanner;
    }
    
    res.json({
      success: true,
      data: planner
    });
  } catch (error) {
    console.error('Error fetching salary planner:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch salary planner data'
    });
  }
};

// Update salary planner data
const updateSalaryPlanner = async (req, res) => {
  try {
    const userId = req.userId;
    const { month, updates } = req.body;
    
    const planner = await SalaryPlanner.findOneAndUpdate(
      { userId, month },
      updates,
      { new: true, upsert: true }
    );
    
    res.json({
      success: true,
      data: planner
    });
  } catch (error) {
    console.error('Error updating salary planner:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update salary planner data'
    });
  }
};

// Add fixed bill
const addFixedBill = async (req, res) => {
  try {
    const userId = req.userId;
    const { month, bill } = req.body;
    
    await SalaryPlanner.findOneAndUpdate(
      { userId, month },
      { $push: { fixedBills: bill } },
      { new: true, upsert: true }
    );
    
    res.json({
      success: true,
      message: 'Fixed bill added successfully'
    });
  } catch (error) {
    console.error('Error adding fixed bill:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add fixed bill'
    });
  }
};

// Update fixed bill
const updateFixedBill = async (req, res) => {
  try {
    const userId = req.userId;
    const { month, billId, updates } = req.body;
    
    await SalaryPlanner.findOneAndUpdate(
      { userId, month, 'fixedBills._id': billId },
      { $set: { 'fixedBills.$': updates } },
      { new: true }
    );
    
    res.json({
      success: true,
      message: 'Fixed bill updated successfully'
    });
  } catch (error) {
    console.error('Error updating fixed bill:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update fixed bill'
    });
  }
};

// Delete fixed bill
const deleteFixedBill = async (req, res) => {
  try {
    const userId = req.userId;
    const { month, billId } = req.body;
    
    await SalaryPlanner.findOneAndUpdate(
      { userId, month },
      { $pull: { fixedBills: { _id: billId } } },
      { new: true }
    );
    
    res.json({
      success: true,
      message: 'Fixed bill deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting fixed bill:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete fixed bill'
    });
  }
};

// Update variable expense category
const updateVariableExpense = async (req, res) => {
  try {
    const userId = req.userId;
    const { month, categoryName, amount } = req.body;
    
    await SalaryPlanner.findOneAndUpdate(
      { userId, month, 'variableExpenses.categories.name': categoryName },
      { 
        $set: { 
          'variableExpenses.categories.$.currentSpent': amount,
          'variableExpenses.totalSpent': { $sum: '$variableExpenses.categories.currentSpent' }
        }
      },
      { new: true }
    );
    
    res.json({
      success: true,
      message: 'Variable expense updated successfully'
    });
  } catch (error) {
    console.error('Error updating variable expense:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update variable expense'
    });
  }
};

// Add savings goal
const addSavingsGoal = async (req, res) => {
  try {
    const userId = req.userId;
    const { month, goal } = req.body;
    
    await SalaryPlanner.findOneAndUpdate(
      { userId, month },
      { $push: { savingsGoals: goal } },
      { new: true, upsert: true }
    );
    
    res.json({
      success: true,
      message: 'Savings goal added successfully'
    });
  } catch (error) {
    console.error('Error adding savings goal:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add savings goal'
    });
  }
};

// Update savings goal
const updateSavingsGoal = async (req, res) => {
  try {
    const userId = req.userId;
    const { month, goalId, updates } = req.body;
    
    await SalaryPlanner.findOneAndUpdate(
      { userId, month, 'savingsGoals._id': goalId },
      { $set: { 'savingsGoals.$': updates } },
      { new: true }
    );
    
    res.json({
      success: true,
      message: 'Savings goal updated successfully'
    });
  } catch (error) {
    console.error('Error updating savings goal:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update savings goal'
    });
  }
};

// Delete savings goal
const deleteSavingsGoal = async (req, res) => {
  try {
    const userId = req.userId;
    const { month, goalId } = req.body;
    
    await SalaryPlanner.findOneAndUpdate(
      { userId, month },
      { $pull: { savingsGoals: { _id: goalId } } },
      { new: true }
    );
    
    res.json({
      success: true,
      message: 'Savings goal deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting savings goal:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete savings goal'
    });
  }
};

module.exports = {
  getSalaryPlanner,
  updateSalaryPlanner,
  addFixedBill,
  updateFixedBill,
  deleteFixedBill,
  updateVariableExpense,
  addSavingsGoal,
  updateSavingsGoal,
  deleteSavingsGoal
};
