import * as Plotly from "plotly.js";

import "./locales"
import prepareData from "./prepareData";
import prepareLayout from "./prepareLayout";
import updateData from "./updateData";
import updateAxes from "./updateAxes";
import updateChartSize from "./updateChartSize";
import { prepareCustomChartData, createCustomChartRenderer } from "./customChartUtils";

// @ts-expect-error ts-migrate(2339) FIXME: Property 'setPlotConfig' does not exist on type 't... Remove this comment to see the full error message
Plotly.setPlotConfig({
  modeBarButtonsToRemove: ["sendDataToCloud", "toImage"],
  modeBarButtonsToAdd: ["togglespikelines", "v1hovermode", {
    name: 'download-png',
    title: 'Download plot as PNG',
    icon: Plotly.Icons.camera,
    click: (gd: any) => {
      const filename = gd.dataset.queryName || gd.dataset.visualizationName || 'chart';
      Plotly.downloadImage(gd, { format: 'png', filename, width: gd._fullLayout.width, height: gd._fullLayout.height });
    }
  }],
  locale: window.navigator.language,
});

export {
  Plotly,
  prepareData,
  prepareLayout,
  updateData,
  updateAxes,
  updateChartSize,
  prepareCustomChartData,
  createCustomChartRenderer,
};
