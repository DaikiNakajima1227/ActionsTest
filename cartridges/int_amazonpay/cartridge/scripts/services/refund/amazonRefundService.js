'use strict';

var LocalServiceRegistry = require('dw/svc/LocalServiceRegistry');

var amazonRefundServiceCallback = require('*/cartridge/scripts/services/refund/amazonRefundServiceCallback');
var constants = require('*/cartridge/scripts/services/amazonServicesConstants');
var AmazonPayRequest = require('*/cartridge/scripts/lib/AmazonPayRequest'); // eslint-disable-line no-unused-vars

/**
 * @module amazonRefundService
 */
var amazonRefundService = {
    /**
     * Initiate a full or partial refund for a charge.
     * @param {AmazonPayRequest} amazonPayRequest Parameters
     * @param {string} amazonPayRequest.payload.chargeId Charge identifier.
     * @param {price} amazonPayRequest.payload.refundAmount Amount to be refunded.
     * @param {string} amazonPayRequest.softDescriptor The description is shown on the buyer payment instrument (such as bank) statement.
     * Default: "AMZ* <MerchantStoreName> amzn.com/pmts"
     * @returns {Result} Result of service.
     */
    create: function (amazonPayRequest) {
        var serviceName = constants.services.refund.create;
        var service = LocalServiceRegistry.createService(serviceName, amazonRefundServiceCallback.create);

        amazonPayRequest.normalizeUrl(service.getURL());
        amazonPayRequest.generateHeaders();

        return service.call(amazonPayRequest);
    },
    /**
     * Initiate a full or partial refund for a charge.
     * @param {AmazonPayRequest} amazonPayRequest Parameters
     * @param {string} amazonPayRequest.refundId Refund identifier
     * @returns {Result} Result of service.
     */
    get: function (amazonPayRequest) {
        var serviceName = constants.services.refund.get;
        var service = LocalServiceRegistry.createService(serviceName, amazonRefundServiceCallback.get);

        amazonPayRequest.normalizeUrl(service.getURL());
        amazonPayRequest.generateHeaders();

        return service.call(amazonPayRequest);
    }
};

/**
 * @typedef price
 * @type {Object}
 * @property {String} amount Transaction amount.
 * @property {String} currencyCode Transaction currency code in ISO 4217 format. Example: USD.
 */
/**
 * @typedef Result
 * @type {Object}
 * @property {Number} error An error-specific code if applicable. For example, this is the HTTP response code for an HTTPService.
 * @property {String} errorMessage An error message on a non-OK status.
 * @property {Boolean} mockResult The status of whether the response is the result of a "mock" service call.
 * @property {String} msg An extra error message on failure (if any).
 * @property {Object} object The actual object returned by the service when the status is OK.
 * @property {Boolean} ok The status of whether the service call was successful.
 * @property {String} status The status. This is "OK" on success. Failure codes include "ERROR" and "SERVICE_UNAVAILABLE".
 * @property {String} unavailableReason The reason the status is SERVICE_UNAVAILABLE.
 */

module.exports = amazonRefundService;
