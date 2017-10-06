/*  eslint-disable indent */
const ReactDOM = require("react-dom/server");
const Router = require("react-router");
const serverContext = require("./serverContext.js");
const {Helmet} = require("react-helmet"); // eslint-disable-line import/no-unresolved

const defaultTemplate = require("./defaultTemplate.js");

const match = Router.match;

module.exports = function serverRender(cfg) {
    const {headers, request, response, wildcatConfig} = cfg;

    return new Promise(function serverRenderPromise(resolve, reject) {
        match(
            {
                history: cfg.history,
                location: cfg.location,
                routes: cfg.routes
            },
            function serverRenderMatch(error, redirectLocation, renderProps) {
                let result = {};

                if (error) {
                    return reject(error);
                }

                if (redirectLocation) {
                    result = {
                        redirect: true,
                        redirectLocation,
                        status: 301
                    };
                } else if (!renderProps) {
                    result = getHtmlNotFoundTemplate(
                        wildcatConfig.serverSettings
                    );
                } else {
                    let initialData = null;

                    let httpStatusCode = 200;

                    return Promise.all(
                        renderProps.components
                            .map(function updateHttpStatusCode(component) {
                                if (
                                    component.routerProps &&
                                    component.routerProps.status !== "undefined"
                                ) {
                                    httpStatusCode =
                                        component.routerProps.status;
                                }
                                return component;
                            })
                            .filter(function renderPropsFilter(component) {
                                return component.prefetch;
                            })
                            .map(function renderPropsMap(component) {
                                let key = component.prefetch.getKey();

                                return component.prefetch
                                    .run(
                                        Object.assign({}, renderProps, {
                                            request,
                                            response,
                                            headers
                                        })
                                    )
                                    .then(function renderPropsPrefetchResult(
                                        props
                                    ) {
                                        initialData = initialData || {};

                                        initialData[key] = props;
                                        component.prefetch[key] = props;

                                        key = null;
                                        return component;
                                    });
                            })
                    )
                        .then(function serverRenderPromiseResult(
                            prefetchedComponents
                        ) {
                            var component = serverContext(
                                cfg,
                                headers,
                                renderProps
                            );

                            const renderType =
                                wildcatConfig.serverSettings.renderType;
                            const getRenderType =
                                typeof renderType === "function"
                                    ? renderType({
                                          wildcatConfig,
                                          request,
                                          headers,
                                          renderProps
                                      })
                                    : renderType;

                            const reactMarkup = ReactDOM[getRenderType](
                                component
                            );

                            const head = Object.assign(
                                {
                                    link: "",
                                    meta: "",
                                    title: ""
                                },
                                Helmet.renderStatic()
                            );

                            const htmlTemplate =
                                wildcatConfig.serverSettings.htmlTemplate ||
                                defaultTemplate;

                            const html = htmlTemplate({
                                data: Object.assign({}, initialData),
                                head: head,
                                html: reactMarkup,
                                wildcatConfig,
                                request,
                                headers,
                                renderProps
                            });

                            result = Object.assign({}, result, {
                                html: html,
                                status: httpStatusCode
                            });

                            // Delete stored object
                            initialData = null;

                            // Delete stored objects
                            prefetchedComponents
                                .filter(function renderPropsFilter(_component) {
                                    return _component.prefetch;
                                })
                                .forEach(function withPrefetchedComponent(
                                    _component
                                ) {
                                    let key = _component.prefetch.getKey();

                                    /* istanbul ignore next */
                                    if (_component.prefetch[key]) {
                                        _component.prefetch[key] = null;
                                    }

                                    key = null;
                                });

                            return resolve(result);
                        })
                        .catch(
                            /* istanbul ignore next */
                            function serverRenderError(err) {
                                return reject(err);
                            }
                        );
                }

                return resolve(result);
            }
        );
    });
};

function getHtmlNotFoundTemplate(serverSettings) {
    const {htmlNotFoundTemplate} = serverSettings;
    if (htmlNotFoundTemplate) {
        return {
            status: 404,
            html: htmlNotFoundTemplate()
        };
    }
    return {
        error: "Not found",
        status: 404
    };
}
