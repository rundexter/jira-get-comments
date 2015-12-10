var JiraApi = require('jira').JiraApi,
    querystring = require('querystring'),
    _ = require('lodash');

var globalPickResults = {
    'total': 'total',
    'comments_self': {
        keyName: 'comments',
        fields: ['self']
    },
    'comments_author': {
        keyName: 'comments',
        fields: ['author.name']
    },
    'comments_body': {
        keyName: 'comments',
        fields: ['body']
    },
    'comments_created': {
        keyName: 'comments',
        fields: ['created']
    },
    'comments_updated': {
        keyName: 'comments',
        fields: ['updated']
    },
    'comments_visibility': {
        keyName: 'comments',
        fields: ['visibility.value']
    }
};

module.exports = {

    /**
     * Return pick result.
     *
     * @param output
     * @param pickTemplate
     * @returns {*}
     */
    pickResult: function (output, pickTemplate) {
        var result = _.isArray(pickTemplate)? [] : {};
        // map template keys
        _.map(pickTemplate, function (templateValue, templateKey) {

            var outputValueByKey = _.get(output, templateValue.keyName || templateValue, undefined);

            if (_.isUndefined(outputValueByKey)) {

                result = undefined;
                return;
            }


            // if template key is object - transform, else just save
            if (_.isArray(pickTemplate)) {

                result = outputValueByKey;
            } else if (_.isObject(templateValue)) {
                // if data is array - map and transform, else once transform
                if (_.isArray(outputValueByKey)) {
                    var mapPickArrays = this._mapPickArrays(outputValueByKey, templateKey, templateValue);

                    result = _.isEmpty(result)? mapPickArrays : _.merge(result, mapPickArrays);
                } else {

                    result[templateKey] = this.pickResult(outputValueByKey, templateValue.fields);
                }
            } else {

                _.set(result, templateKey, outputValueByKey);
            }
        }, this);

        return result;
    },

    /**
     * System func for pickResult.
     *
     * @param mapValue
     * @param templateKey
     * @param templateObject
     * @returns {*}
     * @private
     */
    _mapPickArrays: function (mapValue, templateKey, templateObject) {
        var arrayResult = [],
            result = templateKey === '-'? [] : {};

        _.map(mapValue, function (inOutArrayValue) {
            var pickValue = this.pickResult(inOutArrayValue, templateObject.fields);

            if (pickValue !== undefined)
                arrayResult.push(pickValue);
        }, this);

        if (templateKey === '-') {

            result = arrayResult;
        } else {

            result[templateKey] = arrayResult;
        }

        return result;
    },

    /**
     * Return auth object.
     *
     *
     * @param dexter
     * @returns {*}
     */
    authParams: function (dexter) {
        var auth = {
            protocol: dexter.environment('jira_protocol', 'https'),
            host: dexter.environment('jira_host'),
            port: dexter.environment('jira_port', 443),
            user: dexter.environment('jira_user'),
            password: dexter.environment('jira_password'),
            apiVers: dexter.environment('jira_apiVers', '2')
        };

        if (!dexter.environment('jira_host') || !dexter.environment('jira_user') || !dexter.environment('jira_password')) {

            this.fail('A [jira_protocol, jira_port, jira_apiVers, *jira_host, *jira_user, *jira_password] environment has this module (* - required).');

            return false;
        } else {

            return auth;
        }
    },

    issueString: function (jira, step) {
        var issue = step.input('issue').first();
        var queryString = '/issue/' + issue + '/comment';

        if (step.input('expand').first())
            queryString.concat('?' + querystring.encode({expand: step.input('expand').first()}));

        return jira.makeUri(queryString);
    },

    /**
     * The main entry point for the Dexter module
     *
     * @param {AppStep} step Accessor for the configuration for the step using this module.  Use step.input('{key}') to retrieve input data.
     * @param {AppData} dexter Container for all data used in this workflow.
     */
    run: function(step, dexter) {

        if (step.input('issue').first()) {

            var auth = this.authParams(dexter);
            var jira = new JiraApi(auth.protocol, auth.host, auth.port, auth.user, auth.password, auth.apiVers);

            var jiraUri = this.issueString(jira, step);


            var options = {
                rejectUnauthorized: jira.strictSSL,
                uri: jiraUri,
                method: 'GET',
                json: true
            };

            jira.doRequest(options, function(error, response, body) {

                if (error) {
                    this.fail(error);
                    return;
                }

                if (response.statusCode === 400) {

                    this.fail(response.statusCode + ': '.JSON.stringify(body));
                    return;
                }

                if (response.statusCode === 200) {

                    this.complete(this.pickResult(response.body, globalPickResults));
                }
            }.bind(this));

        } else {

            this.fail('A [issue] input need for this module.');
        }
    }
};
