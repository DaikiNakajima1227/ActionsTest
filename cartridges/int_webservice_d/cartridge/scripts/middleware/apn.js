'use strict';

var Encoding = require('dw/crypto/Encoding');
var MessageDigest = require('dw/crypto/MessageDigest');
var Site = require('dw/system/Site');
var Bytes = require('dw/util/Bytes');
var URLUtils = require('dw/web/URLUtils');

var CurrentSite = Site.getCurrent();
var preferences = CurrentSite.getPreferences().getCustom();

function validateRequest(req, res, next) { // eslint-disable-line consistent-return
    if (!req.httpHeaders.get('x-apn-shared-token')) {
        res.redirect(URLUtils.url('APN-Fail', 'reasonCode', '1').toString());
        return next();
    }

    var md = new MessageDigest(preferences.amzPayAPNMessageDigestAlgorithm.value);
    md.updateBytes(new Bytes(preferences.amzPayAPNSharedToken));
    var sharedToken = Encoding.toHex(md.digest());

    if (req.httpHeaders.get('x-apn-shared-token') !== sharedToken) {
        res.redirect(URLUtils.url('APN-Fail', 'reasonCode', '2').toString());
    }
    next();
}

module.exports = {
    validateRequest: validateRequest
};
