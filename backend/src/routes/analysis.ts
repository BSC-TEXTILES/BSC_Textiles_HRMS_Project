import { Router, Response } from 'express';
import { authenticate, authorize, AuthRequest, getScopedLocationId } from '../middleware/auth.js';
import { AnalysisService, AnalysisFilterOptions } from '../services/analysisService.js';

const router = Router();

// Enforce authentication on all analysis routes
router.use(authenticate);

/**
 * Extract standard filter options with location scoping and access control
 */
function extractFilters(req: AuthRequest): AnalysisFilterOptions {
  let locationId = getScopedLocationId(req.user, req.query.locationId);
  if (locationId === 'all') locationId = undefined;

  const departmentId =
    req.query.departmentId && req.query.departmentId !== 'all'
      ? String(req.query.departmentId)
      : undefined;

  const employeeId = req.query.employeeId ? String(req.query.employeeId) : undefined;
  const status = req.query.status ? String(req.query.status) : undefined;
  const preset = req.query.preset ? String(req.query.preset) : undefined;
  const startDate = req.query.startDate ? String(req.query.startDate) : undefined;
  const endDate = req.query.endDate ? String(req.query.endDate) : undefined;

  return {
    locationId,
    departmentId,
    employeeId,
    status,
    preset,
    startDate,
    endDate,
  };
}

/**
 * GET /api/analysis/summary
 * Summary cards metrics with comparison against previous period
 */
router.get('/summary', authorize('VIEW'), async (req: AuthRequest, res: Response) => {
  try {
    const filters = extractFilters(req);
    const summary = await AnalysisService.getSummary(filters);
    res.json(summary);
  } catch (error: any) {
    console.error('[Analysis API] Summary Error:', error);
    res.status(500).json({
      error: 'Failed to calculate analysis summary',
      message: error?.message || 'Database error occurred',
    });
  }
});

/**
 * GET /api/analysis/timeline
 * Chronological timeline with connected-dot trend points
 */
router.get('/timeline', authorize('VIEW'), async (req: AuthRequest, res: Response) => {
  try {
    const filters = extractFilters(req);
    const timeline = await AnalysisService.getTimeline(filters);
    res.json(timeline);
  } catch (error: any) {
    console.error('[Analysis API] Timeline Error:', error);
    res.status(500).json({
      error: 'Failed to retrieve analysis timeline',
      message: error?.message || 'Database error occurred',
    });
  }
});

/**
 * GET /api/analysis/hourly
 * 24-hour distribution of logins throughout the day
 */
router.get('/hourly', authorize('VIEW'), async (req: AuthRequest, res: Response) => {
  try {
    const filters = extractFilters(req);
    const hourly = await AnalysisService.getHourlyDistribution(filters);
    res.json(hourly);
  } catch (error: any) {
    console.error('[Analysis API] Hourly Error:', error);
    res.status(500).json({
      error: 'Failed to calculate hourly login distribution',
      message: error?.message || 'Database error occurred',
    });
  }
});

/**
 * GET /api/analysis/locations
 * Location comparison (BEL, DAV, SHI, HUB)
 */
router.get('/locations', authorize('VIEW'), async (req: AuthRequest, res: Response) => {
  try {
    const filters = extractFilters(req);
    const locations = await AnalysisService.getLocationAnalysis(filters);
    res.json(locations);
  } catch (error: any) {
    console.error('[Analysis API] Locations Error:', error);
    res.status(500).json({
      error: 'Failed to generate location analysis',
      message: error?.message || 'Database error occurred',
    });
  }
});

/**
 * GET /api/analysis/employee/:employeeId
 * Employee-wise historical activity graph and records
 */
router.get('/employee/:employeeId', authorize('VIEW'), async (req: AuthRequest, res: Response) => {
  try {
    const { employeeId } = req.params;
    if (!employeeId) {
      return res.status(400).json({ error: 'Employee ID is required' });
    }
    const filters = extractFilters(req);
    const activity = await AnalysisService.getEmployeeActivity(employeeId, filters);
    if (!activity) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    res.json(activity);
  } catch (error: any) {
    console.error('[Analysis API] Employee Activity Error:', error);
    res.status(500).json({
      error: 'Failed to retrieve employee activity history',
      message: error?.message || 'Database error occurred',
    });
  }
});

/**
 * GET /api/analysis/punctuality
 * Late arrival and punctuality graphs & repeated late arrivals list
 */
router.get('/punctuality', authorize('VIEW'), async (req: AuthRequest, res: Response) => {
  try {
    const filters = extractFilters(req);
    const punctuality = await AnalysisService.getPunctualityAnalysis(filters);
    res.json(punctuality);
  } catch (error: any) {
    console.error('[Analysis API] Punctuality Error:', error);
    res.status(500).json({
      error: 'Failed to retrieve punctuality trends',
      message: error?.message || 'Database error occurred',
    });
  }
});

/**
 * GET /api/analysis/history-tenure
 * Long-term HR history: employee hiring trends, status breakdown
 */
router.get('/history-tenure', authorize('VIEW'), async (req: AuthRequest, res: Response) => {
  try {
    const filters = extractFilters(req);
    const history = await AnalysisService.getLongTermHistory(filters);
    res.json(history);
  } catch (error: any) {
    console.error('[Analysis API] History Error:', error);
    res.status(500).json({
      error: 'Failed to retrieve long term history',
      message: error?.message || 'Database error occurred',
    });
  }
});

/**
 * GET /api/analysis/drilldown
 * Paginated drill-down records table
 */
router.get('/drilldown', authorize('VIEW'), async (req: AuthRequest, res: Response) => {
  try {
    let locationId = getScopedLocationId(req.user, req.query.locationId);
    if (locationId === 'all') locationId = undefined;

    const departmentId =
      req.query.departmentId && req.query.departmentId !== 'all'
        ? String(req.query.departmentId)
        : undefined;

    const category = req.query.category ? String(req.query.category) : 'all';
    const date = req.query.date ? String(req.query.date) : undefined;
    const status = req.query.status ? String(req.query.status) : undefined;
    const search = req.query.search ? String(req.query.search) : undefined;
    const page = req.query.page ? Number(req.query.page) : 1;
    const limit = req.query.limit ? Number(req.query.limit) : 20;

    const data = await AnalysisService.getDrillDown({
      category,
      date,
      locationId,
      departmentId,
      status,
      search,
      page,
      limit,
    });

    res.json(data);
  } catch (error: any) {
    console.error('[Analysis API] Drill-down Error:', error);
    res.status(500).json({
      error: 'Failed to load drill-down records',
      message: error?.message || 'Database error occurred',
    });
  }
});

export default router;
