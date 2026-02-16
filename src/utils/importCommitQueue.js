class ImportCommitQueue {
  constructor() {
    this.queues = new Map();
    this.commitCounters = new Map();
  }

  getNextCommitOrder(userId) {
    const key = String(userId);
    const next = (this.commitCounters.get(key) || 0) + 1;
    this.commitCounters.set(key, next);
    return next;
  }

  enqueue(userId, task) {
    const key = String(userId);
    const previous = this.queues.get(key) || Promise.resolve();

    const runTask = async () => {
      const commitOrder = this.getNextCommitOrder(key);
      return task({ userId: key, commitOrder });
    };

    const current = previous.then(runTask, runTask);
    this.queues.set(key, current.catch(() => {}));
    return current;
  }
}

module.exports = { ImportCommitQueue };
