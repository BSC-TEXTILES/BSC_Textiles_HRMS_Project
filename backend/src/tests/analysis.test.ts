import assert from 'node:assert';
import { resolveDateRange, AnalysisService } from '../services/analysisService.js';
import { TestResult } from './attendance.test.js';

export async function runAnalysisTests(baseUrl?: string, token?: string): Promise<TestResult[]> {
  const results: TestResult[] = [];

  const runTest = async (name: string, fn: () => Promise<void>) => {
    const start = Date.now();
    try {
      await fn();
      results.push({ suite: 'HR Analysis Module', name, passed: true, durationMs: Date.now() - start });
    } catch (err: any) {
      results.push({
        suite: 'HR Analysis Module',
        name,
        passed: false,
        durationMs: Date.now() - start,
        error: err.message,
      });
    }
  };

  await runTest('resolveDateRange handles all required presets properly', async () => {
    const r7d = resolveDateRange({ preset: '7d' });
    assert.ok(r7d.startDate && r7d.endDate, '7d range should have start and end date');
    assert.ok(r7d.startDate <= r7d.endDate, 'Start date should be <= end date');
    assert.ok(r7d.prevStartDate < r7d.startDate, 'Previous comparison start date should be before start date');

    const r30d = resolveDateRange({ preset: '30d' });
    assert.ok(r30d.startDate <= r30d.endDate);

    const rMonth = resolveDateRange({ preset: 'this_month' });
    assert.ok(rMonth.startDate.endsWith('-01'), 'This month should start on 1st');

    const rCustom = resolveDateRange({
      preset: 'custom',
      startDate: '2026-10-01',
      endDate: '2026-10-10',
    });
    assert.strictEqual(rCustom.startDate, '2026-10-01');
    assert.strictEqual(rCustom.endDate, '2026-10-10');
  });

  await runTest('AnalysisService.getSummary calculates database-derived metrics', async () => {
    const summary = await AnalysisService.getSummary({ preset: '30d' });
    assert.ok(summary, 'Summary should return an object');
    assert.ok(summary.counts.totalEmployees >= 0, 'Total employees should be >= 0');
    assert.ok(summary.counts.activeEmployees <= summary.counts.totalEmployees, 'Active <= Total');
    assert.ok(summary.counts.averageAttendanceRate >= 0 && summary.counts.averageAttendanceRate <= 100);
    assert.ok(typeof summary.counts.currentlyActive === 'number', 'Currently active sessions should be a number');
    assert.ok(typeof summary.counts.loggedInToday === 'number');
    assert.ok(typeof summary.counts.notLoggedInToday === 'number');
    assert.ok(summary.comparison, 'Comparison object should exist');
  });

  await runTest('AnalysisService.getTimeline returns continuous chronological connected points', async () => {
    const timeline = await AnalysisService.getTimeline({ preset: '7d' });
    assert.ok(Array.isArray(timeline.points), 'Timeline points must be an array');
    assert.strictEqual(timeline.points.length, 7, '7d preset should have exactly 7 points');

    for (let i = 0; i < timeline.points.length; i++) {
      const pt = timeline.points[i];
      assert.ok(pt.date, 'Point must have date');
      assert.ok(pt.label, 'Point must have readable label');
      assert.ok(typeof pt.uniqueLogins === 'number', 'uniqueLogins must be a number');
      assert.ok(typeof pt.successfulLogins === 'number');
      assert.ok(typeof pt.presentCount === 'number');

      if (i > 0) {
        assert.ok(
          timeline.points[i - 1].date < pt.date,
          'Points must be strictly sorted in chronological order'
        );
      }
    }
  });

  await runTest('AnalysisService.getHourlyDistribution returns 24 hours with peak & lowest period', async () => {
    const hourly = await AnalysisService.getHourlyDistribution({ preset: '30d' });
    assert.strictEqual(hourly.hourlyData.length, 24, 'Must return 24 hours (0 to 23)');
    assert.ok(hourly.peakPeriod && typeof hourly.peakPeriod.hour === 'number');
    assert.ok(hourly.lowestPeriod && typeof hourly.lowestPeriod.hour === 'number');
    assert.ok(hourly.peakPeriod.count >= hourly.lowestPeriod.count);
  });

  await runTest('AnalysisService.getLocationAnalysis returns store location breakdowns', async () => {
    const locAnalysis = await AnalysisService.getLocationAnalysis({ preset: '30d' });
    assert.ok(Array.isArray(locAnalysis.locations), 'Locations must be an array');
    assert.ok(locAnalysis.locations.length >= 3, 'Must contain BEL, DAV, SHI');

    const codes = locAnalysis.locations.map((l: any) => l.code);
    assert.ok(codes.includes('BEL'), 'Must include BEL');
    assert.ok(codes.includes('DAV'), 'Must include DAV');
    assert.ok(codes.includes('SHI'), 'Must include SHI');
  });

  await runTest('AnalysisService.getPunctualityAnalysis returns late trends and repeat offenders', async () => {
    const punctuality = await AnalysisService.getPunctualityAnalysis({ preset: '30d' });
    assert.ok(Array.isArray(punctuality.trend), 'Trend must be an array');
    assert.ok(Array.isArray(punctuality.repeatOffenders), 'Repeat offenders must be an array');
  });

  await runTest('AnalysisService.getLongTermHistory returns hire trend & department distribution', async () => {
    const history = await AnalysisService.getLongTermHistory({});
    assert.ok(Array.isArray(history.joiningTrend), 'Joining trend must be an array');
    assert.ok(Array.isArray(history.departmentBreakdown), 'Department breakdown must be an array');
    assert.ok(Array.isArray(history.statusBreakdown), 'Status breakdown must be an array');
  });

  await runTest('AnalysisService.getDrillDown supports paginated categories and filters', async () => {
    const drilldown = await AnalysisService.getDrillDown({
      category: 'all',
      page: 1,
      limit: 10,
    });
    assert.ok(drilldown.total >= 0);
    assert.strictEqual(drilldown.page, 1);
    assert.ok(Array.isArray(drilldown.rows));
    assert.ok(drilldown.rows.length <= 10);
  });

  return results;
}

if (process.argv[1]?.includes('analysis.test')) {
  runAnalysisTests().then((results) => {
    console.log('Results:', results);
    const failed = results.filter((r) => !r.passed);
    if (failed.length > 0) {
      console.error(`${failed.length} tests failed!`);
      process.exit(1);
    } else {
      console.log(`All ${results.length} tests passed successfully!`);
      process.exit(0);
    }
  });
}
