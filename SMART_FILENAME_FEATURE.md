# Smart Filename Enhancement for Redash Charts

## Overview
This branch implements intelligent filename generation for chart exports (PNG) and data downloads (CSV/Excel) in Redash, making exported files more identifiable and organized.

## Key Features

### 1. Smart Filename Generation
- **Dynamic filenames** that include query/visualization names, active filters, and parameters
- **Date range formatting**: `d_last_14_days` → `14_days` for cleaner filenames
- **Filter inclusion**: Active dashboard filters are appended to filenames
- **Parameter handling**: Query parameters (like date ranges) are intelligently formatted

### 2. Enhanced PNG Export
- **Custom download button** in Plotly charts with smart filename detection
- **Filename inheritance** from query names, visualization names, or fallback to 'chart'
- **Maintains original Plotly functionality** while adding Redash-specific enhancements

### 3. Configuration & Flexibility
- **Feature toggles** in `visualizationFilenameConfig.js` for easy enabling/disabling
- **Excluded parameters** configuration (e.g., workAreaId won't appear in filenames)
- **Length limits** to prevent overly long filenames

## Architecture Improvements

### Minimized Upstream Conflicts
1. **Centralized logic** in dedicated utility files:
   - `client/app/lib/visualizationFilename.js` - Core filename generation logic
   - `client/app/lib/visualizationFilenameConfig.js` - Configuration settings
   - `viz-lib/src/visualizations/chart/plotly/redashPlotlyConfig.ts` - Plotly customizations

2. **Isolated Plotly changes** in separate config file to minimize conflicts with upstream updates

3. **Clean integration** - existing components only need to pass `queryName` and `queryParams` props

### Files Modified (Minimal Changes)

#### Core Components (Small additions):
- `ExpandedWidgetDialog.jsx` - Pass queryName/queryParams props
- `VisualizationWidget.jsx` - Pass queryName/queryParams props  
- `QueryVisualizationTabs.jsx` - Pass query object
- `VisualizationEmbed.jsx` - Pass queryParams
- `QuerySource.jsx` & `QueryView.jsx` - Pass query object

#### Main Logic (Replaced with utility):
- `VisualizationRenderer.jsx` - Replaced 180+ lines with 8 lines using utility

#### Plotly Integration:
- `PlotlyChart.tsx` & `CustomPlotlyChart.tsx` - Add filename dataset attributes
- `initChart.ts` - Accept optional filename parameter
- `index.ts` - Use new Plotly configuration
- `prepareLayout.ts` - Support additional options

#### Dashboard Filter Enhancement:
- `dashboard.js` - Support both `p_` prefixed and non-prefixed parameters

### New Files Added
- `visualizationFilename.js` - Core filename generation utility
- `visualizationFilenameConfig.js` - Configuration and feature toggles
- `redashPlotlyConfig.ts` - Isolated Plotly customizations
- `VisualizationRenderer.test.jsx` - Test coverage for filename logic

## Example Filename Outputs

### Before:
- `chart.png`
- `query_results.csv`

### After:
- `Sales_by_Category_country-US_category-A-B_14_days.png`
- `Cost_-_Forms_-_Count_Submissions_Daily_7_days.csv`
- `Revenue_Dashboard_region-Europe_11-11-2025--25-11-2025.xlsx`

## Configuration Options

```javascript
// In visualizationFilenameConfig.js
export const FILENAME_CONFIG = {
  enableSmartFilenames: true,        // Master toggle
  maxFilenameLength: 180,           // Length limit
  includeParameters: true,          // Include query parameters
  includeFilters: true,            // Include active filters
  formatDateRanges: true,          // Format date ranges nicely
};

export const EXCLUDED_PARAM_NAMES = [
  "workAreaId",                    // Easily add/remove excluded params
  "work_area_id",
];
```

## Benefits for Upstream Compatibility

1. **Isolated Changes**: Core logic is in separate utility files
2. **Feature Toggles**: Can be easily disabled if conflicts arise  
3. **Minimal Touchpoints**: Most changes are just prop passing
4. **Clean Rollback**: Can revert to original behavior by changing config
5. **Extensible**: Easy to add new filename logic without touching core components

## Testing
- Unit tests cover filename generation logic
- Handles edge cases (empty filters, malformed dates, long names)
- Validates parameter exclusion and formatting rules

This implementation provides significant value with minimal risk to upstream compatibility.