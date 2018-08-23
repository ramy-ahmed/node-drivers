'use strict';

module.exports = {
  Layers: {
    Layer: require('./Stack/Layers/Layer'),
    TCPLayer: require('./Stack/Layers/TCPLayer'),
    EIPLayer: require('./Stack/Layers/EIPLayer'),
    MBTCPLayer: require('./Stack/Layers/MBTCPLayer'),
    PCCCLayer: require('./Stack/Layers/PCCCLayer'),
    CIP: {
      Connection: require('./CIP/Objects/Connection'),
      ControlLogix: require('./CIP/ControlLogix'),
      PCCC: require('./CIP/PCCC')
    }
  }
}
