# vim: set ts=2 sw=2 tw=99 et:
import argparse, json
import urllib2

DatabaseRoot = "https://raw.githubusercontent.com/jrmuizel/gpu-db/master/"

def main():
  parser = argparse.ArgumentParser()
  parser.add_argument('mode', type=str, help='Mode (json or js)')
  args = parser.parse_args()

  output = {}

  databases = [
    'amd.json',
    'intel.json',
    'nvidia.json',
  ]
  for db in databases:
    req = urllib2.urlopen(DatabaseRoot + db)
    obj = json.loads(req.read())
    parse(output, obj)

  x = json.dumps(output)
  if args.mode == 'json':
    print(x)
  elif args.mode == 'js':
    print('var GfxDeviceMap = ' + x + ';')

def parse(output, obj):
  for vendor in obj:
    vendor_key = '0x{0}'.format(vendor)
    vendor_map = output.setdefault(vendor_key, {})

    generations = obj[vendor]
    for generation in generations:
      chipsets = generations[generation]
      for chipset in chipsets:
        devices = chipsets[chipset]
        for device in devices:
          device_key = '0x{0}'.format(device)

          vendor_map[device_key] = [generation, chipset]

if __name__ == '__main__':
    main()
