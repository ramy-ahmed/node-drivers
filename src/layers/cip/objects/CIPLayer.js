'use strict';

const CIPRequest = require('../core/request');
const { CallbackPromise } = require('../../../utils');
const EPath = require('../epath');
const CIP = require('./CIP');
const {
  DataType,
  Decode
} = require('../datatypes');
const Layer = require('./../../Layer');
const Identity = require('./Identity');
const MessageRouter = require('./MessageRouter');

// let requestCount = 0;
// let totalBytesOut = 0;
// let totalBytesIn = 0;

class CIPLayer extends Layer {
  sendRequest(connected, request, callback) {
    return CallbackPromise(callback, resolver => {
      CIPLayer.SendRequest(this, connected, request, function (error, reply) {
        if (error) {
          resolver.reject(error, reply);
        } else {
          resolver.resolve(reply);
        }
      });
    });
  }

  request(connected, service, path, data, callback) {
    return CallbackPromise(callback, resolver => {
      CIPLayer.send(this, connected, service, path, data, function (error, reply) {
        if (error) {
          resolver.reject(error, reply);
        } else {
          resolver.resolve(reply);
        }
      });
    });
  }

  identity(callback) {
    return CallbackPromise(callback, resolver => {
      const service = CIP.CommonServices.GetAttributesAll;
      
      const path = EPath.Encode(true, [
        new EPath.Segments.Logical.ClassID(CIP.Classes.Identity),
        new EPath.Segments.Logical.InstanceID(0x01)
      ]);

      CIPLayer.send(this, true, service, path, null, function (error, reply) {
        if (error) {
          resolver.reject(error, reply);
        } else {
          try {
            Identity.DecodeInstanceAttributesAll(reply.data, 0, value => resolver.resolve(value));
          } catch (err) {
            resolver.reject(err, reply);
          }
        }
      });
    });
  }


  supportedClasses(callback) {
    return CallbackPromise(callback, resolver => {
      const service = CIP.CommonServices.GetAttributeSingle;

      const path = EPath.Encode(true, [
        new EPath.Segments.Logical.ClassID(CIP.Classes.MessageRouter),
        new EPath.Segments.Logical.InstanceID(0x01),
        new EPath.Segments.Logical.AttributeID(0x01)
      ]);

      CIPLayer.send(this, true, service, path, null, (error, reply) => {
        if (error) {
          resolver.reject(error, reply);
        } else {
          try {
            MessageRouter.DecodeSupportedObjects(reply.data, 0, function(classes) {
              resolver.resolve(classes);
            });
          } catch (err) {
            resolver.reject(err, reply);
          }
        }
      });
    });
  }


  messageRouterInstanceAttributes(callback) {
    return CallbackPromise(callback, resolver => {
      const service = CIP.CommonServices.GetAttributesAll;

      const path = EPath.Encode(true, [
        new EPath.Segments.Logical.ClassID(CIP.Classes.MessageRouter),
        new EPath.Segments.Logical.InstanceID(0x01)
      ]);

      CIPLayer.send(this, true, service, path, null, (error, reply) => {
        if (error) {
          resolver.reject(error, reply);
        } else {
          try {
            const data = reply.data;
            let length = data.length;
            let offset = 0;

            const info = {};

            /** object list may not be supported */
            if (offset < length) {
              offset = MessageRouter.DecodeSupportedObjects(reply.data, 0, function (classes) {
                info.classes = classes;
              });
            }   

            /** number active may not be supported */
            if (offset < length) {
              offset = Decode(DataType.UINT, data, offset, val => info.maximumConnections = val);

              let connectionCount;
              offset = Decode(DataType.UINT, data, offset, val => connectionCount = val);

              const connectionIDs = [];
              for (let i = 0; i < connectionCount; i++) {
                offset = Decode(DataType.UINT, data, offset, val => connectionIDs.push(val));
              }

              info.connections = connectionIDs;
            }

            resolver.resolve(info);
          } catch (err) {
            resolver.reject(err, reply);
          }
        }
      });
    });
  }


  exploreAttributes(classCode, instanceID, maxAttribute, callback) {
    if (typeof maxAttribute === 'function') {
      callback = maxAttribute;
      maxAttribute = null;
    }

    if (maxAttribute == null) {
      maxAttribute = 20;
    }

    // return CallbackPromise(callback, async resolver => {
    //   const service = CIP.CommonServices.GetAttributesAll;
    //   const path = EPath.Encode(
    //     new EPath.Segments.Logical.ClassID(classCode),
    //     new EPath.Segments.Logical.InstanceID(instanceID),
    //   );
    //   const reply = await this.request(true, service, path);

    //   resolver.resolve(reply.data);
    // });

    return CallbackPromise(callback, async resolver => {
      const service = CIP.CommonServices.GetAttributeSingle;

      const attributes = [];

      for (let i = 1; i < maxAttribute; i++) {
        try {
          const path = EPath.Encode(true, [
            new EPath.Segments.Logical.ClassID(classCode),
            new EPath.Segments.Logical.InstanceID(instanceID),
            new EPath.Segments.Logical.AttributeID(i)
          ]);
          const reply = await this.request(true, service, path);
          attributes.push({
            code: i,
            data: reply.data
          });
        } catch (err) {
          if (!err.info || !err.info.status || err.info.status.code !== 20) {
            return resolver.reject(err);
          } else {
            //
          }
        }
      }

      resolver.resolve(attributes);
    });
  }


  messageRouterClassAttributes(callback) {
    return CallbackPromise(callback, resolver => {
      const service = CIP.CommonServices.GetAttributesAll;

      const path = EPath.Encode(true, [
        new EPath.Segments.Logical.ClassID(CIP.Classes.Identity),
        new EPath.Segments.Logical.InstanceID(0)
      ]);

      CIPLayer.send(this, true, service, path, null, (error, reply) => {
        if (error) {
          resolver.reject(error, reply);
        } else {
          try {
            console.log(reply);
            resolver.resolve(reply);
          } catch (err) {
            resolver.reject(err, reply);
          }
        }
      });
    });
  }


  handleData(data, info, context) {
    const callback = this.callbackForContext(context);
    if (callback != null) {
      callback(null, data, info);
      return true;
    } else {
      // console.log(arguments);
      // console.log(`CIP layer unhandled data`);
      return false;
    }
  }


  static SendRequest(layer, connected, request, callback, timeout) {
    let req;
    if (request instanceof CIPRequest) {
      req = request.encode();
    } else {
      req = request;
    }
    layer.send(req, { connected }, false, typeof callback === 'function' ? layer.contextCallback((error, message) => {
      if (error) {
        callback(error, message);
      } else {
        let reply;
        if (request instanceof CIPRequest) {
          reply = request.response(message, 0);
        } else {
          reply = MessageRouter.Reply(message);
          reply.request = request;
        }

        // const reply = MessageRouter.Reply(message);
        // reply.request = request;

        // console.log('IN:', message);
        // // console.log('IN:', JSON.stringify(message));
        // // console.log(reply);
        // totalBytesIn += message.length;
        // // console.log(`REQUEST: ${requestCount}, ${totalBytesOut} ${totalBytesIn}`);


        // if (reply.service.code !== service) {
        //   return callback('Response service does not match request service. This should never happen.', reply);
        // }

        if (reply.status.error) {
          callback(reply.status.description || 'CIP Error', reply);
        } else {
          callback(null, reply);
        }
      }
    }, null, timeout) : undefined);
  }


  static send(layer, connected, service, path, data, callback, timeout) {
    // const request = MessageRouter.Request(service, path, data);
    const cipRequest = new CIPRequest(service, path, data);
    const request = cipRequest.encode();


    // console.log('OUT:', request);
    // // console.log('OUT:', JSON.stringify(request));
    // totalBytesOut += request.length;
    // requestCount++;
    // const tmpRequestCount = requestCount;

    const info = { connected };

    layer.send(request, info, false, typeof callback === 'function' ? layer.contextCallback((error, message) => {
      if (error) {
        callback(error, message);
      } else {
        const reply = MessageRouter.Reply(message);
        reply.request = request;

        // console.log('IN:', message);
        // // console.log('IN:', JSON.stringify(message));
        // // console.log(reply);
        // totalBytesIn += message.length;
        // // console.log(`REQUEST: ${requestCount}, ${totalBytesOut} ${totalBytesIn}`);


        if (reply.service.code !== service) {
          return callback('Response service does not match request service. This should never happen.', reply);
        }

        if (reply.status.error) {
          callback(reply.status.description || 'CIP Error', reply);
        } else {
          callback(null, reply);
        }
      }
    }, null, timeout) : undefined);
  }

  
}

module.exports = CIPLayer;