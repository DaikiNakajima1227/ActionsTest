'use strict';

var collections = require('*/cartridge/scripts/util/collections');

var Resource = require('dw/web/Resource');
var Transaction = require('dw/system/Transaction');

var AmazonPayRequest = require('*/cartridge/scripts/lib/AmazonPayRequest');
var CheckoutSessionService = require('*/cartridge/scripts/services/checkoutSession/amazonCheckoutSessionService');

/**
 * Creates a token. This should be replaced by utilizing a tokenization provider
 * @returns {string} a token
 */
function createToken() {
    return Math.random().toString(36).substr(2);
}

/**
 * Verifies that entered credit card information is a valid card. If the information is valid a
 * credit card payment instrument is created
 * @param {dw.order.Basket} basket Current users's basket
 * @param {Object} paymentInformation - the payment information
 * @return {Object} returns an error object
 */
function Handle(basket, paymentInformation) {
    var currentBasket = basket;
    var cardErrors = {};
    var serverErrors = [];

    Transaction.wrap(function () { // eslint-disable-line consistent-return
        var paymentInstruments = currentBasket.getPaymentInstruments().toArray();

        paymentInstruments.forEach(function (paymentInstrument) {
            if (paymentInstrument.getPaymentMethod() !== 'GIFT_CERTIFICATE') {
                Transaction.wrap(function() {
                    currentBasket.removePaymentInstrument(paymentInstrument);
                });
            }
        });

        var paymentInstrument = currentBasket.createPaymentInstrument(
            'AMAZON_PAY', currentBasket.totalGrossPrice
        );

        if (currentBasket.custom.amzPayCheckoutSessionId) {
            var Logger = require('dw/system/Logger');
            var amazonPayRequest = new AmazonPayRequest(currentBasket, 'PATCH', '', ':checkoutSessionId', currentBasket.custom.amzPayCheckoutSessionId);
            var result = CheckoutSessionService.update(amazonPayRequest);
            var checkoutSession;

            if (!result.ok) {
                Logger.getLogger('AmazonPay', 'AmazonPay-CheckoutSession').error(result.toString());
                serverErrors.push(result.errorMessage);

                return { fieldErrors: [cardErrors], serverErrors: serverErrors, error: true };
            }

            try {
                checkoutSession = JSON.parse(result.object);
            } catch (e) {
                var error = e;
                Logger.getLogger('AmazonPay', 'AmazonPay-CheckoutSession').error(error.toString());
                serverErrors.push(error.toString());

                return { fieldErrors: [cardErrors], serverErrors: serverErrors, error: true };
            }

            paymentInstrument.custom.amzPayPaymentDescriptor = !empty(checkoutSession.paymentPreferences[0])
                ? checkoutSession.paymentPreferences[0].paymentDescriptor
                : '';
        }

        paymentInstrument.custom.amzPayPaymentDescriptor = empty(paymentInstrument.custom.amzPayPaymentDescriptor) ? 'Amazon Pay' : paymentInstrument.custom.amzPayPaymentDescriptor;
        paymentInstrument.setCreditCardHolder(currentBasket.billingAddress.fullName);
        paymentInstrument.setCreditCardToken(
            paymentInformation.creditCardToken
                ? paymentInformation.creditCardToken
                : createToken()
        );
    });

    return { fieldErrors: cardErrors, serverErrors: serverErrors, error: false };
}

/**
 * Authorizes a payment using a credit card. Customizations may use other processors and custom
 *      logic to authorize credit card payment.
 * @param {number} orderNumber - The current order's number
 * @param {dw.order.PaymentInstrument} paymentInstrument -  The payment instrument to authorize
 * @param {dw.order.PaymentProcessor} paymentProcessor -  The payment processor of the current
 *      payment method
 * @return {Object} returns an error object
 */
function Authorize(orderNumber, paymentInstrument, paymentProcessor) {
    var serverErrors = [];
    var fieldErrors = {};
    var error = false;

    try {
        Transaction.wrap(function () {
            paymentInstrument.paymentTransaction.setTransactionID(orderNumber);
            paymentInstrument.paymentTransaction.setPaymentProcessor(paymentProcessor);
        });
    } catch (e) {
        error = true;
        serverErrors.push(
            Resource.msg('error.technical', 'checkout', null)
        );
    }

    return { fieldErrors: fieldErrors, serverErrors: serverErrors, error: error };
}

exports.Handle = Handle;
exports.Authorize = Authorize;
exports.createToken = createToken;
