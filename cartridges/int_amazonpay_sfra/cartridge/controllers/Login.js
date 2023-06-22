'use strict';

var server = require('server');
server.extend(module.superModule);

server.append('Show', function (req, res, next) {
    var Resource = require('dw/web/Resource');
    var viewData = res.getViewData();
    var query = req.querystring;
    var target = query.rurl || '1';

    session.custom.amzSignInRedirect = target;

    if (query.amzError) {
        viewData.amzError = true;
        viewData.errorMessage = Resource.msg('error.message.' + query.errorMessage, 'amazon', null);
    }

    res.setViewData(viewData);
    return next();
});

module.exports = server.exports();
