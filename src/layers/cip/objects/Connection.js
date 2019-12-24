'use strict';

const { CallbackPromise, InvertKeyValues } = require('../../../utils');
const { CommonServices } = require('./CIP');
const { DataType } = require('../datatypes');
const EPath = require('./EPath');
const Layer = require('./../../Layer');
const ConnectionManager = require('./ConnectionManager');
const MessageRouter = require('./MessageRouter');

// const FORWARD_OPEN_SERVICE = ConnectionManager.ServiceCodes.ForwardOpen;
const LARGE_FORWARD_OPEN_SERVICE = ConnectionManager.ServiceCodes.LargeForwardOpen;
// const FORWARD_CLOSE_SERVICE = ConnectionManager.ServiceCodes.ForwardClose;
// // const FORWARD_OPEN_SERVICE = ConnectionManager.ServiceCodes.ForwardOpen | (1 << 7);
// // const FORWARD_CLOSE_SERVICE = ConnectionManager.ServiceCodes.ForwardClose | (1 << 7);

const MaximumLargeConnectionSize = 0xFFFF;
const MaximumNormalConnectionSize = 0b111111111; /** 511 */


function unconnectedContext(internal, context, request, callback) {
  return {
    internal,
    context,
    request,
    callback
  };
}

const TypeCodes = Object.freeze({
  Null: 0,
  Multicast: 1,
  PointToPoint: 2
});

const PriorityCodes = Object.freeze({
  Low: 0,
  High: 1,
  Scheduled: 2,
  Urgent: 3
});

const SizeTypeCodes = Object.freeze({
  Fixed: 0,
  Variable: 1
});


/** For Transport Class Trigger Attribute */
const TransportClassCodes = Object.freeze({
  Class0: 0,
  Class1: 1,
  Class2: 2,
  Class3: 3
});

const TransportProductionTriggerCodes = Object.freeze({
  Cyclic: 0,
  ChangeOfState: 1,
  ApplicationObject: 2
});

const TransportDirectionCodes = Object.freeze({
  Client: 0,
  Server: 1
});


class Connection extends Layer {
  constructor(lowerLayer, options) {
    super('cip.connection', lowerLayer);

    mergeOptionsWithDefaults(this, options);

    this._connectionState = 0;
    this._sequenceCount = 0;

    this.connect();
  }


  connect(callback) {
    this._connectCallback = callback;
    if (this._connectionState === 1) return;
    if (this._connectionState === 2 && callback != null) {
      if (callback != null) {
        callback();
      }
      return;
    }

    this._connectionState = 1;

    const request = ConnectionManager.ForwardOpenRequest(this, true);

    this.send(request, null, false, unconnectedContext(true, null, request, async (err, res) => {
      if (err) {
        this._connectionState = 0;

        if (res.service.code === LARGE_FORWARD_OPEN_SERVICE && res.status.code === 8) {
          this.networkConnectionParameters.maximumSize = 500;
          this.large = false;
          this.OtoTNetworkConnectionParameters = buildNetworkConnectionParametersCode(this.networkConnectionParameters);
          this.TtoONetworkConnectionParameters = buildNetworkConnectionParametersCode(this.networkConnectionParameters);
          console.log('Large forward open not supported. Attempting normal forward open');
          this.connect();
        } else {
          console.log('CIP Connection Error: Status is not successful or service is not correct:');
          console.log(message);
        }
      } else {
        if (this._connectionState === 1) {
          const reply = ConnectionManager.ForwardOpenReply(res.data);
          this._OtoTConnectionID = reply.OtoTNetworkConnectionID;
          this._TtoOConnectionID = reply.TtoONetworkConnectionID;
          this._OtoTPacketRate = reply.OtoTActualPacketRate;
          this._TtoOPacketRate = reply.TtoOActualPacketRate;
          this._connectionSerialNumber = reply.ConnectionSerialNumber;

          const rpi = this._OtoTPacketRate < this._TtoOPacketRate ? this._OtoTPacketRate : this._TtoOPacketRate;
          this._connectionTimeout = 4 * (rpi / 1e6) * Math.pow(2, this.ConnectionTimeoutMultiplier);

          // EIP specific information
          this.sendInfo = {
            connectionID: this._OtoTConnectionID,
            responseID: this._TtoOConnectionID
          };

          // await this.readAttributes();

          this._connectionState = 2;

          this.sendNextMessage();
        }
      }

      if (this._connectCallback) this._connectCallback(res);
      this._connectCallback = null;
    }));
  }

  
  // async readAttributes() {
  //   if (this._connectionState === 0) {
  //     // return {};
  //     this.connect();
  //   }

  //   if (this.sendInfo == null) {
  //     return;
  //   }

  //   const attributes = [
  //     InstanceAttributeCodes.State,
  //     // InstanceAttributeCodes.Type,
  //     // InstanceAttributeCodes.TransportClassTrigger,
  //     // InstanceAttributeCodes.ProducedConnectionSize,
  //     // InstanceAttributeCodes.ConsumedConnectionSize,
  //     // InstanceAttributeCodes.ExpectedPacketRate,
  //     // InstanceAttributeCodes.WatchdogTimeoutAction,
  //     // InstanceAttributeCodes.ProducedConnectionPathLength,
  //     // InstanceAttributeCodes.ProducedConnectionPath,
  //     // InstanceAttributeCodes.ConsumedConnectionPathLength,
  //     // InstanceAttributeCodes.ConsumedConnectionPath
  //   ];

  //   // const service = CommonServices.GetAttributeList;

  //   // const data = Encode(DataType.STRUCT([
  //   //   DataType.UINT,
  //   //   DataType.ARRAY(DataType.UINT, 0, attributes.length - 1)
  //   // ]), [
  //   //   attributes.length,
  //   //   attributes
  //   // ]);
  //   // console.log(data);

  //   for (let i = 0; i < attributes.length; i++) {
  //     const attribute = attributes[i];

  //     const service = CommonServices.GetAttributeSingle;

  //     const path = EPath.Encode(true, [
  //       new EPath.Segments.Logical.ClassID(Classes.Connection),
  //       // new EPath.Segments.Logical.InstanceID(this._OtoTConnectionID),
  //       new EPath.Segments.Logical.InstanceID(this._TtoOConnectionID),
  //       new EPath.Segments.Logical.AttributeID(attribute)
  //     ]);

  //     // console.log(path);
  //     // const path = Buffer.from([]);
  //     // const data = Encode(DataType.USINT, attribute);
  //     const data = null;
  //     const request = MessageRouter.Request(service, path, data);

  //     await new Promise(resolve => {
  //       sendConnected(this, true, request, this.contextCallback(function(err, res) {
  //         if (err) {
  //           console.log(err);
  //           console.log(res);
  //         } else {
  //           console.log(res);
  //         }
  //         resolve();
  //       }));
  //     });
  //   }
  // }


  disconnect(callback) {
    return CallbackPromise(callback, resolver => {
      if (this._connectionState === 0) {
        return resolver.resolve();
      }

      if (this._connectionState === -1) {
        return;
      }

      this._disconnectCallback = () => {
        resolver.resolve();
      };

      this._disconnectTimeout = setTimeout(() => {
        this._disconnectCallback();
      }, 10000);

      this._connectionState = -1;

      const request = ConnectionManager.ForwardCloseRequest(this);
      
      this.send(request, null, false, unconnectedContext(true, null, request, (err, res) => {
        stopResend(this);

        if (res.status.code === 0) {
          const reply = ConnectionManager.ForwardCloseReply(res.data);

          this._connectionState = 0;
          this.sendInfo = null;
          // console.log('CIP Connection closed');
          if (this._disconnectCallback) {
            this._disconnectCallback(reply);
            clearTimeout(this._disconnectTimeout);
            this._disconnectCallback = null;
          }
        } else {
          console.log('CIP connection unsuccessful close');
          console.log(res);
        }
      }));
    });
  }


  sendNextMessage() {
    if (this._connectionState === 0) {
      const peek = this.getNextRequest(true);
      if (peek && peek.info) {
        if (peek.info.connected === true) {
          this.connect();
        } else {
          const request = this.getNextRequest();
          this.send(request.message, null, false, unconnectedContext(false, request.context));
          setImmediate(() => this.sendNextMessage());
        }
      }
    } else if (this._connectionState === 2) {
      const request = this.getNextRequest();

      if (request) {
        if (request.context == null) {
          throw new Error('CIP Connection Error: Connected messages must include a context');
        }

        sendConnected(this, false, request.message, request.context);
        setImmediate(() => this.sendNextMessage());
      }
    }
  }


  handleData(data, info, context) {
    // totalData += data.length;
    // totalPackets += 1;
    // console.log(`${totalPackets}: ${totalData}`);

    if (context != null) {
      /** Unconnected Message */
      handleUnconnectedMessage(this, data, info, context);
    } else {
      /** Connected message, context should not be used for connected messages */
      handleConnectedMessage(this, data, info);
    }
  }


  handleDestroy(error) {
    cleanup(this);
  }


  static DecodeInstanceAttribute(attribute, data, offset, cb) {
    const dataType = InstanceAttributeDataTypes[attribute];
    if (!dataType) {
      throw new Error(`Unknown instance attribute: ${attribute}`);
    }

    let value;
    offset = Decode(dataType, data, offset, val => value = val);

    switch (attribute) {
      case InstanceAttributeCodes.State: {
        value = {
          code: value,
          name: InstanceStateNames[value] || 'Unknown'
        };
        break;
      }
      case InstanceAttributeCodes.Type: {
        value = {
          code: value,
          name: InstanceTypeNames[value] || 'Unkown'
        }
      }
      default:
        break;
    }

    if (typeof cb === 'function') {
      cb({
        code: attribute,
        name: InstanceAttributeNames[attribute] || 'Unknown',
        value
      });
    }

    return offset;
  }

  // static BuildTransportClassTriggerCode({ transportClass, productionTrigger, direction }) {
  //   return buildTransportClassTriggerCode({ transportClass, productionTrigger, direction });
  // }
}

module.exports = Connection;


function sendConnected(connection, internal, message, context) {
  const sequenceCount = incrementSequenceCount(connection);
  connection.setContextForID(sequenceCount, {
    context,
    internal,
    request: message
  });

  const buffer = Buffer.allocUnsafe(message.length + 2);
  buffer.writeUInt16LE(sequenceCount, 0);
  message.copy(buffer, 2);

  connection.send(buffer, connection.sendInfo, false);

  startResend(connection, buffer);
}


function cleanup(layer) {
  layer._connectionState === 0;
}


function buildNetworkConnectionParametersCode(options) {
  let code = 0;
  const large = options.maximumSize > MaximumNormalConnectionSize;

  if (large === true) {
    code |= (options.redundantOwner & 1) << 31;
    code |= (options.type & 3) << 29;
    /** Bit 28 reserved */
    code |= (options.priority & 3) << 26;
    code |= (options.sizeType & 1) << 25;
    /** Bits 16 through 24 reserved */
    code |= (options.maximumSize & MaximumLargeConnectionSize);
  } else {
    code |= (options.redundantOwner & 1) << 15;
    code |= (options.type & 3) << 13;
    /** Bit 12 reserved */
    code |= (options.priority & 3) << 10;
    code |= (options.sizeType & 1) << 9;
    code |= (options.maximumSize & MaximumNormalConnectionSize);
  }
  return code;
}


const TransportClassCodesSet = new Set(
  Object.values(TransportClassCodes)
);
const TransportProductionTriggerCodesSet = new Set(
  Object.values(TransportProductionTriggerCodes)
);
const TransportDirectionCodesSet = new Set(
  Object.values(TransportDirectionCodes)
);


function buildTransportClassTriggerCode(transport) {
  if (!TransportClassCodesSet.has(transport.transportClass)) {
    throw new Error(`CIP Connection invalid transport class ${transport.transportClass}`);
  }
  if (!TransportProductionTriggerCodesSet.has(transport.productionTrigger)) {
    throw new Error(`CIP Connection invalid transport production trigger ${transport.productionTrigger}`);
  }
  if (!TransportDirectionCodesSet.has(transport.direction)) {
    throw new Error(`CIP Connection invalid transport direction ${transport.direction}`);
  }
  return (
    ((transport.direction & 0b1) << 7) |
    ((transport.productionTrigger & 0b111) << 4) |
    ((transport.transportClass & 0b1111))
  )
}


function mergeOptionsWithDefaults(self, options) {
  if (!options) options = {};

  // self.networkConnectionParameters = options.networkConnectionParameters || {
  //   redundantOwner: 0,
  //   type: TypeCodes.PointToPoint,
  //   priority: PriorityCodes.Low,
  //   sizeType: SizeTypeCodes.Variable,
  //   maximumSize: 500
  // };

  self.networkConnectionParameters = Object.assign({
    redundantOwner: 0,
    type: TypeCodes.PointToPoint,
    priority: PriorityCodes.Low,
    sizeType: SizeTypeCodes.Variable,
    maximumSize: 500
  }, options.networkConnectionParameters);

  self.transport = Object.assign({
    transportClass: TransportClassCodes.Class3,
    productionTrigger: TransportProductionTriggerCodes.ApplicationObject,
    direction: TransportDirectionCodes.Server
  }, options.transport);

  self.transportClass = options.transportClass || TransportClassCodes.Class3;
  self.transportProductionTrigger = options.transportProductionTrigger || TransportProductionTriggerCodes.ApplicationObject;
  self.transportDirection = options.transportDirection || TransportDirectionCodes.Server;

  // console.log(self.networkConnectionParameters);

  self.large = self.networkConnectionParameters.maximumSize > MaximumNormalConnectionSize;

  self.VendorID = options.VendorID || 0x1339;
  self.OriginatorSerialNumber = options.OriginatorSerialNumber || 42;
  self.ConnectionTimeoutMultiplier = options.ConnectionTimeoutMultiplier || 0x01;
  self.OtoTRPI = options.OtoTRPI || 2000000;
  self.OtoTNetworkConnectionParameters = buildNetworkConnectionParametersCode(self.networkConnectionParameters);
  self.TtoORPI = options.TtoORPI || 2000000;
  self.TtoONetworkConnectionParameters = buildNetworkConnectionParametersCode(self.networkConnectionParameters);
  self.TransportClassTrigger = buildTransportClassTriggerCode(self.transport);
  self.route = options.route;

  // self.options = Object.assign({
  //   vendorID: 0x1339,
  //   originatorSerialNumber: 42,
  //   connectionTimeoutMultiplier: 0x01,
  //   o2tRequestedPacketInterval: 0x00201234,
  //   o2tNetworkConnectionParameters: 0x43F4,
  //   t2oRequestedPacketInterval: 0x00204001,
  //   t2oNetworkConnectionParameters: 0x43F4,
  //   transportClassTrigger: 0xA3, // 0xA3: Direction = Server, Production Trigger = Application Object, Trasport Class = 3
  //   route: options.route
  // }, options);
}


function handleUnconnectedMessage(self, data, info, context) {
  if (!context) {
    console.log('CIP Connection unhandled unconnected message, no context', data);
    return;
  }

  if (context.internal === true) {
    const message = MessageRouter.Reply(data);

    message.request = context.request;

    context.callback(
      message.status.error ? message.status.description || 'CIP Error' : null,
      message
    );
  } else {
    /** Unconnected message for upper layer */
    self.forward(data, info, context.context);
  }
}


function handleConnectedMessage(self, data, info) {
  if (self.sendInfo == null || info == null) {
    console.log('CIP Connection unhandled connected message, not connected', data);
    return;
  }

  if (self.sendInfo.connectionID !== info.connectionID || self.sendInfo.responseID !== info.responseID) {
    console.log(`CIP Connection unhandled connected message, invalid Originator and/or Target connection identifiers`, data, info);
  }

  const sequenceCount = data.readUInt16LE(0);

  const savedContext = self.getContextForID(sequenceCount);
  if (!savedContext) {
    /* This happens when the last message is resent to prevent CIP connection timeout disconnect */
    return;
  }

  data = data.slice(2);

  if (savedContext.internal) {
    const callback = self.callbackForContext(savedContext.context);
    if (callback != null) {
      const reply = MessageRouter.Reply(data);

      reply.request = savedContext.request;

      callback(
        reply.status.error ? reply.status.description || 'CIP Error' : null,
        reply
      );
    } else {
      console.log('CIP.Connection: Unhandled data received.', data);
    }
  } else {
    self.forward(data, null, savedContext.context);
  }
}


function incrementSequenceCount(self) {
  self._sequenceCount = (self._sequenceCount + 1) % 0x10000;
  return self._sequenceCount;
}


function startResend(self, lastMessage) {
  stopResend(self);

  self.__resendInterval = setInterval(function () {
    self.send(lastMessage, self.sendInfo, false, null);
  }, Math.floor(self._connectionTimeout * 3 / 4) * 1000);
}


function stopResend(self) {
  if (self.__resendInterval != null) {
    clearInterval(self.__resendInterval);
    self.__resendInterval = null;
  }
}


// CIP Vol1 Table 3-4.2
const ClassServices = {
  /** Common */
  Create: CommonServices.Create,
  Delete: CommonServices.Delete,
  Reset: CommonServices.Reset,
  FindNextObjectInstance: CommonServices.FindNextObjectInstance,
  GetAttributeSingle: CommonServices.GetAttributeSingle,
  /** Class Specific */
  ConnectionBind: 0x4B,
  ProducingApplicationLookup: 0x4C,
  SafetyClose: 0x4E,
  SafetyOpen: 0x54
};


// CIP Vol 1, Table 3-4.9
const InstanceAttributeCodes = {
  State: 1,
  Type: 2,
  TransportClassTrigger: 3,
  DeviceNetProducedConnectionID: 4,
  DeviceNetConsumedConnectionID: 5,
  DeviceNetInitialCommCharacteristics: 6,
  ProducedConnectionSize: 7,
  ConsumedConnectionSize: 8,
  ExpectedPacketRate: 9,
  CIPProducedConnectionID: 10,
  CIPConsumedConnectionID: 11,
  WatchdogTimeoutAction: 12,
  ProducedConnectionPathLength: 13,
  ProducedConnectionPath: 14,
  ConsumedConnectionPathLength: 15,
  ConsumedConnectionPath: 16,
  ProductionInhibitTime: 17,
  ConnectionTimeoutMultiplier: 18,
  ConnectionBindingList: 19
};


const InstanceAttributeNames = InvertKeyValues(InstanceAttributeCodes);


const InstanceAttributeDataTypes = {
  [InstanceAttributeCodes.State]: DataType.USINT,
  [InstanceAttributeCodes.Type]: DataType.USINT,
  [InstanceAttributeCodes.TransportClassTrigger]: DataType.BYTE,
  [InstanceAttributeCodes.DeviceNetProducedConnectionID]: DataType.UINT,
  [InstanceAttributeCodes.DeviceNetConsumedConnectionID]: DataType.UINT,
  [InstanceAttributeCodes.DeviceNetInitialCommCharacteristics]: DataType.BYTE,
  [InstanceAttributeCodes.ProducedConnectionSize]: DataType.UINT,
  [InstanceAttributeCodes.ConsumedConnectionSize]: DataType.UINT,
  [InstanceAttributeCodes.ExpectedPacketRate]: DataType.UINT,
  [InstanceAttributeCodes.CIPProducedConnectionID]: DataType.UDINT,
  [InstanceAttributeCodes.CIPConsumedConnectionID]: DataType.UDINT,
  [InstanceAttributeCodes.WatchdogTimeoutAction]: DataType.USINT,
  [InstanceAttributeCodes.ProducedConnectionPathLength]: DataType.UINT,
  [InstanceAttributeCodes.ProducedConnectionPath]: DataType.EPATH(false),
  [InstanceAttributeCodes.ConsumedConnectionPathLength]: DataType.UINT,
  [InstanceAttributeCodes.ConsumedConnectionPath]: DataType.EPATH(false),
  [InstanceAttributeCodes.ProductionInhibitTime]: DataType.UINT,
  [InstanceAttributeCodes.ConnectionTimeoutMultiplier]: DataType.USINT,
  [InstanceAttributeCodes.ConnectionBindingList]: DataType.STRUCT([DataType.SMEMBER(DataType.UINT, true), DataType.PLACEHOLDER], function (members) {
    if (members.length === 1) {
      return DataType.ARRAY(DataType.UINT, 0, members[0]);
    }
  })
};


// CIP Vol1 Table 3-4.10
const InstanceStateNames = {
  0: 'Non-existent',
  1: 'Configuring',
  2: 'Waiting for connection ID',
  3: 'Established',
  4: 'Timed out',
  5: 'Deferred delete',
  6: 'Closing'
};


// CIP Vol1 Table 3-4.11
const InstanceTypeNames = {
  0: 'Explicit Messaging',
  1: 'I/O',
  2: 'CIP Bridged'
};


// CIP Vol1 Table 3-4.5
const ConnectionBindServiceStatusCodeDescriptions = {
  0x02: {
    0x01: 'One or both of the connection instances is Non-existent',
    0x02: 'The connection class and/or instance is out of resources to bind instances'
  },
  0x0C: {
    0x01: 'Both of the connection instances are existent, but at least one is not in the established state'
  },
  0x20: {
    0x01: 'Both connection instances are the same value'
  },
  0xD0: {
    0x01: 'One or both of the connection instances is not a dynamically created I/O connection',
    0x02: 'One or both of the connection instances were created internally and the device is not allowing a binding to it'
  }
};
