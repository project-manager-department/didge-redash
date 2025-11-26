import React from "react";
import enzyme from "enzyme";
import VisualizationRenderer from "./VisualizationRenderer";
import { Renderer as WrappedRenderer } from "@/components/visualizations/visualizationComponents";

function createQueryResult(data = {}) {
  // Provide minimal methods used by useQueryResultData
  return {
    getColumns() {
      return data.columns || [];
    },
    getData() {
      return data.rows || [];
    },
    getFilters() {
      return data.filters || [];
    },
    getUpdatedAt() {
      return Date.now();
    },
    getId() {
      return data.id || 1;
    },
  };
}

describe("VisualizationRenderer", () => {
  test("sets options.queryName that includes active filters", () => {
    const filters = [
      { name: "country", friendlyName: "Country", current: "US", values: ["US"] },
      { name: "category", friendlyName: "Category", current: ["A", "B"], values: ["A", "B"], multiple: true },
    ];

    const queryResult = createQueryResult({ columns: [], rows: [], filters });

    const visualization = { id: 123, type: "CHART", name: "Sales by Category", options: {} };

    const wrapper = enzyme.mount(
      <VisualizationRenderer visualization={visualization} queryResult={queryResult} context="query" />
    );

    // Find the wrapped Renderer component and assert its options include queryName with filters
    const renderer = wrapper.find(WrappedRenderer);
    expect(renderer.exists()).toBeTruthy();
    const opts = renderer.props().options || {};
    const queryName = opts.queryName;
    expect(typeof queryName).toBe("string");
    expect(queryName).toContain("Sales_by_Category");
    expect(queryName).toContain("country-US");
    expect(queryName).toContain("category-A-B");
  });

  test("sets options.queryName that includes query parameter values (p_ params)", () => {
    const queryResult = createQueryResult({ columns: [], rows: [], filters: [] });
    const visualization = { id: 123, type: "CHART", name: "Cost - Forms - Count Submissions Daily", options: {} };
    const params = { dateRange: "d_last_14_days" };
    const wrapper = enzyme.mount(
      <VisualizationRenderer visualization={visualization} queryResult={queryResult} context="query" queryParams={params} />
    );

    const renderer = wrapper.find(WrappedRenderer);
    expect(renderer.exists()).toBeTruthy();
    const opts = renderer.props().options || {};
    const queryName = opts.queryName;
    expect(typeof queryName).toBe("string");
    expect(queryName).toContain("Cost_-_Forms_-_Count_Submissions_Daily");
    expect(queryName).toContain("14_days");
  });

  test("does not include p_workAreaId in filename", () => {
    const queryResult = createQueryResult({ columns: [], rows: [], filters: [] });
    const visualization = { id: 123, type: "CHART", name: "Sales by Category", options: {} };
    const params = { dateRange: "d_last_14_days", workAreaId: "12345" };
    const wrapper = enzyme.mount(
      <VisualizationRenderer visualization={visualization} queryResult={queryResult} context="query" queryParams={params} />
    );
    const renderer = wrapper.find(WrappedRenderer);
    expect(renderer.exists()).toBeTruthy();
    const opts = renderer.props().options || {};
    const queryName = opts.queryName;
    expect(queryName).toContain("dateRange-14_days");
    expect(queryName).not.toContain("workAreaId-12345");
  });

  test("sets options.queryName that formats object param values (start/end) correctly (short ranges -> N_days)", () => {
    const queryResult = createQueryResult({ columns: [], rows: [], filters: [] });
    const visualization = { id: 123, type: "CHART", name: "Cost - Forms - Count Submissions Daily", options: {} };
    const params = { dateRange: { start: "2025-11-11 00:00:00", end: "2025-11-25 23:59:00" } };
    const wrapper = enzyme.mount(
      <VisualizationRenderer visualization={visualization} queryResult={queryResult} context="query" queryParams={params} />
    );

    const renderer = wrapper.find(WrappedRenderer);
    expect(renderer.exists()).toBeTruthy();
    const opts = renderer.props().options || {};
    const queryName = opts.queryName;
    expect(typeof queryName).toBe("string");
    expect(queryName).toContain("Cost_-_Forms_-_Count_Submissions_Daily");
    expect(queryName).toContain("dateRange-14_days");
  });

  test("keeps explicit time-of-day ranges as start--end", () => {
    const queryResult = createQueryResult({ columns: [], rows: [], filters: [] });
    const visualization = { id: 123, type: "CHART", name: "Cost - Forms - Count Submissions Daily", options: {} };
    const params = { dateRange: { start: "2025-11-12 14:41", end: "2025-11-13 14:41" } };
    const wrapper = enzyme.mount(
      <VisualizationRenderer visualization={visualization} queryResult={queryResult} context="query" queryParams={params} />
    );

    const renderer = wrapper.find(WrappedRenderer);
    expect(renderer.exists()).toBeTruthy();
    const opts = renderer.props().options || {};
    const queryName = opts.queryName;
    expect(typeof queryName).toBe("string");
    // Should not be collapsed to N_days -- should include explicit start/end
    expect(queryName).toContain("12-11-2025_14-41--13-11-2025_14-41");
  });

  test("excludes workAreaId from filename", () => {
    const queryResult = createQueryResult({ columns: [], rows: [], filters: [] });
    const visualization = { id: 123, type: "CHART", name: "Cost - Forms - Count Submissions Daily", options: {} };
    const params = { workAreaId: 123, dateRange: "d_last_7_days" };
    const wrapper = enzyme.mount(
      <VisualizationRenderer visualization={visualization} queryResult={queryResult} context="query" queryParams={params} />
    );
    const renderer = wrapper.find(WrappedRenderer);
    const opts = renderer.props().options || {};
    const queryName = opts.queryName;
    expect(queryName).not.toContain("workAreaId");
    expect(queryName).toContain("dateRange-7_days");
  });
});