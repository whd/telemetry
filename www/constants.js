// vim: set ts=2 sw=2 tw=99 et:
var VendorMap = {
  '0x1013': 'Cirrus Logic',
  '0x1002': 'AMD',
  '0x8086': 'Intel',
  '0x5333': 'S3 Graphics',
  '0x1039': 'SIS',
  '0x1106': 'VIA',
  '0x10de': 'NVIDIA',
  '0x102b': 'Matrox',
  '0x15ad': 'VMWare',
  '0x80ee': 'Oracle VirtualBox',
  '0x1414': 'Microsoft Basic',
};
function LookupVendor(code)
{
  if (code in VendorMap)
    return VendorMap[code];
  return 'Unknown';
}
function GetVendorName(code)
{
  if (code in VendorMap)
    return VendorMap[code];
  return 'Unknown vendor ' + code;
}

var OSMap = {
  'Windows_NT': 'Windows',
  'Darwin': 'Mac OS X',
};

var MajorVendors = [
  '0x8086',
  '0x1002',
  '0x10de',
];

var IsMajorVendor = function (vendor)
{
  for (var i = 0; i < MajorVendors.length; i++) {
    if (MajorVendors[i]  == vendor)
      return true;
  }
  return false;
}

var WindowsVersionMap = {
  '5.1': 'XP',
  '5.2': 'Server 2003',
  '6.0': 'Vista',
  '6.1': '7',
  '6.2': '8',
  '6.3': '8.1',
  '10.0': '10',
};
function GetWindowsVersion(code)
{
  if (code.indexOf("Windows-") == 0)
    code = code.substr(8);
  var parts = code.split('.');
  if (parts.length < 2)
    return null;
  var base = parts[0] + '.' + parts[1];
  if (!(base in WindowsVersionMap))
    return null;
  if (parts.length >= 3 && parseInt(parts[2]) != 0)
    return WindowsVersionMap[base] + ' SP' + parts[2];
  return WindowsVersionMap[base];
}
function WindowsVersionName(code)
{
  var version = GetWindowsVersion(code);
  if (!version)
    return 'Unknown';
  return 'Windows ' + version;
}
function GetDarwinVersion(version)
{
  var parts = version.split('.');
  var major = parseInt(parts[0]);
  if (!major || major < 5)
    return null;
  return '10.' + (major - 4);
}

var ImportantWindowsVersions = {
  '5.1': true,
  '6.0': true,
  '6.1.0': true,
  '6.1.1': true,
  '6.2': true,
  '6.3': true,
  '10.0': true,
};

// Reduce the Windows version number to eliminate unimportant version differences.
function ReduceWindowsVersion(key)
{
  var maj = key.substring(0, 3);
  switch (maj) {
    case '5.1':
    case '6.0':
    case '6.2':
    case '6.3':
    case '10.0':
      return maj;
  }
  return key;
}

function GetOSName(key)
{
  var parts = key.split('-');
  if (parts.length == 0)
    return 'Unknown';

  var version = null;
  switch (parts[0]) {
    case 'Darwin':
      if (parts.length >= 2)
        version = GetDarwinVersion(parts[1]);
      if (!version)
        return 'Mac OS X (Unknown)';
      return 'Mac OS X ' + version;
    case 'Windows':
      if (parts.length >= 2)
        version = WindowsVersionName(parts[1]);
      if (!version)
        return 'Windows (Unknown)';
      return version;
    default:
      return parts[0] + ' ' + parts.slice(1).join('-');
  }
}

var DeviceResetReason = [
  "OK",
  "Hung",
  "Removed",
  "Reset",
  "Driver error",
  "Invalid Call",
  "Out of memory",
];

var SanityTestCode = [
  "Passed",
  "Render failed",
  "Video failed",
  "Crashed",
  null,
  "Timed out",
];
var StartupTestCode = [
  "Ok",
  "Environment Changed",
  "Crash detected",
  "Acceleration disabled from crash"
];
var SanityTestReason = [
  "New profile",
  "Firefox update",
  "Device change",
  "Driver change",
];

function GetDeviceName(device)
{
  if (device in PCIDeviceMap)
    return PCIDeviceMap[device];
  var parts = device.split('/');
  if (parts.length == 2) {
    var vendor = parts[0];
    if (vendor in GfxDeviceMap) {
      var devices = GfxDeviceMap[vendor];
      if (parts[1] in devices)
        return GetVendorName(vendor) + ' ' + devices[parts[1]][1];
    }
    return GetVendorName(vendor) + ' ' + parts[1];
  }
  return device;
}

function GetDriverName(driver)
{
  var parts = driver.split('/');
  if (parts.length == 2)
    return GetVendorName(parts[0]) + ' ' + parts[1];
  return driver;
}

var D3D11StatusCode = {
  0x9100: 'FEATURE_LEVEL_9_1',
  0x9200: 'FEATURE_LEVEL_9_2',
  0x9300: 'FEATURE_LEVEL_9_3',
  0xA000: 'FEATURE_LEVEL_10_0',
  0xA100: 'FEATURE_LEVEL_10_1',
  0xB000: 'FEATURE_LEVEL_11_0',
  0xB100: 'FEATURE_LEVEL_11_1',
  0xC000: 'FEATURE_LEVEL_12_0',
  0xC100: 'FEATURE_LEVEL_12_1',
  'warp': 'WARP (any feature level)',
};

var D2DStatusCode = {
  '1.0': 'Direct2D 1.0',
  '1.1': 'Direct2D 1.1',
};

var OSXNameMap = {
  '10.5': 'Leopard',
  '10.6': 'Snow Leopard',
  '10.7': 'Lion',
  '10.8': 'Mountain Lion',
  '10.9': 'Mavericks',
  '10.10': 'Yosemite',
  '10.11': 'El Capitan',
};

function DarwinVersionToOSX(darwin_version)
{
  var parts = darwin_version.split('.');
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1]))
    return 'unknown';
  var major = parseInt(parts[0]);
  if (!(major >= 4))
    return 'unknown';
  var osx = major - 4;
  return '10.' + osx;
}

function DarwinVersionToOSXFull(darwin_version)
{
  var parts = darwin_version.split('.');
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2]))
    return 'unknown';
  var major = parseInt(parts[0]);
  if (!(major >= 4))
    return 'unknown';
  var osx = major - 4;
  return '10.' + osx + '.' + parts[1];
}

function GetDeviceProps(vendor, device_id)
{
  if (!(vendor in GfxDeviceMap))
    return null;

  if (!(device_id in GfxDeviceMap[vendor]))
    return null;

  return {
    'gen': GfxDeviceMap[vendor][device_id][0],
    'chipset': GfxDeviceMap[vendor][device_id][1],
  }
}

function SplitDeviceKey(key)
{
  var parts = key.split('/');
  if (parts.length == 2)
    return parts;
  return null;
}

function DeviceKeyToPropKey(device_key, prop)
{
  var parts = SplitDeviceKey(device_key);
  if (!parts)
    return 'unrecognized';

  var vendor = parts[0];
  var device = parts[1];

  var props = GetDeviceProps(vendor, device);
  if (!props)
    return 'unrecognized';
  return props[prop];
}

// Take something like
//   ("0x8086/0x1234", "chipset") -> "Intel <chipset>"
function DeviceKeyToPropLabel(device_key, prop)
{
  var parts = SplitDeviceKey(device_key);
  if (!parts)
    return 'Unrecognized';

  var vendor = parts[0];
  var device = parts[1];

  var props = GetDeviceProps(vendor, device);
  if (!props)
    return 'Unrecognized';
  return VendorMap[vendor] + " " + props[prop];
}
