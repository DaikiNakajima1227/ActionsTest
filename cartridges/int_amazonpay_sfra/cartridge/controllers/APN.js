'use strict';

var server = require('server');

var Resource = require('dw/web/Resource');

var apn = require('*/cartridge/scripts/middleware/apn');

server.post('Notification', server.middleware.https, apn.validateRequest, function (req, res, next) {
    var OrderMgr = require('dw/order/OrderMgr');
    var Logger = require('dw/system/Logger');
    var Transaction = require('dw/system/Transaction');
    var Money = require('dw/value/Money');
    var ArrayList = require('dw/util/ArrayList');

    var sitePreferences = require('dw/system/Site').getCurrent().getPreferences().getCustom();

    var AmazonPayRequest = require('*/cartridge/scripts/lib/AmazonPayRequest');
    var ChargeService = require('*/cartridge/scripts/services/charge/amazonChargeService');
    var RefundService = require('*/cartridge/scripts/services/refund/amazonRefundService');
    var ChargePermissionService = require('*/cartridge/scripts/services/chargePermission/amazonChargePermissionService');

    var emailHelpers = require('*/cartridge/scripts/helpers/emailHelpers');
    var apnLogger = Logger.getLogger('APN', 'APN');

    var result;
    var order;
    var subject;
    var text;
    var notification;
    var body;

    try {
        body = JSON.parse(req.body);
    } catch (error) {
        res.setStatusCode(400);
        res.json({
            success: false,
            errorMessage: error.toString()
        });

        return next();
    }

    if (typeof body.Message === 'object') {
        notification = body.Message;
    } else {
        try {
            notification = JSON.parse(body.Message);
        } catch (error) {
            apnLogger.error(error.toString());
            res.setStatusCode(400);
            res.json({
                success: false,
                errorMessage: error.toString()
            });

            return next();
        }
    }

    switch (notification.ActionType) {
        case 'AUTHORIZE':
            // Search for order
            order = OrderMgr.searchOrder('custom.amzPayChargePermissionId={0}', notification.ChargePermissionId);

            if (!order) {
                apnLogger.error(Resource.msgf('error.message.notfound.order', 'amazon', null, 'ChargePermissionId', notification.ChargePermissionId));
                res.setStatusCode(404);
                res.json({
                    success: false,
                    errorMessage: Resource.msgf('error.message.notfound.order', 'amazon', null, 'ChargePermissionId', notification.ChargePermissionId)
                });

                return next();
            }

            var chargeAmount = null;

            if (notification.ChargeAmount) {
                chargeAmount = {
                    amount: notification.ChargeAmount.Amount,
                    currencyCode: notification.ChargeAmount.CurrencyCode
                };
            }

            var chargeRequest = new AmazonPayRequest(order, 'POST', '', '', notification.ChargePermissionId, chargeAmount, null, null);
            result = ChargeService.create(chargeRequest);

            if (!result.ok) {
                apnLogger.error(result.getErrorMessage());
                res.setStatusCode(result.getError());
                res.json({
                    success: false,
                    message: JSON.parse(result.getErrorMessage()),
                    errorMessage: Resource.msg('error.message.service.error', 'amazon', null)
                });

                return next();
            }

            var authorize;

            try {
                authorize = JSON.parse(result.object);
            } catch (error) {
                res.setStatusCode(500);
                res.json({
                    success: false,
                    errorMessage: Resource.msgf('error.order.invalid.json.2', 'amazon', null, 'Authorize')
                });

                return next();
            }

            if (authorize.statusDetails.reasonCode) {
                subject = Resource.msgf('notes.subject.charge.1', 'amazon', null, authorize.statusDetails.state, authorize.statusDetails.reasonCode);
                text = Resource.msgf('charge.status.code.msg.' + authorize.statusDetails.reasonCode, 'amazon', null, authorize.chargeId);
            } else {
                subject = Resource.msgf('notes.subject.charge.2', 'amazon', null, authorize.statusDetails.state);
                text = Resource.msgf('charge.status.code.msg.' + authorize.statusDetails.state, 'amazon', null, authorize.chargeId);
            }

            try {
                Transaction.wrap(function () {
                    order.addNote('APN | ' + subject, text);
                    order.custom.amzPayChargeId = authorize.chargeId;
                    order.custom.amzPayChargeState = authorize.statusDetails.state;
                    order.custom.amzPayChargeReasonCode = authorize.statusDetails.reasonCode;
                });
            } catch (error) {
                res.setStatusCode(304);
                res.json({
                    success: false,
                    errorMessage: error.toString()
                });

                return next();
            }

            var authorizedAmount = new Money(Number(authorize.chargeAmount.amount), authorize.chargeAmount.currencyCode);

            var orderModel = {
                amount: authorizedAmount,
                chargePermissionId: order.custom.amzPayChargePermissionId,
                lastModified: order.getLastModified(),
                orderId: order.orderNo,
                state: order.custom.amzPayChargeState.displayValue
            };

            var orderObject = { order: orderModel };

            emailHelpers.sendEmail({
                to: order.customerEmail,
                subject: Resource.msg('subject.order.authorization.email', 'amazon', null),
                from: sitePreferences.customerServiceEmail || 'no-reply@salesforce.com',
                type: emailHelpers.emailTypes.orderConfirmation
            }, 'apn/authorizationEmail', orderObject);

            res.json({
                success: true,
                state: authorize.statusDetails.state
            });

            return next();
        case 'CAPTURE':
            // Search for order
            order = OrderMgr.searchOrder('custom.amzPayChargePermissionId={0}', notification.ChargePermissionId);

            if (!order) {
                apnLogger.error(Resource.msgf('error.message.notfound.order', 'amazon', null, 'ChargePermissionId', notification.ChargePermissionId));
                res.setStatusCode(404);
                res.json({
                    success: false,
                    errorMessage: Resource.msgf('error.message.notfound.order', 'amazon', null, 'ChargePermissionId', notification.ChargePermissionId)
                });

                return next();
            }

            var captureAmount = null;

            if (notification.ChargeAmount) {
                captureAmount = {
                    amount: notification.ChargeAmount.Amount,
                    currencyCode: notification.ChargeAmount.CurrencyCode
                };
            }

            var captureRequest = new AmazonPayRequest(order, 'POST', '', ':chargeId', order.custom.amzPayChargeId, captureAmount, null, null);
            result = ChargeService.capture(captureRequest);

            if (!result.ok) {
                apnLogger.error(result.getErrorMessage());
                res.setStatusCode(result.getError());
                res.json({
                    success: false,
                    errorMessage: JSON.parse(result.getErrorMessage())
                });

                return next();
            }

            var capture;

            try {
                capture = JSON.parse(result.object);
            } catch (error) {
                apnLogger.error(error.toString());
                res.setStatusCode(500);
                res.json({
                    success: false,
                    errorMessage: Resource.msgf('error.order.invalid.json.2', 'amazon', null, 'Charge')
                });

                return next();
            }

            if (capture.statusDetails.reasonCode) {
                subject = Resource.msgf('notes.subject.charge.1', 'amazon', null, capture.statusDetails.state, capture.statusDetails.reasonCode);
                text = Resource.msgf('charge.status.code.msg.' + capture.statusDetails.reasonCode, 'amazon', null, capture.chargeId);
            } else {
                subject = Resource.msgf('notes.subject.charge.2', 'amazon', null, capture.statusDetails.state);
                text = Resource.msgf('charge.status.code.msg.' + capture.statusDetails.state, 'amazon', null, capture.chargeId);
            }

            try {
                Transaction.wrap(function () {
                    order.addNote('APN | ' + subject, text);
                    order.custom.amzPayChargeId = capture.chargeId;
                    order.custom.amzPayChargeState = capture.statusDetails.state;
                    order.custom.amzPayChargeReasonCode = capture.statusDetails.reasonCode;
                });
            } catch (error) {
                apnLogger.error(error.toString());
                res.setStatusCode(304);
                res.json({
                    success: false,
                    errorMessage: error.toString()
                });

                return next();
            }

            var capturedAmount = new Money(Number(capture.chargeAmount.amount), capture.chargeAmount.currencyCode);

            var orderModel = {
                amount: capturedAmount,
                chargePermissionId: order.custom.amzPayChargePermissionId,
                lastModified: order.getLastModified(),
                orderId: order.orderNo,
                state: order.custom.amzPayChargeState.displayValue
            };

            var orderObject = { order: orderModel };

            emailHelpers.sendEmail({
                to: order.customerEmail,
                subject: Resource.msg('subject.order.charge.email', 'amazon', null),
                from: sitePreferences.customerServiceEmail || 'no-reply@salesforce.com',
                type: emailHelpers.emailTypes.orderConfirmation
            }, 'apn/chargeEmail', orderObject);

            res.json({
                success: true,
                state: capture.statusDetails.state
            });

            return next();
        case 'REFUND':
            // Search for order
            order = OrderMgr.searchOrder('custom.amzPayChargePermissionId={0}', notification.ChargePermissionId);

            if (!order) {
                apnLogger.error(Resource.msgf('error.message.notfound.order', 'amazon', null, 'ChargePermissionId', notification.ChargePermissionId));
                res.setStatusCode(404);
                res.json({
                    success: false,
                    errorMessage: Resource.msgf('error.message.notfound.order', 'amazon', null, 'ChargePermissionId', notification.ChargePermissionId)
                });

                return next();
            }

            var refundAmount = null;

            if (notification.ChargeAmount) {
                refundAmount = {
                    amount: notification.ChargeAmount.Amount,
                    currencyCode: notification.ChargeAmount.CurrencyCode
                };
            }

            var refundRequest = new AmazonPayRequest(order, 'POST', '', '', order.custom.amzPayChargeId, refundAmount, null, null);
            result = RefundService.create(refundRequest);

            if (!result.ok) {
                res.setStatusCode(500);
                res.json({
                    success: false,
                    message: JSON.parse(result.getErrorMessage()),
                    errorMessage: Resource.msg('error.message.service.error', 'amazon', null)
                });

                return next();
            }

            var refund;

            try {
                refund = JSON.parse(result.object);
            } catch (error) {
                apnLogger.error(error.toString());
                res.setStatusCode(500);
                res.json({
                    success: false,
                    errorMessage: Resource.msgf('error.order.invalid.json.2', 'amazon', null, 'Refund')
                });

                return next();
            }

            // Add the values to subject and text to add a new Note
            if (refund.statusDetails.reasonCode) {
                subject = Resource.msgf('notes.subject.refund.1', 'amazon', null, refund.statusDetails.state, refund.statusDetails.reasonCode);
                text = Resource.msgf('refund.status.code.msg.' + refund.statusDetails.reasonCode, 'amazon', null, refund.refundId);
            } else {
                subject = Resource.msgf('notes.subject.refund.2', 'amazon', null, refund.statusDetails.state);
                text = Resource.msgf('refund.status.code.msg.' + refund.statusDetails.state, 'amazon', null, refund.refundId);
            }

            try {
                Transaction.wrap(function () {
                    order.addNote('APN | ' + subject, text);
                    order.custom.amzPayRefundId = refund.refundId;
                    order.custom.amzPayRefundState = refund.statusDetails.state;
                    order.custom.amzPayRefundReasonCode = refund.statusDetails.reasonCode;
                });
            } catch (error) {
                apnLogger.error(error.toString());
                res.setStatusCode(304);
                res.json({
                    success: false,
                    errorMessage: error.toString()
                });

                return next();
            }

            var refundAmount = new Money(Number(refund.refundAmount.amount), refund.refundAmount.currencyCode);

            var orderModel = {
                amount: refundAmount,
                chargePermissionId: order.custom.amzPayChargePermissionId,
                lastModified: order.getLastModified(),
                orderId: order.orderNo,
                state: order.custom.amzPayChargeState.displayValue
            };

            var orderObject = { order: orderModel };

            emailHelpers.sendEmail({
                to: order.customerEmail,
                subject: Resource.msg('subject.order.refund.email', 'amazon', null),
                from: sitePreferences.customerServiceEmail || 'no-reply@salesforce.com',
                type: emailHelpers.emailTypes.orderConfirmation
            }, 'apn/refundEmail', orderObject);

            res.json({
                success: true,
                state: refund.statusDetails.state
            });

            return next();
        case 'CLOSE' :
            // Search for order
            order = OrderMgr.searchOrder('custom.amzPayChargePermissionId={0}', notification.ChargePermissionId);

            if (!order) {
                apnLogger.error(Resource.msgf('error.message.notfound.order', 'amazon', null, 'ChargePermissionId', notification.ChargePermissionId));
                res.setStatusCode(404);
                res.json({
                    success: false,
                    errorMessage: Resource.msgf('error.message.notfound.order', 'amazon', null, 'ChargePermissionId', notification.ChargePermissionId)
                });

                return next();
            }

            var closeObject = {
                closureReason: notification.ClosureReason,
                cancelPendingCharges: notification.CancelPendingCharges
            };

            var closeRequest = new AmazonPayRequest(order, 'DELETE', '', ':chargePermissionId', order.custom.amzPayChargePermissionId, null, closeObject, null);
            result = ChargePermissionService.close(closeRequest);

            if (!result.ok) {
                apnLogger.error(result.getErrorMessage());
                res.setStatusCode(result.getError());
                res.json({
                    success: false,
                    message: JSON.parse(result.getErrorMessage()),
                    errorMessage: Resource.msg('error.message.service.error', 'amazon', null)
                });

                return next();
            }

            var close;

            try {
                close = JSON.parse(result.object);
            } catch (error) {
                apnLogger.error(error.toString());
                res.setStatusCode(500);
                res.json({
                    success: false,
                    errorMessage: Resource.msgf('error.order.invalid.json.2', 'amazon', null, 'Close')
                });

                return next();
            }

            // Add the values to subject and text to add a new Note
            var reasonCodes;

            try {
                reasonCodes = new ArrayList(order.custom.amzPayChargePermissionReasonCode);
                Transaction.wrap(function () {
                    close.statusDetails.reasons.forEach(function (reason) {
                        reasonCodes.push(reason.reasonCode);
                        subject = Resource.msgf('notes.subject.chargepermission.1', 'amazon', null, close.statusDetails.state, reason.reasonCode);
                        text = Resource.msgf('chargepermission.status.code.msg.' + reason.reasonCode, 'amazon', null, close.chargePermissionId);

                        order.addNote('APN | ' + subject, text);
                    });
                    order.custom.amzPayChargePermissionId = close.chargePermissionId;
                    order.custom.amzPayChargePermissionState = close.statusDetails.state;
                    order.custom.amzPayChargePermissionReasonCode = reasonCodes.toArray();
                });
            } catch (error) {
                apnLogger.error(error.toString());
                res.setStatusCode(304);
                res.json({
                    success: false,
                    errorMessage: error.toString()
                });

                return next();
            }

            res.json({
                success: true,
                state: close.statusDetails.state
            });

            return next();
        case 'CHARGE':
            // Search for order
            order = OrderMgr.searchOrder('custom.amzPayChargePermissionId={0}', notification.ChargePermissionId);

            if (!order) {
                apnLogger.error(Resource.msgf('error.message.notfound.order', 'amazon', null, 'ChargePermissionId', notification.ChargePermissionId));
                res.setStatusCode(404);
                res.json({
                    success: false,
                    errorMessage: Resource.msgf('error.message.notfound.order', 'amazon', null, 'ChargePermissionId', notification.ChargePermissionId)
                });

                return next();
            }

            var authorizeAmount = null;

            if (notification.ChargeAmount) {
                authorizeAmount = {
                    amount: notification.ChargeAmount.Amount,
                    currencyCode: notification.ChargeAmount.CurrencyCode
                };
            }

            var authorizeRequest = new AmazonPayRequest(order, 'POST', '', '', notification.ChargePermissionId, authorizeAmount, null, null);
            var authorizeResult = ChargeService.create(authorizeRequest);

            if (!authorizeResult.ok) {
                var authorizeError;

                try {
                    authorizeError = JSON.parse(authorizeResult.getErrorMessage());
                } catch (error) {
                    res.setStatusCode(500);
                    res.json({
                        success: false,
                        errorMessage: Resource.msgf('error.order.invalid.json.2', 'amazon', null, 'Authorize')
                    });

                    return next();
                }

                if (authorizeError.reasonCode === 'SoftDeclined' || authorizeError.reasonCode === 'ProcessingFailure') {
                    var chargePermissionRequest = new AmazonPayRequest(order, 'GET', '', ':chargePermissionId', notification.ChargePermissionId, null, null, null);
                    var chargePermissionResult = ChargePermissionService.get(chargePermissionRequest);

                    if (!chargePermissionResult.ok) {
                        apnLogger.error(chargePermissionResult.getErrorMessage());
                        res.setStatusCode(chargePermissionResult.getError());
                        res.json({
                            success: false,
                            message: JSON.parse(chargePermissionResult.getErrorMessage()),
                            errorMessage: Resource.msg('error.message.service.error', 'amazon', null)
                        });

                        return next();
                    }

                    var chargePermission;

                    try {
                        chargePermission = JSON.parse(chargePermissionResult.object);
                    } catch (error) {
                        res.setStatusCode(500);
                        res.json({
                            success: false,
                            errorMessage: Resource.msgf('error.order.invalid.json.2', 'amazon', null, 'Authorize')
                        });

                        return next();
                    }

                    if (chargePermission.statusDetails.state !== 'Chargeable') {
                        try {
                            reasonCodes = new ArrayList(order.custom.amzPayChargePermissionReasonCode);
                            Transaction.wrap(function () {
                                chargePermission.statusDetails.reasons.forEach(function (reason) {
                                    reasonCodes.push(reason.reasonCode);
                                    subject = Resource.msgf('notes.subject.chargepermission.1', 'amazon', null, chargePermission.statusDetails.state, reason.reasonCode);
                                    text = Resource.msgf('chargepermission.status.code.msg.' + reason.reasonCode, 'amazon', null, chargePermission.chargePermissionId);

                                    order.addNote('APN | ' + subject, text);
                                });
                                order.custom.amzPayChargePermissionId = chargePermission.chargePermissionId;
                                order.custom.amzPayChargePermissionState = chargePermission.statusDetails.state;
                                order.custom.amzPayChargePermissionReasonCode = reasonCodes.toArray();
                            });
                        } catch (error) {
                            apnLogger.error(error.toString());
                            res.setStatusCode(304);
                            res.json({
                                success: false,
                                errorMessage: error.toString()
                            });

                            return next();
                        }

                        return next();
                    }

                    // re-attempt to call create charge
                    authorizeRequest = new AmazonPayRequest(order, 'POST', '', '', notification.ChargePermissionId, authorizeAmount, null, null);
                    authorizeResult = ChargeService.create(authorizeRequest);

                    if (!authorizeResult.ok) {
                        apnLogger.error(authorizeResult.getErrorMessage());
                        res.setStatusCode(authorizeResult.getError());
                        res.json({
                            success: false,
                            message: JSON.parse(authorizeResult.getErrorMessage()),
                            errorMessage: Resource.msg('error.message.service.error', 'amazon', null)
                        });

                        return next();
                    }
                } else if (authorizeError.reasonCode === 'HardDeclined') {
                    var authorizedAmount = new Money(Number(authorizeAmount.amount), authorizeAmount.currencyCode);

                    var orderModel = {
                        amount: authorizedAmount,
                        chargePermissionId: notification.ChargePermissionId,
                        lastModified: order.getLastModified(),
                        orderId: order.orderNo,
                        state: order.custom.amzPayChargeState.displayValue
                    };

                    var orderObject = { order: orderModel };

                    emailHelpers.sendEmail({
                        to: order.customerEmail,
                        subject: Resource.msgf('subject.order.authorization.email', 'amazon', null),
                        from: sitePreferences.customerServiceEmail || 'no-reply@salesforce.com',
                        type: emailHelpers.emailTypes.orderConfirmation
                    }, 'apn/recurring/hardDeclinedEmail', orderObject);

                    apnLogger.error(authorizeResult.getErrorMessage());
                    res.setStatusCode(authorizeResult.getError());
                    res.json({
                        success: false,
                        message: JSON.parse(authorizeResult.getErrorMessage()),
                        errorMessage: Resource.msg('error.message.service.error', 'amazon', null)
                    });

                    return next();
                } else {
                    apnLogger.error(authorizeResult.getErrorMessage());
                    res.setStatusCode(authorizeResult.getError());
                    res.json({
                        success: false,
                        message: JSON.parse(authorizeResult.getErrorMessage()),
                        errorMessage: Resource.msg('error.message.service.error', 'amazon', null)
                    });

                    return next();
                }
            }

            var authorize;

            try {
                authorize = JSON.parse(authorizeResult.object);
            } catch (error) {
                res.setStatusCode(500);
                res.json({
                    success: false,
                    errorMessage: Resource.msgf('error.order.invalid.json.2', 'amazon', null, 'Authorize')
                });

                return next();
            }

            if (authorize.statusDetails.reasonCode) {
                subject = Resource.msgf('notes.subject.charge.1', 'amazon', null, authorize.statusDetails.state, authorize.statusDetails.reasonCode);
                text = Resource.msgf('charge.status.code.msg.' + authorize.statusDetails.reasonCode, 'amazon', null, authorize.chargeId);
            } else {
                subject = Resource.msgf('notes.subject.charge.2', 'amazon', null, authorize.statusDetails.state);
                text = Resource.msgf('charge.status.code.msg.' + authorize.statusDetails.state, 'amazon', null, authorize.chargeId);
            }

            try {
                Transaction.wrap(function () {
                    order.addNote('APN | ' + subject, text);
                    order.custom.amzPayChargeId = authorize.chargeId;
                    order.custom.amzPayChargeState = authorize.statusDetails.state;
                    order.custom.amzPayChargeReasonCode = authorize.statusDetails.reasonCode;
                });
            } catch (error) {
                apnLogger.error(error.toString());
                res.setStatusCode(304);
                res.json({
                    success: false,
                    errorMessage: error.toString()
                });

                return next();
            }

            // If amzCaptureNow is TRUE, then the capture was done during the Authorize.
            if (sitePreferences.amzCaptureNow) {
                res.json({
                    success: true,
                    authorizeState: authorize.statusDetails.state
                });

                return next();
            }

            var captureRequest = new AmazonPayRequest(order, 'POST', '', ':chargeId', authorize.chargeId, authorizeAmount, null, null);
            result = ChargeService.capture(captureRequest);

            if (!result.ok) {
                apnLogger.error(result.getErrorMessage());
                res.setStatusCode(result.getError());
                res.json({
                    success: false,
                    errorMessage: JSON.parse(result.getErrorMessage())
                });

                return next();
            }

            var capture;

            try {
                capture = JSON.parse(result.object);
            } catch (error) {
                apnLogger.error(error.toString());
                res.setStatusCode(500);
                res.json({
                    success: false,
                    errorMessage: Resource.msgf('error.order.invalid.json.2', 'amazon', null, 'Charge')
                });
                return next();
            }

            if (capture.statusDetails.reasonCode) {
                subject = Resource.msgf('notes.subject.charge.1', 'amazon', null, capture.statusDetails.state, capture.statusDetails.reasonCode);
                text = Resource.msgf('charge.status.code.msg.' + capture.statusDetails.reasonCode, 'amazon', null, capture.chargeId);
            } else {
                subject = Resource.msgf('notes.subject.charge.2', 'amazon', null, capture.statusDetails.state);
                text = Resource.msgf('charge.status.code.msg.' + capture.statusDetails.state, 'amazon', null, capture.chargeId);
            }

            try {
                Transaction.wrap(function () {
                    order.addNote('APN | ' + subject, text);
                    order.custom.amzPayChargeId = capture.chargeId;
                    order.custom.amzPayChargeState = capture.statusDetails.state;
                    order.custom.amzPayChargeReasonCode = capture.statusDetails.reasonCode;
                });
            } catch (error) {
                apnLogger.error(error.toString());
                res.setStatusCode(304);
                res.json({
                    success: false,
                    errorMessage: error.toString()
                });
                return next();
            }

            var capturedAmount = new Money(Number(capture.chargeAmount.amount), capture.chargeAmount.currencyCode);

            var orderModel = {
                amount: capturedAmount,
                chargePermissionId: order.custom.amzPayChargePermissionId,
                lastModified: order.getLastModified(),
                orderId: order.orderNo,
                state: order.custom.amzPayChargeState.displayValue
            };

            var orderObject = { order: orderModel };

            emailHelpers.sendEmail({
                to: order.customerEmail,
                subject: Resource.msg('subject.order.charge.email', 'amazon', null),
                from: sitePreferences.customerServiceEmail || 'no-reply@salesforce.com',
                type: emailHelpers.emailTypes.orderConfirmation
            }, 'apn/chargeEmail', orderObject);

            res.json({
                success: true,
                authorizeState: authorize.statusDetails.state,
                captureState: capture.statusDetails.state
            });

            return next();
        case 'UPDATE':
            // Search for order
            order = OrderMgr.searchOrder('custom.amzPayChargePermissionId={0}', notification.ChargePermissionId);

            if (!order) {
                apnLogger.error(Resource.msgf('error.message.notfound.order', 'amazon', null, 'ChargePermissionId', notification.ChargePermissionId));
                res.setStatusCode(404);
                res.json({
                    success: false,
                    errorMessage: Resource.msgf('error.message.notfound.order', 'amazon', null, 'ChargePermissionId', notification.ChargePermissionId)
                });
                return next();
            }

            var recurringMetadata = null;

            if (notification.RecurringMetadata.Amount) {
                recurringMetadata = {
                    frequency: {
                        unit: notification.RecurringMetadata.Frequency.Unit,
                        value: notification.RecurringMetadata.Frequency.Value
                    },
                    amount: {
                        amount: notification.RecurringMetadata.Amount.Amount,
                        currencyCode: notification.RecurringMetadata.Amount.CurrencyCode
                    }
                };
            }

            var updateRequest = new AmazonPayRequest(order, 'PATCH', '', ':chargePermissionId', order.custom.amzPayChargePermissionId, null, null, recurringMetadata);
            result = ChargePermissionService.update(updateRequest);

            if (!result.ok) {
                res.setStatusCode(500);
                res.json({
                    success: false,
                    message: JSON.parse(result.getErrorMessage()),
                    errorMessage: Resource.msg('error.message.service.error', 'amazon', null)
                });
                return next();
            }

            var update;

            try {
                update = JSON.parse(result.object);
            } catch (error) {
                apnLogger.error(error.toString());
                res.setStatusCode(500);
                res.json({
                    success: false,
                    errorMessage: Resource.msgf('error.order.invalid.json.2', 'amazon', null, 'Refund')
                });
                return next();
            }

            // Add the values to subject and text to add a new Note
            var reasonCodes;

            try {
                reasonCodes = new ArrayList(order.custom.amzPayChargePermissionReasonCode);

                Transaction.wrap(function () {
                    if (!empty(update.statusDetails.reasons)) {
                        update.statusDetails.reasons.forEach(function (reason) {
                            reasonCodes.push(reason.reasonCode);
                            subject = Resource.msgf('notes.subject.chargepermission.1', 'amazon', null, update.statusDetails.state, reason.reasonCode);
                            text = Resource.msgf('chargepermission.status.code.msg.' + reason.reasonCode, 'amazon', null, update.chargePermissionId);

                            order.addNote('APN | ' + subject, text);
                        });
                    }

                    order.custom.amzPayChargePermissionId = update.chargePermissionId;
                    order.custom.amzPayChargePermissionState = update.statusDetails.state;
                    order.custom.amzPayChargePermissionReasonCode = reasonCodes.toArray();
                });
            } catch (error) {
                apnLogger.error(error.toString());
                res.setStatusCode(304);
                res.json({
                    success: false,
                    errorMessage: error.toString()
                });
                return next();
            }

            res.json({
                success: true,
                state: update.statusDetails.state,
                recurringFrequencyUnit: update.recurringMetadata.frequency.unit,
                recurringFrequencyValue: update.recurringMetadata.frequency.value
            });

            return next();
        default:
            res.setStatusCode(400);
            res.json({
                success: false,
                errorMessage: Resource.msg('error.message.wrong.type', 'amazon', null)
            });

            return next();
    }
});

server.get('Fail', function (req, res, next) {
    var query = req.querystring;
    var errorMessage;
    if (query.reasonCode === '1') {
        errorMessage = Resource.msg('error.message.apn.error.1', 'amazon', null);
        res.setStatusCode(403);
    } else if (query.reasonCode === '2') {
        res.setStatusCode(401);
        errorMessage = Resource.msg('error.message.apn.error.2', 'amazon', null);
    }
    res.json({
        error: true,
        errorMessage: errorMessage
    });
    next();
});

module.exports = server.exports();
