'use strict';

var server = require('server');

server.post('Notification', server.middleware.https, function (req, res, next) { // eslint-disable-line consistent-return
    var Order = require('dw/order/Order');
    var OrderMgr = require('dw/order/OrderMgr');
    var Logger = require('dw/system/Logger');
    var Transaction = require('dw/system/Transaction');
    var ArrayList = require('dw/util/ArrayList');
    var Money = require('dw/value/Money');
    var Resource = require('dw/web/Resource');

    var AmazonPayRequest = require('*/cartridge/scripts/lib/AmazonPayRequest');
    var ChargePermission = require('*/cartridge/scripts/services/chargePermission/amazonChargePermissionService');
    var ChargeService = require('*/cartridge/scripts/services/charge/amazonChargeService');
    var RefundService = require('*/cartridge/scripts/services/refund/amazonRefundService');

    var charge;
    var chargeAmount;
    var chargePermission;
    var chargePermissionRequest;
    var chargeRequest;
    var notifications;
    var order;
    var refund;
    var refundRequest;
    var refundAmount;
    var reasonCodes;
    var result;
    var subject;
    var text;
    var body;
    var notification;
    var orderNotConfirmed;

    var ipnLogger = Logger.getLogger('IPN', 'IPN');

    try {
        body = JSON.parse(req.body);
    } catch (error) {
        ipnLogger.error(error.toString());
        res.setStatusCode(400);
        res.json({
            success: false,
            errorMessage: Resource.msgf('error.message.invalid.json', 'amazon', null)
        });
        return next();
    }

    try {
        notification = JSON.parse(body.Message);
    } catch (error) {
        ipnLogger.error(error.toString());
        res.setStatusCode(400);
        res.json({
            success: false,
            errorMessage: Resource.msgf('error.message.invalid.json', 'amazon', null)
        });
        return next();
    }

    if (notification.ObjectType === 'CHARGE') {
        chargeRequest = new AmazonPayRequest(null, 'GET', '', ':chargeId', notification.ObjectId);
        result = ChargeService.get(chargeRequest);

        if (!result.ok) {
            ipnLogger.error(result.getErrorMessage());
            res.setStatusCode(500);
            res.json({
                success: false,
                errorMessage: Resource.msgf('error.message.service.error', 'amazon', null)
            });
            return next();
        }

        try {
            charge = JSON.parse(result.object);
        } catch (error) {
            ipnLogger.error(error.toString());
            res.setStatusCode(400);
            res.json({
                success: false,
                errorMessage: Resource.msgf('error.order.invalid.json.2', 'amazon', null, 'Charge')
            });
            return next();
        }

        order = OrderMgr.searchOrder('custom.amzPayChargePermissionId={0}', charge.chargePermissionId);

        if (!order) {
            ipnLogger.error(Resource.msgf('error.message.notfound.order', 'amazon', null, 'ChargePermissionId', charge.chargePermissionId));
            res.setStatusCode(404);
            res.json({
                success: false,
                errorMessage: Resource.msgf('error.message.service.error', 'amazon', null)
            });
            return next();
        }

        orderNotConfirmed = order.getConfirmationStatus().getValue() === Order.CONFIRMATION_STATUS_NOTCONFIRMED;
        if (orderNotConfirmed) {
            res.setStatusCode(500);
            res.json({
                success: false
            });
            return next();
        }

        notifications = new ArrayList(order.custom.amzPayNotificationsIds);

        if (!notifications.contains(notification.NotificationId)) {
            // Add Notification Id to the Array
            notifications.push(notification.NotificationId);

            // Add the values to subject and text to add a new Note
            if (charge.statusDetails.reasonCode) {
                subject = Resource.msgf('notes.subject.charge.1', 'amazon', null, charge.statusDetails.state, charge.statusDetails.reasonCode);
                text = Resource.msgf('charge.status.code.msg.' + charge.statusDetails.reasonCode, 'amazon', null, charge.chargeId);
            } else {
                subject = Resource.msgf('notes.subject.charge.2', 'amazon', null, charge.statusDetails.state);
                text = Resource.msgf('charge.status.code.msg.' + charge.statusDetails.state, 'amazon', null, charge.chargeId);
            }

            if (charge.statusDetails.state === 'Declined') {
                try {
                    Transaction.wrap(function () {
                        order.addNote('IPN | ' + subject, text);
                        order.custom.amzPayChargeId = charge.chargeId;
                        order.custom.amzPayChargeState = charge.statusDetails.state;
                        order.custom.amzPayChargeReasonCode = charge.statusDetails.reasonCode;
                        order.custom.amzPayNotificationsIds = notifications.toArray();
                        var status = OrderMgr.cancelOrder(order);
                        ipnLogger.error(status.getMessage());
                        order.setCancelCode(charge.statusDetails.state);
                        order.setCancelDescription(text);
                    });
                } catch (error) {
                    ipnLogger.error(error.toString());
                    res.setStatusCode(304);
                    res.json({
                        success: false,
                        errorMessage: Resource.msg('error.order.not.updated', 'amazon', null)
                    });
                    return next();
                }
            } else if (charge.statusDetails.state === 'Captured') {
                try {
                    chargeAmount = new Money(Number(charge.chargeAmount.amount), charge.chargeAmount.currencyCode);
                    Transaction.wrap(function () {
                        // check if the total amount is equal to total gross price
                        if (order.totalGrossPrice.equals(chargeAmount)) {
                            order.setPaymentStatus(Order.PAYMENT_STATUS_PAID);
                        }

                        order.addNote('IPN | ' + subject, text);
                        order.custom.amzPayChargeId = charge.chargeId;
                        order.custom.amzPayChargeState = charge.statusDetails.state;
                        order.custom.amzPayChargeReasonCode = charge.statusDetails.reasonCode;
                        order.custom.amzPayNotificationsIds = notifications.toArray();
                    });
                } catch (error) {
                    ipnLogger.error(error.toString());
                    res.setStatusCode(304);
                    res.json({
                        success: false,
                        errorMessage: Resource.msg('error.order.not.updated', 'amazon', null)
                    });
                    return next();
                }
            } else if (charge.statusDetails.state === 'Canceled') {
                try {
                    Transaction.wrap(function () {
                        OrderMgr.cancelOrder(order);
                        order.setCancelCode(charge.statusDetails.state);
                        order.setCancelDescription(text);
                        order.addNote('IPN | ' + subject, text);
                        order.custom.amzPayChargeId = charge.chargeId;
                        order.custom.amzPayChargeState = charge.statusDetails.state;
                        order.custom.amzPayChargeReasonCode = charge.statusDetails.reasonCode;
                        order.custom.amzPayNotificationsIds = notifications.toArray();
                    });
                } catch (error) {
                    ipnLogger.error(error.toString());
                    res.setStatusCode(304);
                    res.json({
                        success: false,
                        errorMessage: Resource.msg('error.order.not.updated', 'amazon', null)
                    });
                    return next();
                }
            } else {
                try {
                    Transaction.wrap(function () {
                        order.addNote('IPN | ' + subject, text);
                        order.custom.amzPayChargeId = charge.chargeId;
                        order.custom.amzPayChargeState = charge.statusDetails.state;
                        order.custom.amzPayChargeReasonCode = charge.statusDetails.reasonCode;
                        order.custom.amzPayNotificationsIds = notifications.toArray();
                    });
                } catch (error) {
                    ipnLogger.error(error.toString());
                    res.setStatusCode(304);
                    res.json({
                        success: false,
                        errorMessage: Resource.msg('error.order.not.updated', 'amazon', null)
                    });
                    return next();
                }
            }

            // Get the Charge Permission to update in order attributes
            chargePermissionRequest = new AmazonPayRequest('', 'GET', '', ':chargePermissionId', charge.chargePermissionId);
            result = ChargePermission.get(chargePermissionRequest);

            if (!result.ok) {
                ipnLogger.error(result.getErrorMessage());
                res.setStatusCode(500);
                res.json({
                    success: false,
                    errorMessage: Resource.msg('error.message.service.error', 'amazon', null)
                });
                return next();
            }

            try {
                chargePermission = JSON.parse(result.object);
            } catch (error) {
                ipnLogger.error(error.toString());
                res.setStatusCode(400);
                res.json({
                    success: false,
                    errorMessage: Resource.msgf('error.order.invalid.json.2', 'amazon', null, 'Charge')
                });
                return next();
            }

            try {
                reasonCodes = new ArrayList(order.custom.amzPayChargePermissionReasonCode);
                Transaction.wrap(function () {
                    chargePermission.statusDetails.reasons.forEach(function (e) {
                        reasonCodes.push(e.reasonCode);
                        subject = Resource.msgf('notes.subject.chargepermission.1', 'amazon', null, chargePermission.statusDetails.state, e.reasonCode);
                        text = Resource.msgf('chargepermission.status.code.msg.' + e.reasonCode, 'amazon', null, chargePermission.chargePermissionId);

                        order.addNote('IPN | ' + subject, text);
                    });
                    order.custom.amzPayChargePermissionState = chargePermission.statusDetails.state;
                    order.custom.amzPayChargePermissionReasonCode = reasonCodes.toArray();
                });
            } catch (error) {
                ipnLogger.error(error.toString());
                res.setStatusCode(304);
                res.json({
                    success: false,
                    errorMessage: Resource.msg('error.order.not.updated', 'amazon', null)
                });
                return next();
            }
        }
    } else if (notification.ObjectType === 'REFUND') {
        refundRequest = new AmazonPayRequest(order, 'GET', '', ':refundId', notification.ObjectId);
        result = RefundService.get(refundRequest);

        if (!result.ok) {
            ipnLogger.error(result.getErrorMessage());
            res.setStatusCode(500);
            res.json({
                success: false,
                errorMessage: Resource.msg('error.message.service.error', 'amazon', null)
            });
            return next();
        }

        try {
            refund = JSON.parse(result.object);
        } catch (error) {
            ipnLogger.error(error.toString());
            res.setStatusCode(400);
            res.json({
                success: false,
                errorMessage: Resource.msg('error.order.invalid.json.2', 'amazon', null, 'Charge')
            });
            return next();
        }

        order = OrderMgr.searchOrder('custom.amzPayChargeId={0}', refund.chargeId);

        if (!order) {
            ipnLogger.error(Resource.msgf('error.message.notfound.order', 'amazon', null, 'amzPayChargeId', refund.chargeId));
            res.setStatusCode(404);
            res.json({
                success: false,
                errorMessage: Resource.msgf('error.message.notfound.order', 'amazon', null, 'amzPayChargeId', refund.chargeId)
            });
            return next();
        }

        orderNotConfirmed = order.getConfirmationStatus().getValue() === Order.CONFIRMATION_STATUS_NOTCONFIRMED;
        if (orderNotConfirmed) {
            res.setStatusCode(500);
            res.json({
                success: false
            });
            return next();
        }

        notifications = new ArrayList(order.custom.amzPayNotificationsIds);

        if (!notifications.contains(notification.NotificationId)) {
            notifications.push(notification.NotificationId);

            if (refund.statusDetails.reasonCode) {
                subject = Resource.msgf('notes.subject.refund.1', 'amazon', null, refund.statusDetails.state);
                text = Resource.msgf('refund.status.code.msg.' + refund.statusDetails.reasonCode, 'amazon', null, refund.refundId);
            } else {
                subject = Resource.msgf('notes.subject.refund.2', 'amazon', null, refund.statusDetails.state);
                text = Resource.msgf('refund.status.code.msg.' + refund.statusDetails.state, 'amazon', null, refund.refundId);
            }

            try {
                refundAmount = new Money(Number(refund.refundAmount.amount), refund.refundAmount.currencyCode);

                Transaction.wrap(function () {
                    if (order.totalGrossPrice.equals(refundAmount)) {
                        // Cancel Order
                        OrderMgr.cancelOrder(order);
                        order.setCancelCode(refund.statusDetails.state);
                        order.setCancelDescription(text);
                    }

                    order.addNote('IPN | ' + subject, text);
                    order.custom.amzPayRefundId = refund.refundId;
                    order.custom.amzPayRefundState = refund.statusDetails.state;
                    order.custom.amzPayRefundReasonCode = refund.statusDetails.reasonCode;
                    order.custom.amzPayNotificationsIds = notifications.toArray();
                });
            } catch (error) {
                ipnLogger.error(error.toString());
                res.setStatusCode(304);
                res.json({
                    success: false,
                    errorMessage: Resource.msg('error.order.not.updated', 'amazon', null)
                });
                return next();
            }

            // GET the CHARGE object to update the Order details
            chargeRequest = new AmazonPayRequest(order, 'GET', '', ':chargeId', refund.chargeId);
            result = ChargeService.get(chargeRequest);

            if (!result.ok) {
                ipnLogger.error(result.getErrorMessage());
                res.setStatusCode(500);
                res.json({
                    success: false,
                    errorMessage: Resource.msg('error.message.service.error', 'amazon', null)
                });
                return next();
            }

            try {
                charge = JSON.parse(result.object);
            } catch (error) {
                ipnLogger.error(error.toString());
                res.setStatusCode(400);
                res.json({
                    success: false,
                    errorMessage: Resource.msgf('error.order.invalid.json.2', 'amazon', null, 'charge')
                });
                return next();
            }

            // Add the values to subject and text to add a new Note
            if (charge.statusDetails.reasonCode) {
                subject = Resource.msgf('notes.subject.charge.1', 'amazon', null, charge.statusDetails.state, charge.statusDetails.reasonCode);
                text = Resource.msgf('charge.status.code.msg.' + charge.statusDetails.reasonCode, 'amazon', null, charge.chargeId);
            } else {
                subject = Resource.msgf('notes.subject.charge.2', 'amazon', null, charge.statusDetails.state);
                text = Resource.msgf('charge.status.code.msg.' + charge.statusDetails.state, 'amazon', null, charge.chargeId);
            }

            try {
                Transaction.wrap(function () {
                    order.addNote('IPN | ' + subject, text);
                    order.custom.amzPayChargeReasonCode = charge.statusDetails.reasonCode;
                    order.custom.amzPayChargeState = charge.statusDetails.state;
                });
            } catch (error) {
                ipnLogger.error(error.toString());
                res.setStatusCode(304);
                res.json({
                    success: false,
                    errorMessage: Resource.msg('error.order.not.updated', 'amazon', null)
                });
                return next();
            }

            // GET the CHARGE PERMISSION object to update the Order details
            chargePermissionRequest = new AmazonPayRequest('', 'GET', '', ':chargePermissionId', charge.chargePermissionId);
            result = ChargePermission.get(chargePermissionRequest);

            if (!result.ok) {
                ipnLogger.error(result.getErrorMessage());
                res.setStatusCode(500);
                res.json({
                    success: false,
                    errorMessage: Resource.msg('error.message.service.error', 'amazon', null)
                });
                return next();
            }

            try {
                chargePermission = JSON.parse(result.object);
            } catch (error) {
                ipnLogger.error(error.toString());
                res.setStatusCode(400);
                res.json({
                    success: false,
                    errorMessage: Resource.msgf('error.order.invalid.json.2', 'amazon', null, 'Charge Permission')
                });
                return next();
            }

            try {
                reasonCodes = new ArrayList(order.custom.amzPayChargePermissionReasonCode);
                Transaction.wrap(function () {
                    chargePermission.statusDetails.reasons.forEach(function (e) {
                        reasonCodes.push(e.reasonCode);
                        subject = Resource.msgf('notes.subject.chargepermission.1', 'amazon', null, chargePermission.statusDetails.state, e.reasonCode);
                        text = Resource.msgf('chargepermission.status.code.msg.' + e.reasonCode, 'amazon', null, chargePermission.chargePermissionId);

                        order.addNote('IPN | ' + subject, text);
                    });

                    order.custom.amzPayChargePermissionState = chargePermission.statusDetails.state;
                    order.custom.amzPayChargePermissionReasonCode = reasonCodes.toArray();
                });
            } catch (error) {
                ipnLogger.error(error.toString());
                res.setStatusCode(304);
                res.json({
                    success: false,
                    errorMessage: Resource.msg('error.order.not.updated', 'amazon', null)
                });
                return next();
            }
        }
    }

    res.json({
        success: false,
        body: notification
    });
    next();
});

module.exports = server.exports();
