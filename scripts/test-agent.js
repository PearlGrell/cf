import readline from 'readline';
import * as db from '../src/repositories/database.js';
import * as cf from '../src/services/codeforces.js';
import * as gt from '../src/services/googleTasks.js';
import * as cal from '../src/services/googleCalendar.js';
import { syncUpcomingContests, syncLiveContests, syncCleanupAndArchival } from '../src/agents/contestAgent.js';
import { logger } from '../src/utils/logger.js';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const waitEnter = (query) => {
  return new Promise((resolve) => rl.question(query, () => resolve()));
};

// Set logging to debug so we can see everything happening
logger.level = 'debug';

async function main() {
  console.log('\n\x1b[35m%s\x1b[0m', '=======================================================');
  console.log('\x1b[35m%s\x1b[0m', '     CP Contest Sync Agent - Interactive Mock Test     ');
  console.log('\x1b[35m%s\x1b[0m', '=======================================================\n');

  console.log('This script will simulate a mock Codeforces contest lifecycle');
  console.log('to verify Tasks, Google Calendar Alarms, and state cleanups.\n');

  const mockContestId = 99999;
  const mockContestName = 'Mock Test Round 999';
  const duration = 2 * 60 * 60; // 2 hours

  try {
    // 0. Database Migration check
    await db.runMigrations();

    // Clean up any old mock database entry if it exists
    const dbClient = db.getDbClient();
    await dbClient.execute({
      sql: 'DELETE FROM contests WHERE contest_id = ?',
      args: [mockContestId]
    });

    // ========================================================
    // PHASE 1: UPCOMING/SCHEDULED CONTEST CONTEXT
    // ========================================================
    console.log('\x1b[33m%s\x1b[0m', '-------------------------------------------------------');
    console.log('\x1b[33m%s\x1b[0m', '  PHASE 1: Upcoming Contest Scheduled                  ');
    console.log('\x1b[33m%s\x1b[0m', '-------------------------------------------------------');
    console.log('Simulating a newly scheduled Codeforces contest...');

    const upcomingStart = Math.floor(Date.now() / 1000) + 300; // Starts in 5 minutes
    
    // Monkeypatch Codeforces API fetcher using the new setter
    cf.setMockContests(() => [
      {
        id: mockContestId,
        name: mockContestName,
        type: 'CF',
        phase: 'BEFORE',
        frozen: false,
        durationSeconds: duration,
        startTimeSeconds: upcomingStart
      }
    ]);

    console.log('\nTriggering syncUpcomingContests()...');
    await syncUpcomingContests();

    const phase1Entry = await db.getContest(mockContestId);
    console.log('\n\x1b[32m%s\x1b[0m', '✓ PHASE 1 SYNC COMPLETED!');
    console.log(`Database Status : "${phase1Entry.status}"`);
    console.log(`Google Task ID  : ${phase1Entry.task_id}`);
    console.log(`Calendar Event  : ${phase1Entry.calendar_event_id}`);

    console.log('\n\x1b[36m%s\x1b[0m', '👉 CHECK YOUR APPS NOW:');
    console.log('1. Open Google Tasks: You should see the task "[UPCOMING] [Starts Time] Mock Test Round 999"');
    console.log('2. Open Google Calendar: You should see the alarm event "[ALARM] Mock Test Round 999" scheduled in 5 minutes');
    console.log('   with an alarm notification reminder set.');

    await waitEnter('\nPress [ENTER] when you have verified and are ready to simulate the contest starting...');

    // ========================================================
    // PHASE 2: CONTEST START / LIVE TRANSITION
    // ========================================================
    console.log('\n\x1b[33m%s\x1b[0m', '-------------------------------------------------------');
    console.log('\x1b[33m%s\x1b[0m', '  PHASE 2: Contest Goes LIVE                           ');
    console.log('\x1b[33m%s\x1b[0m', '-------------------------------------------------------');
    console.log('Simulating the start time has passed. Contest goes LIVE...');

    // Simulate database start time shifted to 5 minutes in the past
    const startedStart = Math.floor(Date.now() / 1000) - 300;
    phase1Entry.start_time = startedStart;
    phase1Entry.end_time = startedStart + duration;
    await db.upsertContest(phase1Entry);

    console.log('\nTriggering syncLiveContests()...');
    await syncLiveContests();

    const phase2Entry = await db.getContest(mockContestId);
    console.log('\n\x1b[32m%s\x1b[0m', '✓ PHASE 2 SYNC COMPLETED!');
    console.log(`Database Status : "${phase2Entry.status}" (Should be "live")`);
    console.log(`Calendar Event  : ${phase2Entry.calendar_event_id} (Should be null/deleted)`);

    console.log('\n\x1b[36m%s\x1b[0m', '👉 CHECK YOUR APPS NOW:');
    console.log('1. Open Google Tasks: The task title has changed to "[LIVE 🔴] Mock Test Round 999".');
    console.log('2. Open Google Calendar: The "[ALARM]" event has been DELETED automatically! Your calendar is perfectly clean.');

    await waitEnter('\nPress [ENTER] when you have verified and are ready to simulate the contest ending...');

    // ========================================================
    // PHASE 3: CONTEST END & STATISTICS ANALYSIS
    // ========================================================
    console.log('\n\x1b[33m%s\x1b[0m', '-------------------------------------------------------');
    console.log('\x1b[33m%s\x1b[0m', '  PHASE 3: Contest Ends & Solves Sync                 ');
    console.log('\x1b[33m%s\x1b[0m', '-------------------------------------------------------');
    console.log('Simulating contest end time passed. Retrieving submissions...');

    // Simulate database end time shifted to 5 minutes in the past
    const endedStart = Math.floor(Date.now() / 1000) - duration - 300;
    const endedEnd = endedStart + duration;
    phase2Entry.start_time = endedStart;
    phase2Entry.end_time = endedEnd;
    await db.upsertContest(phase2Entry);

    // Mock Codeforces user status return values:
    // User submitted:
    // - Problem A: Wrong answer then Correct Answer (1 solve, 1 wrong attempt)
    // - Problem B: Correct Answer (1 solve, 0 wrong attempts)
    cf.setMockUserSubmissions(() => [
      {
        id: 2001,
        contestId: mockContestId,
        creationTimeSeconds: endedStart + 600,
        relativeTimeSeconds: 600,
        problem: { index: 'A', name: 'Problem A', type: 'PROGRAMMING' },
        author: { members: [{ handle: 'test' }], participantType: 'CONTESTANT' },
        programmingLanguage: 'JavaScript',
        verdict: 'WRONG_ANSWER'
      },
      {
        id: 2002,
        contestId: mockContestId,
        creationTimeSeconds: endedStart + 1200,
        relativeTimeSeconds: 1200,
        problem: { index: 'A', name: 'Problem A', type: 'PROGRAMMING' },
        author: { members: [{ handle: 'test' }], participantType: 'CONTESTANT' },
        programmingLanguage: 'JavaScript',
        verdict: 'OK'
      },
      {
        id: 2003,
        contestId: mockContestId,
        creationTimeSeconds: endedStart + 1800,
        relativeTimeSeconds: 1800,
        problem: { index: 'B', name: 'Problem B', type: 'PROGRAMMING' },
        author: { members: [{ handle: 'test' }], participantType: 'CONTESTANT' },
        programmingLanguage: 'JavaScript',
        verdict: 'OK'
      }
    ]);

    // Mock rating change (none since it just ended, rating delta will sync later or display Solved Count)
    cf.setMockUserRatingChanges(() => []);

    console.log('\nTriggering syncCleanupAndArchival()...');
    await syncCleanupAndArchival();

    const phase3Entry = await db.getContest(mockContestId);
    console.log('\n\x1b[32m%s\x1b[0m', '✓ PHASE 3 SYNC COMPLETED!');
    console.log(`Database Status : "${phase3Entry.status}" (Should be "attempted")`);
    console.log(`Solved Problems : ${phase3Entry.solved} (${phase3Entry.solved_list}) (Should be "2 (A, B)")`);
    console.log(`Wrong Attempts  : ${phase3Entry.wrong_submissions} (Should be 1)`);

    console.log('\n\x1b[36m%s\x1b[0m', '👉 CHECK YOUR APPS NOW:');
    console.log('1. Open Google Tasks: The task title has changed to "[DONE ✅] Mock Test Round 999 (Solved: 2)".');
    console.log('2. Open Task Details: You should see the beautiful, clean, professional performance summary inside the notes:');
    console.log('   Starts, Duration, Link, Solved Problems, Wrong Attempts, Rank, and Rating Change.');

    console.log('\n\x1b[32m%s\x1b[0m', '=======================================================');
    console.log('\x1b[32m%s\x1b[0m', '            MOCK LIFE-CYCLE TEST SUCCESSFUL!           ');
    console.log('\x1b[32m%s\x1b[0m', '=======================================================');

  } catch (error) {
    console.error('\n\x1b[31m%s\x1b[0m', '✖ MOCK TEST FAILED!');
    console.error(error);
  } finally {
    rl.close();
  }
}

main();
