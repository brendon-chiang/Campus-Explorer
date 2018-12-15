"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const restify = require("restify");
const Util_1 = require("../Util");
const InsightFacade_1 = require("../controller/InsightFacade");
class Server {
    constructor(port) {
        Util_1.default.info("Server::<init>( " + port + " )");
        this.port = port;
    }
    stop() {
        Util_1.default.info("Server::close()");
        const that = this;
        return new Promise(function (fulfill) {
            that.rest.close(function () {
                fulfill(true);
            });
        });
    }
    start() {
        const that = this;
        return new Promise(function (fulfill, reject) {
            try {
                Util_1.default.info("Server::start() - start");
                that.rest = restify.createServer({
                    name: "insightUBC",
                });
                that.rest.use(function crossOrigin(req, res, next) {
                    res.header("Access-Control-Allow-Origin", "*");
                    res.header("Access-Control-Allow-Headers", "X-Requested-With");
                    return next();
                });
                that.rest.get("/echo/:msg", Server.echo);
                that.rest.use(restify.bodyParser());
                that.rest.put("/dataset/:id/:kind", Server.put);
                that.rest.post("/query", Server.post);
                that.rest.del("/dataset/:id", Server.del);
                that.rest.get("/.*", Server.getStatic);
                that.rest.listen(that.port, function () {
                    Util_1.default.info("Server::start() - restify listening: " + that.rest.url);
                    fulfill(true);
                });
                that.rest.on("error", function (err) {
                    Util_1.default.info("Server::start() - restify ERROR: " + err);
                    reject(err);
                });
            }
            catch (err) {
                Util_1.default.error("Server::start() - ERROR: " + err);
                reject(err);
            }
        });
    }
    static echo(req, res, next) {
        Util_1.default.trace("Server::echo(..) - params: " + JSON.stringify(req.params));
        try {
            const result = Server.performEcho(req.params.msg);
            Util_1.default.info("Server::echo(..) - responding " + result.code);
            res.json(result.code, result.body);
        }
        catch (err) {
            Util_1.default.error("Server::echo(..) - responding 400");
            res.json(400, { error: err.message });
        }
        return next();
    }
    static performEcho(msg) {
        if (typeof msg !== "undefined" && msg !== null) {
            return { code: 200, body: { result: msg + "..." + msg } };
        }
        else {
            return { code: 400, body: { error: "Message not provided" } };
        }
    }
    static getStatic(req, res, next) {
        const publicDir = "frontend/public/";
        Util_1.default.trace("RoutHandler::getStatic::" + req.url);
        let path = publicDir + "index.html";
        if (req.url !== "/") {
            path = publicDir + req.url.split("/").pop();
        }
        fs.readFile(path, function (err, file) {
            if (err) {
                res.send(500);
                Util_1.default.error(JSON.stringify(err));
                return next();
            }
            res.write(file);
            res.end();
            return next();
        });
    }
    static put(req, res, next) {
        let insightFacade = new InsightFacade_1.default();
        const path = "./test/data/" + req.params.id + ".zip";
        fs.readFile(path, function (err, file) {
            if (err) {
                res.send(400);
                Util_1.default.error(JSON.stringify(err));
                return next();
            }
            insightFacade.addDataset(req.params.id, file.toString("base64"), req.params.kind).then(function (result) {
                res.json(result.code, result.body);
            }).catch(function (error) {
                res.json(error.code, error.body);
            });
        });
        return next();
    }
    static post(req, res, next) {
        let insightFacade = new InsightFacade_1.default();
        insightFacade.performQuery(req.body).then(function (result) {
            res.json(result.code, result.body);
        }).catch(function (err) {
            res.json(err.code, err.body);
        });
        return next();
    }
    static del(req, res, next) {
        let insightFacade = new InsightFacade_1.default();
        insightFacade.removeDataset(req.params.id).then(function (result) {
            res.json(result.code, result.body);
        }).catch(function (err) {
            res.json(err.code, err.body);
        });
        return next();
    }
}
exports.default = Server;
//# sourceMappingURL=Server.js.map