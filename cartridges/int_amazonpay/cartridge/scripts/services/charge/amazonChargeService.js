'use strict';

var LocalServiceRegistry = require('dw/svc/LocalServiceRegistry');
var amazonChargeServiceCallback = require('*/cartridge/scripts/services/charge/amazonChargeServiceCallback');
var constants = require('*/cartridge/scripts/services/amazonServicesConstants');
var AmazonPayRequest = require('*/cartridge/scripts/lib/AmazonPayRequest'); // eslint-disable-line no-unused-vars
/**
 * @module amazonChargeService
 */
var amazonChargeService = {
    /**
     * You can create a Charge to authorize payment, if you have a Charge Permission in a Chargeable state.
     * @param {AmazonPayRequest} amazonPayRequest Parameters
     * @param {Object} amazonPayRequest.payload Payload
     * @param {string} amazonPayRequest.payload.chargePermissionId Charge identifier
     * @param {price} amazonPayRequest.payload.chargeAmount Represents the amount to be charged/authorized
     * @param {boolean} amazonPayRequest.payload.captureNow Boolean that indicates whether or not Charge should be captured immediately after a successful authorization
     * @param {string} amazonPayRequest.idempotencyKey Idempotency key to safely retry requests.
     * @param {string} amazonPayRequest.softDescriptor Description shown on the buyer's payment instrument statement.
     * The soft descriptor sent to the payment processor is: 'AMZ* <soft descriptor specified here>'
     * @returns {Object} Result of the service.
     */
    create: function (amazonPayRequest) {
        var serviceName = constants.services.charge.create;
        var service = LocalServiceRegistry.createService(serviceName, amazonChargeServiceCallback.create);

        amazonPayRequest.normalizeUrl(service.getURL());
        amazonPayRequest.generateHeaders();

        return service.call(amazonPayRequest);
    },
    /**
     * Get Charge details such as charge amount and authorization state.
     * Use this operation to determine if authorization or capture was successful.
     * @param {AmazonPayRequest} amazonPayRequest Parameters
     * @param {string} amazonPayRequest.chargeId Charge Identifier
     * @returns {Object} Result of the service.
     */
    get: function (amazonPayRequest) {
        var serviceName = constants.services.charge.get;
        var service = LocalServiceRegistry.createService(serviceName, amazonChargeServiceCallback.get);

        amazonPayRequest.normalizeUrl(service.getURL());
        amazonPayRequest.generateHeaders();

        return service.call(amazonPayRequest);
    },
    /**
     * Capture payment on a Charge in the Authorized state.
     * A successful Capture will move the Charge from Authorized to Captured state.
     * The Captured state may be preceded by a temporary CaptureInitiated state if payment was captured more than 7 days after authorization.
     * @param {AmazonPayRequest} amazonPayRequest Parameters
     * @param {price} amazonPayRequest.payload.captureAmount Amount to capture
     * @param {string} amazonPayRequest.payload.softDescriptor Description shown on the buyer's payment instrument statement.
     * The soft descriptor sent to the payment processor is: "AMZ* <soft descriptor specified here>"
     * @returns {Object} Result of the service.
     */
    capture: function (amazonPayRequest) {
        var serviceName = constants.services.charge.capture;
        var service = LocalServiceRegistry.createService(serviceName, amazonChargeServiceCallback.capture);

        amazonPayRequest.normalizeUrl(service.getURL());
        amazonPayRequest.generateHeaders();

        return service.call(amazonPayRequest);
    },
    /**
     * Moves Charge to Canceled state and releases any authorized payments.
     * You can call this operation until Capture is initiated
     * while Charge is in an AuthorizationInitiated or Authorized state.
     * @param {AmazonPayRequest} amazonPayRequest Parameters
     * @param {string} amazonPayRequest.payload.cancellationReason Merchant-provided reason for canceling Charge.
     * @returns {Object} Result of the service.
     */
    cancel: function (amazonPayRequest) {
        var serviceName = constants.services.charge.cancel;
        var service = LocalServiceRegistry.createService(serviceName, amazonChargeServiceCallback.cancel);

        amazonPayRequest.normalizeUrl(service.getURL());
        amazonPayRequest.generateHeaders();

        return service.call(amazonPayRequest);
    }
};

/**
 * @typedef price
 * @type {Object}
 * @property {String} amount Transaction amount
 * @property {String} currencyCode Transaction currency code in ISO 4217 format
 */

module.exports = amazonChargeService;
