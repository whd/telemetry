// vim: set ts=2 sw=2 tw=99 et:
"use strict";

ChartDisplay.prototype.plotPercentageTrend = function (elt, points, options)
{
  options = options || {};

  var labelFn = options.gfxLabelFn || function (key) { return key; };
  var preprocess = options.gfxPreprocess || function (point, data) { return data; };

  // We track the total average to make the legend appear roughly sorted
  // in the same order as each line.
  var total = 0;
  var totalsMap = {};

  var trends = {};
  for (var i = 0; i < points.length; i++) {
    var point = points[i];
    if (point.total == 0)
      continue;

    var data = preprocess(point, point.data);
    for (var key in data) {
      var trend = trends[key];
      if (!trend) {
        totalsMap[key] = 0;
        trend = (trends[key] = []);
      }

      totalsMap[key] += data[key];
      trend.push([point.start * 1000, (data[key] / point.total) * 100]);
    }
    total += point.total;
  }

  var series = [];
  for (var key in trends) {
    series.push({
      // Note: we shove the index into the label, since the legend sorting
      // function doesn't have access to the series object.
      label: labelFn(key),
      data: trends[key],

      // Custom - used in the sorted callback.
      gfxTotal: totalsMap[key],
    });
  }

  options.series = options.series || {};
  options.series.lines = options.series.lines || {};
  options.series.lines.show = true;
  options.series.points = options.series.points || {};
  options.series.points.show = true;
  options.xaxis = options.xaxis || {};
  options.xaxis.mode = 'time';
  options.xaxis.timeformat = '%b %d %Y';
  options.yaxis = options.yaxis || {};
  options.yaxis.min = options.yaxis.min || 0;
  options.yaxis.tickFormatter = options.yaxis.tickFormatter || function (num, str) {
    return num + '%';
  };
  options.legend = options.legend || {};
  options.legend.show = true;
  options.legend.container = $('#' + elt.attr('id') + '-legend');
  options.legend.sorted = function (x, y) {
    return y.series.gfxTotal - x.series.gfxTotal;
  };
  options.grid = options.grid || {};
  options.grid.hoverable = true;
  options.hooks = options.hooks || {};

  this.bindHoverDraw(elt, (function (event, pos, item) {
    var label = series[item.seriesIndex].label;
    var value = item.datapoint[1].toFixed(2);
    var date = new Date(item.datapoint[0]);
    try {
      var dateString = date.toLocaleDateString(undefined, {
        formatMatcher: 'best fit',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch (e) {
      var dateString = date.toString();
    }
    var text = 'Week of ' + dateString + '<br/>' +
               label + ': ' + value + '%';
    return text;
  }).bind(this));;

  $.plot(elt, series, options);
}

ChartDisplay.prototype.drawTrends = function ()
{
  this.prefetch([
    'trend-windows-versions.json',
    'trend-windows-compositors.json',
    'trend-windows-arch.json',
  ]);

  var winver_elt = this.prepareChartDiv(
    'windows-versions-trend',
    'Windows Versions',
    800, 300, 150);
  this.onFetch('trend-windows-versions.json', (function (obj) {
    this.plotPercentageTrend(winver_elt, obj.trend, {
      gfxLabelFn: WindowsVersionName,
      gfxPreprocess: function (point, data) {
        return CD.CollapseMap(data, point.total, 0.01, ReduceWindowsVersion);
      }.bind(this),
    });
  }).bind(this));

  var wincc_elt = this.prepareChartDiv(
    'windows-compositors-trend',
    'Windows Compositors',
    800, 300, 150);
  this.onFetch('trend-windows-compositors.json', (function (obj) {
    this.plotPercentageTrend(wincc_elt, obj.trend, {
      gfxLabelFn: function (key) {
        switch (key) {
          case 'd3d11': return 'Direct3D 11';
          case 'basic': return 'Software';
          case 'none': return 'None';
          case 'd3d9': return 'Direct3D 9';
          case 'opengl': return 'OpenGL';
        }
        return 'Unknown';
      }
    });
  }).bind(this));

  var winarch_elt = this.prepareChartDiv(
    'windows-arch-trend',
    'Firefox CPU Architecture',
    800, 300, 150);
  this.onFetch('trend-windows-arch.json', (function (obj) {
    this.plotPercentageTrend(winarch_elt, obj.trend, {
      gfxLabelFn: function (key) {
        switch (key) {
          case '32': return '32-bit Fx, Win';
          case '64': return '64-bit Fx, Win';
          case '32_on_64': return '32-bit Fx, 64-bit Win';
        }
        return key;
      }
    });
  }).bind(this));
}
