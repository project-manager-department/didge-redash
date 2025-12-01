import { generateVisualizationFilename } from '@/lib/visualizationFilename';

describe('generateVisualizationFilename', () => {
  test('dynamic date range converts to N_days', () => {
    const filename = generateVisualizationFilename({ baseName: 'Sales', filters: [], queryParams: { dateRange: 'd_last_14_days' } });
    expect(filename).toContain('14_days');
  });

  test('explicit range with time included uses single dash between dates', () => {
    const filename = generateVisualizationFilename({ baseName: 'Cost', filters: [], queryParams: { dateRange: '2025-11-11 08:27--2025-11-13 08:27' } });
    expect(filename).toContain('11-11-2025_08-27-13-11-2025_08-27'); // Single dash between dates
  });

  test('workAreaId is included with smart naming (no prefix)', () => {
    const filename = generateVisualizationFilename({ baseName: 'Cost', filters: [], queryParams: { workAreaId: 123, dateRange: 'd_last_7_days' } });
    expect(filename).toContain('Area_123'); // Should use smart naming without prefix
    expect(filename).toContain('7_days');
  });

  test('workAreaId resolves to filter friendly name when available (no prefix)', () => {
    const filters = [
      { name: 'workAreaId', friendlyName: 'Production Zone A', current: 123, values: [123] }
    ];
    const filename = generateVisualizationFilename({ 
      baseName: 'Sales', 
      filters, 
      queryParams: { workAreaId: 123, dateRange: 'd_last_14_days' } 
    });
    expect(filename).toContain('Production_Zone_A'); // No prefix
    expect(filename).toContain('14_days');
  });

  test('workAreaId array (multi-select) uses summary naming (no prefix)', () => {
    const filename = generateVisualizationFilename({ 
      baseName: 'Report', 
      filters: [], 
      queryParams: { 
        workAreaId: ['67903f20ee57d3112559ce2c', '67903f631b9add078f43f1d0', '67903f9e55fc74dd2bb36e29', '67903facee57d3112559cfaa'],
        dateRange: 'd_last_7_days' 
      } 
    });
    expect(filename).toContain('All_Areas'); // Should use summary for large arrays, no prefix
    expect(filename).toContain('7_days');
  });

  test('other ID parameters use smart naming (no prefix)', () => {
    const filename = generateVisualizationFilename({ 
      baseName: 'Report', 
      filters: [], 
      queryParams: { departmentId: 456, categoryId: 789 } 
    });
    expect(filename).toContain('Dept_456'); // No prefix
    expect(filename).toContain('Category_789'); // No prefix
  });

  test('small arrays show individual values (no prefix)', () => {
    const filename = generateVisualizationFilename({ 
      baseName: 'Report', 
      filters: [], 
      queryParams: { workAreaId: ['area1', 'area2'], dateRange: 'd_last_7_days' } 
    });
    expect(filename).toContain('Area_area1-Area_area2'); // No prefix
    expect(filename).toContain('7_days');
  });
});
