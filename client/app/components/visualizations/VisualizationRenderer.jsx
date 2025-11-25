import { isEqual, map, find, fromPairs } from "lodash";
import React, { useState, useMemo, useEffect, useRef } from "react";
import moment from "moment";
import PropTypes from "prop-types";
import useQueryResultData from "@/lib/useQueryResultData";
import useImmutableCallback from "@/lib/hooks/useImmutableCallback";
import { isDynamicDateRangeString, getDynamicDateRangeFromString } from "@/services/parameters/DateRangeParameter";
import location from "@/services/location";
import { FiltersType, filterData } from "@/components/Filters";
import { VisualizationType } from "@redash/viz/lib";
import { Renderer } from "@/components/visualizations/visualizationComponents";

function combineFilters(localFilters, globalFilters) {
  // tiny optimization - to avoid unnecessary updates
  if (localFilters.length === 0 || globalFilters.length === 0) {
    return localFilters;
  }

  return map(localFilters, localFilter => {
    const globalFilter = find(globalFilters, f => f.name === localFilter.name);
    if (globalFilter) {
      return {
        ...localFilter,
        current: globalFilter.current,
      };
    }
    return localFilter;
  });
}

function areFiltersEqual(a, b) {
  if (a.length !== b.length) {
    return false;
  }

  a = fromPairs(map(a, item => [item.name, item]));
  b = fromPairs(map(b, item => [item.name, item]));

  return isEqual(a, b);
}

export default function VisualizationRenderer(props) {
  const data = useQueryResultData(props.queryResult);
  const [filters, setFilters] = useState(() => combineFilters(data.filters, props.filters)); // lazy initialization
  const filtersRef = useRef();
  filtersRef.current = filters;

  const handleFiltersChange = useImmutableCallback(newFilters => {
    if (!areFiltersEqual(newFilters, filters)) {
      setFilters(newFilters);
      props.onFiltersChange(newFilters);
    }
  });

  // Reset local filters when query results updated
  useEffect(() => {
    handleFiltersChange(combineFilters(data.filters, props.filters));
  }, [data.filters, props.filters, handleFiltersChange]);

  // Update local filters when global filters changed.
  // For correct behavior need to watch only `props.filters` here,
  // therefore using ref to access current local filters
  useEffect(() => {
    handleFiltersChange(combineFilters(filtersRef.current, props.filters));
  }, [props.filters, handleFiltersChange]);

  const filteredData = useMemo(
    () => ({
      columns: data.columns,
      rows: filterData(data.rows, filters),
    }),
    [data, filters]
  );

  const { visualization, queryParams } = props;

  let options = { ...visualization.options };

  // define pagination size based on context for Table visualization
  if (visualization.type === "TABLE") {
    options.paginationSize = props.context === "widget" ? "small" : "default";
  }

  // Build a friendly file name that optionally appends active filters.
  // This gets consumed by Plotly's export filename helper (gd.dataset.queryName)
  // in `viz-lib/src/visualizations/chart/plotly/index.ts`.
  const baseName = (options && options.queryName) || props.queryName || visualization.name;

  function sanitizeFilename(s) {
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
          // If range is less than 1 month (<=31 days), show as N_days
          if (diffDays > 0 && diffDays <= 31) {
            return `${diffDays}_days`;
          }
        }
        return `${v.start}--${v.end}`;
      }
      // Fallback: flatten object into key-value pairs
      return Object.keys(v)
        .map(k => `${k}-${formatParamValue(v[k])}`)
        .join("-");
    }
    if (typeof v === "string") {
      return formatDynamicRangeIfNeeded(v);
    }
    return String(v);
  }

  // Convert dynamic date range keys like d_last_14_days to '14_days' or 'Last 14 days' mapped value
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



  // Build filters suffix from filters that have a current value (non empty)
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

  // Build parameter suffix from query parameters that have a value (non empty) - used for query params like p_dateRange
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
        if (joined !== "") {
          // sanitize parameter name to avoid spaces in composed filename
          const paramName = String(p).replace(/^p_w\d+_/, "").replace(/^p_/, "");
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
            activeParamParts.push(`${paramName}-${joined}`);
          }
        }
      }
    });
  } catch (e) {
    // ignore fallback errors
  }

  const paramSuffix = activeParamParts.length ? `_${activeParamParts.join("_")}` : "";
  const filterSuffix = activeFilterParts.length ? `_${activeFilterParts.join("_")}` : "";
  // Limit filename length to prevent overly long downloads (including filters)
  const MAX_FILENAME_LEN = 180;
  let fullName = sanitizeFilename(`${baseName}${filterSuffix}${paramSuffix}`);
  if (fullName.length > MAX_FILENAME_LEN) {
    fullName = fullName.substring(0, MAX_FILENAME_LEN);
  }
  options.queryName = fullName;

  return (
    <Renderer
      key={`visualization${visualization.id}`}
      type={visualization.type}
      options={options}
      data={filteredData}
      visualizationName={visualization.name}
    />
  );
}

VisualizationRenderer.propTypes = {
  visualization: VisualizationType.isRequired,
  queryResult: PropTypes.object.isRequired, // eslint-disable-line react/forbid-prop-types
  filters: FiltersType,
  onFiltersChange: PropTypes.func,
  context: PropTypes.oneOf(["query", "widget"]).isRequired,
  queryName: PropTypes.string,
  queryParams: PropTypes.object,
};

VisualizationRenderer.defaultProps = {
  filters: [],
  onFiltersChange: () => {},
  queryName: null,
  queryParams: null,
};
