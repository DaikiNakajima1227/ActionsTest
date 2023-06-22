'use strict';

var baseBilling = require('base/checkout/billing');

baseBilling.methods.updatePaymentInformation = function updatePaymentInformation(order) {
    var $paymentSummary = $('.payment-details');
    var htmlToAppend = '';

    if (order.billing.payment && order.billing.payment.selectedPaymentInstruments && order.billing.payment.selectedPaymentInstruments.length > 0) {
        order.billing.payment.selectedPaymentInstruments.forEach(function (pi) {
            if (pi.paymentMethod === 'CREDIT_CARD') {
                htmlToAppend += '<span>' + order.resources.cardType + ' '
                    + pi.type
                    + '</span><div>'
                    + pi.maskedCreditCardNumber
                    + '</div><div><span>'
                    + order.resources.cardEnding + ' '
                    + pi.expirationMonth
                    + '/' + pi.expirationYear
                    + '</span></div>';
            } else if (pi.paymentMethod === 'AMAZON_PAY' && $('.amazon_pay-tab .amazon_pay-option').length) {
                htmlToAppend += '<div class="amazon_pay-option">'
                + '<span>' + pi.paymentDescriptor + '</span>';

                if (order.amzPayRedirectURL) {
                    htmlToAppend += ' <span class="change-payment">' + pi.paymentEdit + '</span>'
                    + '</div>';
                }
            }
        });
    }

    $paymentSummary.empty().append(htmlToAppend);

    if (order.billing.payment && order.billing.payment.selectedPaymentInstruments && order.billing.payment.selectedPaymentInstruments.length > 0) {
        order.billing.payment.selectedPaymentInstruments.forEach(function (pi) {
            if (pi.paymentMethod === 'AMAZON_PAY' && $('.amazon_pay-tab .amazon_pay-option').length && order.amzPayRedirectURL) {
                if ($('.change-payment').length) {
                    amazon.Pay.bindChangeAction('.change-payment', {
                    amazonCheckoutSessionId: order.amzPayCheckoutSessionId,
                    changeAction: 'changePayment'
                });
            }
            }
        });
    }
};

baseBilling.paymentTabs = function () {
    $('.payment-options .nav-item').on('click', function (e) {
        e.preventDefault();
        var methodID = $(this).data('method-id');
        $('.payment-information').data('payment-method-id', methodID);
        sessionStorage.setItem('paymentMethodId', methodID);
    });

    $('.amazon_pay-message').addClass('d-none');
    $('.amazon_pay-tab').on('click', function () {
        $('.amazon_pay-message').removeClass('d-none');
    })
};

module.exports = baseBilling;
