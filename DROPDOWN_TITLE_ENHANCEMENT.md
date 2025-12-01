# Dropdown Title Enhancement for PNG Export Filenames

## Overview

This enhancement addresses the issue where dashboard dropdown filters (like workAreaId) would show meaningful titles in the UI but only include numeric IDs in exported PNG filenames. Now the system can use human-readable titles from dropdown options when available.

## What Was Changed

### 1. Enabled workAreaId in Export Filenames

**File:** `client/app/lib/visualizationFilenameConfig.js`
- Removed `workAreaId` and `work_area_id` from the `EXCLUDED_PARAM_NAMES` array
- These parameters will now appear in export filenames instead of being hidden

### 2. Added Dropdown Title Resolution

**File:** `client/app/lib/visualizationFilename.js`
- Added `resolveDropdownTitle()` function to map parameter IDs to human-readable names
- Enhanced `buildActiveParamParts()` to use dropdown titles when available
- Implemented smart naming fallbacks for common ID parameters

### 3. Updated Tests

- Modified existing tests to reflect that workAreaId is now included
- Added new test cases for dropdown title resolution functionality

## How It Works

### Smart Title Resolution Priority

1. **Dashboard Filter Friendly Names** - If the parameter is exposed as a dashboard filter with a `friendlyName`, use that
2. **Smart Naming Patterns** - For common ID parameters, use predefined friendly names:
   - `workAreaId` → `Area_123`
   - `departmentId` → `Dept_456`  
   - `categoryId` → `Category_789`
   - `locationId` → `Location_101`
   - `userId` → `User_202`
3. **Original Value** - Fall back to the original parameter value

### Example Transformations

#### Before (workAreaId excluded):
```
Sales_Report_14_days.png
```

#### After (with ID only):
```
Sales_Report_workAreaId-Area_123_14_days.png
```

#### After (with dropdown title):
```
Sales_Report_workAreaId-Production_Zone_A_14_days.png
```

## Usage in Code

### For Dashboard Filters

If you have a dashboard filter for workAreaId:

```js
// In your query result filters
const filters = [
  {
    name: 'workAreaId',
    friendlyName: 'Production Zone A', // This will be used in filename
    current: 123,
    values: [123, 124, 125]
  }
];
```

### For Query Parameters

The system automatically detects ID parameters and applies smart naming:

```js
// Query parameters
const queryParams = {
  workAreaId: 123,      // → workAreaId-Area_123
  departmentId: 456,    // → departmentId-Dept_456
  categoryId: 789,      // → categoryId-Category_789
  dateRange: 'd_last_14_days'  // → 14_days
};
```

## Configuration

### Adding New Smart Name Mappings

To add support for additional ID parameters, edit the `smartNames` object in `visualizationFilename.js`:

```js
const smartNames = {
  'workAreaId': 'Area',
  'work_area_id': 'Area',
  'departmentId': 'Dept',
  'department_id': 'Dept',
  'categoryId': 'Category',
  'category_id': 'Category',
  'locationId': 'Location',
  'location_id': 'Location',
  'userId': 'User',
  'user_id': 'User',
  // Add your custom mappings here
  'projectId': 'Project',
  'customerId': 'Customer',
};
```

### Excluding Parameters

To exclude a parameter from filenames entirely, add it to `EXCLUDED_PARAM_NAMES` in `visualizationFilenameConfig.js`:

```js
export const EXCLUDED_PARAM_NAMES = [
  "internalSystemId",    // This won't appear in filenames
  "session_token",       // Neither will this
];
```

### Disabling the Feature

To disable smart filenames entirely:

```js
// In visualizationFilenameConfig.js
export const FILENAME_CONFIG = {
  enableSmartFilenames: false,  // Set to false to disable
  // ... other config
};
```

## Technical Implementation Details

### Dropdown Title Resolution Flow

1. **Filter Search** - Look for matching dashboard filters by name variations
2. **Value Matching** - Check if the current filter value matches the parameter value
3. **Title Extraction** - Use the filter's `friendlyName` if available
4. **Smart Fallback** - Apply predefined smart naming patterns for common ID types
5. **Sanitization** - Clean the resolved title for filesystem compatibility

### Integration Points

The enhancement integrates at these key points:

- **VisualizationRenderer.jsx** - Passes query parameters and filters to filename generator
- **Plotly Export** - Uses the generated filename for PNG downloads
- **Dashboard Filters** - Provides friendly names for parameter resolution

## Testing

Run the tests to verify functionality:

```bash
# Run filename generation tests
npx jest client/app/lib/__tests__/visualizationFilename.test.js

# Run a manual test script
node test-filename-generation.js
```

## Benefits

1. **Better File Organization** - Export files have meaningful names that match what users see in dropdowns
2. **Improved User Experience** - No need to remember that "123" means "Production Zone A"
3. **Backward Compatible** - Existing functionality is preserved, only adds new capabilities
4. **Configurable** - Easy to add new parameter mappings or disable the feature
5. **Robust Fallbacks** - Always produces a valid filename even if dropdown data isn't available

## Future Enhancements

Potential improvements could include:

1. **Dynamic Dropdown Loading** - Fetch dropdown values in real-time for title resolution
2. **Custom Name Templates** - Allow users to define their own filename patterns
3. **Internationalization** - Support for multiple languages in dropdown titles
4. **Advanced Filtering** - More sophisticated parameter filtering and grouping options

## Troubleshooting

### Dropdown Titles Not Appearing

1. **Check Filter Configuration** - Ensure the parameter is exposed as a dashboard filter
2. **Verify friendlyName** - Make sure the filter has a meaningful `friendlyName` property
3. **Parameter Matching** - Confirm the parameter name matches between query and filter
4. **Smart Naming** - Check if the parameter follows supported ID naming patterns

### Filename Too Long

The system automatically truncates filenames to 180 characters by default. To adjust:

```js
// In visualizationFilenameConfig.js
export const FILENAME_CONFIG = {
  maxFilenameLength: 250,  // Increase as needed
  // ... other config
};
```

### Special Characters in Titles

The `sanitizeFilename()` function handles special characters automatically, converting them to filesystem-safe alternatives.