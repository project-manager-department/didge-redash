/**
 * Configuration for visualization filename generation
 */

// Parameters to exclude from filename generation
// These are typically internal IDs or preferences that shouldn't appear in exported filenames
export const EXCLUDED_PARAM_NAMES = [
  // "workAreaId", // Enabled for filename inclusion with title resolution
  // "work_area_id", // Enabled for filename inclusion with title resolution
  // Add more excluded parameters here as needed
];

// Feature toggles for filename enhancement
export const FILENAME_CONFIG = {
  // Enable smart filename generation with filters and parameters
  enableSmartFilenames: true,
  
  // Maximum filename length to prevent overly long exports
  maxFilenameLength: 180,
  
  // Enable parameter inclusion in filenames
  includeParameters: true,
  
  // Enable filter inclusion in filenames  
  includeFilters: true,
  
  // Format date ranges as "N_days" when possible
  formatDateRanges: true,
};

export default FILENAME_CONFIG;