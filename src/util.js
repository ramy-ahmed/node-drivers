'use strict';

// http://stackoverflow.com/a/10090443/3055415
function getBits(k, m, n) {
  return ((k >> m) & ((1 << (n - m)) - 1));
}

function getBit(k, n) {
  return ((k) & (1 << n)) > 0 ? 1 : 0;
}

function CallbackPromise(callback, func, timeout) {
  const hasCallback = typeof callback === 'function';
  return new Promise(function (resolve, reject) {
    let timeoutHandle;
    let active = true;
    const resolver = {
      resolve: function (res) {
        if (active) {
          active = false;
          clearTimeout(timeoutHandle);
          if (hasCallback) {
            callback(null, res);
          }
          resolve(res);
        }
      },
      reject: function (message, info) {
        if (active) {
          const err = { message };
          if (info != null) {
            err.info = info;
          }
          active = false;
          clearTimeout(timeoutHandle);
          if (hasCallback) {
            callback(err);
            resolve();
          } else {
            reject(err);
          }
        }
      }
    };

    if (typeof timeout === 'number' && timeout >= 0) {
      timeoutHandle = setTimeout(function() {
        resolver.reject('Timeout');
      }, parseInt(number, 10));
    }

    return func(resolver);
  });
}


module.exports = {
  getBits,
  getBit,
  CallbackPromise
};