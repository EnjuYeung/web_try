export function scheduleDailyScan({ enabled, runScan, time }) {
  if (!enabled) {
    console.log("Daily movie scan disabled");
    return;
  }

  const nextRun = nextDailyRunDate(time);
  if (!nextRun) {
    console.warn(`Daily movie scan not scheduled: invalid DAILY_SCAN_TIME=${time}`);
    return;
  }

  console.log(`Next daily movie scan scheduled at ${nextRun.toLocaleString()}`);
  setTimeout(async () => {
    try {
      await runScan();
    } catch (error) {
      console.error("Scheduled movie scan failed", error);
    } finally {
      scheduleDailyScan({ enabled, runScan, time });
    }
  }, nextRun.getTime() - Date.now());
}

function nextDailyRunDate(timeValue) {
  const match = String(timeValue).match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) return null;

  const now = new Date();
  const nextRun = new Date(now);
  nextRun.setHours(Number(match[1]), Number(match[2]), 0, 0);
  if (nextRun <= now) {
    nextRun.setDate(nextRun.getDate() + 1);
  }

  return nextRun;
}
