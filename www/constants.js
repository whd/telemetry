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
  '5.1': 'Windows XP',
  '5.2': 'Windows Server 2003',
  '6.0': 'Windows Vista',
  '6.1': 'Windows 7',
  '6.2': 'Windows 8',
  '6.3': 'Windows 8.1',
  '10.0': 'Windows 10',
};
function WindowsVersionName(code)
{
  if (code.indexOf("Windows-") == 0)
    code = code.substr(8);
  var parts = code.split('.');
  if (parts.length < 2)
    return 'Unknown';
  var base = parts[0] + '.' + parts[1];
  if (!(base in WindowsVersionMap))
    return 'Unknown';
  if (parts.length >= 3 && parseInt(parts[2]) != 0)
    return WindowsVersionMap[base] + ' SP' + parts[2];
  return WindowsVersionMap[base];
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
];
var StartupTestCode = [
  "Ok",
  "Environment Changed",
  "Crash detected",
  "Acceleration disabled from crash"
];

function GetDeviceName(device)
{
  if (device in PCIDeviceMap)
    return PCIDeviceMap[device];
  var parts = device.split('/');
  if (parts.length == 2)
    return GetVendorName(parts[0]) + ' ' + parts[1];
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

// Take something like
//   ("0x8086/0x1234", "chipset") -> "Intel <chipset>"
function DeviceKeyToPropKey(device_key, prop)
{
  var parts = SplitDeviceKey(device_key);
  if (!parts)
    return "Unknown device " + device_key;

  var vendor = parts[0];
  var device = parts[1];

  var props = GetDeviceProps(vendor, device);
  if (!props) {
    if (!(vendor in VendorMap) || !(vendor in GfxDeviceMap))
      return "Unknown device " + device_key;
    return "Unknown device " + VendorMap[vendor] + " " + device;
  }

  return VendorMap[vendor] + " " + props[prop];
}
