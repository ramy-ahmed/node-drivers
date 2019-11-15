# Changelog
## 2.0.0-beta.0 (2019-11-14)
### New
  - Modbus layer - one layer for all Modbus frame formats
    - TCP, RTU (future), and ASCII (future)
### Removed
  - ModbusTCP layer has been removed, use Modbus layer instead
### Changed
  - Logix5000.listTags
      - now returns an async iterator
      - structure tags now include template information
  - src structure has been simplified

## 1.5.4 / 2019-05-10
  - Added CIP.Connection disconnect timeout of 10000 milliseconds
## 1.5.3 / 2019-05-06
  - CIP DecodeValue returns true or false for boolean data type
## 1.5.2 / 2019-05-06
  - Layer contextCallback added timeout parameter
  - CIP.Logix5000 listTags added options parameter, allowed fields:
    - timeout - timeout in milliseconds, will return tags instead of timeout error if at least one response received with tags (default 10000)
## 1.5.1 / 2019-04-12
  - CIP.Logix5000 allows reading multiple elements from tags
    - e.g. logix.readTag('tagname', 2)
    - resolves an array of values if number is greater than 1
## 1.5.0 / 2019-04-12
  - CIP.Logix5000 no longer requires including CIP.Connection as a lower layer.
  - CIP.Connection only connects if needed
    - e.g. getting all attributes of identity object does not require a connection