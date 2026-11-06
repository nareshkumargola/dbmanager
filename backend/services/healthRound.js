// Runs one round of background health checks. Connections are checked in parallel, so a slow or
// offline database can't hold up the others, and a stuck check can't stop later rounds.
const UNREACHABLE = /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EHOSTUNREACH|ENETUNREACH|ECONNRESET|EAI_AGAIN|PROTOCOL_CONNECTION_LOST|MongoServerSelectionError|MongoNetworkError|Connection terminated|timeout expired|NJS-5[01][0-9]/i;

const isUnreachableError = (err) => Boolean(err) && UNREACHABLE.test(`${err.name || ''} ${err.code || ''} ${err.message || ''}`);

// Rounds to skip after each failure in a row. The rounds are a minute apart, so an offline
// database is tried after 1, then 2, then every 3 minutes. Other errors don't slow its checks.
const SKIP_AFTER_FAILURE = [0, 1, 2];

const createHealthRunner = ({ check, concurrency = 5, deadlineMs = 45000 }) => {
  const offline = new Map();
  const unfinished = new Set();
  let running = false;

  const record = (id, problem) => {
    if (!isUnreachableError(problem)) {
      offline.delete(id);
      return;
    }
    const failures = (offline.get(id)?.failures || 0) + 1;
    offline.set(id, { failures, skip: SKIP_AFTER_FAILURE[Math.min(failures, SKIP_AFTER_FAILURE.length) - 1] });
  };

  const isDue = (id) => {
    if (unfinished.has(id)) return false;
    const state = offline.get(id);
    if (state?.skip > 0) {
      state.skip -= 1;
      return false;
    }
    return true;
  };

  const runOne = async (connection) => {
    const id = String(connection._id);
    unfinished.add(id);
    const task = Promise.resolve()
      .then(() => check(connection))
      .then(
        (problem) => record(id, problem),
        (err) => {
          console.error(`Health check failed for connection "${connection.name}":`, err.message);
          record(id, err);
        },
      )
      .finally(() => unfinished.delete(id));

    let timer;
    const deadline = new Promise((resolve) => {
      timer = setTimeout(() => {
        console.warn(`Health check for connection "${connection.name}" is still running; moving on.`);
        resolve();
      }, deadlineMs);
    });
    await Promise.race([task, deadline]);
    clearTimeout(timer);
  };

  const runRound = async (connections) => {
    if (running) {
      console.warn('Previous health check round is still running; skipping this one.');
      return false;
    }
    running = true;
    try {
      const current = new Set(connections.map((connection) => String(connection._id)));
      [...offline.keys()].filter((id) => !current.has(id)).forEach((id) => offline.delete(id));

      const due = connections.filter((connection) => isDue(String(connection._id)));
      let next = 0;
      const worker = async () => {
        while (next < due.length) {
          next += 1;
          await runOne(due[next - 1]);
        }
      };
      await Promise.all(Array.from({ length: Math.min(concurrency, due.length) }, worker));
      return true;
    } finally {
      running = false;
    }
  };

  return { runRound };
};

module.exports = { createHealthRunner, isUnreachableError };
