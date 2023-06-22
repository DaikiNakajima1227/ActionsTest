'use strict';

var LocalServiceRegistry = require('dw/svc/LocalServiceRegistry');

var amazonCheckoutSessionServiceCallback = require('*/cartridge/scripts/services/checkoutSession/amazonCheckoutSessionServiceCallback');
var constants = require('*/cartridge/scripts/services/amazonServicesConstants');
var AmazonPayRequest = require('*/cartridge/scripts/lib/AmazonPayRequest'); // eslint-disable-line no-unused-vars

/**
 * @module amazonCheckoutSessionService
 */

var amazonCheckoutSessionService = {
    /**
     * Create a new Amazon Pay Checkout Session to customize and manage the buyer experience,
     * from when the buyer clicks the Amazon Pay button to when they complete checkout.
     * @param {AmazonPayRequest} amazonPayRequest
     * @returns {Object} Result of service.
     */
    create: function (amazonPayRequest) {
        var serviceName = constants.services.checkoutSession.create;
        var service = LocalServiceRegistry.createService(serviceName, amazonCheckoutSessionServiceCallback.create);

        amazonPayRequest.normalizeUrl(service.getURL());
        amazonPayRequest.generateHeaders();

        return service.call(amazonPayRequest);
    },
    /**
     * Get Checkout Session details includes buyer info, payment instrument details, and shipping address.
     * Use this operation to determine if checkout was successful after the buyer returns
     * from the AmazonPayRedirectUrl to the specified checkoutResultReturnUrl.
     * @param {AmazonPayRequest} amazonPayRequest Parameters
     * @returns {Object} Result of service.
     */
    get: function (amazonPayRequest) {
        var serviceName = constants.services.checkoutSession.get;
        var service = LocalServiceRegistry.createService(serviceName, amazonCheckoutSessionServiceCallback.get);

        amazonPayRequest.normalizeUrl(service.getURL());
        amazonPayRequest.generateHeaders();

        return service.call(amazonPayRequest);
    },
    /**
     * Update the Checkout Session with transaction details.
     * You can keep updating the Checkout Session, as long as it’s in an Open state.
     * @param {AmazonPayRequest} amazonPayRequest Parameters
     * @param {string} amazonPayRequest.checkoutSessionId Checkout Session Identifier
     * @param {CheckoutSession} amazonPayRequest.payload
     * @returns {Object} Result of service.
     */
    update: function (amazonPayRequest) {
        var serviceName = constants.services.checkoutSession.update;
        var service = LocalServiceRegistry.createService(serviceName, amazonCheckoutSessionServiceCallback.update);

        amazonPayRequest.normalizeUrl(service.getURL());
        amazonPayRequest.generateHeaders();

        return service.call(amazonPayRequest);
    },
    /**
     * Get Complete Checkout Session details includes buyer info, payment instrument details, and shipping address.
     * Use this operation to determine if checkout was successful after the buyer returns
     * from the AmazonPayRedirectUrl to the specified checkoutResultReturnUrl.
     * @param {AmazonPayRequest} amazonPayRequest Parameters
     * @returns {Object} Result of service.
     */
    complete: function (amazonPayRequest) {
        var serviceName = constants.services.checkoutSession.complete;
        var service = LocalServiceRegistry.createService(serviceName, amazonCheckoutSessionServiceCallback.complete);

        amazonPayRequest.normalizeUrl(service.getURL());
        amazonPayRequest.generateHeaders();

        return service.call(amazonPayRequest);
    }
};

module.exports = amazonCheckoutSessionService;
