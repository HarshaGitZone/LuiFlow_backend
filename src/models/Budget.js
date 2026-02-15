const mongoose = require('mongoose');

const budgetSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, trim: true },
  amount: { type: Number, required: true, min: 0 },
  spent: { type: Number, default: 0, min: 0 },
  remaining: { type: Number, default: 0 },
  category: { type: String, required: true, trim: true },
  period: { type: String, required: true, trim: true, default: 'Monthly' }
}, { timestamps: true });

budgetSchema.pre('save', function preSave(next) {
  const amount = Number(this.amount) || 0;
  const spent = Number(this.spent) || 0;
  this.remaining = amount - spent;
  next();
});

budgetSchema.index({ userId: 1, createdAt: -1 });

const Budget = mongoose.model('Budget', budgetSchema);

module.exports = Budget;
