'use strict';

var LocalServiceRegistry = require('dw/svc/LocalServiceRegistry');
var amazonBuyerServiceCallback = require('*/cartridge/scripts/services/buyer/amazonBuyerServiceCallback');
var constants = require('*/cartridge/scripts/services/amazonServicesConstants');
var AmazonPayRequest = require('*/cartridge/scripts/lib/AmazonPayRequest'); // eslint-disable-line no-unused-vars
/**
 * @module amazonSignInService
 */
var amazonBuyerService = {
    /**
     * Get Buyer info such as buyerId, phone number, shipping address.
     * @param {AmazonPayRequest} amazonPayRequest Parameters
     * @returns {Object} Result of the service.
     */
    get: function (amazonPayRequest) {
        var serviceName = constants.services.buyer.get;
        var service = LocalServiceRegistry.createService(serviceName, amazonBuyerServiceCallback.get);

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

module.exports = amazonBuyerService;
