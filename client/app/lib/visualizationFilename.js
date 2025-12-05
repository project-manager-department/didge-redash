import moment from "moment";
import { isDynamicDateRangeString, getDynamicDateRangeFromString } from "@/services/parameters/DateRangeParameter";
import location from "@/services/location";
import { EXCLUDED_PARAM_NAMES, FILENAME_CONFIG } from "./visualizationFilenameConfig";
import { Auth } from "@/services/auth";

// Cache for dropdown options to avoid repeated API calls
const dropdownOptionsCache = new Map();

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
      return `${formatForFilename(startM)}-${formatForFilename(endM)}`;
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
        return `${formatForFilename(s)}-${formatForFilename(e)}`;
      }
    }
    return formatDynamicRangeIfNeeded(v);
  }
  return String(v);
}

/**
 * Attempts to load dropdown options for a query parameter synchronously
 * @param {string} queryId - Query ID for the dropdown
 * @param {string} parentQueryId - Parent query ID that contains this parameter
 * @returns {Array} - Array of dropdown options or empty array if not available
 */
function loadDropdownOptionsSync(queryId, parentQueryId) {
  if (!queryId) return [];
  
  // Check cache first
  const cacheKey = `dropdown_${parentQueryId}_${queryId}`;
  if (dropdownOptionsCache.has(cacheKey)) {
    return dropdownOptionsCache.get(cacheKey);
  }
  
  // Try to make a synchronous request (this will only work if the data is already cached by the browser)
  try {
    const xhr = new XMLHttpRequest();
    // Use the correct endpoint format: /api/queries/{parentQueryId}/dropdowns/{dropdownQueryId}
    const endpoint = parentQueryId ? 
      `api/queries/${parentQueryId}/dropdowns/${queryId}` : 
      `api/queries/${queryId}/dropdown`;
    
    xhr.open('GET', endpoint, false); // synchronous request
    xhr.setRequestHeader('Content-Type', 'application/json');
    
    // Add authorization headers using Redash's Auth service
    const apiKey = Auth.getApiKey();
    if (apiKey) {
      xhr.setRequestHeader('Authorization', `Key ${apiKey}`);
    }
    
    // Add CSRF token
    xhr.setRequestHeader('X-CSRF-TOKEN', 'csrf_token');
    xhr.withCredentials = true; // Include cookies for session auth
    xhr.send();
    
    if (xhr.status === 200) {
      const options = JSON.parse(xhr.responseText);
      // Cache the result
      dropdownOptionsCache.set(cacheKey, options);
      return options;
    } else {
      // Cache empty result to avoid repeated failed requests
      dropdownOptionsCache.set(cacheKey, []);
    }
  } catch (e) {
    // Cache empty result to avoid repeated failed requests
    dropdownOptionsCache.set(cacheKey, []);
  }
  
  return [];
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
 * Attempts to extract dropdown options from DOM
 * @param {string} paramName - Parameter name
 * @returns {Array} - Array of dropdown options extracted from DOM
 */
function extractDropdownOptionsFromDOM(paramName) {
  try {
    const parameterBlock = document.querySelector(`[data-test="ParameterBlock-${paramName}"]`);
    if (!parameterBlock) return [];
    
    // Look for dropdown options in the DOM
    const options = [];
    
    // Strategy 1: Look for Ant Design Select options that might be cached in DOM
    const selectElements = parameterBlock.querySelectorAll('.ant-select-dropdown-menu-item, .ant-select-item-option');
    selectElements.forEach(element => {
      const value = element.getAttribute('data-value') || element.getAttribute('value');
      const text = element.textContent?.trim();
      if (value && text && !value.match(/^[a-f0-9]{24}$/) && text !== value) {
        options.push({
          value: value,
          name: text,
          label: text,
          text: text
        });
      }
    });
    
    // Strategy 2: Look for React component state that might contain options
    try {
      const reactFiber = Object.keys(parameterBlock).find(key => 
        key.startsWith('__reactInternalInstance') || 
        key.startsWith('_reactInternalFiber') ||
        key.startsWith('__reactFiber')
      );
      
      if (reactFiber) {
        let currentNode = parameterBlock[reactFiber];
        let searchDepth = 0;
        
        while (currentNode && searchDepth < 15) {
          if (currentNode.memoizedProps) {
            const props = currentNode.memoizedProps;
            if (props.options && Array.isArray(props.options)) {
              props.options.forEach(opt => {
                if (opt && typeof opt === 'object') {
                  const value = opt.value || opt.id;
                  const name = opt.label || opt.name || opt.text;
                  if (value && name && !options.find(existing => existing.value === value)) {
                    options.push({
                      value: value,
                      name: name,
                      label: name,
                      text: name
                    });
                  }
                }
              });
            }
          }
          
          if (currentNode.memoizedState && currentNode.memoizedState.options) {
            const stateOptions = currentNode.memoizedState.options;
            if (Array.isArray(stateOptions)) {
              stateOptions.forEach(opt => {
                if (opt && typeof opt === 'object') {
                  const value = opt.value || opt.id;
                  const name = opt.label || opt.name || opt.text;
                  if (value && name && !options.find(existing => existing.value === value)) {
                    options.push({
                      value: value,
                      name: name,
                      label: name,
                      text: name
                    });
                  }
                }
              });
            }
          }
          
          currentNode = currentNode.child || currentNode.sibling || currentNode.return;
          searchDepth++;
        }
      }
    } catch (e) {
      // React fiber access failed, continue with other strategies
    }
    
    return options;
  } catch (e) {
    return [];
  }
}

/**
 * Attempts to get the full parameter display text from DOM
 * @param {string} paramName - Parameter name  
 * @returns {string|null} - Full parameter display text if found, null otherwise
 */
function getParameterDisplayFromDOM(paramName) {
  try {
    const parameterBlock = document.querySelector(`[data-test="ParameterBlock-${paramName}"]`);
    if (!parameterBlock) return null;
    
    // Strategy 1: Look for all text content in the parameter block
    const allElements = parameterBlock.querySelectorAll('*');
    const possibleTexts = [];
    
    for (const element of allElements) {
      // Check various attributes that might contain full text
      const attributes = ['title', 'aria-label', 'data-title', 'alt'];
      for (const attr of attributes) {
        const value = element.getAttribute(attr);
        if (value && value.trim() !== '' && !value.match(/^[a-f0-9]{24}$/)) {
          possibleTexts.push(value.trim());
        }
      }
      
      // Also check text content
      const textContent = element.textContent?.trim();
      if (textContent && !textContent.match(/^[a-f0-9]{24}$/) && 
          !textContent.includes('Select') && textContent.length > 3) {
        possibleTexts.push(textContent);
      }
    }
    

    
    // Look specifically for title attributes that contain the full text for truncated elements
    for (const element of allElements) {
      const textContent = element.textContent?.trim();
      
      // If this element shows truncated text, check if it has a title with the full text
      if (textContent && (textContent.endsWith('...') || textContent.endsWith('…'))) {
        const fullTitle = element.getAttribute('title') || 
                         element.closest('[title]')?.getAttribute('title') ||
                         element.parentElement?.getAttribute('title');
        
        if (fullTitle && fullTitle.trim() !== '' && 
            fullTitle !== textContent && 
            !fullTitle.match(/^[a-f0-9]{24}$/) &&
            !fullTitle.toLowerCase().includes('work area') &&
            !fullTitle.toLowerCase().includes('parameter') &&
            !fullTitle.toLowerCase().includes('select')) {
          
          return sanitizeFilename(fullTitle.trim().replace(/\s+/g, "_"));
        }
      }
    }
    
    // Look for any title attributes that seem to contain option names
    const titleTexts = possibleTexts.filter(text => 
      text.length > 10 && 
      !text.endsWith('...') && 
      !text.endsWith('…') &&
      !text.toLowerCase().includes('work area') &&
      !text.toLowerCase().includes('parameter') &&
      !text.toLowerCase().includes('select') &&
      !text.toLowerCase().includes('close') &&
      text.split(' ').length >= 2 &&
      text.split(' ').length <= 8
    );
    
    if (titleTexts.length > 0) {
      // Use the longest title text as it's likely the most complete
      const bestTitle = titleTexts.reduce((longest, current) => 
        current.length > longest.length ? current : longest
      );
      
      return sanitizeFilename(bestTitle.replace(/\s+/g, "_"));
    }
    
    // Find the most likely candidate (longest text that looks like a real option)
    let bestMatch = null;
    let bestScore = 0;
    
    for (const text of possibleTexts) {
      if (text.endsWith('...') || text.endsWith('…')) continue;
      
      const words = text.split(/\s+/).length;
      const length = text.length;
      
      // Score based on reasonable length and word count for dropdown options
      let score = 0;
      if (length >= 10 && length <= 100) score += 2;
      if (words >= 2 && words <= 8) score += 2;
      if (!text.toLowerCase().includes('parameter')) score += 1;
      if (!text.toLowerCase().includes('select')) score += 1;
      if (!text.toLowerCase().includes('work area')) score += 1; // Avoid generic labels
      
      if (score > bestScore) {
        bestScore = score;
        bestMatch = text;
      }
    }
    

    
    if (bestMatch && bestScore >= 3) {
      return sanitizeFilename(bestMatch.replace(/\s+/g, "_"));
    }
    
    return null;
  } catch (e) {
    return null;
  }
}

/**
 * Attempts to resolve parameter value to its display title from dropdown options
 * @param {string} paramName - Parameter name
 * @param {*} value - Parameter value (ID or array of IDs)
 * @param {Array} filters - Dashboard filters array (may contain dropdown options)
 * @param {Array} parameterDefs - Array of parameter definitions with dropdown options
 * @returns {string} - Display title if found, otherwise smart-named or original value
 */
function resolveDropdownTitle(paramName, value, filters, parameterDefs = []) {
  
  // First try to resolve from parameter definitions with dropdown options
  if (parameterDefs && parameterDefs.length > 0) {
    // Try direct parameter name match first
    let paramDef = parameterDefs.find(p => p.name === paramName);
    
    // If not found, try to find parameter through locals (for dashboard-level parameters)
    if (!paramDef) {
      for (const param of parameterDefs) {
        if (param.locals && param.locals.length > 0) {
          const localParam = param.locals.find(local => local.name === paramName);
          if (localParam && localParam.type === 'query') {
            paramDef = localParam;
            break;
          }
        }
      }
    }
    
    if (paramDef && paramDef.type === 'query') {
      // Check for dropdown options in various possible locations
      let dropdownOptions = paramDef.dropdownOptions || 
                           paramDef.options || 
                           (paramDef.loadedDropdownValues && paramDef.loadedDropdownValues) ||
                           null;
      
      // If no dropdown options available, try to load them synchronously
      if (!dropdownOptions && paramDef.queryId) {
        // The parentQueryId should be the query that defines this parameter, not the current dashboard query
        // For dropdown parameters, the queryId in paramDef is actually the dropdown query ID
        // We need to find the query that contains this parameter definition
        const parentQueryId = paramDef.parentQueryId || paramDef.parent_query_id || 
                             (parameterDefs.length > 0 && parameterDefs[0].query_id) || 
                             103; // Fallback to known working query ID
        dropdownOptions = loadDropdownOptionsSync(paramDef.queryId, parentQueryId);
      }
      
      // If still no dropdown options, try to extract from existing DOM elements
      if (!dropdownOptions || dropdownOptions.length === 0) {
        dropdownOptions = extractDropdownOptionsFromDOM(paramName);
      }
                             
      if (dropdownOptions && Array.isArray(dropdownOptions) && dropdownOptions.length > 0) {
        
        // Handle array values (multi-select)
        if (Array.isArray(value)) {
          if (value.length > 3) {
            // Use smart naming for large arrays
            const smartNames = {
              'workAreaId': 'All_Areas',
              'work_area_id': 'All_Areas',
              'departmentId': 'All_Depts',
              'department_id': 'All_Depts',
              'categoryId': 'All_Categories',
              'category_id': 'All_Categories'
            };
            return smartNames[paramName] || `All_${paramName.replace(/Id$/, '').replace(/_id$/, '')}`;
          }
          
          // Resolve individual values for smaller arrays
          const resolvedValues = value.map(v => {
            const option = dropdownOptions.find(opt => 
              String(opt.value) === String(v) || String(opt.id) === String(v)
            );
            const resolved = option ? sanitizeFilename(option.name || option.label || option.text) : null;
            return resolved || String(v);
          }).filter(v => v && !v.match(/^[a-f0-9]{24}$/));
          
          if (resolvedValues.length > 0) {
            return resolvedValues.join('-');
          }
        } else {
          // Handle single value
          const option = dropdownOptions.find(opt => 
            String(opt.value) === String(value) || String(opt.id) === String(value)
          );
          if (option) {
            const displayName = option.name || option.label || option.text;
            if (displayName && !displayName.match(/^[a-f0-9]{24}$/)) {
              return sanitizeFilename(displayName.replace(/\s+/g, "_"));
            }
          }
        }
      }
    }
  }
  
  // Fallback to DOM extraction as secondary approach
  const domDisplayText = getParameterDisplayFromDOM(paramName);
  if (domDisplayText && !domDisplayText.match(/^[a-f0-9]{24}$/)) {
    return domDisplayText;
  }
  
  // Try to access React component data if available
  try {
    const parameterBlock = document.querySelector(`[data-test="ParameterBlock-${paramName}"]`);
    if (parameterBlock) {
      // Look for React fiber node to access component props
      const reactKeys = Object.keys(parameterBlock).find(key => 
        key.startsWith('__reactInternalInstance') || key.startsWith('_reactInternalFiber')
      );
      
      if (reactKeys) {
        const reactNode = parameterBlock[reactKeys];
        // Try to find component props that might contain option data
        let current = reactNode;
        let attempts = 0;
        
        while (current && attempts < 10) {
          if (current.memoizedProps) {
            const props = current.memoizedProps;
            // Look for props that might contain the selected option data
            if (props.value && typeof props.value === 'string' && !props.value.match(/^[a-f0-9]{24}$/)) {
              return sanitizeFilename(props.value.replace(/\s+/g, "_"));
            }
            if (props.options && Array.isArray(props.options)) {
              const selectedOption = props.options.find(opt => 
                (opt.value === value) || (opt.id === value)
              );
              if (selectedOption && selectedOption.label) {
                return sanitizeFilename(selectedOption.label.replace(/\s+/g, "_"));
              }
            }
          }
          current = current.child || current.sibling || current.return;
          attempts++;
        }
      }
    }
  } catch (e) {
    // Ignore React access errors
  }
  
  // Handle array values (multi-select parameters)
  if (Array.isArray(value)) {
    // If it's a large array, use a summary name
    if (value.length > 3) {
      const smartNames = {
        'workAreaId': 'All_Areas',
        'work_area_id': 'All_Areas',
        'departmentId': 'All_Depts',
        'department_id': 'All_Depts',
        'categoryId': 'All_Categories',
        'category_id': 'All_Categories',
        'locationId': 'All_Locations',
        'location_id': 'All_Locations',
        'userId': 'All_Users',
        'user_id': 'All_Users',
      };
      
      const summaryName = smartNames[paramName];
      if (summaryName) {
        return summaryName;
      }
      
      return `Multiple_${paramName.replace(/Id$/, '').replace(/_id$/, '')}`;
    }
    
    // For smaller arrays, try to resolve individual items
    return value.map(v => resolveDropdownTitle(paramName, v, filters)).join('-');
  }
  
  // Try to find the parameter's options in the filters array
  const filterVariations = [
    paramName,
    `${paramName}::filter`,
    `${paramName}__filter`,
    paramName.replace(/Id$/, ''), // workAreaId -> workArea
    paramName.replace(/_id$/, ''), // work_area_id -> work_area
  ];
  
  // Look for the filter with options/values array
  for (const filterName of filterVariations) {
    const filter = (filters || []).find(f => f.name === filterName);
    if (filter) {
      // Check if filter has a values array with options
      if (filter.values && Array.isArray(filter.values)) {
        const option = filter.values.find(opt => {
          // Handle different option formats
          if (typeof opt === 'object' && opt !== null) {
            return String(opt.value || opt.id) === String(value);
          }
          return String(opt) === String(value);
        });
        
        if (option) {
          if (typeof option === 'object' && option !== null) {
            // Use label, name, or text property for display
            const displayText = option.label || option.name || option.text || option.title;
            if (displayText && displayText !== String(value)) {
              return sanitizeFilename(displayText.replace(/\s+/g, "_"));
            }
          }
        }
      }
      
      // If current value matches this filter and has a friendly display
      if (filter.current !== undefined && String(filter.current) === String(value)) {
        const displayValue = filter.friendlyName || filter.name;
        if (displayValue && displayValue !== filterName && displayValue !== String(value)) {
          return sanitizeFilename(displayValue.replace(/\s+/g, "_"));
        }
      }
    }
  }
  
  // Try to look for any filter that has this value in its options
  for (const filter of (filters || [])) {
    if (filter.values && Array.isArray(filter.values)) {
      const option = filter.values.find(opt => {
        if (typeof opt === 'object' && opt !== null) {
          return String(opt.value || opt.id) === String(value);
        }
        return String(opt) === String(value);
      });
      
      if (option && typeof option === 'object' && option !== null) {
        const displayText = option.label || option.name || option.text || option.title;
        if (displayText && displayText !== String(value)) {
          return sanitizeFilename(displayText.replace(/\s+/g, "_"));
        }
      }
    }
  }
  
  // If value looks like an ID (24-character hex string), use smart naming
  if (typeof value === 'string' && value.match(/^[a-f0-9]{24}$/)) {
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
    };
    
    const smartName = smartNames[paramName];
    if (smartName) {
      return `${smartName}_Selected`;
    }
    
    return `${paramName.replace(/Id$/, '').replace(/_id$/, '')}_Selected`;
  }
  
  // Smart naming based on common patterns for readable values
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
  };
  
  const smartName = smartNames[paramName];
  if (smartName && String(value) !== paramName) {
    return `${smartName}_${value}`;
  }
  
  // Fallback: return the original value
  return String(value);
}

/**
 * Builds parameter suffix from query parameters
 * @param {Object} queryParams - Query parameter object
 * @param {Array} filters - Dashboard filters array for title resolution
 * @param {Array} parameterDefs - Array of parameter definitions with dropdown options
 * @returns {Array} - Array of formatted parameter parts
 */
function buildActiveParamParts(queryParams, filters = [], parameterDefs = []) {
  const activeParamParts = [];
  
  if (queryParams && typeof queryParams === "object") {
    Object.keys(queryParams).forEach((p) => {
      const value = queryParams[p];
      if (value !== undefined && value !== null && value !== "") {
        const vals = Array.isArray(value) ? value : [value];
        const paramName = String(p).replace(/^p_w\d+_/, "").replace(/^p_/, "");
        if (EXCLUDED_PARAM_NAMES.includes(paramName)) {
          return;
        }
        
        // Try to resolve dropdown titles for known dropdown parameters
        let resolvedVals;
        
        // Handle the entire parameter value as a unit (important for multi-select)
        if ((paramName.includes("Id") || paramName.includes("_id")) && Array.isArray(value)) {
          // For array parameters, resolve the entire array at once
          const title = resolveDropdownTitle(paramName, value, filters, parameterDefs);
          resolvedVals = [title];
        } else {
          // Handle individual values
          resolvedVals = vals
            .filter(v => v !== null && v !== undefined)
            .map(v => {
              // Special handling for workAreaId and similar ID parameters
              if (paramName.includes("Id") || paramName.includes("_id")) {
                const title = resolveDropdownTitle(paramName, v, filters, parameterDefs);
                return title;
              }
              return formatParamValue(v);
            });
        }
        
        const joined = resolvedVals.join("-");
        
        // For dateRange param, omit the param name and use just the value for nicer filenames
        if (paramName === "dateRange") {
          activeParamParts.push(`${joined}`);
        } else if (paramName.includes("Id") || paramName.includes("_id")) {
          // For ID parameters, omit the parameter name prefix for cleaner filenames
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
          
          // Apply same dropdown title resolution as above
          let resolvedVals;
          
          // Handle array parameters consistently
          if ((paramName.includes("Id") || paramName.includes("_id")) && Array.isArray(v)) {
            const title = resolveDropdownTitle(paramName, v, filters);
            resolvedVals = [title];
          } else {
            resolvedVals = vals
              .filter(vv => vv !== null && vv !== undefined)
              .map(vv => {
                // Special handling for workAreaId and similar ID parameters
                if (paramName.includes("Id") || paramName.includes("_id")) {
                  const title = resolveDropdownTitle(paramName, vv, filters);
                  return title;
                }
                return formatParamValue(vv);
              });
          }
          
          const joined = resolvedVals.join("-");
          if (joined !== "") {
            if (paramName === "dateRange") {
              activeParamParts.push(`${joined}`);
            } else if (paramName.includes("Id") || paramName.includes("_id")) {
              // For ID parameters, omit the parameter name prefix for cleaner filenames
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
 * @param {Array} options.parameterDefs - Array of parameter definitions with dropdown options
 * @param {number} options.maxLength - Maximum filename length (default from config)
 * @returns {string} - Generated filename
 */
export function generateVisualizationFilename({ baseName, filters = [], queryParams = {}, parameterDefs = [], maxLength = FILENAME_CONFIG.maxFilenameLength, query = null }) {
  // Check if feature is enabled
  if (!FILENAME_CONFIG.enableSmartFilenames) {
    return sanitizeFilename(baseName);
  }
  
  const activeFilterParts = FILENAME_CONFIG.includeFilters ? buildActiveFilterParts(filters) : [];
  const activeParamParts = FILENAME_CONFIG.includeParameters ? buildActiveParamParts(queryParams, filters, parameterDefs) : [];
  
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