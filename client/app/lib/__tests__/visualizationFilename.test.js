import generateVisualizationFilename from '@/lib/visualizationFilename2';

describe('generateVisualizationFilename', () => {
  test('dynamic date range converts to N_days', () => {
    const filename = generateVisualizationFilename({ baseName: 'Sales', filters: [], queryParams: { dateRange: 'd_last_14_days' } });
    expect(filename).toContain('14_days');
  });

  test('explicit range with time included stays start--end in DD-MM-YYYY_HH-MM format', () => {
    const filename = generateVisualizationFilename({ baseName: 'Cost', filters: [], queryParams: { dateRange: '2025-11-11 08:27--2025-11-13 08:27' } });
    expect(filename).toContain('11-11-2025_08-27--13-11-2025_08-27');
  });

  test('workAreaId is excluded', () => {
    const filename = generateVisualizationFilename({ baseName: 'Cost', filters: [], queryParams: { workAreaId: 123, dateRange: 'd_last_7_days' } });
    expect(filename).not.toContain('workAreaId');
    expect(filename).toContain('7_days');
  });
});
