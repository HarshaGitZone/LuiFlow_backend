const Debt = require('../models/Debt');
const DebtPayment = require('../models/DebtPayment');

// Create a new debt
const createDebt = async (req, res) => {
  try {
    const debtData = { ...req.body, userId: req.userId };

    if (!Number.isFinite(Number(debtData.principalAmount))) {
      return res.status(400).json({ error: 'Principal amount must be a valid number' });
    }

    if (debtData.tenure === '' || debtData.tenure === null || debtData.tenure === undefined) {
      delete debtData.tenure;
    } else {
      const parsedTenure = Number(debtData.tenure);
      if (Number.isFinite(parsedTenure)) {
        debtData.tenure = parsedTenure;
      } else {
        delete debtData.tenure;
      }
    }

    if (debtData.interestType === 'none') {
      debtData.interestRate = 0;
    } else if (debtData.interestRate === '' || debtData.interestRate === null || debtData.interestRate === undefined) {
      delete debtData.interestRate;
    } else {
      const parsedInterestRate = Number(debtData.interestRate);
      if (Number.isFinite(parsedInterestRate)) {
        debtData.interestRate = parsedInterestRate;
      } else {
        delete debtData.interestRate;
      }
    }

    const debt = new Debt(debtData);
    await debt.save();
    res.status(201).json(debt);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Get all debts with summary
const getAllDebts = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = { userId: req.userId, isDeleted: false };
    
    if (status) {
      filter.status = status;
    }

    const debts = await Debt.find(filter).sort({ startDate: -1 });
    
    // Calculate computed fields for each debt
    const debtsWithCalculations = await Promise.all(
      debts.map(async (debt) => {
        const interestAccrued = debt.calculateInterest();
        const outstandingBalance = await debt.calculateOutstandingBalance();
        const projections = debt.calculateProjections(2); // 2 years projection
        
        // Get total payments
        const payments = await DebtPayment.find({
          debtId: debt._id,
          isDeleted: false
        });
        const totalPaid = payments.reduce((sum, payment) => sum + payment.amountPaid, 0);

        return {
          ...debt.toJSON(),
          interestAccrued: Math.round(interestAccrued * 100) / 100,
          outstandingBalance: Math.round(outstandingBalance * 100) / 100,
          totalPaid: Math.round(totalPaid * 100) / 100,
          projectedInterest2Years: Math.round(projections.projectedInterest * 100) / 100,
          projectedOutstanding2Years: Math.round(projections.projectedTotal * 100) / 100
        };
      })
    );

    // Calculate summary statistics
    const activeDebts = debtsWithCalculations.filter(d => d.status === 'active');
    const summary = {
      totalOutstandingDebt: activeDebts.reduce((sum, d) => sum + d.outstandingBalance, 0),
      totalInterestAccrued: activeDebts.reduce((sum, d) => sum + d.interestAccrued, 0),
      totalPaidSoFar: debtsWithCalculations.reduce((sum, d) => sum + d.totalPaid, 0),
      activeDebtsCount: activeDebts.length,
      totalDebtsCount: debtsWithCalculations.length
    };

    res.json({
      debts: debtsWithCalculations,
      summary: {
        ...summary,
        totalOutstandingDebt: Math.round(summary.totalOutstandingDebt * 100) / 100,
        totalInterestAccrued: Math.round(summary.totalInterestAccrued * 100) / 100,
        totalPaidSoFar: Math.round(summary.totalPaidSoFar * 100) / 100
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get single debt with details
const getDebtById = async (req, res) => {
  try {
    const debt = await Debt.findOne({
      _id: req.params.id,
      userId: req.userId,
      isDeleted: false
    });

    if (!debt) {
      return res.status(404).json({ error: 'Debt not found' });
    }

    // Get payments for this debt
    const payments = await DebtPayment.find({
      debtId: debt._id,
      isDeleted: false
    }).sort({ paymentDate: -1 });

    // Calculate computed fields
    const interestAccrued = debt.calculateInterest();
    const outstandingBalance = await debt.calculateOutstandingBalance();
    const projections = debt.calculateProjections(2);
    const totalPaid = payments.reduce((sum, payment) => sum + payment.amountPaid, 0);

    // Generate calculation explanation
    const calculationExplanation = generateCalculationExplanation(debt, interestAccrued);

    res.json({
      ...debt.toJSON(),
      payments,
      interestAccrued: Math.round(interestAccrued * 100) / 100,
      outstandingBalance: Math.round(outstandingBalance * 100) / 100,
      totalPaid: Math.round(totalPaid * 100) / 100,
      projectedInterest2Years: Math.round(projections.projectedInterest * 100) / 100,
      projectedOutstanding2Years: Math.round(projections.projectedTotal * 100) / 100,
      calculationExplanation
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Update debt details
const updateDebt = async (req, res) => {
  try {
    const updateData = { ...req.body };

    if (updateData.tenure === '' || updateData.tenure === null || updateData.tenure === undefined) {
      delete updateData.tenure;
    } else {
      const parsedTenure = Number(updateData.tenure);
      if (Number.isFinite(parsedTenure)) {
        updateData.tenure = parsedTenure;
      } else {
        delete updateData.tenure;
      }
    }

    if (updateData.interestType === 'none') {
      updateData.interestRate = 0;
    } else if (updateData.interestRate === '' || updateData.interestRate === null || updateData.interestRate === undefined) {
      delete updateData.interestRate;
    } else {
      const parsedInterestRate = Number(updateData.interestRate);
      if (Number.isFinite(parsedInterestRate)) {
        updateData.interestRate = parsedInterestRate;
      } else {
        delete updateData.interestRate;
      }
    }

    const debt = await Debt.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId, isDeleted: false },
      updateData,
      { new: true, runValidators: true }
    );

    if (!debt) {
      return res.status(404).json({ error: 'Debt not found' });
    }

    res.json(debt);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Close a debt
const closeDebt = async (req, res) => {
  try {
    const debt = await Debt.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId, isDeleted: false },
      { status: 'closed', closedDate: new Date() },
      { new: true }
    );

    if (!debt) {
      return res.status(404).json({ error: 'Debt not found' });
    }

    res.json(debt);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Delete a debt (soft delete)
const deleteDebt = async (req, res) => {
  try {
    const debt = await Debt.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      { isDeleted: true },
      { new: true }
    );

    if (!debt) {
      return res.status(404).json({ error: 'Debt not found' });
    }

    // Also soft delete all payments for this debt
    await DebtPayment.updateMany(
      { debtId: req.params.id },
      { isDeleted: true }
    );

    res.json({ message: 'Debt deleted successfully' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Add payment to a debt
const addPayment = async (req, res) => {
  try {
    const paymentData = {
      ...req.body,
      debtId: req.params.id,
      userId: req.userId
    };

    // Verify debt exists and belongs to user
    const debt = await Debt.findOne({
      _id: req.params.id,
      userId: req.userId,
      isDeleted: false
    });

    if (!debt) {
      return res.status(404).json({ error: 'Debt not found' });
    }

    const payment = new DebtPayment(paymentData);
    await payment.save();

    // Check if debt should be automatically closed
    const outstandingBalance = await debt.calculateOutstandingBalance();
    if (outstandingBalance <= 0 && debt.status === 'active') {
      await Debt.findByIdAndUpdate(debt._id, {
        status: 'closed',
        closedDate: new Date()
      });
    }

    res.status(201).json(payment);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Get all payments for a debt
const getDebtPayments = async (req, res) => {
  try {
    // Verify debt exists and belongs to user
    const debt = await Debt.findOne({
      _id: req.params.id,
      userId: req.userId,
      isDeleted: false
    });

    if (!debt) {
      return res.status(404).json({ error: 'Debt not found' });
    }

    const payments = await DebtPayment.find({
      debtId: req.params.id,
      isDeleted: false
    }).sort({ paymentDate: -1 });

    res.json(payments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Update a payment
const updatePayment = async (req, res) => {
  try {
    const payment = await DebtPayment.findOneAndUpdate(
      { _id: req.params.paymentId, userId: req.userId, isDeleted: false },
      req.body,
      { new: true, runValidators: true }
    );

    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    res.json(payment);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Delete a payment
const deletePayment = async (req, res) => {
  try {
    const payment = await DebtPayment.findOneAndUpdate(
      { _id: req.params.paymentId, userId: req.userId },
      { isDeleted: true },
      { new: true }
    );

    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    // Check if debt should be re-opened
    const debt = await Debt.findById(payment.debtId);
    if (debt && debt.status === 'closed') {
      const outstandingBalance = await debt.calculateOutstandingBalance();
      if (outstandingBalance > 0) {
        await Debt.findByIdAndUpdate(debt._id, {
          status: 'active',
          closedDate: null
        });
      }
    }

    res.json({ message: 'Payment deleted successfully' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Helper function to generate calculation explanation
const generateCalculationExplanation = (debt, interestAccrued) => {
  if (debt.interestType === 'none') {
    return 'No interest is charged on this debt.';
  }

  const ageInDays = debt.ageInDays;
  const ageInMonths = Math.floor(ageInDays / 30);
  const ageInYears = ageInDays / 365.25;

  let explanation = '';

  if (debt.interestType === 'simple') {
    explanation = `Simple interest calculated for ${ageInDays} days (${ageInMonths} months, ${ageInYears.toFixed(1)} years) at ${debt.interestRate}% yearly rate on principal ₹${debt.principalAmount.toLocaleString('en-IN')}.`;
    explanation += ` Formula: Principal × Rate × Time = ₹${debt.principalAmount.toLocaleString('en-IN')} × ${debt.interestRate}% × ${ageInYears.toFixed(2)} years = ₹${interestAccrued.toLocaleString('en-IN')}`;
  } else if (debt.interestType === 'compound') {
    explanation = `Compound interest calculated for ${ageInDays} days at ${debt.interestRate}% yearly rate with ${debt.compoundFrequency} compounding on principal ₹${debt.principalAmount.toLocaleString('en-IN')}.`;
    explanation += ` Formula: P × (1 + r/n)^(n×t) - P = ₹${debt.principalAmount.toLocaleString('en-IN')} × (1 + ${debt.interestRate/100}/${debt.compoundFrequency === 'monthly' ? 12 : debt.compoundFrequency === 'quarterly' ? 4 : 1})^(${debt.compoundFrequency === 'monthly' ? 12 : debt.compoundFrequency === 'quarterly' ? 4 : 1} × ${ageInYears.toFixed(2)}) - ₹${debt.principalAmount.toLocaleString('en-IN')} = ₹${interestAccrued.toLocaleString('en-IN')}`;
  }

  return explanation;
};

module.exports = {
  createDebt,
  getAllDebts,
  getDebtById,
  updateDebt,
  closeDebt,
  deleteDebt,
  addPayment,
  getDebtPayments,
  updatePayment,
  deletePayment
};
