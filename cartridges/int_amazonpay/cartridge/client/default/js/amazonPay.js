'use strict';

var processInclude = require('./util');
var $ = require('jquery');

$(document).ready(function () {
    processInclude(require('./amazonPay/amazonPay'));
});
