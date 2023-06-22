'use strict';

var server = require('server');
server.extend(module.superModule);

var BasketMgr = require('dw/order/BasketMgr');

server.prepend('SelectShippingMethod', function (req, res, next) {
    var currentBasket = BasketMgr.getCurrentBasket();

    var shippingMethodID = req.querystring.methodID || req.form.methodID;
    var shipment = currentBasket.defaultShipment;

    if (!empty(currentBasket.custom.amzPayCheckoutSessionId) && !empty(currentBasket.custom.amzPayRedirectURL)) {
        var Transaction = require('dw/system/Transaction');
        var AccountModel = require('*/cartridge/models/account');
        var OrderModel = require('*/cartridge/models/order');
        var ShippingHelper = require('*/cartridge/scripts/checkout/shippingHelpers');
        var Locale = require('dw/util/Locale');
        var basketCalculationHelpers = require('*/cartridge/scripts/helpers/basketCalculationHelpers');
        var AmazonPayRequest = require('*/cartridge/scripts/lib/AmazonPayRequest');
        var CheckoutSessionService = require('*/cartridge/scripts/services/checkoutSession/amazonCheckoutSessionService');

        var amazonPayRequest = new AmazonPayRequest(currentBasket, 'GET', '', ':checkoutSessionId', currentBasket.custom.amzPayCheckoutSessionId);
        var result = CheckoutSessionService.get(amazonPayRequest);
        var checkoutSession;

        try {
            checkoutSession = JSON.parse(result.object);
        } catch (error) {
            return next();
        }

        var amzShippingAddress = checkoutSession.shippingAddress;
        var firstName = '';
        var lastName = '';

        var names = amzShippingAddress.name.split(' ');

        names.forEach(function (n, i, a) {
            if (i === 0) {
                firstName = n;
            } else {
                lastName = lastName + n + (i + 1 < a.length ? ' ' : '');
            }
        });

        if (empty(lastName) && amzShippingAddress.countryCode !== 'JP') {
            lastName = '-';
        }

        var address1 = '';
        var address2 = '';

        if (empty(amzShippingAddress.addressLine1) && !empty(amzShippingAddress.addressLine2)) {
            address1 = amzShippingAddress.addressLine2;
            address2 = amzShippingAddress.addressLine2;
        } else {
            address1 = amzShippingAddress.addressLine1;
            address2 = amzShippingAddress.addressLine2;
        }

        address2 = !empty(amzShippingAddress.addressLine3) ? address2 + ' ' + amzShippingAddress.addressLine3 : address2;

        try {
            Transaction.wrap(function () {
                var shippingAddress = shipment.shippingAddress;

                if (!shippingAddress) {
                    shippingAddress = shipment.createShippingAddress();
                }

                shippingAddress.setFirstName(firstName || '');
                shippingAddress.setLastName(lastName || '');
                shippingAddress.setAddress1(address1 || '');
                shippingAddress.setAddress2(address2 || '');
                shippingAddress.setCity(amzShippingAddress.city || '');
                shippingAddress.setPostalCode(amzShippingAddress.postalCode || '');
                shippingAddress.setStateCode(amzShippingAddress.stateOrRegion || '');
                shippingAddress.setCountryCode(amzShippingAddress.countryCode || '');
                shippingAddress.setPhone(amzShippingAddress.phoneNumber || '');

                ShippingHelper.selectShippingMethod(shipment, shippingMethodID);

                basketCalculationHelpers.calculateTotals(currentBasket);
            });
        } catch (err) {
            var Resource = require('dw/web/Resource');
            var Logger = require('dw/system/Logger');
            var e = err;
            Logger.getLogger('AmazonPay', 'SelectShippingMethod').error(e.toString());
            res.setStatusCode(500);
            res.json({
                error: true,
                err: e,
                errorMessage: Resource.msg('error.cannot.select.shipping.method', 'cart', null)
            });

            this.emit('route:Complete', req, res);
            return; // eslint-disable-line consistent-return
        }

        amazonPayRequest = new AmazonPayRequest(currentBasket, 'PATCH', '', ':checkoutSessionId', currentBasket.custom.amzPayCheckoutSessionId);
        result = CheckoutSessionService.update(amazonPayRequest);

        var usingMultiShipping = req.session.privacyCache.get('usingMultiShipping');
        var currentLocale = Locale.getLocale(req.locale.id);

        var basketModel = new OrderModel(
            currentBasket,
            { usingMultiShipping: usingMultiShipping, countryCode: currentLocale.country, containerView: 'basket' }
        );

        res.json({
            customer: new AccountModel(req.currentCustomer),
            order: basketModel
        });

        this.emit('route:Complete', req, res);
        return; // eslint-disable-line consistent-return
    }

    return next();
});

module.exports = server.exports();
