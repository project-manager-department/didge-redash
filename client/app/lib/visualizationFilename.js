import moment from "moment";
import { isDynamicDateRangeString, getDynamicDateRangeFromString } from "@/services/parameters/DateRangeParameter";
import location from "@/services/location";
import { EXCLUDED_PARAM_NAMES, FILENAME_CONFIG } from "./visualizationFilenameConfig";

/**
 * Sanitizes a string to be safe for use in filenames
 * @param {string} s - String to sanitize
 * @returns {string} - Sanitized filename-safe string
 */
export function sanitizeFilename(s) {
  if (!s || typeof s !== "string") {
    return "";
  }
  // Remove ASCII control characters and characters invalid for filenames.
  // Replace groups of whitespace or invalid char with underscore.
  // Keep alphanumeric, dash and underscore.
  // Collapse multiple underscores.
  return s
    // Replace file system-invalid chars with a space first
    .replace(/[<>:"\\|?*]+/g, " ")
    .replace(/\//g, " ")
    // Remove control characters using Unicode property escape (Cc - control char class)
    .replace(/\p{Cc}+/gu, " ")
    .replace(/\s+/g, "_")
    .replace(/__+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Formats a moment object for filename use
 * @param {moment.Moment} m - Moment object
 * @returns {string} - Formatted date string for filename
 */
function formatForFilename(m) {
  if (!m || !m.isValid()) {
    return "";
  }
  // if time is midnight only, format as DD-MM-YYYY
  const isMidnight = m.hour() === 0 && m.minute() === 0 && m.second() === 0;
  if (isMidnight) {
    return m.format("DD-MM-YYYY");
  }
  // else include time: DD-MM-YYYY_HH-MM
  return `${m.format("DD-MM-YYYY")}__${m.format("HH-mm")}`.replace(/__/g, "_");
}

/**
 * Converts dynamic date range keys like d_last_14_days to '14_days' or 'Last 14 days' mapped value
 * @param {string} s - String to format
 * @returns {string} - Formatted string
 */
function formatDynamicRangeIfNeeded(s) {
  if (typeof s !== "string") return s;
  if (isDynamicDateRangeString(s)) {
    const preset = getDynamicDateRangeFromString(s);
    const name = preset && preset.name ? preset.name : s;
    const m = name.match(/(\d+)\s*days?/i);
    if (m) return `${m[1]}_days`;
    return name.replace(/\s+/g, "_");
  }
  return s;
}

/**
 * Formats parameter values for filename inclusion
 * @param {*} v - Parameter value to format
 * @returns {string} - Formatted parameter value
 */
function formatParamValue(v) {
  if (v === undefined || v === null) {
    return "";
  }
  if (Array.isArray(v)) {
    return v.map(x => formatParamValue(x)).join("-");
  }
  if (typeof v === "object") {
    // Date range value with start/end
    if (Object.prototype.hasOwnProperty.call(v, "start") && Object.prototype.hasOwnProperty.call(v, "end")) {
      const startM = moment(v.start);
      const endM = moment(v.end);
      if (startM.isValid() && endM.isValid()) {
        // Compute calendar diff in days using start of day, matching UI behavior (e.g. "Last 14 days")
        const diffDays = endM.clone().startOf("day").diff(startM.clone().startOf("day"), "days");
        // If range is less than 1 month (<=31 days), show as N_days only when it's a dynamic range or full-day range ending today
        const isEndToday = endM.isSame(moment(), "day");
        const isFullDayRange = startM.isSame(startM.clone().startOf("day")) && endM.isSame(endM.clone().endOf("day"));
        if (diffDays > 0 && diffDays <= 31 && (isEndToday || isFullDayRange)) {
          return `${diffDays}_days`;
        }
      }
      return `${formatForFilename(startM)}--${formatForFilename(endM)}`;
    }
    // Fallback: flatten object into key-value pairs
    return Object.keys(v)
      .map(k => `${k}-${formatParamValue(v[k])}`)
      .join("-");
  }
  if (typeof v === "string") {
    // support serialized range values 'start--end'
    if (v.includes("--")) {
      const parts = v.split("--");
      const s = moment(parts[0]);
      const e = moment(parts[1]);
      if (s.isValid() && e.isValid()) {
        return `${formatForFilename(s)}--${formatForFilename(e)}`;
      }
    }
    return formatDynamicRangeIfNeeded(v);
  }
  return String(v);
}

/**
 * Builds filter suffix from active filters
 * @param {Array} filters - Array of filter objects
 * @returns {Array} - Array of formatted filter parts
 */
function buildActiveFilterParts(filters) {
  const activeFilterParts = [];
  (filters || []).forEach((f) => {
    if (f && f.current !== undefined && f.current !== null) {
      const vals = Array.isArray(f.current) ? f.current : [f.current];
      if (vals.length) {
        const joined = vals
          .filter(v => v !== null && v !== undefined)
          .map(v => (typeof v === "string" ? v : String(v)))
          .join("-");
        if (joined !== "") {
          activeFilterParts.push(`${f.name || f.friendlyName}-${joined}`);
        }
      }
    }
  });
  return activeFilterParts;
}

/**
 * Builds parameter suffix from query parameters
 * @param {Object} queryParams - Query parameter object
 * @returns {Array} - Array of formatted parameter parts
 */
function buildActiveParamParts(queryParams) {
  const activeParamParts = [];
  
  if (queryParams && typeof queryParams === "object") {
    Object.keys(queryParams).forEach((p) => {
      const value = queryParams[p];
      if (value !== undefined && value !== null && value !== "") {
        const vals = Array.isArray(value) ? value : [value];
        const joined = vals
          .filter(v => v !== null && v !== undefined)
          .map(v => formatParamValue(v))
          .join("-");
        const paramName = String(p).replace(/^p_w\d+_/, "").replace(/^p_/, "");
        if (EXCLUDED_PARAM_NAMES.includes(paramName)) {
          return;
        }
        // For dateRange param, omit the param name and use just the value for nicer filenames
        if (paramName === "dateRange") {
          activeParamParts.push(`${joined}`);
        } else {
          activeParamParts.push(`${paramName}-${joined}`);
        }
      }
    });
  }

  // As a fallback (e.g. public dashboards) also check location.search for p_ parameters
  try {
    const locationParams = location.search || {};
    Object.keys(locationParams).forEach((k) => {
      if (k.startsWith("p_")) {
        // skip if already included from queryParams
        const paramName = k.replace(/^p_w\d+_/, "").replace(/^p_/, "");
        if (queryParams && Object.prototype.hasOwnProperty.call(queryParams, paramName)) {
          return;
        }
        const v = locationParams[k];
        if (v !== undefined && v !== null && v !== "") {
          const vals = Array.isArray(v) ? v : [v];
          const joined = vals
            .filter(vv => vv !== null && vv !== undefined)
            .map(vv => formatParamValue(vv))
            .join("-");
          if (joined !== "") {
            if (paramName === "dateRange") {
              activeParamParts.push(`${joined}`);
            } else {
              activeParamParts.push(`${paramName}-${joined}`);
            }
          }
        }
      }
    });
  } catch (e) {
    // ignore fallback errors
  }
  
  return activeParamParts;
}

/**
 * Generates a smart filename for visualization exports
 * @param {Object} options - Configuration options
 * @param {string} options.baseName - Base name for the file (query/visualization name)
 * @param {Array} options.filters - Array of active filters
 * @param {Object} options.queryParams - Query parameters object
 * @param {number} options.maxLength - Maximum filename length (default from config)
 * @returns {string} - Generated filename
 */
export function generateVisualizationFilename({ baseName, filters = [], queryParams = {}, maxLength = FILENAME_CONFIG.maxFilenameLength }) {
  // Check if feature is enabled
  if (!FILENAME_CONFIG.enableSmartFilenames) {
    return sanitizeFilename(baseName);
  }
  
  const activeFilterParts = FILENAME_CONFIG.includeFilters ? buildActiveFilterParts(filters) : [];
  const activeParamParts = FILENAME_CONFIG.includeParameters ? buildActiveParamParts(queryParams) : [];
  
  const paramSuffix = activeParamParts.length ? `_${activeParamParts.join("_")}` : "";
  const filterSuffix = activeFilterParts.length ? `_${activeFilterParts.join("_")}` : "";
  
  let fullName = sanitizeFilename(`${baseName}${filterSuffix}${paramSuffix}`);
  if (fullName.length > maxLength) {
    fullName = fullName.substring(0, maxLength);
  }
  
  return fullName;
}

/**
 * Legacy function name for backwards compatibility
 */
export default generateVisualizationFilename;