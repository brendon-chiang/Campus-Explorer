/**
 * Receives a query object as parameter and sends it as Ajax request to the POST /query REST endpoint.
 *
 * @param query The query object
 * @returns {Promise} Promise that must be fulfilled if the Ajax request is successful and be rejected otherwise.
 */
CampusExplorer.sendQuery = function(query) {
    const xhttp = new XMLHttpRequest();
    return new Promise(function(fulfill, reject) {
        try {
            xhttp.open("POST", "http://localhost:4321/query", true);
            xhttp.setRequestHeader("Content-type", "application/json");
            xhttp.onload = function(query) {
                // do nothing???
            };
            xhttp.send(JSON.stringify(query));
        }
        catch (err) {
            reject(err);
        }
        fulfill();
    });
};
