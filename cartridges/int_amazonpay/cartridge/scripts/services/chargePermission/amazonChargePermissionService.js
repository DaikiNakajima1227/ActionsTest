'use strict';

var LocalServiceRegistry = require('dw/svc/LocalServiceRegistry');

var amazonChargePermissionServiceCallback = require('*/cartridge/scripts/services/chargePermission/amazonChargePermissionServiceCallback');
var constants = require('*/cartridge/scripts/services/amazonServicesConstants');
var AmazonPayRequest = require('*/cartridge/scripts/lib/AmazonPayRequest'); // eslint-disable-line no-unused-vars

/**
 * @module amazonChargePermissionService
 */

var amazonChargePermissionService = {
    /**
     * Get Charge Permission to determine if this Charge Permission can be used to charge the buyer.
     * @param {AmazonPayRequest} amazonPayRequest Parameters
     * @param {string} amazonPayRequest.chargePermissionId Charge Permission identifier
     * @returns {Object} Result of service.
     */
    get: function (amazonPayRequest) {
        var serviceName = constants.services.chargePermission.get;
        var service = LocalServiceRegistry.createService(serviceName, amazonChargePermissionServiceCallback.get);

        amazonPayRequest.normalizeUrl(service.getURL());
        amazonPayRequest.generateHeaders();

        return service.call(amazonPayRequest);
    },
    /**
     * Update the Charge Permission with your order metadata.
     * Some of the values may be shared with the buyer.
     * @param {AmazonPayRequest} amazonPayRequest Parameters
     * @param {string} amazonPayRequest.chargePermissionId Charge Permission identifier
     * @param {merchantMetadata} merchantMetadata Merchant-provided order details
     * @returns {Object} Result of service.
     */
    update: function (amazonPayRequest) {
        var serviceName = constants.services.chargePermission.update;
        var service = LocalServiceRegistry.createService(serviceName, amazonChargePermissionServiceCallback.update);

        amazonPayRequest.normalizeUrl(service.getURL());
        amazonPayRequest.generateHeaders();

        return service.call(amazonPayRequest);
    },
    /**
     * Moves the Charge Permission to a Closed state.
     * No future charges can be made and pending charges will be canceled if you set cancelPendingCharges to true.
     * @param {AmazonPayRequest} amazonPayRequest Parameters
     * @param {string} amazonPayRequest.chargePermissionId Charge Permission identifier
     * @param {string} amazonPayRequest.closureReason Merchant-provided reason for closing Charge Permission
     * @param {boolean} amazonPayRequest.cancelPendingCharges Boolean for whether pending charges should be canceled
     * @returns {Object} Result of service.
     */
    close: function (amazonPayRequest) {
        var serviceName = constants.services.chargePermission.close;
        var service = LocalServiceRegistry.createService(serviceName, amazonChargePermissionServiceCallback.close);

        amazonPayRequest.normalizeUrl(service.getURL());
        amazonPayRequest.generateHeaders();

        return service.call(amazonPayRequest);
    }
};

/**
 * @typedef merchantMetadata
 * @type {Object}
 * @property {String} merchantReferenceId External merchant order identifer.
 * @property {String} merchantStoreName Merchant store name.
 * @property {String} noteToBuyer Description of the order that is shared in buyer communication.
 * @property {String} customInformation Custom information for the order.
 * This data is not shared in any buyer communication.
 */

module.exports = amazonChargePermissionService;
