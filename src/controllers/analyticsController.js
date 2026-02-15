const mongoose = require('mongoose');



const getAnalytics = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const userId = req.userId;

        // Define date ranges
        const start = startDate ? new Date(startDate) : new Date(0);
        const end = endDate ? new Date(endDate) : new Date();

        // Base filter
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

        // 2. Spending by Category
        const categoryAgg = await TransactionModel.aggregate([
            { $match: { ...filter, type: 'expense' } },
            {
                $group: {
                    _id: '$category',
                    amount: { $sum: '$amount' }
                }
            },
            { $sort: { amount: -1 } }
        ]);

        const categorySpend = categoryAgg.map(cat => ({
            category: cat._id,
            amount: cat.amount,
            percentage: totalExpenses > 0 ? Math.round((cat.amount / totalExpenses) * 100) : 0
        }));

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

        res.json({
            summary: {
                totalIncome,
                totalExpenses,
                netFlow,
                savingsRate,
                incomeCount,
                expenseCount
            },
            categorySpend,
            trend
        });

    } catch (error) {
        console.error('Analytics Error:', error);
        res.status(500).json({ error: 'Failed to fetch analytics data' });
    }
};

module.exports = { getAnalytics };
