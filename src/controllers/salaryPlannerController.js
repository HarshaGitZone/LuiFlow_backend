const mongoose = require('mongoose');
const SalaryPlanner = require('../models/SalaryPlanner');

const buildMonthRange = (month) => {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return null;
  }
  const [yearStr, monthStr] = month.split('-');
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1;
  const monthStart = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0));
  const nextMonthStart = new Date(Date.UTC(year, monthIndex + 1, 1, 0, 0, 0, 0));
  return { monthStart, nextMonthStart };
};

const getMonthlyTransactionFlow = async (req, month) => {
  const range = buildMonthRange(month);
  if (!range) {
    return { totalIncome: 0, totalExpenses: 0, netFlow: 0 };
  }

  const Transaction =
    req.app?.locals?.Transaction || mongoose.model('Transaction');

  const summary = await Transaction.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(req.userId),
        isDeleted: false,
        date: { $gte: range.monthStart, $lt: range.nextMonthStart }
      }
    },
    {
      $group: {
        _id: '$type',
        total: { $sum: '$amount' }
      }
    }
  ]);

  let totalIncome = 0;
  let totalExpenses = 0;
  for (const row of summary) {
    if (row._id === 'income') totalIncome = Number(row.total) || 0;
    if (row._id === 'expense') totalExpenses = Number(row.total) || 0;
  }

  return {
    totalIncome,
    totalExpenses,
    netFlow: totalIncome - totalExpenses
  };
};

const createEmptyPlannerDoc = (userId, month) => ({
  userId,
  month,
  salary: { amount: 0, creditDate: '01', month },
  fixedBills: [],
  variableExpenses: { categories: [], totalSpent: 0 },
  savingsGoals: [],
  subscriptions: [],
  cumulativeSavings: { totalSaved: 0, manualSavings: 0, monthlyHistory: [] }
});

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
        salary: { amount: 0, creditDate: '01', month: month || new Date().toISOString().slice(0, 7) },
        fixedBills: [],
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
        savingsGoals: [],
        subscriptions: [],
        cumulativeSavings: {
          totalSaved: 0,
          monthlyHistory: []
        }
      });
      
      await defaultPlanner.save();
      planner = defaultPlanner;
    }
    
    const targetMonth = planner?.month || month || new Date().toISOString().slice(0, 7);
    const transactionFlow = await getMonthlyTransactionFlow(req, targetMonth);

    res.json({
      success: true,
      data: {
        ...planner.toObject(),
        transactionFlow
      }
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

    if (!month || typeof month !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Month is required in YYYY-MM format'
      });
    }

    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Updates payload is required'
      });
    }

    const setPayload = {};

    if (updates.salary !== undefined) {
      if (updates.salary.amount !== undefined) {
        const parsedAmount = Number(updates.salary.amount);
        if (isNaN(parsedAmount) || parsedAmount < 0) {
          return res.status(400).json({
            success: false,
            error: 'Salary amount must be a valid non-negative number'
          });
        }
        setPayload['salary.amount'] = parsedAmount;
      }
      if (updates.salary.creditDate !== undefined) {
        setPayload['salary.creditDate'] = String(updates.salary.creditDate).padStart(2, '0');
      }
      setPayload['salary.month'] = month;
    }

    if (updates.fixedBills !== undefined) setPayload.fixedBills = updates.fixedBills;
    if (updates.variableExpenses !== undefined) setPayload.variableExpenses = updates.variableExpenses;
    if (updates.savingsGoals !== undefined) setPayload.savingsGoals = updates.savingsGoals;
    if (updates.subscriptions !== undefined) setPayload.subscriptions = updates.subscriptions;
    if (updates.cumulativeSavings !== undefined) setPayload.cumulativeSavings = updates.cumulativeSavings;

    if (Object.keys(setPayload).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid fields provided to update'
      });
    }

    const planner = await SalaryPlanner.findOneAndUpdate(
      { userId, month },
      {
        $set: setPayload,
        $setOnInsert: {
          userId,
          month,
          fixedBills: [],
          subscriptions: [],
          savingsGoals: [],
          variableExpenses: { categories: [], totalSpent: 0 },
          cumulativeSavings: { totalSaved: 0, manualSavings: 0, monthlyHistory: [] }
        }
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );

    // Initialize salary if it doesn't exist
    if (!planner.salary) {
      planner.salary = { amount: 0, creditDate: '01', month };
      await planner.save();
    }
    
    res.json({
      success: true,
      data: planner
    });
  } catch (error) {
    console.error('Error updating salary planner:', error);
    if (error?.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        error: error.message || 'Invalid salary planner data'
      });
    }
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
    const setPayload = {};
    if (updates?.name !== undefined) setPayload['fixedBills.$.name'] = updates.name;
    if (updates?.amount !== undefined) setPayload['fixedBills.$.amount'] = updates.amount;
    if (updates?.dueDate !== undefined) setPayload['fixedBills.$.dueDate'] = updates.dueDate;
    if (updates?.status !== undefined) setPayload['fixedBills.$.status'] = updates.status;
    if (updates?.notes !== undefined) setPayload['fixedBills.$.notes'] = updates.notes;

    if (Object.keys(setPayload).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fixed bill fields provided to update'
      });
    }

    let planner = await SalaryPlanner.findOneAndUpdate(
      { userId, month, 'fixedBills._id': billId },
      { $set: setPayload },
      { new: true, runValidators: true }
    );

    if (!planner) {
      planner = await SalaryPlanner.findOneAndUpdate(
        { userId, 'fixedBills._id': billId },
        { $set: setPayload },
        { new: true, runValidators: true }
      );
    }

    if (!planner) {
      return res.status(404).json({
        success: false,
        error: 'Fixed bill not found for the selected month'
      });
    }
    
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

    if (!month || !subscription || typeof subscription !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Month and subscription payload are required'
      });
    }

    let planner = await SalaryPlanner.findOne({ userId, month });
    if (!planner) {
      planner = new SalaryPlanner(createEmptyPlannerDoc(userId, month));
    }

    planner.subscriptions.push(subscription);
    await planner.save();
    
    res.json({
      success: true,
      message: 'Subscription added successfully'
    });
  } catch (error) {
    console.error('Error adding subscription:', error);
    if (error?.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        error: error.message || 'Invalid subscription data'
      });
    }
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

    if (!subscriptionId || !updates || typeof updates !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Subscription ID and update payload are required'
      });
    }

    let planner = null;
    if (month) {
      planner = await SalaryPlanner.findOne({ userId, month, 'subscriptions._id': subscriptionId });
    }
    if (!planner) {
      planner = await SalaryPlanner.findOne({ userId, 'subscriptions._id': subscriptionId });
    }

    if (!planner) {
      return res.status(404).json({
        success: false,
        error: 'Subscription not found for the selected month'
      });
    }

    const subDoc = planner.subscriptions.id(subscriptionId);
    if (!subDoc) {
      return res.status(404).json({
        success: false,
        error: 'Subscription not found'
      });
    }

    if (updates.name !== undefined) subDoc.name = updates.name;
    if (updates.provider !== undefined) subDoc.provider = updates.provider;
    if (updates.monthlyCost !== undefined) subDoc.monthlyCost = updates.monthlyCost;
    if (updates.renewalDate !== undefined) subDoc.renewalDate = updates.renewalDate;
    if (updates.category !== undefined) subDoc.category = updates.category;
    if (updates.status !== undefined) subDoc.status = updates.status;

    await planner.save();
    
    res.json({
      success: true,
      message: 'Subscription updated successfully'
    });
  } catch (error) {
    console.error('Error updating subscription:', error);
    if (error?.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        error: error.message || 'Invalid subscription update data'
      });
    }
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
    const { month, saved, goalsCompleted, manualSaved } = req.body;
    
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
    const nextMonthlyHistory = [];
    
    // Recalculate cumulative savings
    for (const p of allPlanners) {
      const goalSaved = p.savingsGoals.reduce((sum, goal) => sum + (goal.savedAmount || 0), 0);
      const monthGoalsCompleted = p.savingsGoals.filter(goal => 
        goal.savedAmount >= goal.targetAmount
      ).length;

      const existingHistory = p.cumulativeSavings?.monthlyHistory?.find(h => h.month === p.month);

      const parsedSaved = Number(saved);
      const hasSavedUpdate = p.month === month && Number.isFinite(parsedSaved);

      const parsedManualSaved = Number(manualSaved);
      const hasManualSavedUpdate = p.month === month && Number.isFinite(parsedManualSaved);

      const currentManualSaved = hasManualSavedUpdate
        ? parsedManualSaved
        : Number(existingHistory?.manualSaved || 0);

      const currentMonthSaved = hasSavedUpdate
        ? parsedSaved
        : Number(existingHistory?.saved ?? goalSaved);

      totalSaved += currentMonthSaved;
      totalManualSaved += currentManualSaved;

      nextMonthlyHistory.push({
        month: p.month,
        saved: currentMonthSaved,
        manualSaved: currentManualSaved,
        goalsCompleted: p.month === month && Number.isFinite(Number(goalsCompleted))
          ? Number(goalsCompleted)
          : monthGoalsCompleted
      });
    }

    planner.cumulativeSavings.monthlyHistory = nextMonthlyHistory;
    planner.cumulativeSavings.totalSaved = totalSaved;
    planner.cumulativeSavings.manualSavings = totalManualSaved;
    await planner.save();
    
    res.json({
      success: true,
      data: {
        totalSaved,
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
