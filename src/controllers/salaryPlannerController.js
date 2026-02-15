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
        ],
        subscriptions: [
          { name: 'Netflix Premium', provider: 'Netflix', monthlyCost: 649, renewalDate: '15', category: 'Entertainment', status: 'active', autoRenewal: true },
          { name: 'Spotify Premium', provider: 'Spotify', monthlyCost: 119, renewalDate: '22', category: 'Entertainment', status: 'active', autoRenewal: true },
          { name: 'Amazon Prime', provider: 'Amazon', monthlyCost: 179, renewalDate: '08', category: 'Shopping', status: 'active', autoRenewal: true }
        ],
        cumulativeSavings: {
          totalSaved: 11000,
          monthlyHistory: [
            { month: '2025-10', saved: 3000, goalsCompleted: 0 },
            { month: '2025-11', saved: 4500, goalsCompleted: 1 },
            { month: '2025-12', saved: 3500, goalsCompleted: 0 }
          ]
        }
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

// Add subscription
const addSubscription = async (req, res) => {
  try {
    const userId = req.userId;
    const { month, subscription } = req.body;
    
    await SalaryPlanner.findOneAndUpdate(
      { userId, month },
      { $push: { subscriptions: subscription } },
      { new: true, upsert: true }
    );
    
    res.json({
      success: true,
      message: 'Subscription added successfully'
    });
  } catch (error) {
    console.error('Error adding subscription:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add subscription'
    });
  }
};

// Update subscription
const updateSubscription = async (req, res) => {
  try {
    const userId = req.userId;
    const { month, subscriptionId, updates } = req.body;
    
    await SalaryPlanner.findOneAndUpdate(
      { userId, month, 'subscriptions._id': subscriptionId },
      { $set: { 'subscriptions.$': updates } },
      { new: true }
    );
    
    res.json({
      success: true,
      message: 'Subscription updated successfully'
    });
  } catch (error) {
    console.error('Error updating subscription:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update subscription'
    });
  }
};

// Delete subscription
const deleteSubscription = async (req, res) => {
  try {
    const userId = req.userId;
    const { month, subscriptionId } = req.body;
    
    await SalaryPlanner.findOneAndUpdate(
      { userId, month },
      { $pull: { subscriptions: { _id: subscriptionId } } },
      { new: true }
    );
    
    res.json({
      success: true,
      message: 'Subscription deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting subscription:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete subscription'
    });
  }
};

// Get subscription summary and warnings
const getSubscriptionSummary = async (req, res) => {
  try {
    const userId = req.userId;
    const { month, warningThreshold } = req.query;
    
    const planner = await SalaryPlanner.findOne({ 
      userId, 
      month: month || new Date().toISOString().slice(0, 7) 
    });
    
    if (!planner) {
      return res.json({
        success: true,
        data: {
          totalSubscriptions: 0,
          activeSubscriptions: 0,
          totalMonthlyCost: 0,
          subscriptions: [],
          warning: null
        }
      });
    }
    
    const activeSubscriptions = planner.subscriptions.filter(sub => sub.status === 'active');
    const totalMonthlyCost = activeSubscriptions.reduce((sum, sub) => sum + sub.monthlyCost, 0);
    const threshold = warningThreshold ? parseFloat(warningThreshold) : 1000;
    
    res.json({
      success: true,
      data: {
        totalSubscriptions: planner.subscriptions.length,
        activeSubscriptions: activeSubscriptions.length,
        totalMonthlyCost,
        subscriptions: planner.subscriptions,
        warning: totalMonthlyCost > threshold ? {
          message: `Monthly subscription cost (₹${totalMonthlyCost}) exceeds warning threshold (₹${threshold})`,
          exceeded: true,
          amount: totalMonthlyCost - threshold
        } : null
      }
    });
  } catch (error) {
    console.error('Error getting subscription summary:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get subscription summary'
    });
  }
};

// Update cumulative savings
const updateCumulativeSavings = async (req, res) => {
  try {
    const userId = req.userId;
    const { month, saved, goalsCompleted, manualSaved = 0 } = req.body;
    
    const planner = await SalaryPlanner.findOne({ userId, month });
    if (!planner) {
      return res.status(404).json({
        success: false,
        error: 'Salary planner not found for this month'
      });
    }
    
    // Get all previous months' cumulative savings
    const allPlanners = await SalaryPlanner.find({ 
      userId, 
      month: { $lte: month } 
    }).sort({ month: 1 });
    
    let totalSaved = 0;
    let totalManualSaved = 0;
    const monthlyHistory = [];
    
    // Recalculate cumulative savings
    for (const p of allPlanners) {
      const monthSaved = p.savingsGoals.reduce((sum, goal) => sum + (goal.savedAmount || 0), 0);
      const monthGoalsCompleted = p.savingsGoals.filter(goal => 
        goal.savedAmount >= goal.targetAmount
      ).length;
      
      // Use provided manualSaved for current month, otherwise use existing
      const currentManualSaved = p.month === month ? manualSaved : 
        (p.cumulativeSavings?.monthlyHistory?.find(h => h.month === p.month)?.manualSaved || 0);
      
      totalSaved += monthSaved;
      totalManualSaved += currentManualSaved;
      
      // Update or add to history
      const existingIndex = planner.cumulativeSavings?.monthlyHistory?.findIndex(
        h => h.month === p.month
      );
      
      if (existingIndex >= 0) {
        planner.cumulativeSavings.monthlyHistory[existingIndex] = {
          month: p.month,
          saved: monthSaved,
          manualSaved: currentManualSaved,
          goalsCompleted: monthGoalsCompleted
        };
      } else {
        planner.cumulativeSavings.monthlyHistory.push({
          month: p.month,
          saved: monthSaved,
          manualSaved: currentManualSaved,
          goalsCompleted: monthGoalsCompleted
        });
      }
    }
    
    planner.cumulativeSavings.totalSaved = totalSaved + totalManualSaved;
    planner.cumulativeSavings.manualSavings = totalManualSaved;
    await planner.save();
    
    res.json({
      success: true,
      data: {
        totalSaved: totalSaved + totalManualSaved,
        manualSavings: totalManualSaved,
        monthlyHistory: planner.cumulativeSavings.monthlyHistory
      }
    });
  } catch (error) {
    console.error('Error updating cumulative savings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update cumulative savings'
    });
  }
};

// Get cumulative savings summary
const getCumulativeSavings = async (req, res) => {
  try {
    const userId = req.userId;
    
    // Get the latest planner to get cumulative data
    const latestPlanner = await SalaryPlanner.findOne({ 
      userId 
    }).sort({ month: -1 });
    
    if (!latestPlanner || !latestPlanner.cumulativeSavings) {
      return res.json({
        success: true,
        data: {
          totalSaved: 0,
          monthlyHistory: [],
          totalGoalsCompleted: 0,
          averageMonthlySaving: 0,
          bestMonth: null,
          currentStreak: 0
        }
      });
    }
    
    const { totalSaved, monthlyHistory } = latestPlanner.cumulativeSavings;
    const totalGoalsCompleted = monthlyHistory.reduce((sum, h) => sum + h.goalsCompleted, 0);
    const averageMonthlySaving = monthlyHistory.length > 0 ? 
      totalSaved / monthlyHistory.length : 0;
    
    // Find best month
    const bestMonth = monthlyHistory.length > 0 ? 
      monthlyHistory.reduce((best, current) => 
        current.saved > best.saved ? current : best
      ) : null;
    
    // Calculate current streak (consecutive months with savings)
    let currentStreak = 0;
    const sortedHistory = [...monthlyHistory].sort((a, b) => b.month.localeCompare(a.month));
    for (const month of sortedHistory) {
      if (month.saved > 0) {
        currentStreak++;
      } else {
        break;
      }
    }
    
    res.json({
      success: true,
      data: {
        totalSaved,
        monthlyHistory: sortedHistory,
        totalGoalsCompleted,
        averageMonthlySaving,
        bestMonth,
        currentStreak,
        totalMonths: monthlyHistory.length
      }
    });
  } catch (error) {
    console.error('Error getting cumulative savings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get cumulative savings'
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
  deleteSavingsGoal,
  addSubscription,
  updateSubscription,
  deleteSubscription,
  getSubscriptionSummary,
  updateCumulativeSavings,
  getCumulativeSavings
};
