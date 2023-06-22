'use strict';

var Logger = require('dw/system/Logger');
var Site = require('dw/system/Site');
var Status = require('dw/system/Status');

module.exports = {
    execute: function () {
        var log = Logger.getLogger('DebugSignature', 'DebugSignature');
        try {
            var helper = require('../lib/pssSig');
            var preferences = Site.getCurrent().getPreferences().getCustom();
            var sig = new helper.Signature({ alg: 'SHA256withRSAandMGF1', psssaltlen: 20, prov: 'cryptojs/jsrsa' });
            sig.init(preferences.amzPaySecretKey);
            var hexSigVal = sig.signString('AMZN-PAY-RSASSA-PSS\n4481eae88660a73ced43295844fed7f0e4097c5fe2ad8d1c446eb63a94c85d7a');
            var finSignature = helper.hextob64(hexSigVal);
            log.info('Hashed Payload: {0}', finSignature);
            return new Status(Status.OK);
        } catch (e) {
            var error = e;
            log.info('{0} {1} \n {2}', error.rhinoException.toString(), error.message, error.stack);
            return new Status(Status.ERROR);
        }
    }
};
