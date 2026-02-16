const assert = require('assert');
const { ImportCommitQueue } = require('./src/utils/importCommitQueue');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function run() {
  const queue = new ImportCommitQueue();
  const executionOrder = [];

  const enqueueForUserA = (id, delayMs) => queue.enqueue('user-a', async ({ commitOrder }) => {
    await wait(delayMs);
    executionOrder.push({ user: 'user-a', id, commitOrder });
    return commitOrder;
  });

  const enqueueForUserB = (id, delayMs) => queue.enqueue('user-b', async ({ commitOrder }) => {
    await wait(delayMs);
    executionOrder.push({ user: 'user-b', id, commitOrder });
    return commitOrder;
  });

  const [a1, a2, a3, b1, b2] = await Promise.all([
    enqueueForUserA('A1', 50),
    enqueueForUserA('A2', 10),
    enqueueForUserA('A3', 1),
    enqueueForUserB('B1', 20),
    enqueueForUserB('B2', 5)
  ]);

  assert.deepStrictEqual([a1, a2, a3], [1, 2, 3], 'user-a commit order should be deterministic');
  assert.deepStrictEqual([b1, b2], [1, 2], 'user-b commit order should be deterministic and isolated');

  const userAExecution = executionOrder.filter((entry) => entry.user === 'user-a').map((entry) => entry.id);
  const userBExecution = executionOrder.filter((entry) => entry.user === 'user-b').map((entry) => entry.id);
  assert.deepStrictEqual(userAExecution, ['A1', 'A2', 'A3'], 'user-a tasks should execute in enqueue order');
  assert.deepStrictEqual(userBExecution, ['B1', 'B2'], 'user-b tasks should execute in enqueue order');

  console.log('PASS: import commit queue is deterministic per user and isolated across users.');
}

run().catch((error) => {
  console.error('FAIL:', error.message);
  process.exit(1);
});
