'use strict';

const EPath = require('../epath');
const { CommonServiceCodes } = require('./constants');
const CIPRequest = require('./request');
const CIPAttribute = require('./attribute');
const { Decode } = require('../datatypes/decoding');


function CIPMetaObject(classCode, classAttributeGroup, instanceAttributeGroup, statusDescriptions) {
  return class CIPObject {
    static GetClassAttribute(attribute) {
      attribute = classAttributeGroup.getCode(attribute);
      return new CIPRequest(
        CommonServiceCodes.GetAttributeSingle,
        EPath.Encode(true, [
          new EPath.Segments.Logical.ClassID(classCode),
          new EPath.Segments.Logical.InstanceID(0),
          new EPath.Segments.Logical.AttributeID(attribute)
        ]),
        null,
        (buffer, offset, cb) => {
          this.DecodeClassAttribute(buffer, offset, attribute, cb);
        }
      );
    }

    static GetInstanceAttribute(instance, attribute) {
      attribute = instanceAttributeGroup.getCode(attribute);
      return new CIPRequest(
        CommonServiceCodes.GetAttributeSingle,
        EPath.Encode(true, [
          new EPath.Segments.Logical.ClassID(classCode),
          new EPath.Segments.Logical.InstanceID(instance),
          new EPath.Segments.Logical.AttributeID(attribute)
        ]),
        null,
        (buffer, offset, cb) => {
          this.DecodeInstanceAttribute(buffer, offset, attribute, cb);
        }
      );
    }

    static DecodeAttribute(buffer, offset, attribute, cb) {
      if (attribute instanceof CIPAttribute.Class) {
        return this.DecodeClassAttribute(buffer, offset, attribute, cb);
      } else if (attribute instanceof CIPAttribute.Instance) {
        return this.DecodeInstanceAttribute(buffer, offset, attribute, cb);
      } else {
        throw new Error('Unable to determine if attribute is for class or instance');
      }
    }

    static DecodeInstanceAttribute(buffer, offset, attribute, cb) {
      return DecodeAttribute(buffer, offset, instanceAttributeGroup.get(attribute), cb);
    }

    static DecodeClassAttribute(buffer, offset, attribute, cb) {
      return DecodeAttribute(buffer, offset, classAttributeGroup.get(attribute), cb);
    }
  }
}


module.exports = CIPMetaObject;



function DecodeAttribute(buffer, offset, attribute, cb) {
  const dataType = attribute.dataType;
  if (!dataType) {
    console.log(attribute);
    throw new Error(`Unknown attribute: ${attribute}`);
  }

  let value;
  offset = Decode(dataType, buffer, offset, val => value = val);

  if (typeof cb === 'function') {
    cb({
      attribute,
      value
    });
  }
  return offset;
}