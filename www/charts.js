// vim: set ts=2 sw=2 tw=99 et:
var USE_S3_FOR_CHART_DATA = false;

function ChartController(app)
{
  this.app = app;
  this.activeHover = null;
  this.data = {};
}

ChartController.prototype.clear = function()
{
  this.removeHover();
  
  // Clear callbacks for XHR.
  for (var key in this.data) {
    var state = this.data[key];
    if (state.callbacks)
      state.callbacks = [];
  }

  $("#viewport").empty();
}

ChartController.prototype.removeHover = function()
{
  if (!this.activeHover)
    return;
  this.activeHover.remove();
  this.activeHover = null;
}

ChartController.prototype.prepareChartDiv = function (id, title, width, height)
{
  var elt = $('<div/>', {
    id: id,
    width: width,
    height: height
  });
  $('#viewport').append(
    $('<h4></h4>').text(title)
  );
  $('#viewport').append(elt);
  $('#viewport').append($('<br>'));
  $('#viewport').append($('<br>'));
  return elt;
}

ChartController.prototype.drawChart = function (type, elt, data, aOptions)
{
  aOptions = aOptions || {};

  if (type == 'pie')
    return this.drawPieChart(elt, data);

  var options = {
    series: {},
    legend: {
      show: true,
    },
    grid: {
      hoverable: true,
      clickable: true,
    }
  };

  var dataset = [];
  switch (type) {
  case 'bar':
    dataset.push(data.series);
    options.series.bars = {
      show: true,
      align: 'center',
      barWidth: 0.6,
      fill: true,
      lineWidth: 0,
      fillColor: 'rgb(155,200,123)',
    };

    var ticks = [];
    for (var i = 0; i < data.labels.length; i++)
      ticks.push([i, data.labels[i]]);
    options.xaxis = {
      ticks: ticks,
    };

    options.yaxis = {};
    options.yaxis.tickFormatter = data.formatter;
    break;
  };

  // Merge custom options.
  for (var key in aOptions) {
    if (typeof(aOptions[key]) != 'object')
      continue;
    for (var subkey in aOptions[key])
      options[key][subkey] = aOptions[key][subkey];
  }

  $.plot(elt, dataset, options);
  elt.bind('plothover', (function (event, pos, obj) {
    if (!obj) {
      this.removeHover();
      return;
    }
    if (this.activeHover) {
      if (this.activeHover.id == event.target && this.activeHover.label == obj.seriesIndex)
        return;
      this.removeHover();
    }

    var item = data.labels[obj.dataIndex];
    var value = data.series[obj.dataIndex][1];
    var text = item + " - " + data.formatter(value.toFixed(2));

    this.activeHover = new ToolTip(event.target, obj.seriesIndex, text);
    this.activeHover.draw(pos.pageX, pos.pageY);
  }).bind(this));
}

ChartController.prototype.drawPieChart = function(elt, data)
{
  data.sort(function(a, b) {
    return b.data - a.data;
  });
  var percentages = {};
  var total = 0;
  for (var i = 0; i < data.length; i++)
    total += data[i].data;
  for (var i = 0; i < data.length; i++)
    percentages[data[i].label] = ((data[i].data / total) * 100).toFixed(1);

  var options = {
    series: {
      pie: {
        show: true,
        label: {
          show: false,
        },
      },
    },
    legend: {
      show: true,
      labelFormatter: function(label, series) {
        return label + ' - ' + percentages[label] + '%';
      },
    },
    grid: {
      hoverable: true,
      clickable: true,
    }
  };

  $.plot(elt, data, options);
  elt.bind('plothover', (function (event, pos, obj) {
    if (!obj) {
      this.removeHover();
      return;
    }
    if (this.activeHover) {
      if (this.activeHover.id == event.target && this.activeHover.label == obj.seriesIndex)
        return;
      this.removeHover();
    }

    var label = data[obj.seriesIndex].label;
    var text = label + " - " + percentages[label] + "% (" + data[obj.seriesIndex].data + " sessions)";

    this.activeHover = new ToolTip(event.target, obj.seriesIndex, text);
    this.activeHover.draw(pos.pageX, pos.pageY);
  }).bind(this));
}

ChartController.prototype.drawTable = function(selector, devices)
{
  var GetDeviceName = function(device) {
    if (device in PCIDeviceMap)
      return PCIDeviceMap[device];
    var parts = device.split('/');
    if (parts.length == 2)
      return LookupVendor(parts[0]) + ' ' + parts[1];
    return device;
  }

  var device_list = [];
  var total = 0;
  for (var device in devices) {
    total += devices[device];
    device_list.push({
      name: GetDeviceName(device),
      count: devices[device]
    });
  }
  device_list.sort(function(a, b) {
    return b.count - a.count;
  });

  var table = $('<table></table>');
  for (var i = 0; i < device_list.length; i++) {
    var row = $('<tr></tr>');
    row.append($('<td>' + device_list[i].name + '</td>'));
    row.append($('<td>' + ((device_list[i].count / total) * 100).toFixed(2) + '%</td>'));
    row.append($('<td>(' + device_list[i].count + ')</td>'));
    table.append(row);
  }
  $(selector).append(table);
}

ChartController.prototype.ensureData = function (key, callback)
{
  if (key in this.data && this.data[key].obj)
    return this.data[key].obj;

  var state = this.data[key];
  if (!state) {
    state = {
      callbacks: [],
      obj: null,
    };
    this.data[key] = state;
  }

  state.callbacks.push(callback);

  var prefix = (USE_S3_FOR_CHART_DATA && key != 'snapshots.json') || key == 'device-statistics.json'
               ? 'https://analysis-output.telemetry.mozilla.org/gfx-telemetry/data/'
               : 'data/';

  $.ajax({
    url: prefix + key,
    dataType: 'json',
  }).done(function (data) {
    state.obj = (typeof data == 'string')
                ? JSON.parse(data)
                : data;

    var callbacks = state.callbacks;
    state.callbacks = null;

    for (var i = 0; i < callbacks.length; i++)
      callbacks[i](state.obj);
  });
}

// Combine unknown keys into one key, aggregating it.
ChartController.prototype.reduce = function (data, combineKey, threshold, callback)
{
  var total = 0;
  for (var key in data)
    total += data[key];

  var copy = {};
  if (combineKey in data)
    copy[combineKey] = data[combineKey];

  for (var key in data) {
    if ((!callback || callback(key)) && (data[key] / total >= threshold))
      copy[key] = data[key];
    else if (key != combineKey)
      copy[combineKey] = (copy[combineKey] | 0) + data[key];
  }
  return copy;
}

// Re-aggregate a dictionary based on a key transformation.
ChartController.prototype.mapToKeyedAgg = function (data, keyfn, labelfn)
{
  var out = {};
  for (var key in data) {
    var new_key = keyfn(key);
    if (new_key in out)
      out[new_key].count += data[key];
    else
      out[new_key] = { count: data[key], label: labelfn(key) };
  }
  return out;
}

// Reduce a keyed aggregation based on a threshold.
ChartController.prototype.reduceAgg = function (data, threshold, combineKey, combineLabel)
{
  var total = 0;
  for (var key in data)
    total += data[key].count;

  var out = {};
  for (var key in data) {
    if (data[key].count / total < threshold) {
      if (combineKey in out) {
        out[combineKey].count += data[key].count;
      } else {
        out[combineKey] = {
          count: data[key].count,
          label: combineLabel,
        };
      }
    } else {
      out[key] = data[key];
    }
  }
  return out;
}

ChartController.prototype.aggToSeries = function (data)
{
  var series = [];
  for (var key in data) {
    series.push({
      key: key,
      label: data[key].label,
      data: data[key].count,
    });
  }
  return series;
}

ChartController.prototype.createOptionList = function (map, namer)
{
  var list = [];
  for (var key in map)
    list.push([key, namer ? namer(key) : key]);
  list.sort(function (item1, item2) {
    var a = item1[1];
    var b = item2[1];
    if (a < b)
      return -1;
    if (a > b)
      return 1;
    return 0;
  });

  var options = [];
  for (var i = 0; i < list.length; i++) {
    options.push({
      value: list[i][0],
      text: list[i][1],
    });
  }
  return options;
}

ChartController.prototype.listToSeries = function (input, namer)
{
  var series = [];
  for (var i = 0; i < input.length; i++) {
    series.push({
      label: namer(i),
      data: input[i],
    });
  }
  return series;
};

ChartController.prototype.mapToSeries = function (input, namer)
{
  var series = [];
  for (var key in input) {
    series.push({
      label: namer ? namer(key) : key,
      data: input[key],
    });
  }
  return series;
};

ChartController.prototype.toPercent = function (val)
{
  return parseFloat((val * 100).toFixed(2));
}

ChartController.prototype.drawSampleInfo = function (obj)
{
  var info_div = $("<div/>")
    .hide();

  var chart_div = $('<div/>', {
    id: 'session-source-info',
    width: 300,
    height: 150
  });

  var renderInfo = (function () {
    var series = this.mapToSeries(obj.sessions.share, function (key) {
      return "Firefox " + key;
    });
    this.drawPieChart(chart_div, series);
  }).bind(this);

  var href = $("<a>")
    .text("Click to show sample information.")
    .attr('href', '#')
    .click((function (e) {
      e.preventDefault();

      if (info_div.is(":visible")) {
        info_div.hide();
        href.text('Click to show sample information.');
      } else {
        info_div.show();
        renderInfo();
        href.text('Click to hide sample information.');
      }
    }).bind(this));

  $("#viewport").append(
      $("<p></p>").append(
        $("<strong></strong>").append(href)
      ),
      info_div
  );

  var blobs = [];
  for (var i = 0; i < obj.sessions.metadata.length; i++) {
    var md = obj.sessions.metadata[i].info;
    var channel = (md.channel == '*')
                  ? 'all'
                  : md.channel;
    var text = channel + ' (';
    if (md.day_range)
      text += md.day_range + ' days of sessions';
    else
      text += 'builds from the last ' + md.build_range + ' days';
    text += ')';
    blobs.push(text);
  }

  var sourceText = (new Date(obj.sessions.timestamp * 1000)).toLocaleDateString() +
                   ', channels: ' + blobs.join(', ');

  info_div.append(
      $("<p></p>").append(
        $("<strong></strong>").text("Size: ")
      ).append(
        $("<span></span>").text(obj.sessions.count.toLocaleString() + " sessions")
      ),
      $("<p></p>").append(
        $("<strong></strong>").text("Source: ")
      ).append(
        $("<span></span>").text(sourceText)
      ),
      $('<h4></h4>').text('Sample Makeup'),
      $('<br>'),
      $('<br>'),
      chart_div
  );
};

ChartController.prototype.drawGeneral = function ()
{
  var obj = this.ensureData('general-statistics.json', this.drawGeneral.bind(this));
  if (!obj)
    return;

  if ('all' in obj) {
    obj.byFx = {};
    obj.byFx['all'] = obj.all;
    obj.byFx['39'] = obj['39'];
    obj.byFx['40'] = obj['40'];
    obj.byFx['41'] = obj['41'];
    obj.byFx['42'] = obj['42'];
    obj.byFx['43'] = obj['43'];
  }

  var options = this.createOptionList(obj.byFx, function (key) {
    if (key == 'all')
      return 'All';
    return "Firefox " + key;
  });
  var filter = this.app.addFilter(
    'fxversion',
    'Firefox Version',
    options,
    this.app.refresh.bind(this.app),
    'all');

  var subset = null;
  if (filter.val() == 'all') {
    subset = obj.all || obj.byFx.all;
    this.drawSampleInfo(obj);
  } else {
    subset = obj.byFx[filter.val()];
    var total = 0;
    for (var key in subset.os)
      total += subset.os[key];
    $('#viewport').append(
      $('<p></p>').append(
        $('<strong></strong>').text('Total sessions: '),
        $('<span></span>').text(total.toLocaleString()),
        $('<span></span>').text(' (out of ' + obj.sessions.count.toLocaleString() + ' sampled)')
      )
    );
  }

  var elt = this.prepareChartDiv('os-share', 'Operating System Usage', 600, 300);
  this.drawPieChart(elt, [
      { label: "Windows", data: parseInt(subset.os['Windows']) },
      { label: "Linux", data: parseInt(subset.os['Linux']) },
      { label: "OS X", data: parseInt(subset.os['Darwin']) },
  ]);

  if (filter.val() == 'all') {
    var elt = this.prepareChartDiv('fx-share', 'Firefox Version Usage', 600, 300);
    var fx_series = this.mapToSeries(obj.sessions.share, function (key) {
      return "Firefox " + key;
    });
    this.drawPieChart(elt, fx_series);
  }

  var vendors = this.reduce(subset.vendors, 'Unknown', 0, function(key) {
    return key in VendorMap;
  });

  var elt = this.prepareChartDiv('vendor-share', 'Device Vendor Usage', 600, 300);
  var vendor_series = this.mapToSeries(vendors, LookupVendor);
  this.drawPieChart(elt, vendor_series);

  var windows = this.reduce(subset.windows, 'Other', 0.005, function(key) {
    return WindowsVersionName(key) != 'Unknown';
  });
  var elt = this.prepareChartDiv('winver-share', 'Windows Usage', 700, 300);
  var winver_series = this.mapToSeries(windows, function (key) {
    if (key == 'Other')
      return key;
    return WindowsVersionName(key);
  });
  this.drawPieChart(elt, winver_series);

  // Everything else is specific to the "all" category.
  if (filter.val() != 'all')
    return;

  var DeviceView = function(parent, data, prop, title) {
    this.parent = parent;
    this.prop = prop;
    this.source = data;
    this.data = parent.mapToKeyedAgg(this.source,
      function (key) { return DeviceKeyToPropKey(key, prop); },
      function (key) { return DeviceKeyToPropLabel(key, prop); }
    );
    this.data = parent.reduceAgg(this.data, 0.005, 'other', 'Other');
    this.series = parent.aggToSeries(this.data);
    this.current = this.series;
    this.elt = parent.prepareChartDiv('device-' + prop, title, 1000, 500);
  };
  DeviceView.prototype.aggToSeries = function (data) {
  };
  DeviceView.prototype.render = (function() {
    this.elt.unbind('plothover');
    this.elt.unbind('plotclick');
    this.parent.drawPieChart(this.elt, this.current);
    this.elt.bind('plotclick', (function (event, pos, obj) {
      if (!obj)
        this.unzoom();
      else if (this.series == this.current)
        this.zoom(obj);
      this.render();
    }).bind(this));
  });
  DeviceView.prototype.zoom = (function (obj) {
    var zoom_key = this.series[obj.seriesIndex].key;

    var map = {};
    for (device_key in this.source) {
      var xkey = DeviceKeyToPropKey(device_key, this.prop);
      if (zoom_key == 'other') {
        if (xkey in this.data)
          continue;
      } else {
        if (xkey != zoom_key)
          continue;
      }
      map[device_key] = this.source[device_key];
    }
    map = this.parent.reduce(map, 'Other', 0.005);
    this.current = this.parent.mapToSeries(map, function (key) {
      return GetDeviceName(key);
    });
  });
  DeviceView.prototype.unzoom = (function () {
    this.current = this.series;
  });

  var dev_gen = new DeviceView(this, obj.devices, 'gen', 'Device Generations');
  var dev_chipsets = new DeviceView(this, obj.devices, 'chipset', 'Device Chipsets');
  dev_gen.render();
  dev_chipsets.render();
}

ChartController.prototype.drawCrashReports = function (inReports)
{
  var reports = [];
  for (var i = 0; i < inReports.length; i++) {
    if (!inReports[i].date)
      continue;
    if (!inReports[i].timestamp)
      inReports[i].timestamp = Date.parse(inReports[i].date);
    reports.push(inReports[i]);
  }
  reports.sort(function (a, b) {
    return b.timestamp - a.timestamp;
  });

  $('#viewport').append(
    $("<h2></h2>").text("Crash Reports")
  );

  for (var i = 0; i < reports.length; i++) {
    var report = reports[i];
    var date = new Date(report.date);
    $('#viewport').append(
      $("<p></p>").append(
        $("<strong></strong>").text("Date: "),
        $("<span></span>").text(date.toLocaleDateString())
      )
    );

    var ul = $('<ul></ul>');

    var ostext = (report.os.name in OSMap
                 ? OSMap[report.os.name]
                 : report.os.name);
    if (report.os.version) {
      ostext += " " + report.os.version;
      if (report.os.servicePack)
        ostext += " (SP " + report.os.servicePack + ")";
    } else {
      ostext += " (unknown version)";
    }
    ul.append($('<li></li>').text("Operating System: " + ostext));

    var build = $('<li></li>').text("Build:");
    build.append(
      $('<ul></ul>').append(
        $('<li></li>').text('Version: ' + report.build.version),
        $('<li></li>').text('Revision: ').append(
          $('<a>').text(report.build.revision)
                  .attr('href', report.build.revision)
        )
      )
    );
    ul.append(build);

    var adapter = $('<ul></ul>');
    var vendorText = report.adapter.vendorID;
    if (report.adapter.vendorID in VendorMap)
      vendorText += " (" + VendorMap[report.adapter.vendorID] + ")";
    else
      vendorText += " (unknown vendor)";
    var deviceText = report.adapter.deviceID;
    var fullDeviceID = report.adapter.vendorID + "/" + report.adapter.deviceID;
    if (fullDeviceID in PCIDeviceMap)
      deviceText += " (" + PCIDeviceMap[fullDeviceID] + ")";
    else
      deviceText += " (not in PCI database)";

    adapter.append(
      $('<li></li>').text('Description: ' + report.adapter.description),
      $('<li></li>').text('Vendor: ' + vendorText),
      $('<li></li>').text('Device: ' + deviceText),
      $('<li></li>').text('Driver: ' +
                           report.adapter.driverVersion +
                           ' (date: ' + report.adapter.driverDate + ')'),
      $('<li></li>').text('Subsystem ID: ' + report.adapter.subsysID),
      $('<li></li>').text('RAM: ' + (report.adapter.RAM ? report.adapter.RAM : "unknown"))
    );
    ul.append($('<li></li>').text('Adapter:').append(adapter));

    if (report.snapshot) {
      var canvas = $('<canvas></canvas>');
      var ctx = canvas[0].getContext('2d');
      var image = new Image();
      image.src = report.snapshot;
      ctx.drawImage(image, 0, 0);
      ul.append($('<li></li>').text('Snapshot:').append(canvas));
    }

    $('#viewport').append(ul);
  }
};

ChartController.prototype.drawMonitors = function ()
{
  var obj = this.ensureData('monitor-statistics.json', this.drawMonitors.bind(this));
  if (!obj)
    return;

  this.drawSampleInfo(obj);

  var counts = this.reduce(obj.counts, 'Other', 0.005);
  var refreshRates = this.reduce(obj.refreshRates, 'Other', 0.01);
  var resolutions = this.reduce(obj.resolutions, 'Other', 0.01);

  var largest_width = 0;
  var largest_height = 0;
  var largest_total = 0, largest_total_str;
  for (var resolution in resolutions) {
    var tuple = resolution.split('x');
    if (tuple.length != 2)
      continue;
    if (parseInt(tuple[0]) > largest_width)
      largest_width = parseInt(tuple[0]);
    if (parseInt(tuple[1]) > largest_height)
      largest_height = parseInt(tuple[1]);
    var pixels = parseInt(tuple[0]) * parseInt(tuple[1]);
    if (pixels > largest_total) {
      largest_total = pixels;
      largest_total_str = resolution;
    }
  }

  var res_text = largest_total_str + " " +
                 "(largest width: " + largest_width + ", " +
                 "largest height: " + largest_height + ")";

  $('#viewport').append(
    $("<p></p>").append(
      $("<strong></strong>").text("Largest resolution "),
      $("<span></span>").text(res_text)
    )
  );

  var elt = this.prepareChartDiv('monitor-counts', 'Number of Monitors', 600, 300);
  var series = this.mapToSeries(counts,
    function (key) {
      if (parseInt(key))
        return key + " monitor" + ((key > 1) ? "s" : "");
      return key;
    }
  );
  this.drawPieChart(elt, series);

  var elt = this.prepareChartDiv('refresh-rates', 'Refresh Rates', 600, 300);
  var series = this.mapToSeries(refreshRates,
    function (key) {
      if (parseInt(key))
        return key + 'hz';
      return key;
    }
  );
  this.drawPieChart(elt, series);

  var elt = this.prepareChartDiv('resolutions', 'Resolutions', 600, 300);
  var series = this.mapToSeries(resolutions,
    function (key) {
      return key;
    }
  );
  this.drawPieChart(elt, series);
};

ChartController.prototype.drawWindowsFeatures = function ()
{
  var obj = this.ensureData('windows-features.json', this.drawWindowsFeatures.bind(this));
  if (!obj)
    return;

  var options = this.createOptionList(obj.byVersion, WindowsVersionName);
  options.unshift({
    value: 'all',
    text: 'All',
  });
  var filter = this.app.addFilter(
    'winver',
    'Windows Version',
    options,
    this.app.refresh.bind(this.app),
    'all');

  this.drawSampleInfo(obj);

  var source;
  if (filter.val() == 'all') {
    source = obj.all;

    // When there is no filter, draw a general Windows breakdown for this
    // data set to help users narrow down the filter further.
    var elt = this.prepareChartDiv(
      'windows-versions',
      'Windows Versions',
      600, 300);

    var winvers = {};
    for (var key in obj.byVersion)
      winvers[key] = obj.byVersion[key].count;
    winvers = this.reduce(winvers, 'Other', 0.01, function(key) {
      return WindowsVersionName(key) != 'Unknown';
    });

    var series = this.mapToSeries(winvers, WindowsVersionName);
    this.drawPieChart(elt, series);
  } else {
    source = obj.byVersion[filter.val()];

    var info_leader = WindowsVersionName(filter.val()) + " sessions:";
    var info_text = " " + source.count +
                    " (" +
                    this.toPercent(source.count / obj.sessions.count) + "% of sessions)";

    $('#viewport').append(
      $("<p></p>").append(
        $("<strong></strong>").text(info_leader),
        $("<span></span>").text(info_text)
      )
    );
  }

  var elt = this.prepareChartDiv(
    'compositors',
    'Compositor Usage',
    600, 300);
  var series = this.mapToSeries(source.compositors,
    function (key) {
      return key;
    });
  this.drawPieChart(elt, series);

  // Everything else is Windows Vista+.
  if (!('d3d11' in source))
    return;

  // We don't care about the 'unused' status.
  delete source.d3d11['unused'];

  var elt = this.prepareChartDiv(
    'd3d11-breakdown',
    'Direct3D11 Support',
    600, 300);
  var series = this.mapToSeries(source.d3d11,
    function (key) {
      if (key in D3D11StatusCode)
        return D3D11StatusCode[key];
      return key.charAt(0).toUpperCase() + key.substring(1);
    });
  this.drawPieChart(elt, series);

  var elt = this.prepareChartDiv(
    'd2d-breakdown',
    'Direct2D Support',
    600, 300);
  var series = this.mapToSeries(source.d2d,
    function (key) {
      if (key in D2DStatusCode)
        return D2DStatusCode[key];
      return key.charAt(0).toUpperCase() + key.substring(1);
    });
  this.drawPieChart(elt, series);

  if (Object.keys(source.warp).length > 0) {
    var elt = this.prepareChartDiv('warp-breakdown', 'WARP Fallback Reasons', 600, 300);
    var series = this.mapToSeries(source.warp);
    this.drawPieChart(elt, series);
  }

  var elt = this.prepareChartDiv(
    'texture-sharing-breakdown',
    'Direct3D11 Texture Sharing',
    600, 300);
  var series = this.mapToSeries(source.textureSharing,
    function (key) {
      return (key == "true") ? "Works" : "Doesn't work";
    });
  this.drawPieChart(elt, series);
}

ChartController.prototype.drawStartupData = function ()
{
  var obj = this.ensureData('startup-test-statistics.json', this.drawStartupData.bind(this));
  if (!obj)
    return;

  this.drawSampleInfo(obj);

  var sanityTestInfoText =
    obj.startupTestPings + " (" +
    this.toPercent(obj.startupTestPings / obj.sessions.count) + "% " +
    "of sessions)";

  $("#viewport").append(
      $("<p></p>").append(
        $("<strong></strong>").text("Number of sessions with startup guards: ")
      ).append(
        $("<span></span>").text(sanityTestInfoText)
      )
  );

  var elt = this.prepareChartDiv(
    'startup-test-results',
    'Sanity test results',
    600, 300);
  var series = this.listToSeries(obj.results,
    function (index) {
      return StartupTestCode[index];
    }
  );
  this.drawPieChart(elt, series);

  this.drawCrashReports(obj.reports);
}

ChartController.prototype.drawSnapshots = function ()
{
  var obj = this.ensureData('snapshots.json', this.drawSnapshots.bind(this));
  if (!obj)
    return;

  var startAt = this.app.getParam('startAt', 0) | 0;
  var slice = obj.slice(startAt, startAt + 500);

  this.drawCrashReports(slice);
}

ChartController.prototype.drawTestCrashes = function ()
{
  var obj = this.ensureData('sanity-test-crash-reports.json', this.drawTestCrashes.bind(this));
  if (!obj)
    return;

  this.drawSampleInfo(obj);

  var sanityTestInfoText =
    obj.sanityTestPings + " (" +
    this.toPercent(obj.sanityTestPings / obj.sessions.count) + "% " +
    "of sessions)";
  var crashInfoText =
    obj.reports.length + " (" +
    this.toPercent(obj.reports.length / obj.sanityTestPings) + "% " +
    "of sanity test runs)";

  $("#viewport").append(
      $("<p></p>").append(
        $("<strong></strong>").text("Number of sanity tests attempted: ")
      ).append(
        $("<span></span>").text(sanityTestInfoText)
      ),
      $("<p></p>").append(
        $("<strong></strong>").text("Number of sanity test crashes: ")
      ).append(
        $("<span></span>").text(crashInfoText)
      )
  );

  this.drawCrashReports(obj.reports);
}

ChartController.prototype.drawSanityTests = function ()
{
  var obj = this.ensureData('sanity-test-statistics.json', this.drawSanityTests.bind(this));
  if (!obj)
    return;

  var optionMap = {
    'vista': 'Windows Vista+',
    'xp': 'Windows XP',
  };
  var options = this.createOptionList(optionMap, function (key) {
    return optionMap[key];
  });
  var filter = this.app.addFilter(
    'category',
    'OS Category',
    options,
    this.app.refresh.bind(this.app),
    'vista');

  var subset;
  if (filter.val() == 'xp')
    subset = obj.windowsXP;
  else
    subset = obj.windows;

  this.drawSampleInfo(obj);

  var infoText = subset.sanityTestPings + " (" +
                 this.toPercent(subset.sanityTestPings / subset.totalPings) + "% of sessions)";

  $("#viewport").append(
      $("<p></p>").append(
        $("<strong></strong>").text("Number of sanity tests attempted: ")
      ).append(
        $("<span></span>").text(infoText)
      )
  );

  var elt = this.prepareChartDiv(
    'sanity-test-results',
    'Sanity Test results',
    600, 300);
  var series = this.mapToSeries(subset.results,
    function (key) {
      return SanityTestCode[parseInt(key)];
    }
  );
  this.drawPieChart(elt, series);

  /*
  var elt = this.prepareChartDiv(
    'sanity-test-reasons',
    'Sanity Test triggers',
    600, 300);
  var series = this.listToSeries(obj.reasons,
    function (index) {
      return SanityTestReason[index];
    }
  );
  this.drawPieChart(elt, series);
  */

  for (var i = 0; i < subset.byOS.length; i++) {
    var key = subset.byOS[i][0];
    var data = subset.byOS[i][1];
    var elt = this.prepareChartDiv(
      'sanity-test-by-os-' + key,
      SanityTestCode[key] + ', by Operating System',
      600, 300);
    var series = this.mapToSeries(data,
      function (key) {
        return WindowsVersionName(key);
      });
    this.drawPieChart(elt, series);
  }

  for (var i = 0; i < subset.byVendor.length; i++) {
    var key = subset.byVendor[i][0];
    var data = subset.byVendor[i][1];
    var elt = this.prepareChartDiv(
      'sanity-test-by-vendor-' + key,
      SanityTestCode[key] + ', by Graphics Vendor',
      600, 300);
    var series = this.mapToSeries(data,
      function (key) {
        return GetVendorName(key);
      });
    this.drawPieChart(elt, series);
  }

  for (var i = 0; i < subset.byDevice.length; i++) {
    var key = subset.byDevice[i][0];
    var data = subset.byDevice[i][1];
    var elt = this.prepareChartDiv(
      'sanity-test-by-device-' + key,
      SanityTestCode[key] + ', by Graphics Device',
      800, 300);
    var series = this.mapToSeries(data,
      function (key) {
        return GetDeviceName(key);
      });
    this.drawPieChart(elt, series);
  }

  for (var i = 0; i < subset.byDriver.length; i++) {
    var key = subset.byDriver[i][0];
    var data = subset.byDriver[i][1];
    var elt = this.prepareChartDiv(
      'sanity-test-by-driver-' + key,
      SanityTestCode[key] + ', by Graphics Driver',
      600, 300);
    var series = this.mapToSeries(data,
      function (key) {
        return GetDriverName(key);
      });
    this.drawPieChart(elt, series);
  }
}

ChartController.prototype.drawTDRs = function ()
{
  var obj = this.ensureData('tdr-statistics.json', this.drawTDRs.bind(this));
  if (!obj)
    return;

  this.drawSampleInfo(obj);

  var totalTDRs = 0;
  for (var i = 0; i < obj.results.length; i++)
    totalTDRs += obj.results[i];

  var avgUsers = ((obj['tdrPings'] / obj.sessions.count) * 100).toFixed(2);
  var avgTDRs = (totalTDRs / obj['tdrPings']).toFixed(1);

  $("#viewport").append(
      $("<p></p>").append(
        $("<strong></strong>").text("Percentage of sessions with TDRs: ")
      ).append(
        $("<span></span>").text(avgUsers + '%')
      ),
      $("<p></p>").append(
        $("<strong></strong>").text("Average number of TDRs per TDR-affected user: ")
      ).append(
        $("<span></span>").text(avgTDRs)
      )
  );

  var elt = this.prepareChartDiv('tdr-reasons', 'TDR Reason Breakdown', 600, 300);
  var series = this.listToSeries(obj.results,
    function (reason) {
      return DeviceResetReason[reason];
    });
  this.drawPieChart(elt, series);

  // Combine the TDR breakdown into a single map of vendor => count.
  var combinedMap = {};
  for (var i = 0; i < obj.reasonToVendor.length; i++) {
    var item = obj.reasonToVendor[i];
    var reason = item[0];
    var map = item[1];

    if (!reason || reason > DeviceResetReason.length)
      continue;

    for (var key in map) {
      if (key in combinedMap)
        combinedMap[key] += map[key];
      else
        combinedMap[key] = map[key];
    }
  }

  // Draw the pie chart for the above analysis.
  var elt = this.prepareChartDiv('tdr-vendors', 'TDRs by Vendor', 600, 300);
  var tdrs = [];
  for (var vendor in map) {
    if (!(vendor in VendorMap))
      continue;
    var vendorName = (vendor in VendorMap)
                     ? VendorMap[vendor]
                     : "Unknown vendor " + vendor;
    tdrs.push({
      label: vendorName,
      data: map[vendor],
    });
  }
  this.drawPieChart(elt, tdrs);

  // Draw the vendor -> reason charts.
  for (var i = 0; i < obj.vendorToReason.length; i++) {
    var vendor = obj.vendorToReason[i][0];
    if (!IsMajorVendor(vendor))
      continue;

    var elt = this.prepareChartDiv('tdr-reason-' + vendor, 'TDR Reasons for ' + LookupVendor(vendor), 600, 300);
    var tdrs = [];
    var map = obj.vendorToReason[i][1];
    for (var reason in map) {
      if (!map[reason])
        continue;

      tdrs.push({
        label: DeviceResetReason[reason],
        data: map[reason],
      });
    }
    this.drawPieChart(elt, tdrs);
  }

  // Draw a vendor pie chart for each TDR reason.
  for (var i = 0; i < obj.reasonToVendor.length; i++) {
    var item = obj.reasonToVendor[i];
    var reason = item[0];
    var map = item[1];

    if (!reason || reason > DeviceResetReason.length)
      continue;
    if (Object.keys(map).length == 0)
      continue;

    var elt = this.prepareChartDiv(
        'tdr-reason-' + reason,
        'TDR Reason: ' + DeviceResetReason[reason],
        600, 300);
    var tdrs = [];
    for (var vendor in map) {
      if (!(vendor in VendorMap))
        continue;
      var vendorName = (vendor in VendorMap)
                       ? VendorMap[vendor]
                       : "Unknown vendor " + vendor;
      tdrs.push({
        label: vendorName,
        data: map[vendor],
      });
    }
    this.drawPieChart(elt, tdrs);
  }
}

ChartController.prototype.drawSystem = function ()
{
  var obj = this.ensureData('system-statistics.json', this.drawSystem.bind(this));
  if (!obj)
    return;

  this.drawSampleInfo(obj);

  var elt = this.prepareChartDiv('logical-cores', 'Logical Cores', 500, 300);
  var cores = this.reduce(obj.logical_cores, 'Other', 0.01);
  this.drawChart('pie', elt, this.mapToSeries(cores, function (key) {
    if (key == '1')
      return '1 core';
    if (key == 'Other')
      return 'Other';
    return key + ' cores';
  }));

  // Cull out erroneous 0.
  var memory = {};
  for (var key in obj.memory)
    memory[key] = obj.memory[key];
  if ('0' in memory) {
    memory['1'] = (memory['1'] | 0) + memory['0'];
    delete memory['1'];
  }

  var elt = this.prepareChartDiv('memory', 'Memory', 500, 300);
  this.drawChart('pie', elt, this.mapToSeries(memory, function (key) {
    switch (key) {
    case 'less_1gb':
      return '<1GB';
    case '4_to_8':
      return '4-8GB';
    case '8_to_16':
      return '8-16GB';
    case '16_to_32gb':
      return '16-32GB';
    case 'more_32':
      return '>32GB';
    }
    return key + 'GB';
  }));

  var elt = this.prepareChartDiv('windows-arch', 'Windows Architectures', 500, 300);
  this.drawChart('pie', elt, this.mapToSeries(obj.wow, function (key) {
    switch (key) {
      case '32':
        return '32-bit';
      case '32_on_64':
        return '32-bit on 64-bit';
      case '64':
        return '64-bit';
      default:
        return 'unknown';
    }
  }));

  var data = { series: [], labels: [] };
  for (var feature in obj.x86.features) {
    var label = (feature.substr(0, 3) == 'has')
                ? feature.substr(3)
                : feature;
    var count = obj.x86.features[feature];
    data.series.push([data.labels.length, (count / obj.x86.total) * 100]);
    data.labels.push(label);
  }
  data.formatter = function (n, obj) {
    return n + '%';
  }

  var elt = this.prepareChartDiv('arches', 'x86/64 CPU Features', 500, 300);
  this.drawChart('bar', elt, data, { yaxis: { max: 100 }});
}

ChartController.prototype.drawAPZ = function ()
{
  var obj = this.ensureData('apz-statistics.json', this.drawAPZ.bind(this));
  if (!obj)
    return;

  this.drawSampleInfo(obj);

  var apzText = obj.disabled + ' (' +
                this.toPercent(obj.disabled / obj.sessions.count) + '%)';

  $("#viewport").append(
      $("<p></p>").append(
        $("<strong></strong>").text("Sessions with APZ disabled: ")
      ).append(
        $("<span></span>").text(apzText)
      )
  );

  var os = {};
  for (var key in obj.byOS) {
    var new_key = GetOSName(key);
    if (new_key in os)
      os[new_key] += obj.byOS[key];
    else
      os[new_key] = obj.byOS[key];
  }

  var elt = this.prepareChartDiv(
      'apz-disabled-os',
      'APZ Disabled, by OS',
      600, 300);
  var series = this.mapToSeries(os);
  this.drawPieChart(elt, series);

  var elt = this.prepareChartDiv(
      'apz-disabled-res',
      'APZ Disabled, by Resolution',
      600, 300);
  var series = this.mapToSeries(obj.byResolution);
  this.drawPieChart(elt, series);

  var elt = this.prepareChartDiv(
      'apz-disabled-device',
      'APZ Disabled, by Device',
      600, 300);
  var series = this.mapToSeries(obj.byDevice, GetDeviceName);
  this.drawPieChart(elt, series);
}

ChartController.prototype.displayHardwareSearch = function() {
  var detail = this.ensureData('device-statistics.json', this.displayHardwareSearch.bind(this));
  if (!detail)
    return;

  var general = this.ensureData('general-statistics.json', this.displayHardwareSearch.bind(this));
  if (!general)
    return;

  this.drawSampleInfo(general);

  var vendorChooser = (function () {
    var vendorSelector = $('<select></select>', { id: 'vendor-chooser' });
    for (var i = 0; i < MajorVendors.length; i++) {
      var key = MajorVendors[i];
      vendorSelector.append($('<option></option>', {
        value: key,
      }).text(VendorMap[key]));
    }
    return vendorSelector;
  })();

  function getSearchTerm(str) {
    if (str.indexOf('*') == -1) {
      return str;
    }
    var escaped = str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    var converted = escaped.replace('\\*', '.*');
    return new RegExp('^' + converted + '$');
  }

  function startSearch() {
    var vendor = vendorChooser.val();

    var devicestr = $('#device-search').val().trim();
    var driverstr = $('#driver-search').val().trim();

    var result;
    if (devicestr.length && !driverstr.length) {
      var devices = [];

      var devicearr = devicestr.split(',');
      for (var i = 0; i < devicearr.length; i++) {
        var device = devicearr[i].trim();
        devices.push(vendor + '/' + device.toLowerCase());
      }

      result = Search.ByDevices(general.devices, devices);
    } else if (driverstr.length && !devicestr.length) {
      var drivers = [];

      var driverarr = driverstr.split(',');
      for (var i = 0; i < driverarr.length; i++) {
        var driver = vendor + '/' + driverarr[i].trim();
        drivers.push(getSearchTerm(driver));
      }

      result = Search.ByTerm(general.drivers, drivers);
    } else {
      var devices = devicestr.split(',');
      var drivers = driverstr.split(',');
      var terms = [];

      for (var device_index = 0; device_index < devices.length; device_index++) {
        var prefix = vendor + '/' + devices[device_index].toLowerCase() + '/';
        for (var driver_index = 0; driver_index < drivers.length; driver_index++) {
          terms.push(getSearchTerm(prefix + drivers[driver_index]));
        }
      }

      result = Search.ByTerm(detail.deviceAndDriver, terms);
    }

    var result_box = $('#result-box');
    result_box.text(result[0].toLocaleString() + ' out of ' +
                    result[1].toLocaleString() + ' sessions matched (' +
                    this.toPercent(result[0] / result[1]) + '%)'); 

    this.app.updateViewHash('vendor', devicestr);
    if (devicestr.length)
      this.app.updateViewHash('devices', devicestr);
    if (driverstr.length)
      this.app.updateViewHash('drivers', driverstr);
  }

  function makeChooser(kind) {
    var searchBox = $('<input></input>', {
      id: kind + '-search',
      type: 'text',
    }).prop({
      size: 30,
    });
    if (kind == 'driver')
      searchBox.attr('placeholder', '8.15.10.*');
    else if (kind == 'device')
      searchBox.attr('placeholder', '0x0102, 0x0116');

    var div = $('<div></div>');
    div.append(searchBox);
    return div;
  }

  var control_div = $('<div></div>');
  control_div.append(
    $('<p></p>').text('Fill in filter options below, then click "Search".'),
    $('<p></p>').text('Using both filters is an AND. Using multiple patterns (joined by commas) is an OR.'),
    $('<span></span>').text('Vendor: '),
    vendorChooser,
    $('<p></p>'),
    $('<span></span>').text('Devices: '),
    makeChooser('device'),
    $('<p></p>'),
    $('<span></span>').text('Drivers: '),
    makeChooser('driver'),
    $('<p></p>')
  );

  var button = $('<input type="button" value="Search"></input>');
  button.click(startSearch.bind(this));
  control_div.append(button);

  control_div.append($('<p></p>', {
    id: 'result-box'
  }));

  $('#viewport').append(control_div);

  if (this.app.getParam('vendor', undefined) !== undefined)
    vendorChooser.val(this.app.getParam('vendor'));
  if (this.app.getParam('drivers', undefined) !== undefined)
    $('#driver-search').val(this.app.getParam('drivers'));
  if (this.app.getParam('devices', undefined) !== undefined)
    $('#device-search').val(this.app.getParam('devices'));
}
