const mongoose = require('mongoose');

const buildAnalyticsCacheKey = (userId, startIso, endIso) => `${String(userId)}::analytics::${startIso}::${endIso}`;

const detectExpenseSpikes = (trend) => {
    if (!Array.isArray(trend) || trend.length < 3) {
        return [];
    }

    const expenses = trend.map((entry) => Number(entry.expenses) || 0);
    const mean = expenses.reduce((sum, value) => sum + value, 0) / expenses.length;
    const variance = expenses.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / expenses.length;
    const stdDev = Math.sqrt(variance);

    return trend
        .filter((entry) => {
            const value = Number(entry.expenses) || 0;
            if (value <= 0) return false;
            const zSpike = stdDev > 0 && value > mean + (2 * stdDev);
            const ratioSpike = mean > 0 && value >= (mean * 1.75);
            return zSpike || ratioSpike;
        })
        .map((entry) => {
            const value = Number(entry.expenses) || 0;
            const ratio = mean > 0 ? Number((value / mean).toFixed(2)) : null;
            const delta = Number((value - mean).toFixed(2));
            return {
                key: entry.key,
                name: entry.name,
                expenses: value,
                averageExpenses: Number(mean.toFixed(2)),
                deltaFromAverage: delta,
                ratioToAverage: ratio,
                severity: ratio !== null && ratio >= 2.5 ? 'high' : 'medium'
            };
        })
        .sort((a, b) => b.expenses - a.expenses)
        .slice(0, 5);
};

const getModelIfAvailable = (name) => {
    try {
        return mongoose.model(name);
    } catch {
        return null;
    }
};

const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

const toAlert = (id, title, detail, severity = 'warning', meta = {}) => ({
    id,
    title,
    detail,
    severity,
    ...meta
});

const buildUnexpectedSpikes = async ({ trend, filter, userId, TransactionModel }) => {
    const alerts = [];

    const incomes = trend.map((item) => Number(item.income) || 0);
    const expenses = trend.map((item) => Number(item.expenses) || 0);
    const nets = trend.map((item) => Number(item.net) || 0);
    const latestPeriod = trend.length ? trend[trend.length - 1] : null;

    let incomeSpike = null;
    let incomeDrop = null;
    if (trend.length >= 3) {
        const prevIncome = incomes.slice(0, -1);
        const avgIncome = mean(prevIncome);
        const latestIncome = incomes[incomes.length - 1];
        if (avgIncome > 0 && latestIncome >= avgIncome * 1.75) {
            incomeSpike = {
                period: latestPeriod.key,
                latestIncome,
                averageIncome: Number(avgIncome.toFixed(2)),
                ratioToAverage: Number((latestIncome / avgIncome).toFixed(2))
            };
            alerts.push(toAlert(
                'income-spike',
                'Income Spike',
                `Income in ${latestPeriod.key} is ${incomeSpike.ratioToAverage}x your recent average.`,
                'info',
                { kind: 'income', period: latestPeriod.key }
            ));
        }
        if (avgIncome > 0 && latestIncome <= avgIncome * 0.55) {
            incomeDrop = {
                period: latestPeriod.key,
                latestIncome,
                averageIncome: Number(avgIncome.toFixed(2)),
                ratioToAverage: Number((latestIncome / avgIncome).toFixed(2))
            };
            alerts.push(toAlert(
                'income-drop',
                'Income Drop',
                `Income in ${latestPeriod.key} dropped to ${incomeDrop.ratioToAverage}x of your recent average.`,
                'critical',
                { kind: 'income', period: latestPeriod.key }
            ));
        }
    }

    let netFlowDeterioration = null;
    if (trend.length >= 3) {
        const prevNet = nets.slice(0, -1);
        const avgNet = mean(prevNet);
        const latestNet = nets[nets.length - 1];
        if (avgNet !== 0 && latestNet < avgNet - Math.abs(avgNet * 0.5)) {
            netFlowDeterioration = {
                period: latestPeriod.key,
                latestNet,
                averageNet: Number(avgNet.toFixed(2)),
                delta: Number((latestNet - avgNet).toFixed(2))
            };
            alerts.push(toAlert(
                'net-deterioration',
                'Net Flow Deterioration',
                `Net flow in ${latestPeriod.key} is significantly below your trend.`,
                'critical',
                { kind: 'net', period: latestPeriod.key }
            ));
        }
    }

    const periodCategoryAgg = await TransactionModel.aggregate([
        { $match: { ...filter, type: 'expense' } },
        {
            $group: {
                _id: {
                    period: { $dateToString: { format: '%Y-%m', date: '$date' } },
                    category: { $trim: { input: { $toLower: '$category' } } }
                },
                amount: { $sum: '$amount' }
            }
        },
        { $sort: { '_id.period': 1 } }
    ]);

    const categorySeries = new Map();
    for (const row of periodCategoryAgg) {
        const category = row?._id?.category || 'uncategorized';
        if (!categorySeries.has(category)) categorySeries.set(category, []);
        categorySeries.get(category).push({ period: row._id.period, amount: Number(row.amount) || 0 });
    }

    const categorySpendSpikes = [];
    for (const [category, series] of categorySeries.entries()) {
        if (series.length < 3) continue;
        const latest = series[series.length - 1];
        const prevAmounts = series.slice(0, -1).map((entry) => entry.amount);
        const avgAmount = mean(prevAmounts);
        if (avgAmount <= 0) continue;
        if (latest.amount >= avgAmount * 1.75) {
            categorySpendSpikes.push({
                category,
                period: latest.period,
                amount: latest.amount,
                averageAmount: Number(avgAmount.toFixed(2)),
                ratioToAverage: Number((latest.amount / avgAmount).toFixed(2))
            });
        }
    }
    categorySpendSpikes.sort((a, b) => b.amount - a.amount);
    if (categorySpendSpikes.length) {
        alerts.push(toAlert(
            'category-spike',
            'Category Spend Spike',
            `${categorySpendSpikes[0].category} spending spiked in ${categorySpendSpikes[0].period}.`,
            'warning',
            { kind: 'category', category: categorySpendSpikes[0].category }
        ));
    }

    const debtSeries = (categorySeries.get('debt-payment') || []);
    let debtPaymentSpike = null;
    if (debtSeries.length >= 2) {
        const latest = debtSeries[debtSeries.length - 1];
        const avgPrev = mean(debtSeries.slice(0, -1).map((item) => item.amount));
        if (avgPrev > 0 && latest.amount >= avgPrev * 1.5) {
            debtPaymentSpike = {
                period: latest.period,
                amount: latest.amount,
                averageAmount: Number(avgPrev.toFixed(2)),
                ratioToAverage: Number((latest.amount / avgPrev).toFixed(2))
            };
            alerts.push(toAlert(
                'debt-spike',
                'Debt Payment Spike',
                `Debt payments in ${latest.period} are ${debtPaymentSpike.ratioToAverage}x your recent average.`,
                'warning',
                { kind: 'debt', period: latest.period }
            ));
        }
    }

    const countAgg = await TransactionModel.aggregate([
        { $match: filter },
        {
            $group: {
                _id: { period: { $dateToString: { format: '%Y-%m', date: '$date' } } },
                count: { $sum: 1 }
            }
        },
        { $sort: { '_id.period': 1 } }
    ]);

    let transactionCountSpike = null;
    if (countAgg.length >= 3) {
        const latest = countAgg[countAgg.length - 1];
        const prevAvg = mean(countAgg.slice(0, -1).map((item) => Number(item.count) || 0));
        const latestCount = Number(latest.count) || 0;
        if (prevAvg > 0 && latestCount >= prevAvg * 1.8) {
            transactionCountSpike = {
                period: latest._id.period,
                count: latestCount,
                averageCount: Number(prevAvg.toFixed(2)),
                ratioToAverage: Number((latestCount / prevAvg).toFixed(2))
            };
            alerts.push(toAlert(
                'tx-count-spike',
                'Transaction Volume Spike',
                `Transaction count in ${latest._id.period} is ${transactionCountSpike.ratioToAverage}x normal.`,
                'warning',
                { kind: 'volume', period: latest._id.period }
            ));
        }
    }

    let budgetBurnRateSpikes = [];
    const BudgetModel = getModelIfAvailable('Budget');
    if (BudgetModel) {
        const budgets = await BudgetModel.find({ userId }).lean();
        const now = new Date();
        const day = now.getDate();
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const monthProgressPct = (day / daysInMonth) * 100;
        budgetBurnRateSpikes = budgets
            .map((budget) => {
                const amount = Number(budget.amount) || 0;
                const spent = Number(budget.spent) || 0;
                if (amount <= 0) return null;
                const utilizationPct = (spent / amount) * 100;
                const period = String(budget.period || 'Monthly').toLowerCase();
                const isSpike = utilizationPct > 100 || (period.includes('month') && utilizationPct > monthProgressPct + 25 && utilizationPct >= 70);
                if (!isSpike) return null;
                return {
                    budgetId: String(budget._id),
                    name: budget.name,
                    category: budget.category,
                    utilizationPct: Number(utilizationPct.toFixed(1)),
                    expectedPct: Number(monthProgressPct.toFixed(1)),
                    overBy: Number((spent - amount).toFixed(2))
                };
            })
            .filter(Boolean)
            .sort((a, b) => b.utilizationPct - a.utilizationPct)
            .slice(0, 5);
        if (budgetBurnRateSpikes.length) {
            alerts.push(toAlert(
                'budget-burn-rate',
                'Budget Burn-Rate Spike',
                `${budgetBurnRateSpikes[0].name} is burning faster than expected.`,
                'critical',
                { kind: 'budget', category: budgetBurnRateSpikes[0].category }
            ));
        }
    }

    let importAnomaly = null;
    const ImportHistoryModel = getModelIfAvailable('ImportHistory');
    if (ImportHistoryModel) {
        const recentImports = await ImportHistoryModel.find({ userId }).sort({ importDate: -1 }).limit(8).lean();
        if (recentImports.length >= 2) {
            const latest = recentImports[0];
            const prev = recentImports.slice(1);
            const latestTotal = Number(latest?.summary?.totalRows) || 0;
            const latestErrors = (Number(latest?.summary?.errors) || 0) + (Number(latest?.summary?.skippedRows) || 0);
            const latestDuplicates = Number(latest?.summary?.duplicateRows) || 0;
            const latestErrorRate = latestTotal > 0 ? latestErrors / latestTotal : 0;
            const latestDuplicateRate = latestTotal > 0 ? latestDuplicates / latestTotal : 0;

            const prevErrorRates = prev.map((entry) => {
                const total = Number(entry?.summary?.totalRows) || 0;
                const errs = (Number(entry?.summary?.errors) || 0) + (Number(entry?.summary?.skippedRows) || 0);
                return total > 0 ? errs / total : 0;
            });
            const prevDupRates = prev.map((entry) => {
                const total = Number(entry?.summary?.totalRows) || 0;
                const dup = Number(entry?.summary?.duplicateRows) || 0;
                return total > 0 ? dup / total : 0;
            });

            const avgErr = mean(prevErrorRates);
            const avgDup = mean(prevDupRates);
            if (
                latestErrorRate > Math.max(0.15, avgErr * 1.75) ||
                latestDuplicateRate > Math.max(0.2, avgDup * 1.75)
            ) {
                importAnomaly = {
                    importDate: latest.importDate,
                    errorRate: Number((latestErrorRate * 100).toFixed(1)),
                    duplicateRate: Number((latestDuplicateRate * 100).toFixed(1)),
                    averageErrorRate: Number((avgErr * 100).toFixed(1)),
                    averageDuplicateRate: Number((avgDup * 100).toFixed(1))
                };
                alerts.push(toAlert(
                    'import-anomaly',
                    'Import Quality Spike',
                    `Latest import has unusually high error/duplicate rates.`,
                    'warning',
                    { kind: 'import' }
                ));
            }
        }
    }

    let subscriptionCostSpike = null;
    const SalaryPlannerModel = getModelIfAvailable('SalaryPlanner');
    if (SalaryPlannerModel) {
        const plannerRows = await SalaryPlannerModel.find({ userId }).sort({ month: -1, createdAt: -1 }).limit(3).lean();
        if (plannerRows.length >= 2) {
            const sumActive = (row) => (Array.isArray(row?.subscriptions) ? row.subscriptions
                .filter((sub) => (sub?.status || 'active') === 'active')
                .reduce((sum, sub) => sum + (Number(sub.monthlyCost) || 0), 0) : 0);
            const latest = plannerRows[0];
            const previous = plannerRows[1];
            const latestCost = sumActive(latest);
            const previousCost = sumActive(previous);
            if (previousCost > 0 && latestCost >= previousCost * 1.2) {
                subscriptionCostSpike = {
                    month: latest.month || latest?.salary?.month || 'latest',
                    latestCost: Number(latestCost.toFixed(2)),
                    previousCost: Number(previousCost.toFixed(2)),
                    ratioToPrevious: Number((latestCost / previousCost).toFixed(2))
                };
                alerts.push(toAlert(
                    'subscription-spike',
                    'Subscription Cost Spike',
                    `Subscription spend is ${subscriptionCostSpike.ratioToPrevious}x vs previous month.`,
                    'warning',
                    { kind: 'subscription', period: subscriptionCostSpike.month }
                ));
            }
        }
    }

    let portfolioVolatilitySpike = null;
    const PortfolioModel = getModelIfAvailable('Portfolio');
    if (PortfolioModel) {
        const holdings = await PortfolioModel.find({ userId, isDeleted: false }).lean();
        if (holdings.length > 0) {
            const totalInvested = holdings.reduce((sum, item) => sum + ((Number(item.quantity) || 0) * (Number(item.buyPrice) || 0)), 0);
            const totalCurrent = holdings.reduce((sum, item) => sum + ((Number(item.quantity) || 0) * (Number(item.currentPrice) || 0)), 0);
            const pnlPct = totalInvested > 0 ? ((totalCurrent - totalInvested) / totalInvested) * 100 : 0;
            if (Math.abs(pnlPct) >= 8) {
                portfolioVolatilitySpike = {
                    totalInvested: Number(totalInvested.toFixed(2)),
                    totalCurrent: Number(totalCurrent.toFixed(2)),
                    pnlPercentage: Number(pnlPct.toFixed(2))
                };
                alerts.push(toAlert(
                    'portfolio-volatility',
                    'Portfolio Volatility Spike',
                    `Portfolio P/L swing is ${portfolioVolatilitySpike.pnlPercentage}% from invested value.`,
                    Math.abs(pnlPct) >= 15 ? 'critical' : 'warning',
                    { kind: 'portfolio' }
                ));
            }
        }
    }

    return {
        incomeSpike,
        incomeDrop,
        categorySpendSpikes: categorySpendSpikes.slice(0, 5),
        debtPaymentSpike,
        subscriptionCostSpike,
        budgetBurnRateSpikes,
        netFlowDeterioration,
        importAnomaly,
        transactionCountSpike,
        portfolioVolatilitySpike,
        alerts
    };
};

const getAnalytics = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        let userId = req.userId;

        // Ensure userId is in ObjectId format
        if (userId && !mongoose.Types.ObjectId.isValid(userId)) {
            // Try to convert string userId to ObjectId
            try {
                userId = new mongoose.Types.ObjectId(userId);
            } catch (e) {
                // If conversion fails, keep as string
                console.warn(`Could not convert userId to ObjectId: ${userId}`);
            }
        } else if (userId) {
            userId = new mongoose.Types.ObjectId(userId);
        }

        // Define date ranges
        const start = startDate ? new Date(startDate) : new Date(0);
        const end = endDate ? new Date(endDate) : new Date();
        const startIso = start.toISOString();
        const endIso = end.toISOString();
        const cache = req.app.locals.analyticsCache;
        const cacheTtlMs = req.app.locals.analyticsCacheTTLms || 30000;
        const cacheKey = buildAnalyticsCacheKey(userId, startIso, endIso);

        if (cache) {
            const cached = cache.get(cacheKey);
            if (cached && cached.expiresAt > Date.now()) {
                return res.json(cached.value);
            }
            if (cached && cached.expiresAt <= Date.now()) {
                cache.delete(cacheKey);
            }
        }


        // Base filter - ensure userId matches ObjectId format
        const filter = {
            userId,
            isDeleted: false,
            date: { $gte: start, $lte: end }
        };

        // Use Transaction model directly or from locals
        const TransactionModel = req.app.locals.Transaction || mongoose.model('Transaction');

        // 1. Summary Stats
        const summaryAgg = await TransactionModel.aggregate([
            { $match: filter },
            {
                $group: {
                    _id: '$type',
                    total: { $sum: '$amount' },
                    count: { $sum: 1 }
                }
            }
        ]);

        let totalIncome = 0;
        let totalExpenses = 0;
        let incomeCount = 0;
        let expenseCount = 0;

        summaryAgg.forEach(stat => {
            if (stat._id === 'income') {
                totalIncome = stat.total;
                incomeCount = stat.count;
            }
            if (stat._id === 'expense') {
                totalExpenses = stat.total;
                expenseCount = stat.count;
            }
        });

        const netFlow = totalIncome - totalExpenses;
        const savingsRate = totalIncome > 0 ? (netFlow / totalIncome) * 100 : 0;

        // 2. Spending/Income by Category
        const categoryAgg = await TransactionModel.aggregate([
            { $match: filter },
            {
                $group: {
                    _id: {
                        type: '$type',
                        category: {
                            $trim: {
                                input: { $toLower: '$category' }
                            }
                        }
                    },
                    amount: { $sum: '$amount' }
                }
            },
            { $sort: { amount: -1 } }
        ]);

        const incomeCategories = categoryAgg
            .filter(cat => cat._id.type === 'income')
            .map(cat => ({
                category: cat._id.category,
                amount: cat.amount,
                percentage: totalIncome > 0 ? Math.round((cat.amount / totalIncome) * 100) : 0
            }))
            .sort((a, b) => b.amount - a.amount);

        const expenseCategories = categoryAgg
            .filter(cat => cat._id.type === 'expense')
            .map(cat => ({
                category: cat._id.category,
                amount: cat.amount,
                percentage: totalExpenses > 0 ? Math.round((cat.amount / totalExpenses) * 100) : 0
            }))
            .sort((a, b) => b.amount - a.amount);

        // 3. Trend Analysis
        const daysDiff = (end - start) / (1000 * 60 * 60 * 24);

        // Choose grouping format
        let dateParams;
        if (daysDiff <= 31) {
            dateParams = { format: "%Y-%m-%d", date: "$date" };
        } else {
            dateParams = { format: "%Y-%m", date: "$date" };
        }

        const trendAgg = await TransactionModel.aggregate([
            { $match: filter },
            {
                $group: {
                    _id: {
                        date: { $dateToString: dateParams },
                        type: '$type'
                    },
                    amount: { $sum: '$amount' }
                }
            },
            { $sort: { '_id.date': 1 } }
        ]);

        // Shape trend data
        const trendMap = new Map();

        trendAgg.forEach(item => {
            const dateKey = item._id.date;
            if (!trendMap.has(dateKey)) {
                trendMap.set(dateKey, { key: dateKey, name: dateKey, income: 0, expenses: 0, net: 0 });
            }
            const entry = trendMap.get(dateKey);
            if (item._id.type === 'income') entry.income = item.amount;
            if (item._id.type === 'expense') entry.expenses = item.amount;
            entry.net = entry.income - entry.expenses;
        });

        const trend = Array.from(trendMap.values())
            .sort((a, b) => a.key.localeCompare(b.key));
        const unusualSpikes = detectExpenseSpikes(trend);
        const unexpectedSpikes = await buildUnexpectedSpikes({ trend, filter, userId, TransactionModel });

        // Debug: Get total count for user without date filter
        const totalUserTransactions = await TransactionModel.countDocuments({ userId, isDeleted: false });
        const matchCount = await TransactionModel.countDocuments(filter);


        const payload = {
            summary: {
                totalIncome,
                totalExpenses,
                netFlow,
                savingsRate,
                incomeCount,
                expenseCount,
                unusualSpikeCount: unusualSpikes.length,
                unexpectedSpikeCount: unexpectedSpikes.alerts.length
            },
            incomeCategories,
            expenseCategories,
            trend,
            unusualSpikes,
            unexpectedSpikes,
            debug: {
                userId: userId.toString(),
                totalUserTransactions,
                matchCount,
                startDate: startIso,
                endDate: endIso
            }
        };

        if (cache) {
            cache.set(cacheKey, { value: payload, expiresAt: Date.now() + cacheTtlMs });
        }

        res.json(payload);

    } catch (error) {
        console.error('Analytics Error:', error);
        res.status(500).json({ error: 'Failed to fetch analytics data', details: error.message });
    }
};

module.exports = { getAnalytics };
