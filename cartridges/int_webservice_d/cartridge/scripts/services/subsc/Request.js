'use strict';

const URLUtils = require( 'dw/web/URLUtils' );
const Resource = require( 'dw/web/Resource' );
const Logger = require( 'dw/system/Logger' );
const sitePreferences = require( 'dw/system/Site' ).getCurrent().getPreferences().getCustom();
const strUtils = require( 'dw/util/StringUtils' );

/**
 *
 * @param {httpMethod} httpMethod HTTP method
 */
function Request( httpMethod, token, contentType ) {
    this.subscriptionApiUrl = sitePreferences.subscriptionApiUrl;
    this.headers = [];
    this.url = '';
    this.payload = '';
    this.httpMethod = httpMethod;
    this.contentType = (contentType != null) ? contentType : ((this.httpMethod == 'PUT') ? 'application/json' : 'application/x-www-form-urlencoded');
    this.buyerId = '';
    this.token = token != null ? token : '';


    const logger = Logger.getLogger( 'SubscriptionRequest' );

    /**
     * Normalize URL received.
     * @param {String} url URL to be normalized
     */
    this.normalizeUrl = function normalizeUrl( url, key ) { // eslint-disable-line no-shadow
        if ( !url ) {
            return;
        }

        var paramsToReplace = [];
        var newURL = url;

        paramsToReplace.push( {
            srchVal: ':subscriptionApiUrl',
            rplcVal: this.subscriptionApiUrl
        } );
        if ( key != null ) {
            paramsToReplace.push( {
                srchVal: ':key',
                rplcVal: key
            } );
        }

        paramsToReplace.forEach( function ( e ) {
            newURL = newURL.replace( e.srchVal, e.rplcVal );
        } );

        this.url = newURL;
    };
    /**
     * Generate headers to be added on the service headers.
     */
    this.generateHeaders = function generateHeaders() {
        //Generate PreSignedHeaders with utils module if necessary
        this.headers.push( {
            entry: 'content-type',
            val: this.contentType
        } );
        if ( this.token ) {
            this.headers.push( {
                entry: 'Authorization',
                val: 'Bearer ' + this.token
            } );
        }
    };

    /**
     * 
     */
    this.setData = function setData( data ) {
        this.payload = data;
    }

    this.generateOauthInfo = function generateOauthInfo() {
        let clientId = sitePreferences.subscriptionClientId;
        let clientCred = sitePreferences.subscriptionClientCred;
        this.payload = strUtils.format( 'client_id={0}&client_secret={1}&grant_type=client_credentials', clientId, clientCred );
    }

    /**
     * 
     */
    this.setAccountUrl = function setAccountUrl() {
        this.url = 'https://rest.sandbox.na.zuora.com/v1/object/rate-plan/8ac697b0862562fb018625ba78ee1fd5';
    }
}

Request.prototype.type = 'Request';
module.exports = Request;